-- Strategya · Presupuesto como estado de resultados, todo enlazado
--
-- 1. Cada categoría tiene un TIPO = la línea del estado de resultados donde cae:
--      ingreso · costo · gasto · gasto_financiero · otro_ingreso · otro_gasto · ahorro_inversion
--    Los grupos de antes se convierten: ingreso→ingreso, fijo→gasto, variable→gasto,
--    ahorro→ahorro_inversion, deuda→gasto_financiero.
-- 2. Lo presupuestado de una categoría = la suma de sus pagos fijos del mes (caja_recurrentes con esa
--    categoría) + un monto ADICIONAL opcional que escribe Mena. El «presupuesto» de antes era el total:
--    al convertir, se le descuenta lo que ya ponen sus fijos mensuales en RD$ (sin bajar de 0).
-- 3. Nada se pierde: el grupo y el presupuesto de antes quedan en grupo_v1 y presupuesto_v1 (solo
--    referencia, la app ya no los usa). Los fijos y movimientos sin categoría siguen igual: la pantalla
--    los muestra en «Sin categoría» con el aviso «Asígnale una categoría».
-- 4. Contrato para el Portafolio (docs/caja.md): personal.presupuesto_ahorro_mensual(date) y
--    personal.resultado_mes(date). SECURITY INVOKER: leen con los permisos y la RLS de quien llama.
--
-- Ninguna cifra de Mena vive en este archivo.

-- ---------------------------------------------------------------------------
-- Días del mes de un fijo: "15, 30" → 15, 30 (mismas reglas que diasDeRecurrente en lib/caja/motor.ts)
-- ---------------------------------------------------------------------------

create function personal.caja_dias_lista(p_dias text)
returns setof integer
language sql
immutable
set search_path = ''
as $$
  select distinct x::integer
  from (
    select substring(tok from '^[0-9]+')::numeric as x
    from regexp_split_to_table(coalesce(p_dias, ''), '[,[:space:]]+') as tok
  ) s
  where x between 1 and 31
$$;

comment on function personal.caja_dias_lista(text) is 'Días del mes (1–31, sin repetir) de un pago fijo mensual. Igual que diasDeRecurrente en lib/caja/motor.ts.';

grant execute on function personal.caja_dias_lista(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Categorías: tipo + adicional (conversión de los datos que ya existen)
-- ---------------------------------------------------------------------------

alter table personal.caja_categorias rename column grupo to grupo_v1;
alter table personal.caja_categorias rename column presupuesto to presupuesto_v1;
alter table personal.caja_categorias alter column grupo_v1 drop not null;
alter table personal.caja_categorias add column tipo text;
alter table personal.caja_categorias add column adicional numeric check (adicional >= 0);

update personal.caja_categorias c
set tipo = case c.grupo_v1
             when 'ingreso' then 'ingreso'
             when 'fijo' then 'gasto'
             when 'variable' then 'gasto'
             when 'ahorro' then 'ahorro_inversion'
             when 'deuda' then 'gasto_financiero'
           end,
    adicional = (
      select case
               when c.presupuesto_v1 is null or c.presupuesto_v1 <= 0 then null
               else nullif(greatest(c.presupuesto_v1 - coalesce(sum(r.monto * (select count(*) from personal.caja_dias_lista(r.dias))), 0), 0), 0)
             end
      from personal.caja_recurrentes r
      where r.categoria = c.id and r.activo and r.frecuencia = 'mensual' and r.moneda = 'DOP'
        and not r.pago_total and r.tipo in ('ingreso', 'gasto')
    );

alter table personal.caja_categorias alter column tipo set not null;
alter table personal.caja_categorias add constraint caja_categorias_tipo_check
  check (tipo in ('ingreso', 'costo', 'gasto', 'gasto_financiero', 'otro_ingreso', 'otro_gasto', 'ahorro_inversion'));

comment on column personal.caja_categorias.tipo is
  'Línea del estado de resultados: ingreso, costo, gasto, gasto_financiero, otro_ingreso, otro_gasto o ahorro_inversion (destino de la utilidad hacia el Portafolio).';
comment on column personal.caja_categorias.adicional is
  'Monto adicional al mes (RD$) que escribe Mena. Presupuestado de la categoría = suma de sus fijos del mes + adicional.';
comment on column personal.caja_categorias.grupo_v1 is 'Grupo de la versión anterior (hasta oct. 2026). Solo referencia: la app ya no lo usa.';
comment on column personal.caja_categorias.presupuesto_v1 is 'Presupuesto total de la versión anterior. Solo referencia: se convirtió en «adicional».';
comment on column personal.caja_recurrentes.categoria is
  'Categoría del fijo (obligatoria en la pantalla para ingresos y gastos; los de antes sin categoría se muestran con aviso). Su monto del mes suma a lo presupuestado de esa categoría.';

-- ---------------------------------------------------------------------------
-- Importación (la misma de 20261016000700_caja.sql, ahora con tipo y adicional)
-- ---------------------------------------------------------------------------

-- p_datos.categorias: [{id, nombre, tipo, adicional}]. Por compatibilidad también acepta {grupo, presupuesto}
-- de la versión anterior (el grupo se convierte igual que arriba; el presupuesto pasa tal cual a adicional:
-- lib/caja/importar.ts ya descuenta los fijos antes de llamar).
create or replace function personal.caja_importar(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c jsonb := p_datos -> 'config';
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado: solo la dueña o el dueño de Strategya puede importar la caja'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(v_c) is distinct from 'object' then
    raise exception 'Importación inválida: falta config';
  end if;

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

  insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'saldo_inicial')::numeric, 0),
         (e ->> 'limite')::numeric, coalesce((e ->> 'orden')::integer, 0)
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

  insert into personal.caja_movimientos (id, fecha, tipo, monto, moneda, tasa, cuenta, destino, categoria, nota, recurrente_id)
  select e ->> 'id', (e ->> 'fecha')::date, e ->> 'tipo', (e ->> 'monto')::numeric, coalesce(e ->> 'moneda', 'DOP'),
         (e ->> 'tasa')::numeric, e ->> 'cuenta', e ->> 'destino', e ->> 'categoria', e ->> 'nota', e ->> 'recurrente_id'
  from jsonb_array_elements(coalesce(p_datos -> 'movimientos', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_omitidos (fecha, recurrente_id)
  select distinct (e ->> 'fecha')::date, e ->> 'recurrente_id'
  from jsonb_array_elements(coalesce(p_datos -> 'omitidos', '[]')) as t (e);

  insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
  select (e ->> 'fecha')::date, e ->> 'cuenta_id', (e ->> 'saldo')::numeric
  from jsonb_array_elements(coalesce(p_datos -> 'saldos', '[]')) as t (e);

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
-- Fijos del mes (lo planificado). Mismas reglas que ocurreEn / fijosDelMes en lib/caja:
--   activo; dentro de desde/hasta; «unica» = esa fecha; «cada_n» = cada N días contados desde «desde» o
--   desde el inicio del calendario (sin ninguno, no ocurre); «mensual» = días del mes, y el 29/30/31 cae
--   el último día en meses más cortos. Total en RD$: US$ × tasa general (sin tasa → null, no se inventa);
--   «pagar todo lo que debas» → null (no se sabe de antemano).
-- ---------------------------------------------------------------------------

create function personal.caja_fijos_mes(p_mes date)
returns table (recurrente_id text, tipo text, categoria text, destino text, veces integer, total numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select inicio, nullif(tasa_usd, 0) as tasa from personal.caja_config where id = 1
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
           when o.moneda = 'USD' then o.monto * (select tasa from cfg) * o.veces
           else o.monto * o.veces
         end
  from ocurre o
$$;

comment on function personal.caja_fijos_mes(date) is
  'Pagos y cobros fijos que caen en el mes de p_mes: veces y total en RD$ (null si es US$ sin tasa o pago total de tarjeta). SECURITY INVOKER (RLS).';

revoke all on function personal.caja_fijos_mes(date) from public, anon;
grant execute on function personal.caja_fijos_mes(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CONTRATO · Estado de resultados del mes (lo usa el Portafolio; documentado en docs/caja.md)
--
-- Cada monto cae en una línea (igual que destinoDe en lib/caja/resultados.ts):
--   · ingreso o gasto con categoría → la línea del tipo de su categoría; suma si el sentido coincide
--     (ingreso en categoría de ingreso, gasto en categoría de gasto) y resta si no (p. ej. un reembolso);
--   · ingreso o gasto sin categoría (o con una que ya no existe) → Ingresos o Gastos («Sin categoría»);
--   · mover entre cuentas o pagar la tarjeta → solo cuenta si su categoría es ahorro_inversion o, sin
--     categoría, si el destino es una cuenta de ahorro; si no, no es ni ingreso ni gasto.
-- Presupuestado = fijos del mes + adicional de cada categoría. Real = movimientos anotados o confirmados
-- en el mes (US$ con su tasa o la general; sin tasa no se suma).
--
-- Devuelve (montos como TEXTO decimal exacto, para no pasar por float en JSON):
--   { "mes": "AAAA-MM",
--     "presupuestado": { ingresos, costos, gastos, gastos_financieros, otros_ingresos, otros_gastos,
--                        gastos_totales, utilidad_bruta, utilidad_operativa, utilidad_neta, ahorro, disponible },
--     "real":          { … las mismas claves; «ahorro» = ahorro realizado … } }
--   gastos_totales = costos + gastos + gastos_financieros + otros_gastos (el ahorro no es gasto)
--   utilidad_neta  = ingresos − costos − gastos − gastos_financieros + otros_ingresos − otros_gastos
--   disponible     = utilidad_neta − ahorro
-- ---------------------------------------------------------------------------

create function personal.resultado_mes(p_mes date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with cfg as (
    select nullif(tasa_usd, 0) as tasa from personal.caja_config where id = 1
  ),
  montos as (
    select 'p'::text as k, f.tipo, f.categoria, f.destino, f.total as dop, false as adicional
    from personal.caja_fijos_mes(p_mes) f
    union all
    select 'r', m.tipo, m.categoria, m.destino,
           case when m.moneda = 'USD' then m.monto * coalesce(nullif(m.tasa, 0), (select tasa from cfg)) else m.monto end,
           false
    from personal.caja_movimientos m
    where m.fecha >= date_trunc('month', p_mes)::date
      and m.fecha < (date_trunc('month', p_mes) + interval '1 month')::date
    union all
    select 'p', null, c.id, null, c.adicional, true
    from personal.caja_categorias c
    where c.adicional is not null
  ),
  lineas as (
    select x.k, x.dop,
           case
             when x.adicional then c.tipo
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
  'Contrato: estado de resultados del mes de p_mes (presupuestado y real; montos como texto). SECURITY INVOKER: con RLS, quien no está autorizado ve ceros. Ver docs/caja.md.';

revoke all on function personal.resultado_mes(date) from public, anon;
grant execute on function personal.resultado_mes(date) to authenticated, service_role;

-- CONTRATO · Lo presupuestado al mes para ahorro e inversión (lo que el Portafolio espera recibir).
create function personal.presupuesto_ahorro_mensual(p_mes date)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select ((personal.resultado_mes(p_mes) -> 'presupuestado') ->> 'ahorro')::numeric
$$;

comment on function personal.presupuesto_ahorro_mensual(date) is
  'Contrato: presupuesto del mes de p_mes de las categorías ahorro_inversion (fijos del mes + adicional), en RD$. SECURITY INVOKER (RLS). Ver docs/caja.md.';

revoke all on function personal.presupuesto_ahorro_mensual(date) from public, anon;
grant execute on function personal.presupuesto_ahorro_mensual(date) to authenticated, service_role;
