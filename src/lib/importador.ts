/** Sistema único de importação/exportação por planilha: 10 tipos, modelo preenchido com os dados atuais e backup completo. */
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import type { Json, TablesInsert } from "@/integrations/supabase/types";
import type { Config } from "./config";
import type { Entrada, EntradaPessoal, Saida } from "./dados";
import { calcularHorizonte, type Horizonte } from "./horizonte";
import { formatarBRL, normalizarBanco } from "./format";
import { acharCabecalho, chaveMes, lerMes, lerPlanilha, norm, paraNumero } from "./importacao";
import {
  CHAVE_CAT_PESSOAL, GRUPOS_DRE, chaveCatDRE, chaveCatEntrada, chaveCatSaida, destinoSaida, fator, grupoDRE, grupoPadraoDRE,
  regraDo, tipoInvestimentoSugerido, valorEntrada, valorSaida,
  type Baixa, type Bem, type Divida, type GrupoDRE, type Investimento, type Regra, type Saldo,
} from "./calc";

export type TipoImp = "entradas" | "saidas" | "pessoais" | "saldos" | "baixas" | "reajustes" | "dre" | "investimentos" | "bens" | "dividas";

export type Ctx = {
  cfg: Config; h: Horizonte;
  entradas: Entrada[]; saidas: Saida[]; pessoais: EntradaPessoal[];
  saldos: Saldo[]; baixas: Baixa[]; investimentos: Investimento[]; bens: Bem[]; dividas: Divida[];
};

export type Previa = {
  resumo: string;
  cab: string[];
  linhas: string[][];
  avisos: string[];
  aplicar: () => Promise<string>;
};

type Def = {
  id: TipoImp; titulo: string; aba: string; aliases?: string[]; chaves: string[]; contagem: string;
  colunas: [string, string][];
  exportar: (c: Ctx) => unknown[][];
  ler: (rows: unknown[][], c: Ctx) => Previa;
};

// ---------- utilidades ----------
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r2 = (n: number) => Math.round(n * 100) / 100;
const txt = (r: unknown[], i: number) => (i >= 0 && r[i] != null ? String(r[i]).trim() : "");
const num = (r: unknown[], i: number) => (i >= 0 ? paraNumero(r[i]) : null);
const col = (cab: string[], ...ks: string[]) => cab.findIndex((c) => ks.some((k) => c.includes(k)));
const banco = (s: string) => (s ? normalizarBanco(s) : null);
const destinoDe = (v: string) => { const n = norm(v); return n.includes("ESCRIT") ? "ESCRITORIO" : n.includes("PESSOA") || n.includes("CASA") ? "PESSOAL" : null; };
const destinoTxt = (d: string | null) => (d === "ESCRITORIO" ? "ESCRITÓRIO" : d === "PESSOAL" ? "PESSOAL" : "");
const mmaaaa = (k: string | null | undefined) => (k ? `${k.slice(5, 7)}/${k.slice(0, 4)}` : "");
const dataBR = (iso: string) => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`; };
function dataISO(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number" && v > 20000 && v < 80000) { const d = XLSX.SSF.parse_date_code(v); return new Date(d.y, d.m - 1, d.d, 12).toISOString(); }
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12).toISOString() : null;
}
function dia(v: unknown): number | null {
  if (v instanceof Date) return v.getDate();
  const n = paraNumero(v);
  return n && n >= 1 && n <= 31 ? Math.round(n) : null;
}
const mesDe = (v: unknown, anoBase: number) => { const m = lerMes(v); return m ? chaveMes(m.ano ?? anoBase, m.mes) : null; };
const cel = (v: unknown) => (v == null ? "" : typeof v === "number" ? v.toLocaleString("pt-BR", { maximumFractionDigits: 6 }) : v instanceof Date ? dataBR(v.toISOString()) : String(v));
const amostra = (cab: string[], linhas: unknown[][]) => ({ cab, linhas: linhas.map((l) => l.map(cel)) });
const sim = (v: unknown) => !["NAO", "N", "0", "FALSE", "FALSO"].includes(norm(v));

async function substituirImportados<T extends "entradas" | "saidas" | "entradas_pessoais">(t: T, novos: TablesInsert<T>[], manuais: { id: string; chave: string }[], chave: (i: TablesInsert<T>) => string) {
  const porChave = new Map(manuais.map((m) => [m.chave, m.id]));
  const inserir: TablesInsert<T>[] = [];
  for (const n of novos) {
    const id = porChave.get(chave(n));
    if (id) {
      const { origem: _o, ...resto } = n as Record<string, unknown>;
      const { error } = await supabase.from(t as "saidas").update(resto as never).eq("id", id);
      if (error) throw error;
    } else inserir.push(n);
  }
  const del = await supabase.from(t as "saidas").delete().eq("origem", "import");
  if (del.error) throw del.error;
  for (let i = 0; i < inserir.length; i += 500) {
    const { error } = await supabase.from(t).insert(inserir.slice(i, i + 500) as never);
    if (error) throw error;
  }
}
async function substituirLista(t: "investimentos" | "bens" | "dividas", itens: Record<string, unknown>[]) {
  const ids = (await supabase.from(t).select("id")).data?.map((x) => x.id) ?? [];
  if (ids.length) { const d = await supabase.from(t).delete().in("id", ids); if (d.error) throw d.error; }
  if (itens.length) { const { error } = await supabase.from(t).insert(itens as never); if (error) throw error; }
}
async function salvarConfig(v: Partial<TablesInsert<"config">>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Sessão expirada");
  const { error } = await supabase.from("config").upsert({ ...v, user_id: u.user.id, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// ---------- itens para reajustes ----------
const GRUPOS_REAJ = [
  { g: "E", nome: "ENTRADAS" }, { g: "SE", nome: "SAIDAS ESCRITORIO" }, { g: "SP", nome: "SAIDAS PESSOAIS" }, { g: "EP", nome: "ENTRADAS PESSOAIS" },
] as const;
type ItemR = { id: string; nome: string; g: string; tipo: "E" | "S"; cat: string; catKey: string };
function itensReaj(c: Ctx): ItemR[] {
  return [
    ...c.entradas.map((e) => ({ id: e.id, nome: e.empresa, g: "E", tipo: "E" as const, cat: e.carteira ?? "", catKey: chaveCatEntrada(e) })),
    ...c.saidas.map((s) => ({ id: s.id, nome: s.descricao, g: destinoSaida(s) === "PESSOAL" ? "SP" : "SE", tipo: "S" as const, cat: s.categoria ?? "", catKey: chaveCatSaida(s) })),
    ...c.pessoais.map((p) => ({ id: p.id, nome: p.descricao, g: "EP", tipo: "E" as const, cat: "ENTRADAS PESSOAIS", catKey: CHAVE_CAT_PESSOAL })),
  ];
}
function catDaChave(k: string): { g: string; nome: string } | null {
  if (k === CHAVE_CAT_PESSOAL) return { g: "EP", nome: "ENTRADAS PESSOAIS" };
  const p = k.split("|");
  if (p[0] === "E") return { g: "E", nome: p.slice(1).join("|") };
  if (p[0] === "S") return { g: p[1] === "PESSOAL" ? "SP" : "SE", nome: p.slice(2).join("|") };
  return null;
}
const chaveCatDe = (g: string, nome: string) =>
  g === "EP" ? CHAVE_CAT_PESSOAL : g === "E" ? `E|${nome.toUpperCase()}` : `S|${g === "SP" ? "PESSOAL" : "ESCRITORIO"}|${nome.toUpperCase()}`;
const grupoReajDe = (v: unknown) => {
  const n = norm(v);
  if (n.includes("PESSOA")) return n.includes("SAIDA") ? "SP" : "EP";
  if (n.includes("SAIDA")) return "SE";
  if (n.includes("ENTRADA")) return "E";
  return null;
};

function acharLinhaDRE(v: unknown): GrupoDRE | null {
  const t = norm(v);
  if (!t) return null;
  if (t.includes("IMPOST")) return "IMP";
  if (t.includes("PESSOAL")) return "PES";
  if (t.includes("SOCIO") || t.includes("RETIRADA")) return "SOC";
  if (t.includes("FINANC") || t.includes("INVEST")) return "FIN";
  if (t.includes("DESPESA") || t.includes("OPERAC") || t.includes("ADMIN")) return "DESP";
  return null;
}

// ---------- definições ----------
export const TIPOS: Def[] = [
  {
    id: "entradas", titulo: "Entradas", aba: "ENTRADAS", aliases: ["RECEITAS"], chaves: ["EMPRESA", "VALOR"], contagem: "entradas",
    colunas: [["CODIGOS", "Código do cliente"], ["EMPRESAS", "Nome da empresa (obrigatório)"], ["CARTEIRA", "Carteira"], ["Dia do vencimento", "Dia 1 a 31"], ["Recebimento", "Banco onde recebe"], ["Situação", "Ativo ou Inativo"], ["Regime Tributário", "Regime"], ["Grupo", "Grupo (boleto único)"], ["Setor", "Setor"], ["Valor", "Valor mensal (obrigatório; pode ser fórmula)"], ["INICIO", "Primeiro mês mm/aaaa (opcional)"], ["FIM", "Último mês mm/aaaa (opcional)"]],
    exportar: (c) => [
      ["CODIGOS", "EMPRESAS", "CARTEIRA", "Dia do vencimento", "Recebimento", "Situação", "Regime Tributário", "Grupo", "Setor", "Valor", "INICIO", "FIM"],
      ...c.entradas.map((e) => [e.codigo ?? "", e.empresa, e.carteira ?? "", e.dia ?? "", e.banco ?? "", e.ativo ? "Ativo" : "Inativo", e.regime ?? "", e.grupo ?? "", e.setor ?? "", Number(e.valor), mmaaaa(e.inicio), mmaaaa(e.fim)]),
    ],
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["EMPRESA", "VALOR"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { cod: col(cab, "CODIGO"), emp: col(cab, "EMPRESA"), cart: col(cab, "CARTEIRA"), dia: col(cab, "VENCIMENTO", "DIA"), banco: col(cab, "RECEBIMENTO", "BANCO"), sit: col(cab, "SITUA"), reg: col(cab, "REGIME"), grupo: col(cab, "GRUPO"), setor: col(cab, "SETOR"), valor: col(cab, "VALOR"), ini: col(cab, "INICIO"), fim: col(cab, "FIM") };
      const itens: TablesInsert<"entradas">[] = [];
      for (const r of rows.slice(h + 1)) {
        const empresa = txt(r, ci.emp), valor = num(r, ci.valor);
        if (!empresa || !valor) continue;
        itens.push({ codigo: txt(r, ci.cod) || null, empresa, carteira: txt(r, ci.cart) || null, dia: dia(r[ci.dia]), banco: banco(txt(r, ci.banco)), ativo: !norm(r[ci.sit]).startsWith("INATIV"), regime: txt(r, ci.reg) || null, grupo: txt(r, ci.grupo) || null, setor: txt(r, ci.setor) || null, valor: r6(valor), inicio: ci.ini >= 0 ? mesDe(r[ci.ini], c.h.base.ano) : null, fim: ci.fim >= 0 ? mesDe(r[ci.fim], c.h.base.ano) : null, origem: "import" });
      }
      const k = (i: { codigo?: string | null; empresa: string }) => `${norm(i.codigo)}|${norm(i.empresa)}`;
      const total = itens.reduce((s, i) => s + Number(i.valor ?? 0), 0);
      return {
        resumo: `${itens.length} contratos · ${formatarBRL(total)}/mês`, avisos: [],
        ...amostra(["Código", "Empresa", "Carteira", "Dia", "Banco", "Ativo", "Valor"], itens.map((i) => [i.codigo, i.empresa, i.carteira, i.dia, i.banco, i.ativo ? "Sim" : "Não", i.valor])),
        aplicar: async () => { await substituirImportados("entradas", itens, c.entradas.filter((e) => e.origem !== "import").map((e) => ({ id: e.id, chave: k(e) })), k); return `${itens.length} entradas`; },
      };
    },
  },
  {
    id: "saidas", titulo: "Saídas", aba: "SAIDAS", aliases: ["DESPESAS"], chaves: ["DESCRI"], contagem: "saídas",
    colunas: [["DESCRIÇÃO", "Nome da despesa (obrigatório)"], ["CATEGORIA", "Categoria (\"Físico (2016)\"/\"Virtual (2024)\" vira ASSINATURAS)"], ["PGTO", "Forma de pagamento"], ["BANCO", "Banco"], ["VCTO", "Dia do vencimento"], ["DESTINO", "ESCRITÓRIO, PESSOAL/CASA ou vazio"], ["Um mês por coluna", "10/2026, OUT/26, OUTUBRO ou OUTUBRO 2026 — valor do mês"]],
    exportar: (c) => {
      const ks = new Set<string>();
      for (const s of c.saidas) { Object.keys((s.valores_mes ?? {}) as object).forEach((k) => ks.add(k)); if (s.ri) ks.add(s.ri); if (s.rf) ks.add(s.rf); }
      let meses = [...ks].sort();
      if (meses.length) {
        const todos: string[] = []; let [a, m] = meses[0]!.split("-").map(Number) as [number, number];
        const fim = meses[meses.length - 1]!;
        while (chaveMes(a, m) <= fim) { todos.push(chaveMes(a, m)); m++; if (m > 12) { m = 1; a++; } }
        meses = todos;
      } else meses = c.h.meses.slice(0, 12).map((x) => chaveMes(x.ano, x.mes));
      return [
        ["DESCRIÇÃO", "CATEGORIA", "PGTO", "BANCO", "VCTO", "DESTINO", ...meses.map(mmaaaa)],
        ...c.saidas.map((s) => [s.descricao, s.categoria ?? "", s.pgto ?? "", s.banco ?? "", s.dia ?? "", destinoTxt(s.destino), ...meses.map((k) => valorSaida(s, k) || "")]),
      ];
    },
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["DESCRI"]);
      const bruto = rows[h] ?? [], cab = bruto.map(norm);
      const ci = { desc: col(cab, "DESCRI"), cat: col(cab, "CATEGORIA"), pgto: col(cab, "PGTO", "PAGAMENTO"), banco: col(cab, "BANCO"), vcto: col(cab, "VCTO", "VENC"), dest: col(cab, "DESTINO") };
      const fixas = new Set(Object.values(ci));
      const meses: { idx: number; chave: string }[] = [];
      let ano = c.h.base.ano, ant = 0;
      bruto.forEach((v, idx) => {
        if (fixas.has(idx)) return;
        const m = lerMes(v); if (!m) return;
        if (m.ano != null) ano = m.ano; else if (ant && m.mes < ant) ano++;
        ant = m.mes; meses.push({ idx, chave: chaveMes(ano, m.mes) });
      });
      if (!meses.length) throw new Error("Não achei as colunas de mês (ex.: OUTUBRO, OUT/26, 10/2026).");
      const ri = meses[0]!.chave, rf = meses[meses.length - 1]!.chave;
      const antigos = new Map(c.saidas.filter((s) => s.destino).map((s) => [norm(s.descricao), s.destino]));
      const itens: TablesInsert<"saidas">[] = [];
      for (const r of rows.slice(h + 1)) {
        const descricao = txt(r, ci.desc); if (!descricao) continue;
        const valores_mes: Record<string, number> = {};
        for (const m of meses) { const n = paraNumero(r[m.idx]); if (n) valores_mes[m.chave] = r6(n); }
        let categoria = txt(r, ci.cat) || null, pgto = txt(r, ci.pgto) || null;
        if (categoria && /^(FISICO|VIRTUAL) ?\(\d{4}\)$/.test(norm(categoria))) { pgto = `CARTÃO ${categoria}`; categoria = "ASSINATURAS"; }
        const destino = destinoDe(txt(r, ci.dest)) ?? antigos.get(norm(descricao)) ?? null;
        itens.push({ descricao, categoria, pgto, banco: banco(txt(r, ci.banco)), dia: dia(r[ci.vcto]), destino, valores_mes, valor_fixo: null, ri, rf, origem: "import" });
      }
      const k = (i: { descricao: string }) => norm(i.descricao);
      const sem = itens.filter((i) => !i.destino).length;
      return {
        resumo: `${itens.length} despesas · ${mmaaaa(ri)} a ${mmaaaa(rf)}`, avisos: sem ? [`${sem} saídas sem destino — contam como escritório até você revisar.`] : [],
        ...amostra(["Descrição", "Categoria", "Pgto", "Banco", "Dia", "Destino", `Valor ${mmaaaa(ri)}`], itens.map((i) => [i.descricao, i.categoria, i.pgto, i.banco, i.dia, destinoTxt(i.destino ?? null), (i.valores_mes as Record<string, number>)[ri] ?? ""])),
        aplicar: async () => { await substituirImportados("saidas", itens, c.saidas.filter((s) => s.origem !== "import").map((s) => ({ id: s.id, chave: k(s) })), k); return `${itens.length} saídas`; },
      };
    },
  },
  {
    id: "pessoais", titulo: "Entradas pessoais", aba: "PESSOAIS", aliases: ["ENTRADAS PESSOAIS"], chaves: ["ORIGEM", "VALOR"], contagem: "entradas pessoais",
    colunas: [["ORIGEM", "De onde vem (obrigatório)"], ["DIA", "Dia do recebimento"], ["BANCO", "Banco"], ["VALOR", "Valor mensal (obrigatório)"], ["INICIO", "Primeiro mês mm/aaaa"], ["FIM", "Último mês mm/aaaa (vazio = contínua)"]],
    exportar: (c) => [["ORIGEM", "DIA", "BANCO", "VALOR", "INICIO", "FIM"], ...c.pessoais.map((p) => [p.descricao, p.dia ?? "", p.banco ?? "", Number(p.valor), mmaaaa(p.inicio), mmaaaa(p.fim)])],
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["ORIGEM", "VALOR"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { ori: col(cab, "ORIGEM"), dia: col(cab, "DIA"), banco: col(cab, "BANCO"), ini: col(cab, "INICIO"), fim: col(cab, "FIM"), valor: col(cab, "VALOR") };
      const itens: TablesInsert<"entradas_pessoais">[] = [];
      for (const r of rows.slice(h + 1)) {
        const descricao = txt(r, ci.ori), valor = num(r, ci.valor);
        if (!descricao || !valor) continue;
        itens.push({ descricao, dia: dia(r[ci.dia]), banco: banco(txt(r, ci.banco)), inicio: ci.ini >= 0 ? mesDe(r[ci.ini], c.h.base.ano) : null, fim: ci.fim >= 0 ? mesDe(r[ci.fim], c.h.base.ano) : null, valor: r6(valor), origem: "import" });
      }
      const k = (i: { descricao: string }) => norm(i.descricao);
      const total = itens.reduce((s, i) => s + Number(i.valor ?? 0), 0);
      return {
        resumo: `${itens.length} entradas pessoais · ${formatarBRL(total)}/mês`, avisos: [],
        ...amostra(["Origem", "Dia", "Banco", "Valor", "Início", "Fim"], itens.map((i) => [i.descricao, i.dia, i.banco, i.valor, mmaaaa(i.inicio), mmaaaa(i.fim)])),
        aplicar: async () => { await substituirImportados("entradas_pessoais", itens, c.pessoais.filter((p) => p.origem !== "import").map((p) => ({ id: p.id, chave: k(p) })), k); return `${itens.length} entradas pessoais`; },
      };
    },
  },
  {
    id: "saldos", titulo: "Saldos bancários", aba: "SALDOS", chaves: ["BANCO", "SALDO"], contagem: "saldos",
    colunas: [["BANCO", "Nome do banco (obrigatório)"], ["SALDO", "Saldo conferido (obrigatório)"], ["DATA", "Dia da conferência (só referência; grava como agora)"]],
    exportar: (c) => [["BANCO", "SALDO", "DATA"], ...c.saldos.map((s) => [s.banco, Number(s.saldo), dataBR(s.atualizado_em)])],
    ler: (rows) => {
      const h = acharCabecalho(rows, ["BANCO", "SALDO"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { banco: col(cab, "BANCO"), saldo: col(cab, "SALDO") };
      const agora = new Date().toISOString();
      const itens: TablesInsert<"saldos">[] = [];
      for (const r of rows.slice(h + 1)) {
        const b = txt(r, ci.banco), saldo = num(r, ci.saldo);
        if (!b || saldo == null) continue;
        itens.push({ banco: normalizarBanco(b), saldo, atualizado_em: agora, origem: "import" });
      }
      return {
        resumo: `${itens.length} bancos · ${formatarBRL(itens.reduce((s, i) => s + Number(i.saldo), 0))}`, avisos: [],
        ...amostra(["Banco", "Saldo"], itens.map((i) => [i.banco, i.saldo])),
        aplicar: async () => { if (itens.length) { const { error } = await supabase.from("saldos").upsert(itens, { onConflict: "user_id,banco" }); if (error) throw error; } return `${itens.length} saldos`; },
      };
    },
  },
  {
    id: "baixas", titulo: "Baixas", aba: "BAIXAS", chaves: ["TIPO", "MES"], contagem: "baixas",
    colunas: [["TIPO", "RECEBER ou PAGAR"], ["MES", "Mês da conta mm/aaaa"], ["IDENTIFICACAO", "Receber: código, empresa, entrada pessoal ou grupo. Pagar: descrição da saída"], ["VALOR", "Valor baixado (vazio = previsto)"], ["DATA", "Dia do pagamento dd/mm/aaaa (vazio = hoje)"]],
    exportar: (c) => {
      const ent = new Map(c.entradas.map((e) => [e.id, e])), pes = new Map(c.pessoais.map((p) => [p.id, p])), sai = new Map(c.saidas.map((s) => [s.id, s]));
      const linhas: unknown[][] = [];
      for (const b of [...c.baixas].sort((a, z) => a.mes.localeCompare(z.mes))) {
        const id = b.tipo === "entrada" ? (ent.get(b.item_id)?.codigo || ent.get(b.item_id)?.empresa) : b.tipo === "pessoal" ? pes.get(b.item_id)?.descricao : sai.get(b.item_id)?.descricao;
        if (!id) continue;
        linhas.push([b.tipo === "saida" ? "PAGAR" : "RECEBER", mmaaaa(b.mes), id, Number(b.valor), dataBR(b.baixado_em)]);
      }
      return [["TIPO", "MES", "IDENTIFICACAO", "VALOR", "DATA"], ...linhas];
    },
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["TIPO", "MES"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { tipo: col(cab, "TIPO"), mes: col(cab, "MES"), id: col(cab, "IDENTIFICA", "DESCRI", "EMPRESA", "NOME"), valor: col(cab, "VALOR"), data: col(cab, "DATA") };
      const { cfg, h: hz } = c;
      const previstoE = (e: Entrada, k: string) => { const [a, m] = k.split("-").map(Number) as [number, number]; return valorEntrada(e, k) * fator({ ano: a, mes: m }, hz.y0, cfg.reajuste_mes, regraDo(cfg, e.id, chaveCatEntrada(e), "E")); };
      const previstoP = (p: EntradaPessoal, k: string) => { const [a, m] = k.split("-").map(Number) as [number, number]; const v = (!p.inicio || k >= p.inicio) && (!p.fim || k <= p.fim) ? Number(p.valor) : 0; return v * fator({ ano: a, mes: m }, hz.y0, cfg.reajuste_mes, regraDo(cfg, p.id, CHAVE_CAT_PESSOAL, "E")); };
      const previstoS = (s: Saida, k: string) => { const [a, m] = k.split("-").map(Number) as [number, number]; return valorSaida(s, k) * fator({ ano: a, mes: m }, hz.y0, cfg.reajuste_mes, regraDo(cfg, s.id, chaveCatSaida(s), "S")); };
      const gk = (g: string | null) => norm(g).replace(/\s/g, "");
      const itens = new Map<string, TablesInsert<"baixas">>();
      const nao: string[] = []; const vis: unknown[][] = [];
      const add = (tipo: "entrada" | "pessoal" | "saida", id: string, bco: string | null, mes: string, valor: number, em: string, nome: string, how: string) => {
        itens.set(`${tipo}|${id}|${mes}`, { tipo, item_id: id, mes, valor: r2(valor), banco: bco ? normalizarBanco(bco) : null, baixado_em: em, origem: "import" });
        vis.push([tipo === "saida" ? "PAGAR" : "RECEBER", mmaaaa(mes), nome, r2(valor), how]);
      };
      for (const r of rows.slice(h + 1)) {
        const ident = txt(r, ci.id), n = norm(ident), mes = mesDe(r[ci.mes], hz.base.ano);
        if (!ident || !mes) continue;
        const valor = num(r, ci.valor), em = (ci.data >= 0 && dataISO(r[ci.data])) || new Date().toISOString();
        if (norm(r[ci.tipo]).startsWith("PAG")) {
          const s = c.saidas.find((x) => norm(x.descricao) === n) ?? c.saidas.find((x) => norm(x.descricao).includes(n));
          if (!s) { nao.push(`PAGAR ${ident}`); continue; }
          add("saida", s.id, s.banco, mes, valor ?? previstoS(s, mes), em, s.descricao, norm(s.descricao) === n ? "descrição" : "contém o texto");
          continue;
        }
        const e = c.entradas.find((x) => x.codigo && norm(x.codigo) === n) ?? c.entradas.find((x) => norm(x.empresa) === n);
        if (e) { add("entrada", e.id, e.banco, mes, valor ?? previstoE(e, mes), em, e.empresa, e.codigo && norm(e.codigo) === n ? "código" : "empresa"); continue; }
        const p = c.pessoais.find((x) => norm(x.descricao) === n);
        if (p) { add("pessoal", p.id, p.banco, mes, valor ?? previstoP(p, mes), em, p.descricao, "entrada pessoal"); continue; }
        const grupo = c.entradas.filter((x) => x.grupo && gk(x.grupo) === gk(ident)).map((x) => ({ x, prev: previstoE(x, mes) })).filter((g) => g.prev > 0);
        if (grupo.length) {
          const tot = grupo.reduce((s, g) => s + g.prev, 0);
          for (const g of grupo) add("entrada", g.x.id, g.x.banco, mes, valor == null ? g.prev : valor * g.prev / tot, em, g.x.empresa, `grupo ${ident}`);
          continue;
        }
        const e2 = c.entradas.find((x) => norm(x.empresa).includes(n));
        if (e2) { add("entrada", e2.id, e2.banco, mes, valor ?? previstoE(e2, mes), em, e2.empresa, "contém o texto"); continue; }
        const p2 = c.pessoais.find((x) => norm(x.descricao).includes(n));
        if (p2) { add("pessoal", p2.id, p2.banco, mes, valor ?? previstoP(p2, mes), em, p2.descricao, "contém o texto"); continue; }
        nao.push(`RECEBER ${ident}`);
      }
      const lista = [...itens.values()];
      return {
        resumo: `${lista.length} baixas reconhecidas${nao.length ? ` · ${nao.length} não encontradas` : ""}`,
        avisos: nao.length ? [`Não encontradas (${nao.length}): ${nao.slice(0, 30).join(", ")}${nao.length > 30 ? "…" : ""}`] : [],
        ...amostra(["Tipo", "Mês", "Conta", "Valor", "Achada por"], vis),
        aplicar: async () => {
          for (let i = 0; i < lista.length; i += 500) { const { error } = await supabase.from("baixas").upsert(lista.slice(i, i + 500), { onConflict: "user_id,tipo,item_id,mes" }); if (error) throw error; }
          return `${lista.length} baixas`;
        },
      };
    },
  },
  {
    id: "reajustes", titulo: "Reajustes", aba: "REAJUSTES", chaves: ["GRUPO", "NOME"], contagem: "reajustes",
    colunas: [["Configuração (no topo)", "Mês do reajuste e índices padrão de entradas e saídas"], ["GRUPO", "Entradas, Saídas escritório, Saídas pessoais ou Entradas pessoais"], ["CATEGORIA", "Carteira ou categoria do cadastro"], ["NOME", "Empresa, despesa ou entrada pessoal já cadastrada"], ["REAJUSTAR", "SIM ou NÃO"], ["ÍNDICE ANUAL %", "Percentual ao ano (5 = 5%)"]],
    exportar: (c) => {
      const nomeG = (g: string) => GRUPOS_REAJ.find((x) => x.g === g)?.nome ?? g;
      const linhas = itensReaj(c)
        .sort((a, b) => nomeG(a.g).localeCompare(nomeG(b.g), "pt-BR") || a.cat.localeCompare(b.cat, "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"))
        .map((it) => {
          const r = regraDo(c.cfg, it.id, it.catKey, it.tipo);
          return [nomeG(it.g), it.cat, it.nome, r.sobe === false ? "NÃO" : "SIM", Number(r.indice)];
        });
      return [
        ["CONFIGURAÇÃO", "VALOR"],
        ["MÊS DO REAJUSTE", c.cfg.reajuste_mes],
        ["ÍNDICE PADRÃO ENTRADAS %", Number(c.cfg.indice_padrao_entradas)],
        ["ÍNDICE PADRÃO SAÍDAS %", Number(c.cfg.indice_padrao_saidas)],
        [],
        ["GRUPO", "CATEGORIA", "NOME", "REAJUSTAR", "ÍNDICE ANUAL %"],
        ...linhas,
      ];
    },
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["GRUPO", "NOME"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { niv: col(cab, "NIVEL"), g: col(cab, "GRUPO"), nome: col(cab, "NOME"), sobe: col(cab, "SOBE", "REAJUST"), ind: col(cab, "INDICE") };
      const its = itensReaj(c);
      const rc = { ...((c.cfg.regras_categoria ?? {}) as Record<string, Regra>) }, ri = { ...((c.cfg.regras_item ?? {}) as Record<string, Regra>) };
      const padrao: Partial<Config> = {};
      const nao: string[] = []; const vis: unknown[][] = [];
      let n = 0;
      if (ci.niv < 0) {
        for (const r of rows.slice(0, h)) {
          const nome = norm(r[0]), valor = paraNumero(r[1]);
          if (valor == null) continue;
          if (nome.includes("MES") && valor >= 1 && valor <= 12) padrao.reajuste_mes = Math.round(valor);
          else if (nome.includes("PADRAO") && nome.includes("ENTRADA")) padrao.indice_padrao_entradas = valor;
          else if (nome.includes("PADRAO") && nome.includes("SAIDA")) padrao.indice_padrao_saidas = valor;
        }
        const cfgBase = { ...c.cfg, ...padrao };
        const regrasCat = (cfgBase.regras_categoria ?? {}) as Record<string, Regra>;
        const regraSemItem = (it: ItemR): Regra => regrasCat[it.catKey] ?? {
          sobe: true,
          indice: it.tipo === "E" ? Number(cfgBase.indice_padrao_entradas) : Number(cfgBase.indice_padrao_saidas),
        };
        for (const r of rows.slice(h + 1)) {
          const g = grupoReajDe(r[ci.g]), nome = txt(r, ci.nome), nn = norm(nome), ind = num(r, ci.ind);
          if (!g || !nome || ind == null) continue;
          const it = its.find((i) => i.g === g && norm(i.nome) === nn);
          if (!it) { nao.push(nome); continue; }
          const regra: Regra = { sobe: ci.sobe < 0 || !txt(r, ci.sobe) ? true : sim(r[ci.sobe]), indice: ind };
          const herdada = regraSemItem(it);
          if (regra.sobe === herdada.sobe && Number(regra.indice) === Number(herdada.indice)) delete ri[it.id];
          else ri[it.id] = regra;
          vis.push([GRUPOS_REAJ.find((x) => x.g === g)?.nome ?? g, it.cat, it.nome, regra.sobe ? "SIM" : "NÃO", ind]);
          n++;
        }
        return {
          resumo: `${n} itens de reajuste`, avisos: nao.length ? [`Não reconhecidos: ${nao.slice(0, 20).join(", ")}`] : [],
          ...amostra(["Grupo", "Categoria", "Nome", "Reajustar", "Índice anual %"], vis),
          aplicar: async () => { await salvarConfig({ ...padrao, regras_categoria: rc as Json, regras_item: ri as Json }); return `${n} reajustes`; },
        };
      }
      for (const r of rows.slice(h + 1)) {
        const niv = norm(r[ci.niv]), nome = txt(r, ci.nome), nn = norm(nome), ind = num(r, ci.ind);
        if (!niv || !nome) continue;
        const sobe = ci.sobe < 0 || !txt(r, ci.sobe) ? true : sim(r[ci.sobe]);
        if (niv.startsWith("PADR")) {
          if (nn.includes("MES")) { if (ind && ind >= 1 && ind <= 12) padrao.reajuste_mes = Math.round(ind); else { nao.push(nome); continue; } }
          else if (nn.includes("ENTRADA") && ind != null) padrao.indice_padrao_entradas = ind;
          else if (nn.includes("SAIDA") && ind != null) padrao.indice_padrao_saidas = ind;
          else { nao.push(nome); continue; }
          vis.push(["Padrão", "", nome, "", ind]); n++; continue;
        }
        const g = grupoReajDe(r[ci.g]);
        if (!g) { nao.push(nome); continue; }
        const regra: Regra = { sobe, ...(ind != null ? { indice: ind } : {}) };
        if (niv.startsWith("CAT")) {
          const doCat = its.filter((i) => i.g === g && (g === "EP" || norm(i.cat) === nn));
          const ck = doCat[0]?.catKey ?? chaveCatDe(g, nome);
          rc[ck] = regra;
          for (const i of doCat) delete ri[i.id];
          vis.push(["Categoria", GRUPOS_REAJ.find((x) => x.g === g)!.nome, nome, sobe ? "SIM" : "NÃO", ind]); n++;
        } else {
          const it = its.find((i) => i.g === g && norm(i.nome) === nn);
          if (!it) { nao.push(nome); continue; }
          ri[it.id] = regra;
          vis.push(["Item", GRUPOS_REAJ.find((x) => x.g === g)!.nome, nome, sobe ? "SIM" : "NÃO", ind]); n++;
        }
      }
      return {
        resumo: `${n} regras de reajuste`, avisos: nao.length ? [`Não reconhecidas: ${nao.slice(0, 20).join(", ")}`] : [],
        ...amostra(["Nível", "Grupo", "Nome", "Sobe", "Índice %"], vis),
        aplicar: async () => { await salvarConfig({ ...padrao, regras_categoria: rc as Json, regras_item: ri as Json }); return `${n} reajustes`; },
      };
    },
  },
  {
    id: "dre", titulo: "Classificação da DRE", aba: "DRE", aliases: ["CLASSIFICACAO"], chaves: ["CATEGORIA", "LINHA"], contagem: "classificações",
    colunas: [["CATEGORIA", "Categoria das saídas do escritório"], ["LINHA", GRUPOS_DRE.map((g) => g.rotulo).join(" / ")]],
    exportar: (c) => {
      const cats = [...new Set(c.saidas.filter((s) => destinoSaida(s) === "ESCRITORIO").map((s) => s.categoria?.trim() || "Sem categoria"))].sort();
      const rot = (g: GrupoDRE) => GRUPOS_DRE.find((x) => x.id === g)!.rotulo;
      return [["CATEGORIA", "LINHA"], ...cats.map((cat) => [cat, rot(grupoDRE(c.cfg, cat))])];
    },
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["CATEGORIA", "LINHA"]);
      const cab = (rows[h] ?? []).map(norm);
      const ic = col(cab, "CATEGORIA"), il = col(cab, "LINHA");
      const mapa = { ...((c.cfg.dre_map ?? {}) as Record<string, GrupoDRE>) };
      const nao: string[] = []; const vis: unknown[][] = [];
      for (const r of rows.slice(h + 1)) {
        const cat = txt(r, ic); if (!cat) continue;
        const g = acharLinhaDRE(r[il]);
        if (!g) { nao.push(cat); continue; }
        if (g === grupoPadraoDRE(cat)) delete mapa[chaveCatDRE(cat)]; else mapa[chaveCatDRE(cat)] = g;
        vis.push([cat, GRUPOS_DRE.find((x) => x.id === g)!.rotulo]);
      }
      return {
        resumo: `${vis.length} categorias classificadas`, avisos: nao.length ? [`Linha não reconhecida em: ${nao.join(", ")}`] : [],
        ...amostra(["Categoria", "Linha da DRE"], vis),
        aplicar: async () => { await salvarConfig({ dre_map: mapa as Json }); return `${vis.length} classificações`; },
      };
    },
  },
  {
    id: "investimentos", titulo: "Investimentos", aba: "INVESTIMENTOS", chaves: ["NOME"], contagem: "investimentos",
    colunas: [["NOME", "Nome (obrigatório)"], ["TIPO", "Aplicação, Consórcio, Previdência, Imóvel…"], ["INSTITUICAO", "Onde está"], ["DESTINO", "ESCRITÓRIO ou PESSOAL"], ["SALDO", "Saldo na base zero"], ["TAXA % A.M.", "Rendimento % ao mês (0,9 = 0,9%)"], ["APORTE", "Aporte fixo por mês"], ["VINCULO SAIDA", "Descrição da saída que é o aporte (substitui o valor fixo)"]],
    exportar: (c) => {
      const sd = new Map(c.saidas.map((s) => [s.id, s.descricao]));
      return [["NOME", "TIPO", "INSTITUICAO", "DESTINO", "SALDO", "TAXA % A.M.", "APORTE", "VINCULO SAIDA"],
        ...c.investimentos.map((i) => [i.nome, i.tipo, i.instituicao ?? "", destinoTxt(i.destino), Number(i.saldo_inicial), Number(i.taxa), i.saida_id ? "" : Number(i.aporte_fixo), i.saida_id ? sd.get(i.saida_id) ?? "" : ""])];
    },
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["NOME"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { nome: col(cab, "NOME"), tipo: col(cab, "TIPO"), inst: col(cab, "INSTITUI"), dest: col(cab, "DESTINO"), saldo: col(cab, "SALDO"), taxa: col(cab, "TAXA"), aporte: col(cab, "APORTE"), vinc: col(cab, "VINCULO") };
      const porNome = new Map(c.saidas.map((s) => [norm(s.descricao), s.id]));
      const itens: TablesInsert<"investimentos">[] = []; const nao: string[] = [];
      for (const r of rows.slice(h + 1)) {
        const nome = txt(r, ci.nome); if (!nome) continue;
        const v = txt(r, ci.vinc); let saida_id: string | null = null;
        if (v) { saida_id = porNome.get(norm(v)) ?? null; if (!saida_id) nao.push(v); }
        itens.push({ nome, tipo: txt(r, ci.tipo) || tipoInvestimentoSugerido(nome), instituicao: txt(r, ci.inst) || null, destino: destinoDe(txt(r, ci.dest)), saldo_inicial: num(r, ci.saldo) ?? 0, taxa: num(r, ci.taxa) ?? 0, aporte_fixo: num(r, ci.aporte) ?? 0, saida_id, origem: "import" });
      }
      return {
        resumo: `${itens.length} investimentos · ${formatarBRL(itens.reduce((s, i) => s + Number(i.saldo_inicial ?? 0), 0))} na base zero`,
        avisos: nao.length ? [`Saída vinculada não encontrada: ${nao.join(", ")}`] : [],
        ...amostra(["Nome", "Tipo", "Instituição", "Destino", "Saldo", "Taxa", "Aporte"], itens.map((i) => [i.nome, i.tipo, i.instituicao, destinoTxt(i.destino ?? null), i.saldo_inicial, i.taxa, i.saida_id ? "saída vinculada" : i.aporte_fixo])),
        aplicar: async () => { await substituirLista("investimentos", itens); return `${itens.length} investimentos`; },
      };
    },
  },
  {
    id: "bens", titulo: "Bens", aba: "BENS", chaves: ["NOME"], contagem: "bens",
    colunas: [["NOME", "Nome (obrigatório)"], ["TIPO", "Imóvel, Veículo…"], ["DESTINO", "ESCRITÓRIO ou PESSOAL"], ["VALOR", "Valor do bem"]],
    exportar: (c) => [["NOME", "TIPO", "DESTINO", "VALOR"], ...c.bens.map((b) => [b.nome, b.tipo ?? "", destinoTxt(b.destino), Number(b.valor)])],
    ler: (rows) => {
      const h = acharCabecalho(rows, ["NOME"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { nome: col(cab, "NOME"), tipo: col(cab, "TIPO"), dest: col(cab, "DESTINO"), valor: col(cab, "VALOR") };
      const itens: TablesInsert<"bens">[] = [];
      for (const r of rows.slice(h + 1)) {
        const nome = txt(r, ci.nome); if (!nome) continue;
        itens.push({ nome, tipo: txt(r, ci.tipo) || null, destino: destinoDe(txt(r, ci.dest)), valor: num(r, ci.valor) ?? 0, origem: "import" });
      }
      return {
        resumo: `${itens.length} bens · ${formatarBRL(itens.reduce((s, i) => s + Number(i.valor ?? 0), 0))}`, avisos: [],
        ...amostra(["Nome", "Tipo", "Destino", "Valor"], itens.map((i) => [i.nome, i.tipo, destinoTxt(i.destino ?? null), i.valor])),
        aplicar: async () => { await substituirLista("bens", itens); return `${itens.length} bens`; },
      };
    },
  },
  {
    id: "dividas", titulo: "Dívidas", aba: "DIVIDAS", chaves: ["NOME"], contagem: "dívidas",
    colunas: [["NOME", "Nome (obrigatório)"], ["TIPO", "Empréstimo, Financiamento…"], ["DESTINO", "ESCRITÓRIO ou PESSOAL"], ["SALDO DEVEDOR", "Saldo na base zero"], ["TAXA % A.M.", "Juros % ao mês"], ["PARCELA", "Parcela fixa por mês"], ["VINCULO SAIDA", "Descrição da saída que é a parcela (substitui a parcela fixa)"], ["CREDOR", "Banco/credor (opcional)"]],
    exportar: (c) => {
      const sd = new Map(c.saidas.map((s) => [s.id, s.descricao]));
      return [["NOME", "TIPO", "DESTINO", "SALDO DEVEDOR", "TAXA % A.M.", "PARCELA", "VINCULO SAIDA", "CREDOR"],
        ...c.dividas.map((d) => [d.nome, d.tipo ?? "", destinoTxt(d.destino), Number(d.saldo), Number(d.juros), d.saida_id ? "" : Number(d.parcela_fixa), d.saida_id ? sd.get(d.saida_id) ?? "" : "", d.credor ?? ""])];
    },
    ler: (rows, c) => {
      const h = acharCabecalho(rows, ["NOME"]);
      const cab = (rows[h] ?? []).map(norm);
      const ci = { nome: col(cab, "NOME"), tipo: col(cab, "TIPO"), dest: col(cab, "DESTINO"), saldo: col(cab, "SALDO"), taxa: col(cab, "TAXA", "JUROS"), parc: col(cab, "PARCELA"), vinc: col(cab, "VINCULO"), cred: col(cab, "CREDOR") };
      const porNome = new Map(c.saidas.map((s) => [norm(s.descricao), s.id]));
      const itens: TablesInsert<"dividas">[] = []; const nao: string[] = [];
      for (const r of rows.slice(h + 1)) {
        const nome = txt(r, ci.nome); if (!nome) continue;
        const v = txt(r, ci.vinc); let saida_id: string | null = null;
        if (v) { saida_id = porNome.get(norm(v)) ?? null; if (!saida_id) nao.push(v); }
        itens.push({ nome, tipo: txt(r, ci.tipo) || null, destino: destinoDe(txt(r, ci.dest)), saldo: num(r, ci.saldo) ?? 0, juros: num(r, ci.taxa) ?? 0, parcela_fixa: num(r, ci.parc) ?? 0, saida_id, credor: txt(r, ci.cred) || null, origem: "import" });
      }
      return {
        resumo: `${itens.length} dívidas · ${formatarBRL(itens.reduce((s, i) => s + Number(i.saldo ?? 0), 0))} de saldo devedor`,
        avisos: nao.length ? [`Saída vinculada não encontrada: ${nao.join(", ")}`] : [],
        ...amostra(["Nome", "Tipo", "Destino", "Saldo devedor", "Taxa", "Parcela"], itens.map((i) => [i.nome, i.tipo, destinoTxt(i.destino ?? null), i.saldo, i.juros, i.saida_id ? "saída vinculada" : i.parcela_fixa])),
        aplicar: async () => { await substituirLista("dividas", itens); return `${itens.length} dívidas`; },
      };
    },
  },
];

export const defDe = (t: TipoImp) => TIPOS.find((d) => d.id === t)!;

// ---------- contexto, abas e arquivos ----------
export async function carregarCtx(): Promise<Ctx> {
  const q = async <T,>(t: string) => { const { data, error } = await supabase.from(t as "bens").select("*"); if (error) throw error; return data as unknown as T[]; };
  const { data: cfg, error } = await supabase.from("config").select("*").maybeSingle();
  if (error) throw error;
  if (!cfg?.base_data) throw new Error("Defina a base zero antes de importar.");
  const [entradas, saidas, pessoais, saldos, baixas, investimentos, bens, dividas] = await Promise.all([
    q<Entrada>("entradas"), q<Saida>("saidas"), q<EntradaPessoal>("entradas_pessoais"), q<Saldo>("saldos"), q<Baixa>("baixas"),
    q<Investimento>("investimentos"), q<Bem>("bens"), q<Divida>("dividas"),
  ]);
  return { cfg, h: calcularHorizonte(cfg.base_data, cfg.anos_projecao, cfg.incluir_restante), entradas, saidas, pessoais, saldos, baixas, investimentos, bens, dividas };
}

const nomesAba = (d: Def) => [d.aba, ...(d.aliases ?? [])];
const abaExata = (wb: XLSX.WorkBook, d: Def) => wb.SheetNames.find((n) => nomesAba(d).includes(norm(n)));
const rowsDe = (wb: XLSX.WorkBook, nome: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome]!, { header: 1, raw: true, defval: null });

/** Um tipo: usa a aba com o nome do tipo, senão a primeira aba (fora "COMO PREENCHER"). */
export async function lerArquivo(file: File, tipo: TipoImp, c: Ctx): Promise<Previa> {
  const wb = await lerPlanilha(file), d = defDe(tipo);
  const temCab = (n: string) => { try { acharCabecalho(rowsDe(wb, n), d.chaves); return true; } catch { return false; } };
  const livres = wb.SheetNames.filter((n) => !norm(n).startsWith("COMO PREENCHER"));
  const nome = abaExata(wb, d) ?? livres.find(temCab) ?? livres[0];
  if (!nome) throw new Error("A planilha não tem abas com dados.");
  return d.ler(rowsDe(wb, nome), c);
}

const ajudaAba = (d: Def): unknown[][] => [["COMO PREENCHER — " + d.titulo.toUpperCase()], [], ["COLUNA", "O QUE VAI"], ...d.colunas, [], ["O cabeçalho pode estar em qualquer uma das 30 primeiras linhas. Maiúsculas e acentos não importam."]];
const larguras = (ws: XLSX.WorkSheet, aoa: unknown[][]) => { ws["!cols"] = (aoa[0] ?? []).map((_, i) => ({ wch: Math.min(40, Math.max(10, ...aoa.slice(0, 200).map((r) => String(r[i] ?? "").length + 2))) })); return ws; };

export function baixarModeloTipo(tipo: TipoImp, c: Ctx) {
  const d = defDe(tipo), wb = XLSX.utils.book_new(), aoa = d.exportar(c);
  XLSX.utils.book_append_sheet(wb, larguras(XLSX.utils.aoa_to_sheet(aoa), aoa), d.aba);
  const aj = ajudaAba(d);
  XLSX.utils.book_append_sheet(wb, larguras(XLSX.utils.aoa_to_sheet(aj), aj.slice(2)), "COMO PREENCHER");
  XLSX.writeFile(wb, `modelo-${tipo}.xlsx`);
}

export function baixarBackup(c: Ctx) {
  const wb = XLSX.utils.book_new();
  for (const d of TIPOS) { const aoa = d.exportar(c); XLSX.utils.book_append_sheet(wb, larguras(XLSX.utils.aoa_to_sheet(aoa), aoa), d.aba); }
  const aj: unknown[][] = [["COMO PREENCHER — BACKUP COMPLETO"], ["Cada aba tem o nome de um tipo. Reimportar este arquivo em \"Importar backup completo\" restaura tudo."], []];
  for (const d of TIPOS) aj.push([`ABA ${d.aba}`], ...d.colunas, []);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aj), "COMO PREENCHER");
  XLSX.writeFile(wb, `backup-fluxo-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Abas reconhecidas pelo nome, na ordem certa (cadastros antes das baixas/reajustes). */
export async function abasDoBackup(file: File): Promise<{ wb: XLSX.WorkBook; tipos: Def[] }> {
  const wb = await lerPlanilha(file);
  const tipos = TIPOS.filter((d) => abaExata(wb, d));
  if (!tipos.length) throw new Error("Nenhuma aba reconhecida (ENTRADAS, SAIDAS, PESSOAIS, SALDOS, BAIXAS, REAJUSTES, DRE, INVESTIMENTOS, BENS, DIVIDAS).");
  return { wb, tipos };
}
export async function importarBackup(wb: XLSX.WorkBook, tipos: Def[]): Promise<string> {
  const feitos: string[] = [];
  for (const d of tipos) {
    const c = await carregarCtx();
    try { feitos.push(await d.ler(rowsDe(wb, abaExata(wb, d)!), c).aplicar()); }
    catch (e) { throw new Error(`${feitos.length ? `Importado: ${feitos.join(", ")}. ` : ""}Parou na aba ${d.aba}: ${(e as Error).message}`); }
  }
  return `Importado: ${feitos.join(", ")}.`;
}
