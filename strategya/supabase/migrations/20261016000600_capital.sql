-- Strategya · Mena Capital (finanzas personales: patrimonio, cartera, retorno, riesgo, futuro)
--
-- Esquema personal: solo Mena lee y escribe (RLS con mercado.es_autorizado()). Ninguna cifra de Mena
-- vive en este archivo: los datos entran por la pantalla de importación (/capital/importar) o por los
-- formularios de /capital. Montos y tasas en numeric; los jsonb guardan los números como TEXTO decimal
-- (los valida lib/capital/validar.ts antes de escribir y al leer).
--
-- Mercado: precios de cierre de las acciones/ETF de la cartera (Finnhub) en mercado.cotizaciones_cartera.
-- El tipo de cambio sale de mercado.observaciones (USDDOP_VENTA del BCRD) cuando existe.

-- ---------------------------------------------------------------------------
-- Tablas personales
-- ---------------------------------------------------------------------------

create table personal.parametros (
  id             smallint primary key default 1 check (id = 1),
  datos          jsonb not null check (jsonb_typeof(datos) = 'object'),
  actualizado_en timestamptz not null default now()
);
comment on table personal.parametros is
  'Una sola fila: el objeto P del artefacto Mena Capital (fx manual, metas, asignación objetivo, escenarios, tarjetas, presupuesto). Números como texto.';

create table personal.activos (
  id             text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  clase          text not null check (clase in ('efectivo', 'ahorros', 'rentafija', 'accionesusa')),
  nombre         text not null check (length(nombre) between 1 and 200),
  institucion    text not null default '' check (length(institucion) <= 200),
  simbolo        text check (simbolo ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  moneda         text not null check (moneda in ('DOP', 'USD', 'EUR')),
  cantidad       numeric not null,
  precio         numeric not null default 1 check (precio >= 0),
  tasa           numeric not null default 0,
  vencimiento    date,
  tipo_rf        text check (tipo_rf in ('acumula', 'cupon')),
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
comment on column personal.activos.precio is 'Precio unitario manual (1 para saldos). Si hay cotización de mercado del símbolo, la pantalla usa esa y lo dice.';
comment on column personal.activos.tasa is 'Tasa o dividendo anual como fracción (0.075 = 7.5 %).';

create table personal.transacciones (
  id        text primary key check (id ~ '^[A-Za-z0-9_.:-]{1,80}$'),
  -- Sin llave foránea a propósito: una transacción sobrevive aunque se borre el activo (como en el artefacto).
  activo_id text not null,
  simbolo   text not null default '',
  tipo      text not null check (tipo in ('compra', 'venta', 'dividendo', 'interes')),
  fecha     date,
  cantidad  numeric not null default 0 check (cantidad >= 0),
  precio    numeric not null default 0 check (precio >= 0),
  comision  numeric not null default 0 check (comision >= 0),
  moneda    text check (moneda in ('DOP', 'USD', 'EUR')),
  creado_en timestamptz not null default now()
);
create index transacciones_activo_fecha on personal.transacciones (activo_id, fecha);

create table personal.cierres (
  mes            text primary key check (mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  datos          jsonb not null check (jsonb_typeof(datos) = 'object'),
  actualizado_en timestamptz not null default now()
);
comment on table personal.cierres is
  'Cierre mensual (montos por partida, tarjetas, deudas y foto del patrimonio al cerrar). Números como texto.';

create table personal.ips (
  id             smallint primary key default 1 check (id = 1),
  datos          jsonb not null check (jsonb_typeof(datos) = 'object'),
  actualizado_en timestamptz not null default now()
);
comment on table personal.ips is 'Política de inversión (IPS) de 8 secciones. Una sola fila.';

-- ---------------------------------------------------------------------------
-- Precios de la cartera (Finnhub)
-- ---------------------------------------------------------------------------

create table mercado.cotizaciones_cartera (
  simbolo         text not null check (simbolo ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  fecha           date not null,
  precio          numeric not null check (precio > 0),
  cierre_anterior numeric,
  cambio          numeric,
  cambio_pct      numeric,
  hora_dato       timestamptz,
  fuente          text not null default 'finnhub' references mercado.fuentes (id),
  url_dato        text,
  recogido_en     timestamptz not null default now(),
  primary key (simbolo, fecha)
);
comment on table mercado.cotizaciones_cartera is
  'Último precio del día de cada símbolo de personal.activos (Finnhub /quote: c, pc, d, dp, t). Fecha = día de Nueva York del campo t.';

create index cotizaciones_cartera_fecha on mercado.cotizaciones_cartera (simbolo, fecha desc);

-- Símbolos a consultar. La ingesta (service_role) no lee personal: esta función le da solo la lista.
create function mercado.simbolos_cartera()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct a.simbolo order by a.simbolo), '{}'::text[])
  from personal.activos a
  where a.clase = 'accionesusa' and a.simbolo is not null;
$$;

-- ---------------------------------------------------------------------------
-- Importación: reemplaza en una transacción las secciones presentes
-- ---------------------------------------------------------------------------

-- p_datos (lo arma lib/capital/importar.ts · cargaParaBase, ya validado):
--   { parametros?: {...}, activos?: [{id, clase, nombre, institucion, simbolo, moneda, cantidad, precio,
--     tasa, vencimiento, tipo_rf, orden}], transacciones?: [{id, activo_id, simbolo, tipo, fecha, cantidad,
--     precio, comision, moneda}], cierres?: [{mes, datos}], ips?: {...} }
-- Cada sección presente reemplaza por completo a la guardada; las ausentes no se tocan.
create function personal.importar_capital(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb := '{}'::jsonb;
  v_n integer;
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado para importar Mena Capital' using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' then
    raise exception 'p_datos debe ser un objeto JSON';
  end if;

  if p_datos ? 'parametros' then
    if jsonb_typeof(p_datos -> 'parametros') is distinct from 'object' then
      raise exception 'parametros debe ser un objeto';
    end if;
    insert into personal.parametros (id, datos, actualizado_en) values (1, p_datos -> 'parametros', now())
    on conflict (id) do update set datos = excluded.datos, actualizado_en = now();
    v_resultado := v_resultado || '{"parametros": 1}'::jsonb;
  end if;

  if p_datos ? 'activos' then
    if jsonb_typeof(p_datos -> 'activos') is distinct from 'array' then
      raise exception 'activos debe ser un arreglo';
    end if;
    delete from personal.activos where true;
    insert into personal.activos
      (id, clase, nombre, institucion, simbolo, moneda, cantidad, precio, tasa, vencimiento, tipo_rf, orden)
    select x.id, x.clase, x.nombre, coalesce(x.institucion, ''), nullif(x.simbolo, ''), x.moneda, x.cantidad,
           coalesce(x.precio, 1), coalesce(x.tasa, 0), x.vencimiento, x.tipo_rf, coalesce(x.orden, 0)
    from jsonb_to_recordset(p_datos -> 'activos') as x (
      id text, clase text, nombre text, institucion text, simbolo text, moneda text, cantidad numeric,
      precio numeric, tasa numeric, vencimiento date, tipo_rf text, orden integer);
    get diagnostics v_n = row_count;
    v_resultado := v_resultado || jsonb_build_object('activos', v_n);
  end if;

  if p_datos ? 'transacciones' then
    if jsonb_typeof(p_datos -> 'transacciones') is distinct from 'array' then
      raise exception 'transacciones debe ser un arreglo';
    end if;
    delete from personal.transacciones where true;
    insert into personal.transacciones (id, activo_id, simbolo, tipo, fecha, cantidad, precio, comision, moneda)
    select x.id, x.activo_id, coalesce(x.simbolo, ''), x.tipo, x.fecha, coalesce(x.cantidad, 0), coalesce(x.precio, 0),
           coalesce(x.comision, 0), x.moneda
    from jsonb_to_recordset(p_datos -> 'transacciones') as x (
      id text, activo_id text, simbolo text, tipo text, fecha date, cantidad numeric, precio numeric,
      comision numeric, moneda text);
    get diagnostics v_n = row_count;
    v_resultado := v_resultado || jsonb_build_object('transacciones', v_n);
  end if;

  if p_datos ? 'cierres' then
    if jsonb_typeof(p_datos -> 'cierres') is distinct from 'array' then
      raise exception 'cierres debe ser un arreglo [{mes, datos}]';
    end if;
    delete from personal.cierres where true;
    insert into personal.cierres (mes, datos, actualizado_en)
    select x.mes, x.datos, now()
    from jsonb_to_recordset(p_datos -> 'cierres') as x (mes text, datos jsonb);
    get diagnostics v_n = row_count;
    v_resultado := v_resultado || jsonb_build_object('cierres', v_n);
  end if;

  if p_datos ? 'ips' then
    if jsonb_typeof(p_datos -> 'ips') is distinct from 'object' then
      raise exception 'ips debe ser un objeto';
    end if;
    insert into personal.ips (id, datos, actualizado_en) values (1, p_datos -> 'ips', now())
    on conflict (id) do update set datos = excluded.datos, actualizado_en = now();
    v_resultado := v_resultado || '{"ips": 1}'::jsonb;
  end if;

  return v_resultado;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on
  personal.parametros, personal.activos, personal.transacciones, personal.cierres, personal.ips
  to authenticated;
grant all on
  personal.parametros, personal.activos, personal.transacciones, personal.cierres, personal.ips
  to service_role;

grant select on mercado.cotizaciones_cartera to authenticated;
grant all on mercado.cotizaciones_cartera to service_role;

revoke all on function mercado.simbolos_cartera() from public, anon, authenticated;
grant execute on function mercado.simbolos_cartera() to service_role;

revoke all on function personal.importar_capital(jsonb) from public, anon;
grant execute on function personal.importar_capital(jsonb) to authenticated;

alter table personal.parametros    enable row level security;
alter table personal.activos       enable row level security;
alter table personal.transacciones enable row level security;
alter table personal.cierres       enable row level security;
alter table personal.ips           enable row level security;
alter table mercado.cotizaciones_cartera enable row level security;

create policy "autorizado administra" on personal.parametros
  for all to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));
create policy "autorizado administra" on personal.activos
  for all to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));
create policy "autorizado administra" on personal.transacciones
  for all to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));
create policy "autorizado administra" on personal.cierres
  for all to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));
create policy "autorizado administra" on personal.ips
  for all to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));

create policy "autorizado lee" on mercado.cotizaciones_cartera
  for select to authenticated using ((select mercado.es_autorizado()));

alter publication supabase_realtime add table mercado.cotizaciones_cartera;

-- ---------------------------------------------------------------------------
-- Horario: precios de cierre de la cartera
-- ---------------------------------------------------------------------------

-- 21:30 UTC = 5:30 PM RD, de lunes a viernes: después del cierre de Nueva York tanto en horario de
-- verano (cierre 20:00 UTC) como de invierno (cierre 21:00 UTC).
select cron.schedule('strategya-precios-cartera', '30 21 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"precios-cartera"}')$$);
