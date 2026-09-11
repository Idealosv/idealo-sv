-- Seguridad: validate_quote_item_integrity es una función de trigger y no debe exponerse como RPC.
revoke execute on function public.validate_quote_item_integrity() from public,anon,authenticated;
