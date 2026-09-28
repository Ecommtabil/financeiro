CREATE TABLE public.saldos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  banco text NOT NULL,
  saldo numeric NOT NULL DEFAULT 0,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, banco)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saldos TO authenticated;
GRANT ALL ON public.saldos TO service_role;
ALTER TABLE public.saldos ENABLE ROW LEVEL SECURITY;
CREATE POLICY dono ON public.saldos FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.baixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  tipo text NOT NULL CHECK (tipo IN ('entrada','pessoal','saida')),
  item_id uuid NOT NULL,
  mes text NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  banco text,
  baixado_em timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, tipo, item_id, mes)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.baixas TO authenticated;
GRANT ALL ON public.baixas TO service_role;
ALTER TABLE public.baixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY dono ON public.baixas FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX baixas_user_mes ON public.baixas (user_id, mes);