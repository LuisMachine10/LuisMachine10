-- Strategya · Tarjetas de crédito: ciclo (corte, días para pagar, día en que quieres pagar) y doble moneda
--
-- Pedido de Mena: «para las tarjetas de crédito, vamos a agregar el día de mes del corte, los días para pagar y
-- los días donde uno quiere pagar […] Segundo, el límite de la tarjeta, pon una opción de pesos y dólares.»
--
-- 1. Ciclo (registro único, personal.activos):
--    · dia_corte (1–31): el día del mes en que la tarjeta corta. Si el mes no tiene ese día, corta el último.
--    · dias_para_pagar (1–60): días naturales desde el corte hasta la fecha límite de pago.
--    · dia_pago (ya existía, 1–31): desde aquí, en una TARJETA es «el día en que quieres pagar». Antes decía
--      «día del mes en que pagas», que es lo mismo: el valor que ya estaba se queda tal cual (no se mueve ni
--      se borra nada). En un préstamo sigue siendo el día en que pagas la cuota.
--    Fechas del ciclo: lib/caja/ciclo.ts (puro, con pruebas). Si una tarjeta tiene un pago fijo mensual en el
--    Presupuesto (un «Pago de tarjeta o préstamo» de un solo día), ese día sigue al día elegido (trigger abajo).
-- 2. Doble moneda (solo tarjetas en RD$): limite_usd y saldo_usd (lo que debes en US$, al empezar el día
--    saldo_usd_fecha, igual que cantidad/saldo_fecha). La parte en RD$ sigue en limite y cantidad. Las tarjetas
--    que ya existen quedan en RD$ con estas columnas vacías: no cambia nada hasta que Mena las llene.
--    El total en RD$ convierte la parte en US$ con el dólar de venta del BCRD (sin dato: no se suma).
-- 3. Pagos a una parte: caja_movimientos.parte y caja_recurrentes.parte (DOP | USD, null = según la moneda
--    del monto) dicen a qué moneda de la tarjeta va un pago (o un cargo). Si se paga la parte en US$ desde una
--    cuenta en RD$, se convierte con la tasa del movimiento o la del BCRD de la fecha (lib/caja/motor.ts).
--
-- Sin tablas nuevas en `personal` (las pruebas de esquema fijan la lista): solo columnas, funciones y un
-- trigger. Ninguna cifra de Mena vive en este archivo; nunca se guardan números de tarjeta (ni los 4 últimos).

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------

alter table personal.activos
  add column dia_corte       smallint check (dia_corte between 1 and 31),
  add column dias_para_pagar smallint check (dias_para_pagar between 1 and 60),
  add column limite_usd      numeric check (limite_usd >= 0),
  add column saldo_usd       numeric check (saldo_usd >= 0),
  add column saldo_usd_fecha date;

alter table personal.activos add constraint activos_doble_moneda_check
  check ((limite_usd is null and saldo_usd is null) or (clase = 'tarjeta' and moneda = 'DOP'));
alter table personal.activos add constraint activos_ciclo_check
  check ((dia_corte is null and dias_para_pagar is null) or clase = 'tarjeta');

comment on column personal.activos.dia_pago is
  'Tarjeta: día del mes en que quieres pagar (antes «día en que pagas»: mismo valor). Préstamo: día en que pagas la cuota.';
comment on column personal.activos.dia_corte is 'Tarjeta: día del mes del corte (si el mes no lo tiene, el último día).';
comment on column personal.activos.dias_para_pagar is 'Tarjeta: días naturales desde el corte hasta la fecha límite de pago.';
comment on column personal.activos.limite_usd is 'Tarjeta en RD$ con parte en dólares: límite en US$.';
comment on column personal.activos.saldo_usd is 'Tarjeta en RD$ con parte en dólares: lo que debes en US$ (al empezar saldo_usd_fecha).';
comment on column personal.activos.saldo_usd_fecha is 'Fecha del saldo en US$ (saldo al EMPEZAR ese día, como saldo_fecha).';

alter table personal.caja_movimientos add column parte text check (parte in ('DOP', 'USD'));
alter table personal.caja_recurrentes add column parte text check (parte in ('DOP', 'USD'));
comment on column personal.caja_movimientos.parte is
  'Tarjeta en dos monedas: a qué parte va (pago: la del destino; cargo: la de la cuenta). null = según la moneda del monto.';
comment on column personal.caja_recurrentes.parte is
  'Tarjeta en dos monedas: a qué parte va el pago fijo. null = según la moneda del monto.';

-- ---------------------------------------------------------------------------
-- 2. El pago fijo de la tarjeta sigue al día elegido
-- ---------------------------------------------------------------------------
-- Cuando cambia el «día en que quieres pagar» de una tarjeta que usa el Presupuesto, sus pagos fijos mensuales
-- de UN solo día («28») pasan al día nuevo. Los de varios días («15, 30») no se tocan (Mena los armó así).

create function personal.activos_dia_pago()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.clase <> 'tarjeta' or new.dia_pago is null or new.dia_pago is not distinct from old.dia_pago then
    return null;
  end if;
  update personal.caja_recurrentes r
  set dias = new.dia_pago::text, actualizado_en = now()
  where r.tipo = 'pago_tarjeta'
    and r.frecuencia = 'mensual'
    and r.dias ~ '^\s*\d{1,2}\s*$'
    and trim(r.dias) <> new.dia_pago::text
    and r.destino in (select c.id from personal.caja_cuentas c where c.registro_id = new.id);
  return null;
end;
$$;

create trigger activos_dia_pago after update of dia_pago on personal.activos
  for each row execute function personal.activos_dia_pago();

-- ---------------------------------------------------------------------------
-- 3. Unir dos filas repetidas: también el ciclo y la parte en US$
-- ---------------------------------------------------------------------------
-- Igual que en 20261027000100_deudas_y_dolares.sql; además conserva el ciclo y la parte en US$ de la que se va
-- si la que queda no los tiene, y lleva los cuadres de la parte en US$ («<cuenta>#usd») a la cuenta que queda.

create or replace function personal.unir_registro(p_queda text, p_se_va text, p_saldo numeric default null, p_fecha date default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q personal.activos;
  s personal.activos;
  v_cq text;
  v_cs text;
  v_mov integer := 0;
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado para unir cuentas' using errcode = '42501';
  end if;
  if p_queda is null or p_se_va is null or p_queda = p_se_va then
    raise exception 'Elige dos cuentas distintas para unir' using errcode = '22023';
  end if;
  select * into q from personal.activos a where a.id = p_queda for update;
  select * into s from personal.activos a where a.id = p_se_va for update;
  if q.id is null or s.id is null then
    raise exception 'Una de las dos cuentas ya no existe. Recarga la página.' using errcode = '22023';
  end if;
  if q.unido_a is not null or s.unido_a is not null then
    raise exception 'Una de las dos cuentas ya se unió con otra. Recarga la página.' using errcode = '22023';
  end if;
  if personal.es_deuda(q.clase) <> personal.es_deuda(s.clase) then
    raise exception 'No se puede unir una deuda con algo que tienes: «%» y «%» son de tipos distintos.', q.nombre, s.nombre using errcode = '22023';
  end if;
  if q.moneda <> s.moneda then
    raise exception '«%» está en % y «%» en %: no son la misma cuenta.', q.nombre, q.moneda, s.nombre, s.moneda using errcode = '22023';
  end if;

  select c.id into v_cq from personal.caja_cuentas c where c.registro_id = p_queda;
  select c.id into v_cs from personal.caja_cuentas c where c.registro_id = p_se_va;

  update personal.activos a
  set institucion = case when a.institucion = '' then s.institucion else a.institucion end,
      subtipo = coalesce(a.subtipo, case when a.clase = s.clase then s.subtipo end),
      limite = coalesce(a.limite, s.limite),
      dia_pago = coalesce(a.dia_pago, s.dia_pago),
      cuota = coalesce(a.cuota, s.cuota),
      tasa = case when a.tasa = 0 then s.tasa else a.tasa end,
      vencimiento = coalesce(a.vencimiento, s.vencimiento),
      dia_corte = case when a.clase = 'tarjeta' then coalesce(a.dia_corte, s.dia_corte) end,
      dias_para_pagar = case when a.clase = 'tarjeta' then coalesce(a.dias_para_pagar, s.dias_para_pagar) end,
      limite_usd = case when a.clase = 'tarjeta' and a.moneda = 'DOP' then coalesce(a.limite_usd, s.limite_usd) end,
      saldo_usd = case when a.clase = 'tarjeta' and a.moneda = 'DOP' then coalesce(a.saldo_usd, s.saldo_usd) end,
      saldo_usd_fecha = case when a.clase = 'tarjeta' and a.moneda = 'DOP' then (case when a.saldo_usd is null then s.saldo_usd_fecha else a.saldo_usd_fecha end) end,
      actualizado_en = now()
  where a.id = p_queda;

  if v_cs is not null then
    select * into q from personal.activos a where a.id = p_queda;
    if q.moneda not in ('DOP', 'USD') or q.clase in ('rentavariable', 'otros') or (q.precio is distinct from 1 and not personal.es_deuda(q.clase)) then
      raise exception '«%» no es una cuenta con saldo en RD$ o US$: no puede tomar el lugar de «%» en el Presupuesto.', q.nombre, s.nombre using errcode = '22023';
    end if;
    if v_cq is null then
      perform set_config('personal.sinc', '1', true);
      update personal.caja_cuentas
      set registro_id = p_queda, nombre = left(q.nombre, 120), tipo = personal.tipo_caja_de(q.clase, q.subtipo), limite = q.limite, moneda = q.moneda, actualizado_en = now()
      where id = v_cs;
      perform set_config('personal.sinc', '', true);
      v_cq := v_cs;
    else
      update personal.caja_movimientos set cuenta = v_cq where cuenta = v_cs;
      get diagnostics v_mov = row_count;
      update personal.caja_movimientos set destino = v_cq where destino = v_cs;
      update personal.caja_recurrentes set cuenta = v_cq where cuenta = v_cs;
      update personal.caja_recurrentes set destino = v_cq where destino = v_cs;
      insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
      select fecha, case when cuenta_id = v_cs then v_cq else v_cq || '#usd' end, saldo
      from personal.caja_saldos_reales where cuenta_id in (v_cs, v_cs || '#usd')
      on conflict (fecha, cuenta_id) do nothing;
      delete from personal.caja_saldos_reales where cuenta_id in (v_cs, v_cs || '#usd');
      delete from personal.caja_cuentas where id = v_cs;
    end if;
  end if;

  update personal.transacciones set activo_id = p_queda where activo_id = p_se_va;
  update personal.activos set unido_a = p_queda, actualizado_en = now() where id = p_se_va;

  if p_saldo is not null then
    update personal.activos a set cantidad = p_saldo, saldo_fecha = coalesce(p_fecha, personal.hoy_rd()), actualizado_en = now()
    where a.id = p_queda;
  elsif v_cs is not null and v_cq = v_cs then
    perform set_config('personal.sinc', '1', true);
    update personal.activos a set cantidad = s.cantidad, saldo_fecha = s.saldo_fecha, actualizado_en = now() where a.id = p_queda;
    perform set_config('personal.sinc', '', true);
  end if;

  return jsonb_build_object('queda', p_queda, 'archivada', p_se_va, 'cuenta_presupuesto', v_cq, 'movimientos_pasados', v_mov);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Importación del Presupuesto: también la parte de la tarjeta de cada pago
-- ---------------------------------------------------------------------------

create or replace function personal.caja_importar(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c jsonb := p_datos -> 'config';
  v_enlaces jsonb;
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado: solo la dueña o el dueño de Strategya puede importar la caja'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(v_c) is distinct from 'object' then
    raise exception 'Importación inválida: falta config';
  end if;

  select coalesce(jsonb_object_agg(id, registro_id), '{}'::jsonb) into v_enlaces
  from personal.caja_cuentas where registro_id is not null;

  delete from personal.caja_movimientos where true;
  delete from personal.caja_omitidos where true;
  delete from personal.caja_saldos_reales where true;
  delete from personal.caja_notas where true;
  delete from personal.caja_recurrentes where true;
  delete from personal.caja_categorias where true;
  delete from personal.caja_cuentas where true;
  delete from personal.caja_config where true;

  insert into personal.caja_config (id, inicio, colchon, margen, tasa_usd)
  values (1, (v_c ->> 'inicio')::date, coalesce((v_c ->> 'colchon')::numeric, 0),
          coalesce((v_c ->> 'margen')::numeric, 3000), nullif(v_c ->> 'tasa_usd', '')::numeric);

  insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden, moneda, registro_id)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'saldo_inicial')::numeric, 0),
         (e ->> 'limite')::numeric, coalesce((e ->> 'orden')::integer, 0), coalesce(nullif(e ->> 'moneda', ''), 'DOP'),
         coalesce(nullif(e ->> 'registro_id', ''),
                  case when exists (select 1 from personal.activos a where a.id = v_enlaces ->> (e ->> 'id') and a.unido_a is null)
                       then v_enlaces ->> (e ->> 'id') end)
  from jsonb_array_elements(coalesce(p_datos -> 'cuentas', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_categorias (id, nombre, tipo, adicional)
  select e ->> 'id', e ->> 'nombre',
         coalesce(e ->> 'tipo', case e ->> 'grupo'
                                  when 'ingreso' then 'ingreso' when 'fijo' then 'gasto' when 'variable' then 'gasto'
                                  when 'ahorro' then 'ahorro_inversion' when 'deuda' then 'gasto_financiero'
                                end),
         nullif(coalesce(e ->> 'adicional', e ->> 'presupuesto'), '')::numeric
  from jsonb_array_elements(coalesce(p_datos -> 'categorias', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_recurrentes
    (id, nombre, tipo, monto, moneda, pago_total, cuenta, destino, categoria, frecuencia, dias, cada_n, fecha, desde, hasta, activo, parte)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'monto')::numeric, 0), coalesce(e ->> 'moneda', 'DOP'),
         coalesce((e ->> 'pago_total')::boolean, false), e ->> 'cuenta', e ->> 'destino', e ->> 'categoria',
         coalesce(e ->> 'frecuencia', 'mensual'), coalesce(e ->> 'dias', ''), (e ->> 'cada_n')::integer,
         (e ->> 'fecha')::date, (e ->> 'desde')::date, (e ->> 'hasta')::date, coalesce((e ->> 'activo')::boolean, true),
         nullif(e ->> 'parte', '')
  from jsonb_array_elements(coalesce(p_datos -> 'recurrentes', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_movimientos (id, fecha, tipo, monto, moneda, tasa, cuenta, destino, categoria, nota, recurrente_id, interes, parte)
  select e ->> 'id', (e ->> 'fecha')::date, e ->> 'tipo', (e ->> 'monto')::numeric, coalesce(e ->> 'moneda', 'DOP'),
         (e ->> 'tasa')::numeric, e ->> 'cuenta', e ->> 'destino', e ->> 'categoria', e ->> 'nota', e ->> 'recurrente_id',
         nullif(e ->> 'interes', '')::numeric, nullif(e ->> 'parte', '')
  from jsonb_array_elements(coalesce(p_datos -> 'movimientos', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_omitidos (fecha, recurrente_id)
  select distinct (e ->> 'fecha')::date, e ->> 'recurrente_id'
  from jsonb_array_elements(coalesce(p_datos -> 'omitidos', '[]')) as t (e);

  insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
  select (e ->> 'fecha')::date, e ->> 'cuenta_id', (e ->> 'saldo')::numeric
  from jsonb_array_elements(coalesce(p_datos -> 'saldos', '[]')) as t (e)
  on conflict (fecha, cuenta_id) do update set saldo = excluded.saldo;

  insert into personal.caja_notas (fecha, nota)
  select (e ->> 'fecha')::date, e ->> 'nota'
  from jsonb_array_elements(coalesce(p_datos -> 'notas', '[]')) as t (e);

  return jsonb_build_object(
    'cuentas',     (select count(*) from personal.caja_cuentas),
    'categorias',  (select count(*) from personal.caja_categorias),
    'recurrentes', (select count(*) from personal.caja_recurrentes),
    'movimientos', (select count(*) from personal.caja_movimientos),
    'omitidos',    (select count(*) from personal.caja_omitidos),
    'saldos',      (select count(*) from personal.caja_saldos_reales),
    'notas',       (select count(*) from personal.caja_notas)
  );
end;
$$;

revoke all on function personal.caja_importar(jsonb) from public, anon;
grant execute on function personal.caja_importar(jsonb) to authenticated, service_role;
