-- La devolución se construye dentro de una sola transacción RPC.
-- El monto inicia en cero mientras se validan partidas y se actualiza antes de commit.
alter table public.bar_refunds drop constraint if exists bar_refunds_amount_check;
alter table public.bar_refunds add constraint bar_refunds_amount_check check(amount>=0);
