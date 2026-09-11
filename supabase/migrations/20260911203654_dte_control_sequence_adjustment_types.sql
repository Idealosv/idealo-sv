alter table public.dte_control_sequences
 drop constraint if exists dte_control_sequences_dte_type_check;

alter table public.dte_control_sequences
 add constraint dte_control_sequences_dte_type_check
 check(dte_type in ('01','03','05','06','07','11','14','15'));
