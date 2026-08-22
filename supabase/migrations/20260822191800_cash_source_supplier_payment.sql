alter table cash_movements drop constraint if exists cash_movements_source_type_check;
alter table cash_movements add constraint cash_movements_source_type_check
check (source_type in ('MANUAL','CUSTOMER_PAYMENT','PURCHASE','EXPENSE','SUPPLIER_PAYMENT','OTHER'));
