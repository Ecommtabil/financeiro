import type { Regra } from "./calc";

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
