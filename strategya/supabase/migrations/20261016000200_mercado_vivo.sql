-- Strategya · Fase 2 · mercado en vivo
--
-- Cotizaciones intradía (FMP y Finnhub), tasas de política (Fed y BCE), movimientos del día de acciones,
-- presupuesto diario de llamadas a FMP, retención de lo intradía y Realtime.
-- Horarios de mercado: supabase/functions/_shared/mercados.ts (pg_cron dispara cada 5 min y la tarea decide).

-- ───────────────────────── Catálogo: lo que el plan de FMP de Mena no entrega ─────────────────────────
-- Verificado el 15 oct 2026 con quote-short (conector FMP, misma API que la REST):
--   permitidos: ^GSPC ^DJI ^IXIC ^RUT ^STOXX50E ^FTSE ^N225 ^HSI GCUSD SIUSD BZUSD EURUSD USDJPY BTCUSD
--   negados:    ^GDAXI (DAX) · CLUSD (WTI) · NGUSD (gas natural) · DX-Y.NYB (DXY)
-- La pantalla muestra en su lugar los ETF de Finnhub rotulados como sustitutos (USO, UNG, UUP).
update mercado.series set activa = false where id in ('IDX_GDAXI', 'WTI', 'GAS_NATURAL', 'DXY');

update mercado.fuentes set notas_de_uso =
  'API oficial con la clave de Mena. Plan verificado el 15 oct 2026: quote-short símbolo por símbolo para '
  '^GSPC ^DJI ^IXIC ^RUT ^STOXX50E ^FTSE ^N225 ^HSI, EURUSD, USDJPY, oro, plata, Brent y BTC; biggest-gainers/losers. '
  'Niega DAX, WTI, gas natural, DXY, cobre, CPER, lotes y quote completo. quote-short no trae hora: se usa la de la consulta. '
  'Presupuesto diario en FMP_LLAMADAS_DIA (por defecto 240), contado en mercado.presupuesto_api.'
where id = 'fmp';

update mercado.fuentes set notas_de_uso =
  'Rango objetivo de los fondos federales (DFEDTARU techo, DFEDTARL piso) publicado por la Junta de Gobernadores. '
  'Se lee en CSV público desde FRED (Fed de St. Louis): https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARU. '
  'Formato a confirmar con sondas/lotes/22-tasas-politica.txt.'
where id = 'fed_h15';

-- ───────────────────────── Presupuesto de llamadas ─────────────────────────
create table mercado.presupuesto_api (
  proveedor text not null,
  dia       date not null,
  llamadas  integer not null default 0 check (llamadas >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (proveedor, dia)
);

comment on table mercado.presupuesto_api is
  'Llamadas a APIs con cupo diario (FMP). Día en UTC. Se reserva antes de llamar con mercado.reservar_llamadas.';

-- Reserva atómica: bloquea la fila del día, concede lo que quepa bajo el límite y devuelve cuántas concedió.
create function mercado.reservar_llamadas(p_proveedor text, p_dia date, p_cantidad integer, p_limite integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_usadas integer;
  v_concedidas integer;
begin
  if p_cantidad is null or p_cantidad <= 0 then
    return 0;
  end if;
  insert into mercado.presupuesto_api (proveedor, dia, llamadas) values (p_proveedor, p_dia, 0)
  on conflict (proveedor, dia) do nothing;

  select p.llamadas into v_usadas
  from mercado.presupuesto_api p
  where p.proveedor = p_proveedor and p.dia = p_dia
  for update;

  v_concedidas := greatest(0, least(p_cantidad, coalesce(p_limite, 0) - v_usadas));
  if v_concedidas > 0 then
    update mercado.presupuesto_api p
       set llamadas = p.llamadas + v_concedidas, actualizado_en = now()
     where p.proveedor = p_proveedor and p.dia = p_dia;
  end if;
  return v_concedidas;
end;
$$;

-- ───────────────────────── Último intento por serie (planificador y /estado) ─────────────────────────
create table mercado.consultas_api (
  proveedor      text not null,
  serie_id       text not null references mercado.series (id) on delete cascade,
  ultimo_intento timestamptz,
  ultimo_ok      timestamptz,
  ultimo_error   text,
  denegado_hasta timestamptz,
  primary key (proveedor, serie_id)
);

comment on column mercado.consultas_api.denegado_hasta is
  'El proveedor negó el símbolo (HTTP 402/403 por el plan): no se vuelve a pedir antes de esta hora.';

-- Lo que el planificador necesita en una sola llamada: series activas de la fuente, su símbolo y mercado,
-- el último intento y las llamadas ya usadas ese día.
create function mercado.estado_planificador(p_proveedor text, p_fuente text, p_dia date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'llamadas_hoy', coalesce((
      select p.llamadas from mercado.presupuesto_api p where p.proveedor = p_proveedor and p.dia = p_dia
    ), 0),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'simbolo', s.meta ->> 'simbolo',
               'mercado', s.meta ->> 'mercado',
               'ultimo_intento', c.ultimo_intento,
               'ultimo_ok', c.ultimo_ok,
               'denegado_hasta', c.denegado_hasta
             ) order by s.orden)
      from mercado.series s
      left join mercado.consultas_api c on c.proveedor = p_proveedor and c.serie_id = s.id
      where s.fuente_id = p_fuente and s.activa and s.frecuencia = 'intradia'
    ), '[]'::jsonb)
  );
$$;

-- ───────────────────────── Movimientos del día (acciones de EE. UU.) ─────────────────────────
create table mercado.movimientos_acciones (
  id          bigint generated always as identity primary key,
  fecha       date not null,
  tipo        text not null check (tipo in ('sube', 'baja')),
  posicion    smallint not null check (posicion between 1 and 50),
  simbolo     text not null,
  nombre      text,
  precio      numeric not null,
  cambio      numeric,
  cambio_pct  numeric,
  bolsa       text,
  fuente_id   text not null default 'fmp' references mercado.fuentes (id),
  recogido_en timestamptz not null default now(),
  unique (fecha, tipo, posicion)
);

comment on table mercado.movimientos_acciones is
  'Mayores alzas y bajas del día según FMP (biggest-gainers / biggest-losers). Se reemplaza la lista completa en cada lectura.';

create function mercado.reemplazar_movimientos(p_fecha date, p_tipo text, p_recogido_en timestamptz, p_filas jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_n integer;
begin
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'p_filas debe ser un arreglo JSON';
  end if;
  delete from mercado.movimientos_acciones m where m.fecha = p_fecha and m.tipo = p_tipo;
  insert into mercado.movimientos_acciones (fecha, tipo, posicion, simbolo, nombre, precio, cambio, cambio_pct, bolsa, recogido_en)
  select p_fecha, p_tipo, (e ->> 'posicion')::smallint, e ->> 'simbolo', e ->> 'nombre',
         (e ->> 'precio')::numeric, (e ->> 'cambio')::numeric, (e ->> 'cambio_pct')::numeric, e ->> 'bolsa', p_recogido_en
  from jsonb_array_elements(p_filas) e;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ───────────────────────── Última observación de cada serie (pantalla) ─────────────────────────
create view mercado.ultimas_obs_mercado
with (security_invoker = true) as
select s.id as serie_id, u.valor, u.cambio, u.cambio_pct, u.cambio_origen, u.fecha_dato, u.hora_dato,
       u.recogido_en, u.url_dato, u.estado, u.fuente_id
from mercado.series s
cross join lateral (
  select o.valor, o.cambio, o.cambio_pct, o.cambio_origen, o.fecha_dato, o.hora_dato, o.recogido_en, o.url_dato, o.estado, o.fuente_id
  from mercado.observaciones o
  where o.serie_id = s.id
  order by o.fecha_dato desc, o.hora_dato desc nulls last
  limit 1
) u;

-- ───────────────────────── Retención (cuota de 500 MB) ─────────────────────────
-- Intradía: se guardan todas las filas de los últimos 7 días; de días anteriores, solo la última de cada día.
create function mercado.compactar_intradia(p_dias integer default 7)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_borradas integer;
begin
  with viejas as (
    select o.id,
           row_number() over (partition by o.serie_id, o.fecha_dato order by o.hora_dato desc) as n
    from mercado.observaciones o
    join mercado.series s on s.id = o.serie_id
    where s.frecuencia = 'intradia'
      and o.hora_dato is not null
      and o.fecha_dato < (now() at time zone 'utc')::date - p_dias
  )
  delete from mercado.observaciones o using viejas v where o.id = v.id and v.n > 1;
  get diagnostics v_borradas = row_count;

  delete from mercado.presupuesto_api where dia < (now() at time zone 'utc')::date - 30;
  delete from mercado.movimientos_acciones where fecha < (now() at time zone 'utc')::date - 60;
  return v_borradas;
end;
$$;

-- ───────────────────────── Permisos y RLS ─────────────────────────
grant select on mercado.presupuesto_api, mercado.consultas_api, mercado.movimientos_acciones, mercado.ultimas_obs_mercado
  to authenticated;
grant all on mercado.presupuesto_api, mercado.consultas_api, mercado.movimientos_acciones to service_role;
grant select on mercado.ultimas_obs_mercado to service_role;
grant usage, select on sequence mercado.movimientos_acciones_id_seq to service_role;

alter table mercado.presupuesto_api      enable row level security;
alter table mercado.consultas_api        enable row level security;
alter table mercado.movimientos_acciones enable row level security;

create policy "autorizado lee" on mercado.presupuesto_api      for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.consultas_api        for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.movimientos_acciones for select to authenticated using ((select mercado.es_autorizado()));

revoke all on function mercado.reservar_llamadas(text, date, integer, integer) from public, anon, authenticated;
revoke all on function mercado.estado_planificador(text, text, date) from public, anon, authenticated;
revoke all on function mercado.reemplazar_movimientos(date, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function mercado.compactar_intradia(integer) from public, anon, authenticated;
grant execute on function mercado.reservar_llamadas(text, date, integer, integer) to service_role;
grant execute on function mercado.estado_planificador(text, text, date) to service_role;
grant execute on function mercado.reemplazar_movimientos(date, text, timestamptz, jsonb) to service_role;
grant execute on function mercado.compactar_intradia(integer) to service_role;

-- ───────────────────────── Realtime ─────────────────────────
-- La cinta de precios se suscribe a los cambios de observaciones (RLS aplica a la suscripción).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'mercado' and tablename = 'observaciones'
  ) then
    alter publication supabase_realtime add table mercado.observaciones;
  end if;
end $$;

-- ───────────────────────── Horarios (UTC) ─────────────────────────
-- Cotizaciones FMP: cada 5 min; el planificador decide qué símbolos pedir según mercado abierto y presupuesto.
select cron.schedule('strategya-cotizaciones-fmp', '*/5 * * * *',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"cotizaciones-fmp"}')$$);
-- ETF de Finnhub: cada 5 min de 13:00 a 21:55 UTC, L–V (cubre 9:30–16:00 de Nueva York con y sin horario de
-- verano, más la captura del cierre). La tarea no llama nada con el mercado cerrado.
select cron.schedule('strategya-cotizaciones-finnhub', '*/5 13-21 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"cotizaciones-finnhub"}')$$);
-- Tasas de política: 22:20 UTC (6:20 PM RD) de lunes a viernes, después de la publicación diaria de la Fed y del BCE.
select cron.schedule('strategya-tasas-politica', '20 22 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"tasas-politica"}')$$);
-- Movimientos de acciones: cada hora a los :10 de 14:10 a 20:10 UTC y a las 21:20 UTC (cierre en invierno), L–V.
-- La tarea solo llama con el mercado abierto o hasta 30 min después del cierre (2 llamadas por corrida).
select cron.schedule('strategya-movimientos-acciones', '10 14-20 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"movimientos-acciones"}')$$);
select cron.schedule('strategya-movimientos-acciones-cierre', '20 21 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"movimientos-acciones"}')$$);
-- Retención: todos los días a las 8:40 UTC (4:40 AM RD).
select cron.schedule('strategya-compactar-intradia', '40 8 * * *', $$select mercado.compactar_intradia()$$);
