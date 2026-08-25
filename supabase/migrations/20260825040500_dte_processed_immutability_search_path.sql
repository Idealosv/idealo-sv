-- Endurece el contexto de ejecución del trigger de inmutabilidad DTE.
alter function public.guard_processed_dte_immutability()
  set search_path = public, pg_temp;
