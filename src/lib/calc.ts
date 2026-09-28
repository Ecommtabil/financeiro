/** Módulo único de cálculo — usado por todas as telas. Chave de mês = "aaaa-mm". */
import type { Tables } from "@/integrations/supabase/types";
import type { Config } from "./config";
import type { Entrada, EntradaPessoal, Saida } from "./dados";
import type { Horizonte, MesRef } from "./horizonte";

export type Regra = { indice?: number; sobe?: boolean };
export const chaveMes = (m: MesRef) => `${m.ano}-${String(m.mes).padStart(2, "0")}`;
const dentro = (k: string, ini?: string | null, fim?: string | null) => (!ini || k >= ini) && (!fim || k <= fim);

// ---------- valor do mês (sem reajuste) ----------
export function valorEntrada(e: Entrada, k: string): number {
  const x = e as Entrada & { inicio?: string | null; fim?: string | null };
  return e.ativo && dentro(k, x.inicio, x.fim) ? Number(e.valor) : 0;
}
export function valorEntradaPessoal(e: EntradaPessoal, k: string): number {
  return dentro(k, e.inicio, e.fim) ? Number(e.valor) : 0;
}
export function valorSaida(s: Saida, k: string): number {
  if (s.valor_fixo != null) return dentro(k, s.ri, s.rf) ? Number(s.valor_fixo) : 0;
  const vm = (s.valores_mes ?? {}) as Record<string, number>;
  if (k in vm) return Number(vm[k]);
  if (s.rf && k > s.rf) return Number(vm[s.rf] ?? 0);
  if (s.ri && k < s.ri) return Number(vm[s.ri] ?? 0);
  return 0;
}

// ---------- destino ----------
export const destinoSaida = (s: Saida): "ESCRITORIO" | "PESSOAL" => (s.destino === "PESSOAL" ? "PESSOAL" : "ESCRITORIO");

// ---------- reajuste ----------
export const chaveCatEntrada = (e: Entrada) => `E|${(e.carteira ?? "").toUpperCase()}`;
export const chaveCatSaida = (s: Saida) => `S|${destinoSaida(s)}|${(s.categoria ?? "").toUpperCase()}`;
export const CHAVE_CAT_PESSOAL = "P|ENTRADAS PESSOAIS";

export function nReajustes(m: MesRef, y0: number, mesReajuste: number): number {
  return m.ano - y0 + (m.mes >= mesReajuste ? 1 : 0);
}

export function regraDo(cfg: Config, id: string, chaveCat: string, tipo: "E" | "S"): Required<Regra> {
  const item = (cfg.regras_item as Record<string, Regra>)?.[id];
  const cat = (cfg.regras_categoria as Record<string, Regra>)?.[chaveCat];
  const padrao = Number(tipo === "E" ? cfg.indice_padrao_entradas : cfg.indice_padrao_saidas);
  const r = item ?? cat;
  return { indice: r?.indice ?? padrao, sobe: r?.sobe ?? true };
}

export function fator(m: MesRef, y0: number, mesReajuste: number, r: Required<Regra>): number {
  const n = nReajustes(m, y0, mesReajuste);
  if (n <= 0 || !r.sobe) return 1;
  return Math.pow(1 + r.indice / 100, n);
}

// ---------- totais ----------
export type TotaisMes = {
  E: number; SE: number; SP: number; EP: number; L: number; R: number;
  contratos: number;
  porCarteira: Record<string, number>;
  porCatEscritorio: Record<string, number>;
  porCatPessoal: Record<string, number>;
  porOrigemPessoal: Record<string, number>;
  semDestino: number;
};

const vazio = (): TotaisMes => ({
  E: 0, SE: 0, SP: 0, EP: 0, L: 0, R: 0, contratos: 0,
  porCarteira: {}, porCatEscritorio: {}, porCatPessoal: {}, porOrigemPessoal: {}, semDestino: 0,
});
const add = (o: Record<string, number>, k: string, v: number) => { o[k] = (o[k] ?? 0) + v; };

export type Dados = { entradas: Entrada[]; saidas: Saida[]; pessoais: EntradaPessoal[] };

export function totaisDoMes(m: MesRef, d: Dados, cfg: Config, h: Horizonte): TotaisMes {
  const k = chaveMes(m), t = vazio(), rm = cfg.reajuste_mes;
  for (const e of d.entradas) {
    const v = valorEntrada(e, k);
    if (!v) continue;
    const vp = v * fator(m, h.y0, rm, regraDo(cfg, e.id, chaveCatEntrada(e), "E"));
    t.E += vp; t.contratos++;
    add(t.porCarteira, e.carteira?.trim() || "Sem carteira", vp);
  }
  for (const s of d.saidas) {
    const v = valorSaida(s, k);
    if (!v) continue;
    const vp = v * fator(m, h.y0, rm, regraDo(cfg, s.id, chaveCatSaida(s), "S"));
    const cat = s.categoria?.trim() || "Sem categoria";
    if (destinoSaida(s) === "PESSOAL") { t.SP += vp; add(t.porCatPessoal, cat, vp); }
    else { t.SE += vp; add(t.porCatEscritorio, cat, vp); if (!s.destino) t.semDestino++; }
  }
  for (const p of d.pessoais) {
    const v = valorEntradaPessoal(p, k);
    if (!v) continue;
    const vp = v * fator(m, h.y0, rm, regraDo(cfg, p.id, CHAVE_CAT_PESSOAL, "E"));
    t.EP += vp; add(t.porOrigemPessoal, p.descricao?.trim() || "Sem origem", vp);
  }
  t.L = t.E - t.SE;
  t.R = t.L + t.EP - t.SP;
  return t;
}

/** Soma vários meses (ex.: total do ano). contratos = máximo mensal. */
export function somar(lista: TotaisMes[]): TotaisMes {
  const t = vazio();
  const junta = (a: Record<string, number>, b: Record<string, number>) => { for (const [k, v] of Object.entries(b)) add(a, k, v); };
  for (const x of lista) {
    t.E += x.E; t.SE += x.SE; t.SP += x.SP; t.EP += x.EP; t.L += x.L; t.R += x.R;
    t.contratos = Math.max(t.contratos, x.contratos); t.semDestino = Math.max(t.semDestino, x.semDestino);
    junta(t.porCarteira, x.porCarteira); junta(t.porCatEscritorio, x.porCatEscritorio);
    junta(t.porCatPessoal, x.porCatPessoal); junta(t.porOrigemPessoal, x.porOrigemPessoal);
  }
  return t;
}

/** Totais de todos os meses do horizonte, na ordem. */
export function totaisHorizonte(d: Dados, cfg: Config, h: Horizonte): Map<string, TotaisMes> {
  return new Map(h.meses.map((m) => [chaveMes(m), totaisDoMes(m, d, cfg, h)]));
}

// ---------- contas do mês, baixas, saldos e caixa projetado ----------
export type Baixa = Tables<"baixas">;
export type Saldo = Tables<"saldos">;
export type TipoConta = "entrada" | "pessoal" | "saida";
export type Conta = { tipo: TipoConta; id: string; mes: string; nome: string; dia: number | null; banco: string | null; grupo: string | null; valor: number };
export type SituacaoConta = "Baixado" | "Vencido" | "Em aberto";

/** A receber (entradas ativas + pessoais) e a pagar (saídas) do mês, com valor projetado (reajustado). */
export function contasDoMes(m: MesRef, d: Dados, cfg: Config, h: Horizonte): { receber: Conta[]; pagar: Conta[] } {
  const k = chaveMes(m), rm = cfg.reajuste_mes, receber: Conta[] = [], pagar: Conta[] = [];
  for (const e of d.entradas) {
    const v = valorEntrada(e, k);
    if (v) receber.push({ tipo: "entrada", id: e.id, mes: k, nome: e.empresa, dia: e.dia, banco: e.banco, grupo: e.grupo, valor: v * fator(m, h.y0, rm, regraDo(cfg, e.id, chaveCatEntrada(e), "E")) });
  }
  for (const p of d.pessoais) {
    const v = valorEntradaPessoal(p, k);
    if (v) receber.push({ tipo: "pessoal", id: p.id, mes: k, nome: p.descricao, dia: p.dia, banco: p.banco, grupo: null, valor: v * fator(m, h.y0, rm, regraDo(cfg, p.id, CHAVE_CAT_PESSOAL, "E")) });
  }
  for (const s of d.saidas) {
    const v = valorSaida(s, k);
    if (v) pagar.push({ tipo: "saida", id: s.id, mes: k, nome: s.descricao, dia: s.dia, banco: s.banco, grupo: null, valor: v * fator(m, h.y0, rm, regraDo(cfg, s.id, chaveCatSaida(s), "S")) });
  }
  return { receber, pagar };
}

export const chaveBaixa = (tipo: string, id: string, mes: string) => `${tipo}|${id}|${mes}`;
export const mapaBaixas = (b: Baixa[]) => new Map(b.map((x) => [chaveBaixa(x.tipo, x.item_id, x.mes), x]));

export function situacaoConta(c: Conta, baixas: Map<string, Baixa>, hoje = new Date()): SituacaoConta {
  if (baixas.has(chaveBaixa(c.tipo, c.id, c.mes))) return "Baixado";
  const kh = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  if (c.mes < kh || (c.mes === kh && (c.dia ?? 0) < hoje.getDate())) return "Vencido";
  return "Em aberto";
}

const nb = (b?: string | null) => (b ?? "").trim().toUpperCase() || "SEM BANCO";

/** Saldo atual = informado + recebimentos − pagamentos baixados DEPOIS do atualizado_em do saldo. */
export function saldosAtuais(saldos: Saldo[], baixas: Baixa[]): Map<string, { informado: number; atual: number; saldo?: Saldo }> {
  const r = new Map<string, { informado: number; atual: number; saldo?: Saldo }>();
  for (const s of saldos) r.set(nb(s.banco), { informado: Number(s.saldo), atual: Number(s.saldo), saldo: s });
  for (const b of baixas) {
    const x = r.get(nb(b.banco));
    if (!x?.saldo || b.baixado_em <= x.saldo.atualizado_em) continue;
    x.atual += (b.tipo === "saida" ? -1 : 1) * Number(b.valor);
  }
  return r;
}

/** Caixa no fim do mês M = saldo atual total + Σ(a receber em aberto − a pagar em aberto) do início do horizonte até M. */
export function caixaProjetado(d: Dados, cfg: Config, h: Horizonte, saldos: Saldo[], baixas: Baixa[]): Map<string, number> {
  const mb = mapaBaixas(baixas);
  let caixa = [...saldosAtuais(saldos, baixas).values()].reduce((t, x) => t + x.atual, 0);
  const r = new Map<string, number>();
  for (const m of h.meses) {
    const { receber, pagar } = contasDoMes(m, d, cfg, h);
    const aberto = (l: Conta[]) => l.reduce((t, c) => t + (mb.has(chaveBaixa(c.tipo, c.id, c.mes)) ? 0 : c.valor), 0);
    caixa += aberto(receber) - aberto(pagar);
    r.set(chaveMes(m), caixa);
  }
  return r;
}

// ---------- DRE ----------
export type GrupoDRE = "IMP" | "PES" | "DESP" | "SOC" | "FIN";
export const GRUPOS_DRE: { id: GrupoDRE; rotulo: string }[] = [
  { id: "IMP", rotulo: "Impostos sobre a receita" },
  { id: "PES", rotulo: "Custos com pessoal" },
  { id: "DESP", rotulo: "Despesas operacionais e administrativas" },
  { id: "SOC", rotulo: "Retirada dos sócios" },
  { id: "FIN", rotulo: "Financiamentos e investimentos" },
];
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toUpperCase();
export const chaveCatDRE = (cat: string) => semAcento(cat);
export function grupoPadraoDRE(cat: string): GrupoDRE {
  const c = semAcento(cat);
  if (c.includes("IMPOSTO")) return "IMP";
  if (c.includes("FUNCIONARIO") || c.includes("TERCERISTA") || c.includes("TERCEIRISTA")) return "PES";
  if (c.includes("SOCIO")) return "SOC";
  if (c.includes("INVESTIMENTO")) return "FIN";
  return "DESP";
}
/** Grupo da DRE de uma categoria do escritório: config.dre_map → senão classificação padrão. */
export function grupoDRE(cfg: Config, cat: string): GrupoDRE {
  const m = (cfg.dre_map ?? {}) as Record<string, GrupoDRE>;
  return m[chaveCatDRE(cat)] ?? grupoPadraoDRE(cat);
}

// ---------- Investimentos, bens e dívidas ----------
export type Investimento = Tables<"investimentos">;
export type Bem = Tables<"bens">;
export type Divida = Tables<"dividas">;

/** Valor projetado (com reajuste) de uma saída no mês. */
export function valorSaidaProjetado(s: Saida, m: MesRef, cfg: Config, h: Horizonte): number {
  const v = valorSaida(s, chaveMes(m));
  return v ? v * fator(m, h.y0, cfg.reajuste_mes, regraDo(cfg, s.id, chaveCatSaida(s), "S")) : 0;
}

export type MesInvest = { saldo: number; aporte: number; rendimento: number };
/** Evolução: saldo = anterior + anterior × taxa + aporte do mês (aporte = valor fixo ou saída projetada). */
export function evolucaoInvestimento(i: Investimento, saidas: Saida[], cfg: Config, h: Horizonte): Map<string, MesInvest> {
  const s = i.saida_id ? saidas.find((x) => x.id === i.saida_id) : undefined;
  const r = new Map<string, MesInvest>();
  let saldo = Number(i.saldo_inicial);
  for (const m of h.meses) {
    const rendimento = saldo * Number(i.taxa) / 100;
    const aporte = i.saida_id ? (s ? valorSaidaProjetado(s, m, cfg, h) : 0) : Number(i.aporte_fixo);
    saldo += rendimento + aporte;
    r.set(chaveMes(m), { saldo, aporte, rendimento });
  }
  return r;
}

/** Saldo devedor mês a mês = max(0, saldo + saldo × juros − parcela). */
export function evolucaoDivida(d: Divida, saidas: Saida[], cfg: Config, h: Horizonte): Map<string, number> {
  const s = d.saida_id ? saidas.find((x) => x.id === d.saida_id) : undefined;
  const r = new Map<string, number>();
  let saldo = Number(d.saldo);
  for (const m of h.meses) {
    const parcela = d.saida_id ? (s ? valorSaidaProjetado(s, m, cfg, h) : 0) : Number(d.parcela_fixa);
    saldo = Math.max(0, saldo + saldo * Number(d.juros) / 100 - parcela);
    r.set(chaveMes(m), saldo);
  }
  return r;
}

const DIVIDA_RE = /PRONAMPE|BANCO DO POVO|EMPREST|FINANCIAM/;
export const pareceDivida = (s: Saida) => DIVIDA_RE.test(semAcento(`${s.descricao} ${s.categoria ?? ""}`));
export const saidaDeInvestimento = (s: Saida) => semAcento(s.categoria ?? "").includes("INVESTIMENTO") && !pareceDivida(s);
export function tipoInvestimentoSugerido(nome: string): string {
  const n = semAcento(nome);
  if (n.includes("CONSORCIO")) return "Consórcio";
  if (n.includes("PREVID")) return "Previdência";
  if (n.includes("TERRENO") || n.includes("IMOVEL")) return "Imóvel";
  return "Aplicação";
}
