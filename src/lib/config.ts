import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type Config = Tables<"config">;

export function useConfig() {
  return useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const { data, error } = await supabase.from("config").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useSalvarConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (valores: Partial<TablesInsert<"config">>) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirada");
      const { data, error } = await supabase
        .from("config")
        .upsert({ ...valores, user_id: u.user.id, updated_at: new Date().toISOString() })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => qc.setQueryData(["config"], data),
  });
}
