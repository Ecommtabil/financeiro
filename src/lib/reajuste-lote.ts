import type { Regra } from "./calc";
import type { Saida } from "./dados";
import { atualizacaoValorSaida } from "./edicao-demonstrativo";

/** Cria exceções individuais para as saídas escolhidas, sem alterar as demais regras. */
export function regrasComReajusteEmLote(
  atuais: Record<string, Regra>,
  ids: string[],
  indice: number,
): Record<string, Regra> {
  if (!Number.isFinite(indice) || indice < 0) throw new Error("Informe um percentual válido, maior ou igual a zero.");
  const novas = { ...atuais };
  for (const id of ids) novas[id] = { indice, sobe: true };
  return novas;
}

/** Prepara o novo valor/mês base apenas das saídas escolhidas. */
export function atualizacoesValorEmLote(saidas: Saida[], ids: string[], valor: number, primeiroMes: string) {
  if (!Number.isFinite(valor) || valor < 0) throw new Error("Informe um valor válido, maior ou igual a zero.");
  const escolhidas = new Set(ids);
  return saidas.filter((s) => escolhidas.has(s.id)).map((s) => ({ id: s.id, atualizacao: atualizacaoValorSaida(s, valor, primeiroMes) }));
}
