create index if not exists production_material_requirements_company_idx on public.production_material_requirements(company_id);
create index if not exists production_status_history_company_idx on public.production_status_history(company_id);
create index if not exists production_tasks_assigned_employee_idx on public.production_tasks(assigned_employee_id);
create index if not exists work_orders_assigned_employee_idx on public.work_orders(assigned_employee_id);
create index if not exists work_orders_designer_employee_idx on public.work_orders(designer_employee_id);
create index if not exists work_orders_supervisor_employee_idx on public.work_orders(supervisor_employee_id);
create index if not exists work_orders_client_idx on public.work_orders(client_id);
create index if not exists work_orders_quote_idx on public.work_orders(quote_id);