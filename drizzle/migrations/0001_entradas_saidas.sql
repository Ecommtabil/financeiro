CREATE TABLE public.entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  codigo text, empresa text NOT NULL, carteira text, dia integer, banco text,
  ativo boolean NOT NULL DEFAULT true, regime text, grupo text, setor text,
  valor numeric(18,6) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','import')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.saidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  descricao text NOT NULL, categoria text, pgto text, banco text, dia integer,
  destino text CHECK (destino IN ('ESCRITORIO','PESSOAL')),
  valores_mes jsonb NOT NULL DEFAULT '{}'::jsonb,
  valor_fixo numeric(18,6),
  ri text, rf text,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','import')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.entradas_pessoais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  descricao text NOT NULL, dia integer, banco text, inicio text, fim text,
  valor numeric(18,6) NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','import')),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entradas, public.saidas, public.entradas_pessoais TO authenticated;
GRANT ALL ON public.entradas, public.saidas, public.entradas_pessoais TO service_role;
ALTER TABLE public.entradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saidas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entradas_pessoais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dono" ON public.entradas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono" ON public.saidas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dono" ON public.entradas_pessoais FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.entradas(user_id); CREATE INDEX ON public.saidas(user_id); CREATE INDEX ON public.entradas_pessoais(user_id);