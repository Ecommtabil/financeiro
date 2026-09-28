import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sugerirLinhaDRE } from "./dre-ia.server";

export const sugerirDRE = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ categoria: z.string().max(120), descricao: z.string().min(3).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("IA não configurada.");
    try {
      return await sugerirLinhaDRE(key, data.categoria, data.descricao);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 429) throw new Error("Muitas consultas seguidas. Aguarde um pouco e tente de novo.");
      if (status === 402) throw new Error("Créditos de IA esgotados. Adicione créditos em Configurações → Planos e créditos.");
      if (status === 403) throw new Error("Acesso à IA bloqueado para este espaço de trabalho.");
      throw e instanceof Error ? e : new Error("Falha ao consultar a IA.");
    }
  });
