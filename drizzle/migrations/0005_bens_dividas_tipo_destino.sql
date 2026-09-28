ALTER TABLE public.bens ADD COLUMN IF NOT EXISTS destino text;
ALTER TABLE public.dividas ADD COLUMN IF NOT EXISTS tipo text;
ALTER TABLE public.dividas ADD COLUMN IF NOT EXISTS destino text;