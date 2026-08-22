create index if not exists accounts_payable_purchase_fkey_idx on accounts_payable(purchase_id) where purchase_id is not null;
create index if not exists supplier_payments_payable_fkey_idx on supplier_payments(payable_id);
