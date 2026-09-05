CREATE OR REPLACE FUNCTION public.guard_inventory_item_archive()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL) OR (OLD.active=true AND NEW.active=false) THEN
    IF coalesce(OLD.current_stock,0)<>0 THEN RAISE EXCEPTION 'No se puede archivar un artículo con existencias. Dejá el stock en cero primero.'; END IF;
    IF coalesce(OLD.reserved_stock,0)<>0 OR EXISTS (SELECT 1 FROM public.inventory_reservations r WHERE r.inventory_item_id=OLD.id AND r.status='ACTIVE' AND r.quantity>r.consumed_quantity) THEN
      RAISE EXCEPTION 'No se puede archivar un artículo con reservas activas.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_guard_inventory_item_archive ON public.inventory_items;
CREATE TRIGGER trg_guard_inventory_item_archive BEFORE UPDATE OF active,deleted_at ON public.inventory_items FOR EACH ROW EXECUTE FUNCTION public.guard_inventory_item_archive();

CREATE OR REPLACE FUNCTION public.create_inventory_count_snapshot(
  p_company_id uuid, p_code text, p_count_type text DEFAULT 'CYCLE', p_warehouse_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_count public.inventory_counts%rowtype; v_lines integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.erp_can_operate(p_company_id) THEN RAISE EXCEPTION 'Sin permiso para crear conteos de inventario'; END IF;
  IF nullif(btrim(p_code),'') IS NULL THEN RAISE EXCEPTION 'El código del conteo es obligatorio'; END IF;
  IF p_count_type NOT IN ('CYCLE','FULL','CATEGORY','LOCATION') THEN RAISE EXCEPTION 'Tipo de conteo inválido'; END IF;
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_warehouses w WHERE w.id=p_warehouse_id AND w.company_id=p_company_id) THEN RAISE EXCEPTION 'La bodega no pertenece a esta empresa'; END IF;

  INSERT INTO public.inventory_counts(company_id,warehouse_id,code,count_type,notes,created_by)
  VALUES(p_company_id,p_warehouse_id,btrim(p_code),p_count_type,nullif(btrim(coalesce(p_notes,'')),''),auth.uid()) RETURNING * INTO v_count;

  INSERT INTO public.inventory_count_lines(company_id,inventory_count_id,inventory_item_id,location_id,system_quantity)
  SELECT p_company_id,v_count.id,i.id,i.location_id,i.current_stock
  FROM public.inventory_items i
  WHERE i.company_id=p_company_id AND i.active=true AND i.deleted_at IS NULL
    AND (p_warehouse_id IS NULL OR i.warehouse_id=p_warehouse_id);
  GET DIAGNOSTICS v_lines = ROW_COUNT;
  RETURN jsonb_build_object('id',v_count.id,'code',v_count.code,'status',v_count.status,'lines',v_lines);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_inventory_count_snapshot(uuid,text,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_inventory_count_snapshot(uuid,text,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_inventory_item_archive() FROM PUBLIC;
