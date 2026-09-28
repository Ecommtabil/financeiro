/** Módulo único de cálculo — usado por todas as telas. Chave de mês = "aaaa-mm". */
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
