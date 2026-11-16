import type { TablesInsert } from "@/integrations/supabase/types";
import { norm, paraNumero } from "./importacao";

export type TipoFatura = "PONTUAL" | "PARCELA" | "ASSINATURA";
export type DestinoFatura = "ESCRITORIO" | "PESSOAL";

export type LancamentoFatura = {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: TipoFatura;
  parcelaAtual: number | null;
  parcelasTotal: number | null;
  categoria: string;
  destino: DestinoFatura;
  incluir: boolean;
};

export type ResultadoLeituraFatura = {
  itens: LancamentoFatura[];
  competencia: string | null;
  ignorados: number;
};

const ASSINATURAS = [
  "NETFLIX", "SPOTIFY", "PRIME VIDEO", "AMAZON PRIME", "DISNEY", "GLOBOPLAY", "YOUTUBE",
  "DEEZER", "APPLE.COM/BILL", "ICLOUD", "MICROSOFT 365", "GOOGLE ONE", "DROPBOX", "CANVA",
  "OPENAI", "CHATGPT", "ADOBE", "HBO", "PARAMOUNT", "TELECINE", "LINKEDIN", "MELI MAIS",
];
const IGNORAR = /^(PAGAMENTO|SALDO|TOTAL|LIMITE|FATURA ANTERIOR|PAGAMENTO MINIMO|ENCARGOS|JUROS|IOF)/;
const DINHEIRO = String.raw`-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}`;

function valorDoTexto(s: string): number | null {
  const limpo = s.replace(/R\$/g, "").trim();
  const negativo = limpo.startsWith("-") || limpo.endsWith("-");
  const n = paraNumero(limpo.replace(/^-|-$/g, ""));
  return n == null ? null : negativo ? -n : n;
}

export function parcelaDaDescricao(descricao: string): { atual: number; total: number } | null {
  const m = descricao.match(/(?:PARC(?:ELA)?\.?\s*)?(\d{1,3})\s*(?:\/|\s+DE\s+)(\d{1,3})(?!\d)/i);
  if (!m) return null;
  const atual = Number(m[1]), total = Number(m[2]);
  return atual >= 1 && total > 1 && atual <= total && total <= 360 ? { atual, total } : null;
}

function tipoDaDescricao(descricao: string): TipoFatura {
  if (parcelaDaDescricao(descricao)) return "PARCELA";
  const n = norm(descricao);
  return ASSINATURAS.some((a) => n.includes(norm(a))) ? "ASSINATURA" : "PONTUAL";
}

function categoriaDoTipo(tipo: TipoFatura) {
  return tipo === "ASSINATURA" ? "ASSINATURAS" : tipo === "PARCELA" ? "PARCELAMENTOS" : "CARTÃO";
}

/** Lê linhas no formato comum das faturas: data, descrição e valor em reais ao fim. */
export function extrairLancamentosFatura(linhas: string[]): ResultadoLeituraFatura {
  const itens: LancamentoFatura[] = [];
  let ignorados = 0;
  const re = new RegExp(String.raw`^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+(?:R\$\s*)?(${DINHEIRO}\s*-?)\s*$`, "i");
  for (const bruta of linhas) {
    const linha = bruta.replace(/\s+/g, " ").trim();
    const m = linha.match(re);
    if (!m) continue;
    const data = m[1]!.replaceAll("-", "/"), descricao = m[2]!.trim();
    if (!descricao || IGNORAR.test(norm(descricao))) continue;
    const valor = valorDoTexto(m[3]!);
    if (valor == null) continue;
    // Créditos, estornos e pagamentos não são despesas da fatura.
    if (valor <= 0) { ignorados++; continue; }
    const tipo = tipoDaDescricao(descricao), parcela = parcelaDaDescricao(descricao);
    itens.push({
      id: `fatura-${itens.length + 1}`, data, descricao, valor, tipo,
      parcelaAtual: parcela?.atual ?? null, parcelasTotal: parcela?.total ?? null,
      categoria: categoriaDoTipo(tipo), destino: "PESSOAL", incluir: true,
    });
  }
  return { itens, competencia: inferirCompetenciaFatura(linhas), ignorados };
}

/** Procura o vencimento da fatura e devolve mm/aaaa. */
export function inferirCompetenciaFatura(linhas: string[]): string | null {
  for (const bruta of linhas) {
    const linha = norm(bruta);
    if (!/VENCIMENTO|VENCE EM|DATA DE VENC/.test(linha)) continue;
    const m = linha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (m) return `${m[2]!.padStart(2, "0")}/${m[3]}`;
  }
  for (const bruta of linhas) {
    const m = norm(bruta).match(/\b\d{1,2}[\/\-](\d{1,2})[\/\-](\d{4})\b/);
    if (m) return `${m[1]!.padStart(2, "0")}/${m[2]}`;
  }
  return null;
}

export function mesFaturaValido(v: string): boolean {
  const m = v.trim().match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
  return !!m && Number(m[2]) >= 2000 && Number(m[2]) <= 2200;
}

export function chaveDaCompetencia(v: string): string {
  const m = v.trim().match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
  if (!m) throw new Error("Informe a competência no formato mm/aaaa.");
  return `${m[2]}-${m[1]!.padStart(2, "0")}`;
}

export function somarMeses(chave: string, quantidade: number): string {
  const [ano, mes] = chave.split("-").map(Number);
  const total = ano! * 12 + mes! - 1 + quantidade;
  return `${Math.floor(total / 12)}-${String(total % 12 + 1).padStart(2, "0")}`;
}

export function origemFatura(cartao: string, competencia: string): string {
  return `fatura:${norm(cartao).replace(/\s+/g, " ").slice(0, 60) || "CARTAO"}:${chaveDaCompetencia(competencia)}`;
}

/** Chave para não duplicar uma compra parcelada quando a fatura do mês seguinte chegar. */
export function chaveParcelaFatura(s: { descricao: string; pgto?: string | null; valor_fixo?: number | null; valores_mes?: unknown }) {
  const base = s.descricao.replace(/(?:PARC(?:ELA)?\.?\s*)?\d{1,3}\s*(?:\/|\s+DE\s+)\d{1,3}(?!\d)/ig, "").replace(/[\s\-–—()]+$/g, "");
  const vm = (s.valores_mes ?? {}) as Record<string, number>;
  const valor = Number(s.valor_fixo ?? Object.values(vm).find((v) => Number(v) > 0) ?? 0);
  const parcela = parcelaDaDescricao(s.descricao);
  return `${norm(s.pgto)}|${norm(base)}|${parcela?.total ?? ""}|${Math.round(valor * 100)}`;
}

export function chaveAssinaturaFatura(s: { descricao: string; pgto?: string | null }) {
  return `${norm(s.pgto)}|${norm(s.descricao)}`;
}

export type SaidaFaturaGerada = { item: LancamentoFatura; saida: TablesInsert<"saidas"> };

/**
 * Pontual: zera no mês seguinte. Parcela: zera depois da última. Assinatura: valor fixo contínuo.
 * O zero explícito impede que a regra de despesa contínua repita uma parcela já encerrada.
 */
export function gerarSaidasFatura(
  itens: LancamentoFatura[],
  op: { cartao: string; competencia: string; dia: number | null },
): SaidaFaturaGerada[] {
  const competencia = chaveDaCompetencia(op.competencia), origem = origemFatura(op.cartao, op.competencia);
  const pgto = `CARTÃO ${op.cartao.trim().toUpperCase()}`.trim();
  const out: SaidaFaturaGerada[] = [];
  for (const item of itens) {
    if (!item.incluir || !item.descricao.trim() || !(item.valor > 0)) continue;
    const base: TablesInsert<"saidas"> = {
      descricao: item.descricao.trim(), categoria: item.categoria.trim().toUpperCase() || null,
      pgto, banco: null, dia: op.dia, destino: item.destino, origem,
    };
    if (item.tipo === "ASSINATURA") {
      out.push({ item, saida: { ...base, valor_fixo: item.valor, valores_mes: {}, ri: competencia, rf: null } });
      continue;
    }
    const valores_mes: Record<string, number> = { [competencia]: item.valor };
    let rf = somarMeses(competencia, 1);
    if (item.tipo === "PARCELA") {
      const atual = item.parcelaAtual ?? 1, total = item.parcelasTotal ?? 1;
      if (atual < 1 || total < 2 || atual > total) throw new Error(`Confira a parcela de ${item.descricao}.`);
      const restantes = total - atual;
      for (let i = 1; i <= restantes; i++) valores_mes[somarMeses(competencia, i)] = item.valor;
      rf = somarMeses(competencia, restantes + 1);
    }
    // Marca o fim com zero: valorSaida usa o valor de rf depois de rf.
    valores_mes[rf] = 0;
    out.push({ item, saida: { ...base, valor_fixo: null, valores_mes, ri: competencia, rf } });
  }
  return out;
}
