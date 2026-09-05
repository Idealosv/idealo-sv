-- Inventory integrity and role hardening

-- Secondary inventory tables must follow ERP role permissions.
DROP POLICY IF EXISTS company_members_manage_inventory_warehouses ON public.inventory_warehouses;
DROP POLICY IF EXISTS inventory_warehouses_read ON public.inventory_warehouses;
DROP POLICY IF EXISTS inventory_warehouses_write ON public.inventory_warehouses;
CREATE POLICY inventory_warehouses_read ON public.inventory_warehouses FOR SELECT USING (public.erp_can_read(company_id));
CREATE POLICY inventory_warehouses_write ON public.inventory_warehouses FOR ALL USING (public.erp_can_operate(company_id)) WITH CHECK (public.erp_can_operate(company_id));

DROP POLICY IF EXISTS company_members_manage_inventory_locations ON public.inventory_locations;
DROP POLICY IF EXISTS inventory_locations_read ON public.inventory_locations;
DROP POLICY IF EXISTS inventory_locations_write ON public.inventory_locations;
CREATE POLICY inventory_locations_read ON public.inventory_locations FOR SELECT USING (public.erp_can_read(company_id));
CREATE POLICY inventory_locations_write ON public.inventory_locations FOR ALL USING (public.erp_can_operate(company_id)) WITH CHECK (public.erp_can_operate(company_id));

DROP POLICY IF EXISTS company_members_manage_inventory_counts ON public.inventory_counts;
DROP POLICY IF EXISTS inventory_counts_read ON public.inventory_counts;
DROP POLICY IF EXISTS inventory_counts_write ON public.inventory_counts;
CREATE POLICY inventory_counts_read ON public.inventory_counts FOR SELECT USING (public.erp_can_read(company_id));
CREATE POLICY inventory_counts_write ON public.inventory_counts FOR ALL USING (public.erp_can_operate(company_id)) WITH CHECK (public.erp_can_operate(company_id));

DROP POLICY IF EXISTS company_members_manage_inventory_count_lines ON public.inventory_count_lines;
DROP POLICY IF EXISTS inventory_count_lines_read ON public.inventory_count_lines;
DROP POLICY IF EXISTS inventory_count_lines_write ON public.inventory_count_lines;
CREATE POLICY inventory_count_lines_read ON public.inventory_count_lines FOR SELECT USING (public.erp_can_read(company_id));
CREATE POLICY inventory_count_lines_write ON public.inventory_count_lines FOR ALL USING (public.erp_can_operate(company_id)) WITH CHECK (public.erp_can_operate(company_id));

-- Prevent generic reservations from overbooking usable stock.
CREATE OR REPLACE FUNCTION public.validate_inventory_reservation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock numeric(18,3);
  v_blocked numeric(18,3);
  v_damaged numeric(18,3);
  v_other_reserved numeric(18,3);
  v_requested numeric(18,3);
  v_available numeric(18,3);
BEGIN
  IF NEW.status IS NULL THEN NEW.status := 'ACTIVE'; END IF;
  IF coalesce(NEW.consumed_quantity,0) < 0 OR coalesce(NEW.consumed_quantity,0) > NEW.quantity THEN
    RAISE EXCEPTION 'Cantidad consumida inválida para la reserva';
  END IF;

  SELECT current_stock,blocked_stock,damaged_stock
    INTO v_stock,v_blocked,v_damaged
  FROM public.inventory_items
  WHERE id=NEW.inventory_item_id AND company_id=NEW.company_id AND active=true AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'El artículo no pertenece al inventario activo de esta empresa'; END IF;

  IF NEW.warehouse_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.inventory_warehouses w WHERE w.id=NEW.warehouse_id AND w.company_id=NEW.company_id
  ) THEN RAISE EXCEPTION 'La bodega no pertenece a esta empresa'; END IF;
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.inventory_locations l WHERE l.id=NEW.location_id AND l.company_id=NEW.company_id
      AND (NEW.warehouse_id IS NULL OR l.warehouse_id=NEW.warehouse_id)
  ) THEN RAISE EXCEPTION 'La ubicación no corresponde a la empresa o bodega seleccionada'; END IF;
  IF NEW.work_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.work_orders wo WHERE wo.id=NEW.work_order_id AND wo.company_id=NEW.company_id
  ) THEN RAISE EXCEPTION 'La orden de trabajo no pertenece a esta empresa'; END IF;

  IF NEW.status='ACTIVE' THEN
    SELECT coalesce(sum(greatest(r.quantity-r.consumed_quantity,0)),0)
      INTO v_other_reserved
    FROM public.inventory_reservations r
    WHERE r.inventory_item_id=NEW.inventory_item_id AND r.status='ACTIVE'
      AND (TG_OP='INSERT' OR r.id<>NEW.id);
    v_requested := greatest(NEW.quantity-coalesce(NEW.consumed_quantity,0),0);
    v_available := greatest(coalesce(v_stock,0)-coalesce(v_blocked,0)-coalesce(v_damaged,0)-v_other_reserved,0);
    IF v_requested > v_available THEN
      RAISE EXCEPTION 'Stock insuficiente para reservar: disponible %, solicitado %',v_available,v_requested;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_inventory_reservation ON public.inventory_reservations;
CREATE TRIGGER trg_validate_inventory_reservation
BEFORE INSERT OR UPDATE OF inventory_item_id,company_id,quantity,consumed_quantity,status,warehouse_id,location_id,work_order_id
ON public.inventory_reservations FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_reservation();

CREATE OR REPLACE FUNCTION public.refresh_inventory_reservation_stock_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.refresh_inventory_reserved_stock(OLD.inventory_item_id);
    RETURN OLD;
  END IF;
  PERFORM public.refresh_inventory_reserved_stock(NEW.inventory_item_id);
  IF TG_OP='UPDATE' AND OLD.inventory_item_id IS DISTINCT FROM NEW.inventory_item_id THEN
    PERFORM public.refresh_inventory_reserved_stock(OLD.inventory_item_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_inventory_reserved_stock ON public.inventory_reservations;
CREATE TRIGGER trg_refresh_inventory_reserved_stock
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION public.refresh_inventory_reservation_stock_trigger();

-- Prevent normal outgoing movements from consuming stock reserved, blocked or damaged.
-- A movement carrying reservation_id may consume the remaining quantity of its own active reservation.
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_stock numeric(18,3);
  v_avg numeric(18,4);
  v_reserved numeric(18,3);
  v_blocked numeric(18,3);
  v_damaged numeric(18,3);
  v_own_remaining numeric(18,3) := 0;
  v_available numeric(18,3);
  v_new_stock numeric(18,3);
  v_new_avg numeric(18,4);
  v_out boolean;
BEGIN
  SELECT current_stock,average_cost,reserved_stock,blocked_stock,damaged_stock
    INTO v_stock,v_avg,v_reserved,v_blocked,v_damaged
  FROM public.inventory_items
  WHERE id=NEW.inventory_item_id AND company_id=NEW.company_id AND active=true AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventory item does not belong to this company'; END IF;

  IF NEW.warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_warehouses w WHERE w.id=NEW.warehouse_id AND w.company_id=NEW.company_id) THEN
    RAISE EXCEPTION 'La bodega no pertenece a esta empresa';
  END IF;
  IF NEW.location_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.inventory_locations l WHERE l.id=NEW.location_id AND l.company_id=NEW.company_id AND (NEW.warehouse_id IS NULL OR l.warehouse_id=NEW.warehouse_id)) THEN
    RAISE EXCEPTION 'La ubicación no corresponde a la empresa o bodega seleccionada';
  END IF;
  IF NEW.purchase_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.purchases p WHERE p.id=NEW.purchase_id AND p.company_id=NEW.company_id) THEN RAISE EXCEPTION 'La compra no pertenece a esta empresa'; END IF;
  IF NEW.work_order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.work_orders wo WHERE wo.id=NEW.work_order_id AND wo.company_id=NEW.company_id) THEN RAISE EXCEPTION 'La orden de trabajo no pertenece a esta empresa'; END IF;

  IF NEW.reservation_id IS NOT NULL THEN
    SELECT greatest(r.quantity-r.consumed_quantity,0) INTO v_own_remaining
    FROM public.inventory_reservations r
    WHERE r.id=NEW.reservation_id AND r.company_id=NEW.company_id AND r.inventory_item_id=NEW.inventory_item_id AND r.status='ACTIVE';
    IF NOT FOUND THEN RAISE EXCEPTION 'La reserva no es válida para este artículo'; END IF;
  END IF;

  v_out := NEW.movement_type IN ('CONSUMPTION','ADJUST_OUT','SALE_OUT','TRANSFER_OUT','DAMAGE','LOSS','EXPIRY','SUPPLIER_RETURN','PRODUCTION_OUT','INSTALLATION_OUT');
  NEW.previous_stock := v_stock;
  IF v_out THEN
    v_available := greatest(v_stock-coalesce(v_reserved,0)-coalesce(v_blocked,0)-coalesce(v_damaged,0)+coalesce(v_own_remaining,0),0);
    IF NEW.quantity > v_available THEN RAISE EXCEPTION 'Stock disponible insuficiente: disponible %, solicitado %',v_available,NEW.quantity; END IF;
    v_new_stock:=v_stock-NEW.quantity;
    v_new_avg:=v_avg;
  ELSE
    v_new_stock:=v_stock+NEW.quantity;
    IF NEW.movement_type IN ('PURCHASE_IN','ADJUST_IN','RETURN','PRODUCTION_IN','TRANSFER_IN','INITIAL') AND coalesce(NEW.unit_cost,0)>0 THEN
      v_new_avg:=CASE WHEN v_new_stock>0 THEN ((v_stock*v_avg)+(NEW.quantity*NEW.unit_cost))/v_new_stock ELSE NEW.unit_cost END;
    ELSE v_new_avg:=v_avg; END IF;
  END IF;
  NEW.resulting_stock:=v_new_stock;
  UPDATE public.inventory_items SET current_stock=v_new_stock,average_cost=v_new_avg,last_cost=CASE WHEN coalesce(NEW.unit_cost,0)>0 THEN NEW.unit_cost ELSE last_cost END,last_movement_at=coalesce(NEW.movement_at,now()),updated_at=now() WHERE id=NEW.inventory_item_id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_inventory_reservation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_inventory_reservation_stock_trigger() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_inventory_movement() FROM PUBLIC;
