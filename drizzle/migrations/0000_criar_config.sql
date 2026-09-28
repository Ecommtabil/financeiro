CREATE TABLE public.config (
  user_id uuid PRIMARY KEY DEFAULT auth.uid(),
  base_data date,
  anos_projecao int NOT NULL DEFAULT 5 CHECK (anos_projecao >= 5 AND anos_projecao <= 30),
  incluir_restante boolean NOT NULL DEFAULT true,
  reajuste_mes int NOT NULL DEFAULT 1 CHECK (reajuste_mes BETWEEN 1 AND 12),
  indice_padrao_entradas numeric NOT NULL DEFAULT 5,
  indice_padrao_saidas numeric NOT NULL DEFAULT 5,
  regras_categoria jsonb NOT NULL DEFAULT '{}'::jsonb,
  regras_item jsonb NOT NULL DEFAULT '{}'::jsonb,
  dre_map jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.config TO authenticated;
GRANT ALL ON public.config TO service_role;
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "config propria select" ON public.config FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "config propria insert" ON public.config FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "config propria update" ON public.config FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "config propria delete" ON public.config FOR DELETE TO authenticated USING (auth.uid() = user_id);