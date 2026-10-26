-- Strategya · Fase F: pagos de deudas (capital e interés) y cuentas en US$ en el Presupuesto
--
-- 1. Pagos de tarjetas y préstamos. Un «pago de tarjeta o préstamo» (caja_movimientos.tipo =
--    'pago_tarjeta', destino = una cuenta de deuda) guarda en `interes` la parte que fue interés o cargos.
--    La deuda baja solo por el capital (monto − interes); el interés es gasto financiero del mes (en su
--    categoría de gasto financiero si la tiene, o en «Intereses de tus deudas»). La app lo calcula con la
--    tasa del registro (préstamos con tasa) o lo pregunta en el formulario (por defecto, todo capital).
--    Así el saldo del registro único (Portafolio → Mis cuentas), el Presupuesto y los cierres cuadran.
-- 2. Cuentas en US$. caja_cuentas.moneda (DOP | USD) sale del registro único. Los saldos y movimientos de
--    una cuenta en US$ se guardan en US$. El estado de resultados y los totales en RD$ usan la tasa propia
--    del movimiento (si Mena la anotó) o el dólar de venta oficial del BCRD (mercado.observaciones,
--    serie USDDOP_VENTA) de la fecha del movimiento; sin tasa en los 7 días anteriores, el monto NO se
--    suma (la pantalla dice «no confirmado»). El € no aplica: no hay serie oficial EUR/DOP en el catálogo
--    y caja_movimientos solo admite DOP y USD (prueba de esquema existente).
--
-- Sin tablas nuevas en `personal` (las pruebas de esquema fijan la lista): solo columnas y funciones.
-- Ninguna cifra de Mena vive en este archivo. RLS: las tablas ya tienen sus políticas.

-- ---------------------------------------------------------------------------
-- 1. Columnas
-- ---------------------------------------------------------------------------

alter table personal.caja_cuentas
  add column moneda text not null default 'DOP' check (moneda in ('DOP', 'USD'));
comment on column personal.caja_cuentas.moneda is
  'Moneda de la cuenta (sale del registro único). Saldo inicial, cuadres y posiciones van en esta moneda.';

alter table personal.caja_movimientos
  add column interes numeric check (interes >= 0);
alter table personal.caja_movimientos add constraint caja_movimientos_interes_pago_check
  check (interes is null or (tipo = 'pago_tarjeta' and interes <= monto));
comment on column personal.caja_movimientos.interes is
  'Solo pagos de tarjeta o préstamo: parte del monto que fue interés o cargos (gasto financiero). La deuda baja por monto − interes. null = todo capital.';

-- ---------------------------------------------------------------------------
-- 2. Dólar oficial del BCRD de una fecha
-- ---------------------------------------------------------------------------
-- El último dólar de venta publicado por el BCRD hasta esa fecha (fechas futuras: hasta hoy), con un
-- máximo de 7 días de antigüedad (el BCRD no publica fines de semana ni feriados). Sin dato → null.
-- La misma regla está en lib/caja/tasas.ts (tasaBcrd); las pruebas de base comparan las dos.

create function personal.tasa_usd_bcrd(p_fecha date)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select o.valor
  from mercado.observaciones o
  where o.serie_id = 'USDDOP_VENTA'
    and o.hora_dato is null
    and o.estado = 'ok'
    and o.fecha_dato <= least(p_fecha, personal.hoy_rd())
    and o.fecha_dato >= least(p_fecha, personal.hoy_rd()) - 7
  order by o.fecha_dato desc
  limit 1
$$;

comment on function personal.tasa_usd_bcrd(date) is
  'Dólar de venta del BCRD vigente en p_fecha (el último publicado hasta esa fecha o hasta hoy, máximo 7 días antes). null si no hay. SECURITY INVOKER.';

revoke all on function personal.tasa_usd_bcrd(date) from public, anon;
grant execute on function personal.tasa_usd_bcrd(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Triggers del enlace con el registro: ahora también US$
-- ---------------------------------------------------------------------------

create or replace function personal.caja_cuentas_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r personal.activos;
  v_cs text[];
  v_id text;
begin
  if personal.registro_sincronizando() then
    return new;
  end if;
  if new.registro_id is null and tg_op = 'INSERT' then
    -- Tipo inválido: no se toca nada y la restricción caja_cuentas_tipo_check lo rechaza.
    if new.tipo is null or new.tipo not in ('banco', 'efectivo', 'ahorro', 'tarjeta', 'prestamo') then
      return new;
    end if;
    v_cs := personal.clase_de_tipo_caja(new.tipo);
    v_id := personal.id_registro_libre(new.id);
    perform set_config('personal.sinc', '1', true);
    insert into personal.activos (id, clase, subtipo, nombre, institucion, moneda, cantidad, precio, tasa, limite, saldo_fecha, origen, orden)
    values (v_id, v_cs[1], v_cs[2], coalesce(new.nombre, 'Cuenta'), '', coalesce(new.moneda, 'DOP'), coalesce(new.saldo_inicial, 0), 1, 0, new.limite,
            coalesce((select inicio from personal.caja_config where id = 1), personal.hoy_rd()), 'presupuesto', 1000 + coalesce(new.orden, 0));
    perform set_config('personal.sinc', '', true);
    new.registro_id := v_id;
    return new;
  end if;
  if new.registro_id is not null and (tg_op = 'INSERT' or new.registro_id is distinct from old.registro_id) then
    select * into r from personal.activos a where a.id = new.registro_id;
    if not found then
      raise exception 'Esa cuenta no está en tu Portafolio (registro %).', new.registro_id using errcode = '23503';
    end if;
    if r.unido_a is not null then
      raise exception '«%» se unió con otra cuenta: elige la que quedó.', r.nombre using errcode = '22023';
    end if;
    if r.clase = 'rentavariable' or r.clase = 'otros' or (r.precio is distinct from 1 and not personal.es_deuda(r.clase)) then
      raise exception '«%» no es una cuenta con saldo (son unidades o un bien): no puede ser cuenta del Presupuesto.', r.nombre using errcode = '22023';
    end if;
    if r.moneda not in ('DOP', 'USD') then
      raise exception 'El Presupuesto lleva sus cuentas en RD$ o US$: «%» está en %.', r.nombre, r.moneda using errcode = '22023';
    end if;
    new.nombre := left(r.nombre, 120);
    new.tipo := personal.tipo_caja_de(r.clase, r.subtipo);
    new.limite := r.limite;
    new.moneda := r.moneda;
    return new;
  end if;
  if tg_op = 'UPDATE' and new.moneda is distinct from old.moneda then
    -- La moneda sale del registro: no se cambia desde el Presupuesto.
    new.moneda := old.moneda;
  end if;
  return new;
end;
$$;

create or replace function personal.activos_despues()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caja text;
  v_moneda text;
  v_inicio date := (select inicio from personal.caja_config where id = 1);
begin
  if personal.registro_sincronizando() then
    return null;
  end if;
  select c.id, c.moneda into v_caja, v_moneda from personal.caja_cuentas c where c.registro_id = new.id;
  if v_caja is null then
    return null;
  end if;
  if new.moneda is distinct from v_moneda then
    raise exception '«%» la usa el Presupuesto en %: para pasarla a % quítala primero del Presupuesto.', new.nombre, v_moneda, new.moneda using errcode = '22023';
  end if;
  if new.unido_a is not null and old.unido_a is null then
    raise exception '«%» la usa el Presupuesto: primero pasa sus movimientos a la cuenta que queda.', new.nombre using errcode = '22023';
  end if;
  perform set_config('personal.sinc', '1', true);
  update personal.caja_cuentas c
  set nombre = left(new.nombre, 120), tipo = personal.tipo_caja_de(new.clase, new.subtipo), limite = new.limite, actualizado_en = now()
  where c.id = v_caja
    and (c.nombre is distinct from left(new.nombre, 120) or c.tipo is distinct from personal.tipo_caja_de(new.clase, new.subtipo) or c.limite is distinct from new.limite);
  if new.cantidad is distinct from old.cantidad or new.saldo_fecha is distinct from old.saldo_fecha then
    if new.saldo_fecha is not null and v_inicio is not null and new.saldo_fecha > v_inicio then
      insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
      values (new.saldo_fecha - 1, v_caja, new.cantidad)
      on conflict (fecha, cuenta_id) do update set saldo = excluded.saldo, actualizado_en = now();
    else
      update personal.caja_cuentas c set saldo_inicial = new.cantidad, actualizado_en = now()
      where c.id = v_caja and c.saldo_inicial is distinct from new.cantidad;
    end if;
  end if;
  perform set_config('personal.sinc', '', true);
  return null;
end;
$$;

-- Unir dos filas repetidas: igual que antes, pero la que queda puede ser una cuenta en US$.
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
      select fecha, v_cq, saldo from personal.caja_saldos_reales where cuenta_id = v_cs
      on conflict (fecha, cuenta_id) do nothing;
      delete from personal.caja_saldos_reales where cuenta_id = v_cs;
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
-- 4. Importación del Presupuesto: también la moneda de cada cuenta y el interés de cada pago
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
    (id, nombre, tipo, monto, moneda, pago_total, cuenta, destino, categoria, frecuencia, dias, cada_n, fecha, desde, hasta, activo)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'monto')::numeric, 0), coalesce(e ->> 'moneda', 'DOP'),
         coalesce((e ->> 'pago_total')::boolean, false), e ->> 'cuenta', e ->> 'destino', e ->> 'categoria',
         coalesce(e ->> 'frecuencia', 'mensual'), coalesce(e ->> 'dias', ''), (e ->> 'cada_n')::integer,
         (e ->> 'fecha')::date, (e ->> 'desde')::date, (e ->> 'hasta')::date, coalesce((e ->> 'activo')::boolean, true)
  from jsonb_array_elements(coalesce(p_datos -> 'recurrentes', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_movimientos (id, fecha, tipo, monto, moneda, tasa, cuenta, destino, categoria, nota, recurrente_id, interes)
  select e ->> 'id', (e ->> 'fecha')::date, e ->> 'tipo', (e ->> 'monto')::numeric, coalesce(e ->> 'moneda', 'DOP'),
         (e ->> 'tasa')::numeric, e ->> 'cuenta', e ->> 'destino', e ->> 'categoria', e ->> 'nota', e ->> 'recurrente_id',
         nullif(e ->> 'interes', '')::numeric
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

-- ---------------------------------------------------------------------------
-- 5. Fijos del mes y estado de resultados: dólar del BCRD e intereses de los pagos de deudas
-- ---------------------------------------------------------------------------
-- Fijos en US$: la tasa del BCRD vigente al cierre del mes (o hoy, si el mes no ha terminado).
-- Movimientos en US$: su tasa propia o la del BCRD de su fecha. Sin tasa: null (no se suma).

create or replace function personal.caja_fijos_mes(p_mes date)
returns table (recurrente_id text, tipo text, categoria text, destino text, veces integer, total numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select inicio from personal.caja_config where id = 1
  ),
  dias as (
    select g::date as d
    from generate_series(date_trunc('month', p_mes)::date,
                         (date_trunc('month', p_mes) + interval '1 month - 1 day')::date,
                         interval '1 day') as g
  ),
  ocurre as (
    select r.id, r.tipo, r.categoria, r.destino, r.monto, r.moneda, r.pago_total, count(*)::integer as veces
    from personal.caja_recurrentes r
    cross join dias
    left join cfg on true
    where r.activo
      and (r.desde is null or dias.d >= r.desde)
      and (r.hasta is null or dias.d <= r.hasta)
      and case r.frecuencia
            when 'unica' then r.fecha is not null and r.fecha = dias.d
            when 'cada_n' then coalesce(r.desde, cfg.inicio) is not null
                               and dias.d >= coalesce(r.desde, cfg.inicio)
                               and (dias.d - coalesce(r.desde, cfg.inicio)) % greatest(1, coalesce(r.cada_n, 1)) = 0
            else exists (
              select 1 from personal.caja_dias_lista(r.dias) as x
              where least(x, extract(day from (date_trunc('month', dias.d) + interval '1 month - 1 day'))::integer)
                    = extract(day from dias.d)::integer
            )
          end
    group by r.id, r.tipo, r.categoria, r.destino, r.monto, r.moneda, r.pago_total
  )
  select o.id, o.tipo, o.categoria, o.destino, o.veces,
         case
           when o.tipo = 'pago_tarjeta' and o.pago_total then null
           when o.moneda = 'USD' then o.monto * personal.tasa_usd_bcrd((date_trunc('month', p_mes) + interval '1 month - 1 day')::date) * o.veces
           else o.monto * o.veces
         end
  from ocurre o
$$;

comment on function personal.caja_fijos_mes(date) is
  'Pagos y cobros fijos que caen en el mes de p_mes: veces y total en RD$ (US$ con el dólar del BCRD al cierre del mes o de hoy; null si no hay tasa o es pago total de tarjeta). SECURITY INVOKER (RLS).';

create or replace function personal.resultado_mes(p_mes date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with movs as (
    select m.*,
           case when m.moneda = 'USD' then coalesce(nullif(m.tasa, 0), personal.tasa_usd_bcrd(m.fecha)) else 1 end as fx
    from personal.caja_movimientos m
    where m.fecha >= date_trunc('month', p_mes)::date
      and m.fecha < (date_trunc('month', p_mes) + interval '1 month')::date
  ),
  montos as (
    select 'p'::text as k, f.tipo, f.categoria, f.destino, f.total as dop, false as adicional
    from personal.caja_fijos_mes(p_mes) f
    union all
    select 'r', m.tipo, m.categoria, m.destino, m.monto * m.fx, false
    from movs m
    union all
    -- La parte de interés de un pago de tarjeta o préstamo: gasto financiero.
    select 'r', 'interes', m.categoria, null, m.interes * m.fx, false
    from movs m
    where m.tipo = 'pago_tarjeta' and m.interes > 0
    union all
    select 'p', null, c.id, null, c.adicional, true
    from personal.caja_categorias c
    where c.adicional is not null
  ),
  lineas as (
    select x.k, x.dop,
           case
             when x.adicional then c.tipo
             when x.tipo = 'interes' then 'gasto_financiero'
             when x.tipo in ('transferencia', 'pago_tarjeta') then
               case
                 when c.tipo = 'ahorro_inversion' then 'ahorro_inversion'
                 when c.id is null and cu.tipo = 'ahorro' then 'ahorro_inversion'
               end
             when c.id is null then case when x.tipo = 'ingreso' then 'ingreso' else 'gasto' end
             else c.tipo
           end as linea,
           case
             when not x.adicional and x.tipo in ('ingreso', 'gasto') and c.id is not null
                  and (c.tipo in ('ingreso', 'otro_ingreso')) <> (x.tipo = 'ingreso') then -1
             else 1
           end as signo
    from montos x
    left join personal.caja_categorias c on c.id = x.categoria
    left join personal.caja_cuentas cu on cu.id = x.destino
  ),
  t as (
    select k,
           coalesce(sum(signo * dop) filter (where linea = 'ingreso'), 0) as ing,
           coalesce(sum(signo * dop) filter (where linea = 'costo'), 0) as cos,
           coalesce(sum(signo * dop) filter (where linea = 'gasto'), 0) as gas,
           coalesce(sum(signo * dop) filter (where linea = 'gasto_financiero'), 0) as gfi,
           coalesce(sum(signo * dop) filter (where linea = 'otro_ingreso'), 0) as oin,
           coalesce(sum(signo * dop) filter (where linea = 'otro_gasto'), 0) as oga,
           coalesce(sum(signo * dop) filter (where linea = 'ahorro_inversion'), 0) as aho
    from (select * from lineas where linea is not null and dop is not null
          union all select 'p', 0, null, 1 union all select 'r', 0, null, 1) l
    group by k
  ),
  j as (
    select k, jsonb_build_object(
      'ingresos', ing::text,
      'costos', cos::text,
      'gastos', gas::text,
      'gastos_financieros', gfi::text,
      'otros_ingresos', oin::text,
      'otros_gastos', oga::text,
      'gastos_totales', (cos + gas + gfi + oga)::text,
      'utilidad_bruta', (ing - cos)::text,
      'utilidad_operativa', (ing - cos - gas)::text,
      'utilidad_neta', (ing - cos - gas - gfi + oin - oga)::text,
      'ahorro', aho::text,
      'disponible', (ing - cos - gas - gfi + oin - oga - aho)::text
    ) as v
    from t
  )
  select jsonb_build_object(
    'mes', to_char(date_trunc('month', p_mes), 'YYYY-MM'),
    'presupuestado', (select v from j where k = 'p'),
    'real', (select v from j where k = 'r')
  )
$$;

comment on function personal.resultado_mes(date) is
  'Contrato: estado de resultados del mes de p_mes (presupuestado y real; montos como texto; US$ con su tasa o el dólar del BCRD de su fecha; intereses de pagos de deudas como gasto financiero). SECURITY INVOKER. Ver docs/caja.md.';
