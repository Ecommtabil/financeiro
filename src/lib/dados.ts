import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { norm, type Previa } from "./importacao";

export type Tabela = "entradas" | "saidas" | "entradas_pessoais";
export type Saida = Tables<"saidas">;
export type Entrada = Tables<"entradas">;
export type EntradaPessoal = Tables<"entradas_pessoais">;

export function useLista<T extends Tabela>(tabela: T) {
  return useQuery({
    queryKey: [tabela],
    queryFn: async () => {
      const { data, error } = await supabase.from(tabela).select("*").order("created_at");
      if (error) throw error;
      return data as Tables<T>[];
    },
  });
}

export function useInserir<T extends Tabela>(tabela: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: TablesInsert<T>) => {
      const { error } = await supabase.from(tabela).insert(v as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [tabela] }),
  });
}

export function useAtualizar<T extends Tabela>(tabela: T) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, v }: { id: string; v: TablesUpdate<T> }) => {
      const { error } = await supabase.from(tabela as "saidas").update(v as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [tabela] }),
  });
}

export function useExcluir(tabela: Tabela) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(tabela).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [tabela] }),
  });
}

/** Reimportação: substitui itens de origem 'import', mantém os 'manual'. */
export function useImportar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Previa) => {
      let itens: unknown[] = p.itens;
      if (p.tipo === "saidas") {
        const { data } = await supabase.from("saidas").select("descricao,destino").not("destino", "is", null);
        const antigos = new Map((data ?? []).map((s) => [norm(s.descricao), s.destino]));
        itens = p.itens.map((i) => (i.destino ? i : { ...i, destino: antigos.get(norm(i.descricao)) ?? null }));
      }
      const del = await supabase.from(p.tipo).delete().eq("origem", "import");
      if (del.error) throw del.error;
      for (let i = 0; i < itens.length; i += 500) {
        const { error } = await supabase.from(p.tipo).insert(itens.slice(i, i + 500) as never);
        if (error) throw error;
      }
    },
    onSuccess: (_d, p) => qc.invalidateQueries({ queryKey: [p.tipo] }),
  });
}

/** Valor da saída num mês "aaaa-mm". */
export function valorSaidaNoMes(s: Saida, chave: string): number {
  if (s.valor_fixo != null) {
    if (s.ri && chave < s.ri) return 0;
    if (s.rf && chave > s.rf) return 0;
    return Number(s.valor_fixo);
  }
  return Number((s.valores_mes as Record<string, number>)?.[chave] ?? 0);
}
