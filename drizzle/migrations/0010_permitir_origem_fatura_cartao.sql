ALTER TABLE public.saidas DROP CONSTRAINT saidas_origem_check;
ALTER TABLE public.saidas ADD CONSTRAINT saidas_origem_check CHECK (origem IN ('manual', 'import') OR origem LIKE 'fatura:%');