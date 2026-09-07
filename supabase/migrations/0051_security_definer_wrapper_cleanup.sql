-- Este wrapper no necesita privilegios del propietario de la función:
-- delega toda la autorización en convert_quote_to_work_order(), que ya valida acceso.
alter function public.mobile_convert_quote_to_work_order(uuid,timestamptz,text) security invoker;
