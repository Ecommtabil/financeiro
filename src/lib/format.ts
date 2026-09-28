const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** 1234.56 -> "1.234,56" */
export function formatarNumero(valor: number, casas = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(valor);
}

/** 1234.56 -> "R$ 1.234,56" */
export function formatarBRL(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

/** (2026, 10) -> "Out/26" (mes 1-12) */
export function formatarMes(ano: number, mes: number): string {
  return `${MESES[mes - 1]}/${String(ano).slice(-2)}`;
}

/** Date -> "Out/26" */
export function formatarMesData(data: Date): string {
  return formatarMes(data.getFullYear(), data.getMonth() + 1);
}

/** Date -> "28/09/2026" */
export function formatarData(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR").format(data);
}

const BANCOS_NORMALIZADOS: Array<[RegExp, string]> = [
  [/^SICREEDI$/, "SICREDI"],
  [/^SACREDI X$/, "SICREDI X"],
  [/^BANCO INTER$/, "INTER"],
  [/^BRASIL$/, "BANCO DO BRASIL"],
];

/** Compara sem acento e em maiúsculas, aplicando os apelidos conhecidos. */
export function normalizarBanco(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

  for (const [padrao, destino] of BANCOS_NORMALIZADOS) {
    if (padrao.test(base)) return destino;
  }
  return base;
}
