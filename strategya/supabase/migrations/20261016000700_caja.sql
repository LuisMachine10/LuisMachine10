-- Strategya · Calendario de Caja (flujo de caja diario de Mena)
--
-- Tablas en el esquema personal. Solo Mena (mercado.es_autorizado()) lee y escribe; service_role todo.
-- Ninguna cifra de Mena vive en este archivo: sus datos entran por la pantalla /caja/importar o por
-- los formularios de /caja.
--
-- Los ids son texto: así se conservan los ids del artefacto original y las referencias entre cuentas,
-- categorías y recurrentes siguen valiendo. Las referencias (cuenta, destino, categoría, recurrente)
-- no llevan llave foránea, igual que en el artefacto: un movimiento con una cuenta borrada sigue
-- existiendo y el motor lo ignora al mover saldos. La pantalla impide borrar lo que está en uso.
-- Montos y tasas en numeric.

create table personal.caja_config (
  id         smallint primary key default 1 check (id = 1),
  inicio     date not null,
  colchon    numeric not null default 0 check (colchon >= 0),
  margen     numeric not null default 3000 check (margen >= 0),
  tasa_usd   numeric check (tasa_usd > 0),
  actualizado_en timestamptz not null default now()
);

comment on table personal.caja_config is 'Una sola fila: fecha de inicio de la simulación, colchón, margen y tasa RD$/US$ general de Mena.';
comment on column personal.caja_config.tasa_usd is 'Tasa general que fija Mena. null = sin tasa: los montos en US$ sin tasa propia no se aplican.';

create table personal.caja_cuentas (
  id            text primary key default gen_random_uuid()::text,
  nombre        text not null check (length(nombre) between 1 and 120),
  tipo          text not null check (tipo in ('banco', 'efectivo', 'ahorro', 'tarjeta')),
  saldo_inicial numeric not null default 0,
  limite        numeric,
  orden         integer not null default 0,
  n             bigint generated always as identity,
  actualizado_en timestamptz not null default now()
);

comment on column personal.caja_cuentas.saldo_inicial is 'En tarjeta es la deuda inicial (positiva).';

create table personal.caja_categorias (
  id          text primary key default gen_random_uuid()::text,
  nombre      text not null check (length(nombre) between 1 and 120),
  grupo       text not null check (grupo in ('ingreso', 'fijo', 'variable', 'ahorro', 'deuda')),
  presupuesto numeric check (presupuesto >= 0),
  n           bigint generated always as identity,
  actualizado_en timestamptz not null default now()
);

create table personal.caja_recurrentes (
  id         text primary key default gen_random_uuid()::text,
  nombre     text not null check (length(nombre) between 1 and 120),
  tipo       text not null check (tipo in ('ingreso', 'gasto', 'transferencia', 'pago_tarjeta')),
  monto      numeric not null default 0 check (monto >= 0),
  moneda     text not null default 'DOP' check (moneda in ('DOP', 'USD')),
  pago_total boolean not null default false,
  cuenta     text,
  destino    text,
  categoria  text,
  frecuencia text not null default 'mensual' check (frecuencia in ('mensual', 'cada_n', 'unica')),
  dias       text not null default '',
  cada_n     integer check (cada_n >= 1),
  fecha      date,
  desde      date,
  hasta      date,
  activo     boolean not null default true,
  n          bigint generated always as identity,
  actualizado_en timestamptz not null default now(),
  check (not pago_total or tipo = 'pago_tarjeta')
);

comment on column personal.caja_recurrentes.dias is 'Frecuencia mensual: días del mes separados por coma ("15, 30"). El 31 cae el último día en meses más cortos.';
comment on column personal.caja_recurrentes.pago_total is 'pago_tarjeta: paga el total adeudado en la tarjeta destino ese día.';

create table personal.caja_movimientos (
  id            text primary key default gen_random_uuid()::text,
  fecha         date not null,
  tipo          text not null check (tipo in ('ingreso', 'gasto', 'transferencia', 'pago_tarjeta')),
  monto         numeric not null check (monto >= 0),
  moneda        text not null default 'DOP' check (moneda in ('DOP', 'USD')),
  tasa          numeric check (tasa > 0),
  cuenta        text,
  destino       text,
  categoria     text,
  nota          text check (length(nota) <= 500),
  recurrente_id text,
  n             bigint generated always as identity,
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on column personal.caja_movimientos.recurrente_id is 'Recurrente que este movimiento confirma ese día (el planificado deja de aplicarse).';
comment on column personal.caja_movimientos.n is 'Orden de registro dentro del día (la simulación aplica en este orden).';

create index caja_movimientos_fecha on personal.caja_movimientos (fecha, n);

create table personal.caja_omitidos (
  fecha         date not null,
  recurrente_id text not null,
  primary key (fecha, recurrente_id)
);

create table personal.caja_saldos_reales (
  fecha     date not null,
  cuenta_id text not null,
  saldo     numeric not null,
  actualizado_en timestamptz not null default now(),
  primary key (fecha, cuenta_id)
);

comment on table personal.caja_saldos_reales is '«Cuadrar con tu banco»: el saldo real reemplaza la posición simulada de esa cuenta al cierre del día. En tarjeta, la deuda.';

create table personal.caja_notas (
  fecha date primary key,
  nota  text not null check (length(nota) between 1 and 2000),
  actualizado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------

grant usage on schema personal to authenticated, service_role;

grant select, insert, update, delete on
  personal.caja_config, personal.caja_cuentas, personal.caja_categorias, personal.caja_recurrentes,
  personal.caja_movimientos, personal.caja_omitidos, personal.caja_saldos_reales, personal.caja_notas
  to authenticated;
grant all on
  personal.caja_config, personal.caja_cuentas, personal.caja_categorias, personal.caja_recurrentes,
  personal.caja_movimientos, personal.caja_omitidos, personal.caja_saldos_reales, personal.caja_notas
  to service_role;
grant usage, select on
  sequence personal.caja_cuentas_n_seq, personal.caja_categorias_n_seq,
  personal.caja_recurrentes_n_seq, personal.caja_movimientos_n_seq
  to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['caja_config', 'caja_cuentas', 'caja_categorias', 'caja_recurrentes',
                           'caja_movimientos', 'caja_omitidos', 'caja_saldos_reales', 'caja_notas']
  loop
    execute format('alter table personal.%I enable row level security', t);
    execute format('create policy "autorizado lee" on personal.%I for select to authenticated using ((select mercado.es_autorizado()))', t);
    execute format('create policy "autorizado agrega" on personal.%I for insert to authenticated with check ((select mercado.es_autorizado()))', t);
    execute format('create policy "autorizado corrige" on personal.%I for update to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()))', t);
    execute format('create policy "autorizado borra" on personal.%I for delete to authenticated using ((select mercado.es_autorizado()))', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Importación del artefacto: reemplaza TODO en una sola transacción
-- ---------------------------------------------------------------------------

-- p_datos (lo arma lib/caja/importar.ts → aJsonSQL, ya validado; montos como texto):
--   { config: {inicio, colchon, margen, tasa_usd},
--     cuentas: [{id, nombre, tipo, saldo_inicial, limite, orden}],
--     categorias: [{id, nombre, grupo, presupuesto}],
--     recurrentes: [{id, nombre, tipo, monto, moneda, pago_total, cuenta, destino, categoria,
--                    frecuencia, dias, cada_n, fecha, desde, hasta, activo}],
--     movimientos: [{id, fecha, tipo, monto, moneda, tasa, cuenta, destino, categoria, nota, recurrente_id}],
--     omitidos: [{fecha, recurrente_id}], saldos: [{fecha, cuenta_id, saldo}], notas: [{fecha, nota}] }
-- Si algo no cuadra (tipo inválido, fecha mala), la función falla y no se cambia nada.
create function personal.caja_importar(p_datos jsonb)
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

  insert into personal.caja_categorias (id, nombre, grupo, presupuesto)
  select e ->> 'id', e ->> 'nombre', e ->> 'grupo', (e ->> 'presupuesto')::numeric
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
