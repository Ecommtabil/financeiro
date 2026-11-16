import type { TablesUpdate } from "@/integrations/supabase/types";
import type { Saida } from "./dados";

/** "2026-10" -> "10/2026". */
export function exibirMesNumerico(valor: string | null): string {
  return valor ? `${valor.slice(5, 7)}/${valor.slice(0, 4)}` : "";
}

/** "10/2026" -> "2026-10"; null = vazio; undefined = inválido. */
export function lerMesNumerico(texto: string): string | null | undefined {
  const limpo = texto.trim();
  if (!limpo) return null;
  const m = limpo.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return undefined;
  return `${m[2]}-${m[1]!.padStart(2, "0")}`;
}

/** Entradas: um novo valor/mês substitui os meses-base, como no Cadastro. */
export function atualizacaoValorEntrada(valor: number): Pick<TablesUpdate<"entradas">, "valor" | "valores_base"> {
  return { valor, valores_base: {} };
}

/** Saídas: atualiza os meses não zerados do primeiro mês em diante, preservando parcelas encerradas. */
export function atualizacaoValorSaida(s: Saida, valor: number, primeiroMes: string): Pick<TablesUpdate<"saidas">, "valor_fixo" | "valores_mes"> {
  if (s.valor_fixo != null) return { valor_fixo: valor };
  const valores_mes: Record<string, number> = { ...((s.valores_mes ?? {}) as Record<string, number>) };
  for (const k of Object.keys(valores_mes)) if (k >= primeiroMes && Number(valores_mes[k]) !== 0) valores_mes[k] = valor;
  valores_mes[primeiroMes] = valor;
  return { valores_mes };
}
