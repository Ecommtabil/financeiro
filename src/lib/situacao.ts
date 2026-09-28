import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import type { Baixa, Conta, Saldo } from "./calc";
import type { Entrada, EntradaPessoal, Saida } from "./dados";
import { normalizarBanco } from "./format";
import { acharCabecalho, chaveMes, lerMes, lerPlanilha, norm, paraNumero } from "./importacao";

export function useSaldos() {
  return useQuery({
    queryKey: ["saldos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("saldos").select("*").order("banco");
      if (error) throw error;
      return data as Saldo[];
    },
  });
}

export function useBaixas() {
  return useQuery({
    queryKey: ["baixas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("baixas").select("*");
      if (error) throw error;
      return data as Baixa[];
    },
  });
}

export function useSalvarSaldo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ banco, saldo }: { banco: string; saldo: number }) => {
      const { error } = await supabase.from("saldos")
        .upsert({ banco: normalizarBanco(banco), saldo, atualizado_em: new Date().toISOString() }, { onConflict: "user_id,banco" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["saldos"] }),
  });
}

export function useBaixar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contas: (Conta & { valorBaixa?: number })[]) => {
      if (!contas.length) return;
      const linhas: TablesInsert<"baixas">[] = contas.map((c) => ({
        tipo: c.tipo, item_id: c.id, mes: c.mes, valor: c.valorBaixa ?? Math.round(c.valor * 100) / 100,
        banco: c.banco ? normalizarBanco(c.banco) : null, baixado_em: new Date().toISOString(),
      }));
      const { error } = await supabase.from("baixas").upsert(linhas, { onConflict: "user_id,tipo,item_id,mes" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["baixas"] }),
  });
}

export function useEditarBaixa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, valor }: { id: string; valor: number }) => {
      const { error } = await supabase.from("baixas").update({ valor }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["baixas"] }),
  });
}

export function useEstornar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await supabase.from("baixas").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["baixas"] }),
  });
}

// ---------- importação ----------
function linhasDe(wb: XLSX.WorkBook, alvo: string): unknown[][] {
  const nome = wb.SheetNames.find((n) => norm(n) === alvo) ?? wb.SheetNames.find((n) => norm(n) !== "COMO PREENCHER");
  if (!nome) throw new Error("A planilha não tem abas com dados.");
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, { header: 1, raw: true, defval: null });
}
const col = (cab: string[], ...ks: string[]) => cab.findIndex((c) => ks.some((k) => c.includes(k)));
function dataISO(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  const m = String(v ?? "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12).toISOString() : null;
}

/** Planilha com BANCO, SALDO e DATA (opcional). Substitui o saldo de cada banco listado. */
export async function importarSaldos(file: File): Promise<string> {
  const rows = linhasDe(await lerPlanilha(file), "SALDOS");
  const h = acharCabecalho(rows, ["BANCO", "SALDO"]);
  const cab = (rows[h] ?? []).map(norm);
  const c = { banco: col(cab, "BANCO"), saldo: col(cab, "SALDO"), data: col(cab, "DATA", "ATUALIZ") };
  const itens: TablesInsert<"saldos">[] = [];
  for (const r of rows.slice(h + 1)) {
    const banco = String(r[c.banco] ?? "").trim();
    const saldo = paraNumero(r[c.saldo]);
    if (!banco || saldo == null) continue;
    itens.push({ banco: normalizarBanco(banco), saldo, atualizado_em: (c.data >= 0 && dataISO(r[c.data])) || new Date().toISOString(), origem: "import" });
  }
  if (!itens.length) throw new Error("Nenhum saldo encontrado na planilha.");
  const { error } = await supabase.from("saldos").upsert(itens, { onConflict: "user_id,banco" });
  if (error) throw error;
  return `${itens.length} saldos importados`;
}

/** Planilha com TIPO (RECEBER/PAGAR), DESCRIÇÃO (ou EMPRESA/CÓDIGO), MÊS, VALOR, DATA e BANCO (opcionais). */
export async function importarBaixas(
  file: File, anoBase: number,
  d: { entradas: Entrada[]; pessoais: EntradaPessoal[]; saidas: Saida[] },
): Promise<string> {
  const rows = linhasDe(await lerPlanilha(file), "BAIXAS");
  const h = acharCabecalho(rows, ["TIPO", "VALOR"]);
  const cab = (rows[h] ?? []).map(norm);
  const c = { tipo: col(cab, "TIPO"), desc: col(cab, "DESCRI", "EMPRESA", "NOME"), cod: col(cab, "CODIGO"), mes: col(cab, "MES"), valor: col(cab, "VALOR"), data: col(cab, "DATA"), banco: col(cab, "BANCO") };
  const ent = new Map(d.entradas.map((e) => [norm(e.empresa), e]));
  const cod = new Map(d.entradas.filter((e) => e.codigo).map((e) => [norm(e.codigo), e]));
  const pes = new Map(d.pessoais.map((p) => [norm(p.descricao), p]));
  const sai = new Map(d.saidas.map((s) => [norm(s.descricao), s]));
  const itens: TablesInsert<"baixas">[] = [];
  const naoAchei: string[] = [];
  for (const r of rows.slice(h + 1)) {
    const nome = norm(r[c.desc]);
    const valor = paraNumero(r[c.valor]);
    const m = lerMes(r[c.mes]);
    if ((!nome && c.cod < 0) || valor == null || !m) continue;
    const mes = chaveMes(m.ano ?? anoBase, m.mes);
    const pagar = norm(r[c.tipo]).startsWith("PAG");
    let tipo: "entrada" | "pessoal" | "saida", item: { id: string; banco: string | null } | undefined;
    if (pagar) { tipo = "saida"; item = sai.get(nome); }
    else {
      const e = (c.cod >= 0 ? cod.get(norm(r[c.cod])) : undefined) ?? ent.get(nome);
      if (e) { tipo = "entrada"; item = e; } else { tipo = "pessoal"; item = pes.get(nome); }
    }
    if (!item) { naoAchei.push(String(r[c.desc] ?? r[c.cod] ?? "")); continue; }
    const banco = c.banco >= 0 && r[c.banco] ? String(r[c.banco]) : item.banco;
    itens.push({ tipo, item_id: item.id, mes, valor, banco: banco ? normalizarBanco(banco) : null, baixado_em: (c.data >= 0 && dataISO(r[c.data])) || new Date().toISOString(), origem: "import" });
  }
  if (!itens.length) throw new Error(`Nenhuma baixa reconhecida.${naoAchei.length ? ` Não achei: ${naoAchei.slice(0, 5).join(", ")}` : ""}`);
  const { error } = await supabase.from("baixas").upsert(itens, { onConflict: "user_id,tipo,item_id,mes" });
  if (error) throw error;
  return `${itens.length} baixas importadas${naoAchei.length ? ` · ${naoAchei.length} não encontradas (${naoAchei.slice(0, 3).join(", ")}${naoAchei.length > 3 ? "…" : ""})` : ""}`;
}

export function baixarModeloSituacao(tipo: "saldos" | "baixas") {
  const wb = XLSX.utils.book_new();
  const dados = tipo === "saldos"
    ? [["BANCO", "SALDO", "DATA"], ["SICREDI", 15230.45, "28/09/2026"], ["INTER", 4200, "28/09/2026"]]
    : [["TIPO", "CODIGO", "DESCRIÇÃO", "MÊS", "VALOR", "DATA", "BANCO"], ["RECEBER", 101, "Loja Exemplo Ltda", "10/2026", 1250, "10/10/2026", "SICREDI"], ["PAGAR", "", "Aluguel sala", "10/2026", 2500, "05/10/2026", "SICREDI"]];
  const ajuda = tipo === "saldos"
    ? ["Uma linha por banco. BANCO e SALDO são obrigatórios.", "DATA = dia em que o saldo foi conferido (vazio = hoje). Baixas feitas depois dessa data mexem no saldo atual.", "Reimportar substitui o saldo dos bancos listados."]
    : ["Uma linha por baixa. TIPO (RECEBER ou PAGAR), DESCRIÇÃO, MÊS e VALOR são obrigatórios.", "DESCRIÇÃO deve ser igual à do cadastro (empresa, origem pessoal ou despesa). CÓDIGO ajuda a achar a empresa.", "MÊS no formato 10/2026. DATA = dia do pagamento (vazio = hoje). BANCO vazio = banco do cadastro.", "Reimportar a mesma conta no mesmo mês substitui a baixa."];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados), tipo.toUpperCase());
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["COMO PREENCHER"], ...ajuda.map((t) => [t])]), "COMO PREENCHER");
  XLSX.writeFile(wb, `modelo-${tipo}.xlsx`);
}
