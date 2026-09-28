CREATE TABLE public.investimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'Aplicação',
  instituicao text,
  destino text,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  taxa numeric NOT NULL DEFAULT 0,
  aporte_fixo numeric NOT NULL DEFAULT 0,
  saida_id uuid,
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.bens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  tipo text,
  valor numeric NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.dividas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  credor text,
  saldo numeric NOT NULL DEFAULT 0,
  juros numeric NOT NULL DEFAULT 0,
  parcela_fixa numeric NOT NULL DEFAULT 0,
  saida_id uuid,
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.investimentos, public.bens, public.dividas TO authenticated;
GRANT ALL ON public.investimentos, public.bens, public.dividas TO service_role;
ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dividas ENABLE ROW LEVEL SECURITY;
CREATE POLICY dono ON public.investimentos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY dono ON public.bens FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY dono ON public.dividas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ON public.investimentos(user_id);
CREATE INDEX ON public.bens(user_id);
CREATE INDEX ON public.dividas(user_id);