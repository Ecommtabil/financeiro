import type { Regra } from "./calc";
import type { Entrada, EntradaPessoal, Saida, Tabela } from "./dados";
import { atualizacaoValorEntrada, atualizacaoValorSaida } from "./edicao-demonstrativo";

/** Cria exceções individuais para os itens escolhidos, sem alterar as demais regras. */
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

export type ItemValorBase = {
  tabela: Tabela;
  id: string;
  registro: Entrada | EntradaPessoal | Saida;
};

/** Prepara o valor base de entradas e saídas, preservando as regras próprias de cada cadastro. */
export function atualizacoesValorBaseEmLote(itens: ItemValorBase[], ids: string[], valor: number, primeiroMes: string) {
  if (!Number.isFinite(valor) || valor < 0) throw new Error("Informe um valor válido, maior ou igual a zero.");
  const escolhidos = new Set(ids);
  return itens.filter((item) => escolhidos.has(item.id)).map((item) => ({
    ...item,
    atualizacao: item.tabela === "saidas"
      ? atualizacaoValorSaida(item.registro as Saida, valor, primeiroMes)
      : atualizacaoValorEntrada(valor),
  }));
}
