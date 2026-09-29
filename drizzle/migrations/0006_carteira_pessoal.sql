CREATE TABLE public.carteira (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nome text NOT NULL,
  classe text NOT NULL DEFAULT 'Renda fixa',
  subcategoria text NOT NULL DEFAULT 'CDB',
  instituicao text,
  quantidade numeric NOT NULL DEFAULT 0,
  unidade text,
  valor_investido numeric NOT NULL DEFAULT 0,
  valor_atual numeric NOT NULL DEFAULT 0,
  data_aplicacao date,
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carteira TO authenticated;
GRANT ALL ON public.carteira TO service_role;
ALTER TABLE public.carteira ENABLE ROW LEVEL SECURITY;
CREATE POLICY dono ON public.carteira FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX carteira_user_idx ON public.carteira(user_id);