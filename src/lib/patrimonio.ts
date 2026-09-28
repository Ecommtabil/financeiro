/** Investimentos, bens e dívidas: leitura, gravação e importação por planilha. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { acharCabecalho, lerPlanilha, norm, paraNumero } from "./importacao";
import type { Saida } from "./dados";
import { tipoInvestimentoSugerido } from "./calc";

export type TabPat = "investimentos" | "bens" | "dividas";

export function useListaPat<T extends TabPat>(t: T) {
  return useQuery({
    queryKey: [t],
    queryFn: async () => {
      const { data, error } = await supabase.from(t).select("*").order("created_at");
      if (error) throw error;
      return data as Tables<T>[];
    },
  });
}
export function useInserirPat<T extends TabPat>(t: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: TablesInsert<T> | TablesInsert<T>[]) => {
      const { error } = await supabase.from(t).insert(v as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [t] }),
  });
}
export function useAtualizarPat<T extends TabPat>(t: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, v }: { id: string; v: TablesUpdate<T> }) => {
      const { error } = await supabase.from(t as "bens").update(v as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [t] }),
  });
}
export function useExcluirPat(t: TabPat) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(t).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [t] }),
  });
}

function linhas(wb: XLSX.WorkBook, alvo: string): unknown[][] {
  const nome = wb.SheetNames.find((n) => norm(n) === alvo) ?? wb.SheetNames.find((n) => norm(n) !== "COMO PREENCHER");
  if (!nome) throw new Error("A planilha não tem abas com dados.");
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, { header: 1, raw: true, defval: null });
}
const col = (cab: string[], ...ks: string[]) => cab.findIndex((c) => ks.some((k) => c.includes(k)));
const txt = (r: unknown[], i: number) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
const num = (r: unknown[], i: number) => (i >= 0 ? paraNumero(r[i]) ?? 0 : 0);
const destinoDe = (v: string) => { const n = norm(v); return n.includes("ESCRIT") ? "ESCRITORIO" : n.includes("PESSOA") || n.includes("CASA") ? "PESSOAL" : null; };

/** Reimportação substitui os itens de origem 'import' e mantém os 'manual'. APORTE/PARCELA pode ser número ou a descrição de uma saída. */
export async function importarPat(t: TabPat, file: File, saidas: Saida[]): Promise<string> {
  const rows = linhas(await lerPlanilha(file), t.toUpperCase());
  const h = acharCabecalho(rows, ["NOME"]);
  const cab = (rows[h] ?? []).map(norm);
  const porNome = new Map(saidas.map((s) => [norm(s.descricao), s.id]));
  const c = { nome: col(cab, "NOME"), tipo: col(cab, "TIPO"), inst: col(cab, "INSTITUI", "CREDOR"), dest: col(cab, "DESTINO"),
    saldo: col(cab, "SALDO"), valor: col(cab, "VALOR"), taxa: col(cab, "TAXA", "JUROS"), vinc: col(cab, "APORTE", "PARCELA") };
  const itens: Record<string, unknown>[] = [];
  const naoAchei: string[] = [];
  for (const r of rows.slice(h + 1)) {
    const nome = txt(r, c.nome);
    if (!nome) continue;
    const v = c.vinc >= 0 ? r[c.vinc] : null;
    const vNum = paraNumero(v);
    let saida_id: string | null = null;
    if (v != null && vNum == null && String(v).trim()) { saida_id = porNome.get(norm(v)) ?? null; if (!saida_id) naoAchei.push(String(v)); }
    if (t === "investimentos") itens.push({ nome, tipo: txt(r, c.tipo) || tipoInvestimentoSugerido(nome), instituicao: txt(r, c.inst) || null, destino: destinoDe(txt(r, c.dest)), saldo_inicial: num(r, c.saldo), taxa: num(r, c.taxa), aporte_fixo: vNum ?? 0, saida_id, origem: "import" });
    else if (t === "bens") itens.push({ nome, tipo: txt(r, c.tipo) || null, valor: num(r, c.valor >= 0 ? c.valor : c.saldo), origem: "import" });
    else itens.push({ nome, credor: txt(r, c.inst) || null, saldo: num(r, c.saldo), juros: num(r, c.taxa), parcela_fixa: vNum ?? 0, saida_id, origem: "import" });
  }
  if (!itens.length) throw new Error("Nenhuma linha com NOME encontrada.");
  const del = await supabase.from(t).delete().eq("origem", "import");
  if (del.error) throw del.error;
  const { error } = await supabase.from(t).insert(itens as never);
  if (error) throw error;
  return `${itens.length} importados${naoAchei.length ? ` · saída não encontrada: ${naoAchei.slice(0, 3).join(", ")}` : ""}`;
}

export function baixarModeloPat(t: TabPat) {
  const dados: Record<TabPat, unknown[][]> = {
    investimentos: [["NOME", "TIPO", "INSTITUIÇÃO", "DESTINO", "SALDO", "TAXA % A.M.", "APORTE"], ["CDB Reserva", "Aplicação", "SICREDI", "PESSOAL", 20000, 0.9, 500], ["Consórcio carro", "Consórcio", "SICREDI", "PESSOAL", 8000, 0, "CONSORCIO CARRO"]],
    bens: [["NOME", "TIPO", "VALOR"], ["Carro", "Veículo", 65000], ["Sala comercial", "Imóvel", 280000]],
    dividas: [["NOME", "CREDOR", "SALDO", "JUROS % A.M.", "PARCELA"], ["Pronampe", "BANCO DO BRASIL", 45000, 1.1, "PRONAMPE"], ["Empréstimo pessoal", "INTER", 10000, 2, 800]],
  };
  const ajuda: Record<TabPat, string[]> = {
    investimentos: ["Uma linha por investimento. NOME é obrigatório.", "SALDO = saldo na data da base zero. TAXA = rendimento % ao mês (0,9 = 0,9%).", "APORTE = valor fixo por mês OU a descrição de uma saída igual à do Cadastro (o aporte vira o valor projetado dela).", "DESTINO: ESCRITÓRIO ou PESSOAL. Reimportar substitui os importados antes e mantém os cadastrados na tela."],
    bens: ["Uma linha por bem. NOME e VALOR são obrigatórios.", "Reimportar substitui os importados antes e mantém os cadastrados na tela."],
    dividas: ["Uma linha por dívida. NOME é obrigatório.", "SALDO = saldo devedor na base zero. JUROS = % ao mês.", "PARCELA = valor fixo OU a descrição de uma saída igual à do Cadastro.", "Reimportar substitui as importadas antes e mantém as cadastradas na tela."],
  };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dados[t]), t.toUpperCase());
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["COMO PREENCHER"], ...ajuda[t].map((x) => [x])]), "COMO PREENCHER");
  XLSX.writeFile(wb, `modelo-${t}.xlsx`);
}
