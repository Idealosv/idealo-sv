-- Keep reservation consumption synchronized with movements that explicitly consume a reservation.
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock numeric(18,3); v_avg numeric(18,4); v_reserved numeric(18,3); v_blocked numeric(18,3); v_damaged numeric(18,3);
  v_own_remaining numeric(18,3) := 0; v_available numeric(18,3); v_new_stock numeric(18,3); v_new_avg numeric(18,4); v_out boolean;
BEGIN
  SELECT current_stock,average_cost,reserved_stock,blocked_stock,damaged_stock
    INTO v_stock,v_avg,v_reserved,v_blocked,v_damaged
  FROM public.inventory_items
  WHERE id=NEW.inventory_item_id AND company_id=NEW.company_id AND active=true AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item does not belong to this company'; END IF;

  IF NEW.warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_warehouses w WHERE w.id=NEW.warehouse_id AND w.company_id=NEW.company_id) THEN RAISE EXCEPTION 'La bodega no pertenece a esta empresa'; END IF;
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_locations l WHERE l.id=NEW.location_id AND l.company_id=NEW.company_id AND (NEW.warehouse_id IS NULL OR l.warehouse_id=NEW.warehouse_id)) THEN RAISE EXCEPTION 'La ubicación no corresponde a la empresa o bodega seleccionada'; END IF;
  IF NEW.purchase_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=NEW.purchase_id AND p.company_id=NEW.company_id) THEN RAISE EXCEPTION 'La compra no pertenece a esta empresa'; END IF;
  IF NEW.work_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id=NEW.work_order_id AND wo.company_id=NEW.company_id) THEN RAISE EXCEPTION 'La orden de trabajo no pertenece a esta empresa'; END IF;

  IF NEW.reservation_id IS NOT NULL THEN
    SELECT greatest(r.quantity-r.consumed_quantity,0) INTO v_own_remaining
    FROM public.inventory_reservations r
    WHERE r.id=NEW.reservation_id AND r.company_id=NEW.company_id AND r.inventory_item_id=NEW.inventory_item_id AND r.status='ACTIVE'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La reserva no es válida para este artículo'; END IF;
  END IF;

  v_out := NEW.movement_type IN ('CONSUMPTION','ADJUST_OUT','SALE_OUT','TRANSFER_OUT','DAMAGE','LOSS','EXPIRY','SUPPLIER_RETURN','PRODUCTION_OUT','INSTALLATION_OUT');
  NEW.previous_stock := v_stock;
  IF v_out THEN
    v_available := greatest(v_stock-coalesce(v_reserved,0)-coalesce(v_blocked,0)-coalesce(v_damaged,0)+coalesce(v_own_remaining,0),0);
    IF NEW.quantity > v_available THEN RAISE EXCEPTION 'Stock disponible insuficiente: disponible %, solicitado %',v_available,NEW.quantity; END IF;
    v_new_stock:=v_stock-NEW.quantity; v_new_avg:=v_avg;
  ELSE
    v_new_stock:=v_stock+NEW.quantity;
    IF NEW.movement_type IN ('PURCHASE_IN','ADJUST_IN','RETURN','PRODUCTION_IN','TRANSFER_IN','INITIAL') AND coalesce(NEW.unit_cost,0)>0 THEN
      v_new_avg:=CASE WHEN v_new_stock>0 THEN ((v_stock*v_avg)+(NEW.quantity*NEW.unit_cost))/v_new_stock ELSE NEW.unit_cost END;
    ELSE v_new_avg:=v_avg; END IF;
  END IF;
  NEW.resulting_stock:=v_new_stock;
  UPDATE public.inventory_items SET current_stock=v_new_stock,average_cost=v_new_avg,last_cost=CASE WHEN coalesce(NEW.unit_cost,0)>0 THEN NEW.unit_cost ELSE last_cost END,last_movement_at=coalesce(NEW.movement_at,now()),updated_at=now() WHERE id=NEW.inventory_item_id;

  IF v_out AND NEW.reservation_id IS NOT NULL THEN
    UPDATE public.inventory_reservations
    SET consumed_quantity=least(quantity,consumed_quantity+NEW.quantity),
        status=CASE WHEN consumed_quantity+NEW.quantity>=quantity THEN 'CONSUMED' ELSE 'ACTIVE' END,
        updated_at=now()
    WHERE id=NEW.reservation_id;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_inventory_movement() FROM PUBLIC;
