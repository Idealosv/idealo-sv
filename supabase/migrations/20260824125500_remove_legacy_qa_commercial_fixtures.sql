delete from public.work_order_costs
where work_order_id in (
  '045c65af-29d4-4f48-ae3a-055129f2740b',
  '8e5a47f0-370c-4722-8b4a-2df033f92300',
  '44700b52-8326-42c7-b085-981209719434'
);

delete from public.work_orders
where (id,number,title) in (
  ('045c65af-29d4-4f48-ae3a-055129f2740b'::uuid,987651,'QA trabajo 1'),
  ('8e5a47f0-370c-4722-8b4a-2df033f92300'::uuid,987652,'QA trabajo 2'),
  ('44700b52-8326-42c7-b085-981209719434'::uuid,987653,'QA trabajo 3')
);

delete from public.quotes
where id='037885e4-eb6a-44d5-8f6e-2db2ec269fd5'::uuid
  and number=987654
  and client_id is null
  and not exists (
    select 1 from public.quote_items
    where quote_id='037885e4-eb6a-44d5-8f6e-2db2ec269fd5'::uuid
  );
