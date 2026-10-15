-- Strategya · Fase 1 · esquema base
--
-- Dos esquemas en el mismo proyecto de Supabase:
--   mercado   → Strategya en vivo (datos públicos de mercado, RD, noticias)
--   personal  → reservado para Mena Capital (finanzas personales); vacío por ahora
--
-- Reglas que el esquema hace cumplir:
--   · Dinero y tasas en numeric, nunca float.
--   · Cada observación lleva su fuente, la fecha del dato y cuándo se recogió.
--   · Solo el usuario autorizado lee; solo el servidor (service_role) escribe datos de mercado.

create schema if not exists mercado;
create schema if not exists personal;

comment on schema mercado is 'Strategya: datos de mercado, RD, noticias e ingesta. Escribe solo service_role.';
comment on schema personal is 'Reservado para Mena Capital (finanzas personales). Sin tablas en la Fase 1.';

-- ---------------------------------------------------------------------------
-- Acceso: un solo dueño
-- ---------------------------------------------------------------------------

create table mercado.usuarios_autorizados (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

comment on table mercado.usuarios_autorizados is
  'Quién puede leer Strategya. Se llena a mano una sola vez (ver README). Sin fila aquí, RLS no devuelve nada.';

create function mercado.es_autorizado()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from mercado.usuarios_autorizados ua where ua.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table mercado.fuentes (
  id             text primary key,
  nombre         text not null,
  url            text not null,
  tipo           text not null check (tipo in ('api', 'rss', 'html', 'xlsx', 'xml', 'manual')),
  requiere_clave boolean not null default false,
  notas_de_uso   text,
  lectura_automatica boolean not null default true,
  creado_en      timestamptz not null default now()
);

comment on column mercado.fuentes.lectura_automatica is
  'false = el sitio prohíbe o bloquea la lectura automática; el dato entra solo por carga_manual.';

create table mercado.series (
  id                 text primary key,
  nombre             text not null,
  nombre_corto       text not null,
  categoria          text not null check (categoria in
                       ('indice', 'divisa', 'metal', 'energia', 'tasa', 'rd', 'cripto', 'macro', 'otro')),
  unidad             text not null,
  moneda             text,
  fuente_id          text not null references mercado.fuentes (id),
  frecuencia         text not null check (frecuencia in ('intradia', 'diaria', 'semanal', 'mensual', 'eventual')),
  max_antiguedad_min integer not null check (max_antiguedad_min > 0),
  orden              integer not null default 0,
  sustituto_de       text,
  meta               jsonb not null default '{}'::jsonb,
  creado_en          timestamptz not null default now()
);

comment on column mercado.series.max_antiguedad_min is
  'Minutos desde el dato (hora_dato, o el fin del día de fecha_dato) a partir de los cuales se pinta como desactualizado.';
comment on column mercado.series.sustituto_de is
  'Si la serie es un sustituto (p. ej. SPY por el S&P 500), qué representa. La pantalla lo rotula.';

-- ---------------------------------------------------------------------------
-- Corridas de ingesta (para /estado)
-- ---------------------------------------------------------------------------

create table mercado.corridas (
  id        bigint generated always as identity primary key,
  tarea     text not null,
  fuente_id text references mercado.fuentes (id),
  inicio    timestamptz not null default now(),
  fin       timestamptz,
  estado    text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'parcial', 'error', 'omitida')),
  error     text,
  filas     integer not null default 0,
  detalle   jsonb not null default '{}'::jsonb
);

create index corridas_tarea_inicio on mercado.corridas (tarea, inicio desc);

-- ---------------------------------------------------------------------------
-- Observaciones
-- ---------------------------------------------------------------------------

create table mercado.observaciones (
  id            bigint generated always as identity primary key,
  serie_id      text not null references mercado.series (id),
  valor         numeric not null,
  cambio        numeric,
  cambio_pct    numeric,
  cambio_origen text not null default 'calculado' check (cambio_origen in ('fuente', 'calculado')),
  fecha_dato    date not null,
  hora_dato     timestamptz,
  recogido_en   timestamptz not null default now(),
  fuente_id     text not null references mercado.fuentes (id),
  url_dato      text,
  estado        text not null default 'ok' check (estado in ('ok', 'desactualizado', 'error', 'no_confirmado')),
  corrida_id    bigint references mercado.corridas (id) on delete set null
);

comment on column mercado.observaciones.fecha_dato is 'Día al que se refiere el dato, en la fecha de la fuente.';
comment on column mercado.observaciones.hora_dato is 'Momento exacto del dato si la fuente lo da (cotizaciones). Null en datos diarios.';
comment on column mercado.observaciones.cambio_origen is
  'fuente = el cambio lo publicó la fuente; calculado = valor menos la observación diaria anterior.';

create unique index observaciones_unica
  on mercado.observaciones (serie_id, fecha_dato, hora_dato) nulls not distinct;

create index observaciones_serie_fecha
  on mercado.observaciones (serie_id, fecha_dato desc, hora_dato desc nulls last);

-- ---------------------------------------------------------------------------
-- Tablas de las fases siguientes (estructura lista; se llenan en su fase)
-- ---------------------------------------------------------------------------

create table mercado.noticias (
  id         bigint generated always as identity primary key,
  titular    text not null,
  resumen    text,
  url        text not null,
  medio      text not null,
  fecha      timestamptz not null,
  pais       text,
  lat        numeric(8, 5),
  lon        numeric(8, 5),
  categoria  text not null check (categoria in ('mercado', 'guerra', 'rd', 'instituciones')),
  hash       text not null unique,
  fuente_id  text references mercado.fuentes (id),
  recogido_en timestamptz not null default now()
);

comment on table mercado.noticias is 'Solo titular, resumen corto propio y enlace. Nunca el texto completo del artículo.';
create index noticias_fecha on mercado.noticias (fecha desc);

create table mercado.instituciones_feed (
  id          bigint generated always as identity primary key,
  institucion text not null,
  titulo      text not null,
  url         text not null,
  fecha       timestamptz not null,
  hash        text not null unique,
  fuente_id   text references mercado.fuentes (id),
  recogido_en timestamptz not null default now()
);

create index instituciones_feed_fecha on mercado.instituciones_feed (institucion, fecha desc);

create table mercado.agenda (
  id          bigint generated always as identity primary key,
  fecha_hora  timestamptz not null,
  institucion text not null,
  evento      text not null,
  importancia smallint not null default 2 check (importancia between 1 and 3),
  confirmado  boolean not null default false,
  url         text,
  fuente_id   text references mercado.fuentes (id),
  unique (fecha_hora, institucion, evento)
);

create table mercado.emisiones_rd (
  id          bigint generated always as identity primary key,
  fuente      text not null check (fuente in ('SIMV', 'CREDITO_PUBLICO', 'BCRD', 'BVRD')),
  numero      text not null,
  emisor      text,
  instrumento text,
  monto       numeric,
  moneda      text,
  tasa        numeric,
  fecha       date not null,
  url         text not null,
  recogido_en timestamptz not null default now(),
  unique (fuente, numero)
);

create table mercado.explicaciones (
  id          bigint generated always as identity primary key,
  serie_id    text references mercado.series (id),
  noticia_id  bigint references mercado.noticias (id) on delete cascade,
  tipo        text not null default 'porque' check (tipo in ('porque', 'cinco_del_dia', 'guerras')),
  fecha       timestamptz not null default now(),
  texto       text not null,
  fuentes     jsonb not null default '[]'::jsonb,
  modelo      text not null,
  tokens_entrada integer,
  tokens_salida  integer,
  costo_usd   numeric(12, 6) not null default 0
);

create table mercado.reglas_alerta (
  id        bigint generated always as identity primary key,
  serie_id  text not null references mercado.series (id),
  tipo      text not null check (tipo in ('cambio_pct_dia', 'nivel_sobre', 'nivel_bajo', 'cualquier_cambio')),
  umbral    numeric,
  activa    boolean not null default true,
  nota      text,
  actualizado_en timestamptz not null default now(),
  check (tipo = 'cualquier_cambio' or umbral is not null)
);

create table mercado.alertas_disparadas (
  id         bigint generated always as identity primary key,
  regla_id   bigint not null references mercado.reglas_alerta (id) on delete cascade,
  serie_id   text not null references mercado.series (id),
  fecha      date not null,
  valor      numeric not null,
  mensaje    text not null,
  disparada_en timestamptz not null default now(),
  enviada_en timestamptz,
  canal      text,
  unique (serie_id, fecha)
);

comment on constraint alertas_disparadas_serie_id_fecha_key on mercado.alertas_disparadas is
  'Una alerta por activo y día.';

create table mercado.carga_manual (
  id          bigint generated always as identity primary key,
  dato        text not null,
  serie_id    text references mercado.series (id),
  valor       numeric not null,
  fecha       date not null,
  nota        text,
  url_fuente  text,
  creado_por  uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en   timestamptz not null default now()
);

comment on table mercado.carga_manual is
  'Datos que no se pueden leer de forma automática (BVRD calculadora, BHD Fondos, etc.). Los escribe Mena.';

-- ---------------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------------

create view mercado.estado_tareas
with (security_invoker = true) as
select
  t.tarea,
  u.id as corrida_id,
  u.fuente_id,
  u.inicio,
  u.fin,
  u.estado,
  u.error,
  u.filas,
  u.detalle,
  (select max(c.inicio) from mercado.corridas c where c.tarea = t.tarea and c.estado = 'ok') as ultima_ok,
  (select count(*) from mercado.corridas c
    where c.tarea = t.tarea and c.estado = 'error' and c.inicio > now() - interval '24 hours') as errores_24h
from (select distinct tarea from mercado.corridas) t
cross join lateral (
  select * from mercado.corridas c where c.tarea = t.tarea order by c.inicio desc limit 1
) u;

-- ---------------------------------------------------------------------------
-- Registro de observaciones (lo llama la ingesta con service_role)
-- ---------------------------------------------------------------------------

-- p_filas: arreglo JSON de objetos
--   { serie_id, valor (texto), fecha_dato 'AAAA-MM-DD', hora_dato?, cambio?, cambio_pct?, url_dato?, estado? }
-- Los valores viajan como texto para no pasar por float en ningún punto.
-- Inserta lo nuevo, actualiza lo que la fuente revisó y deja intacto lo que no cambió.
-- Después recalcula el cambio diario (valor − observación diaria anterior) de las series tocadas.
create function mercado.registrar_observaciones(p_corrida_id bigint, p_filas jsonb)
returns table (recibidas integer, insertadas integer, actualizadas integer)
language plpgsql
set search_path = ''
as $$
declare
  v_desconocida text;
begin
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'p_filas debe ser un arreglo JSON';
  end if;

  select e.serie_id into v_desconocida
  from jsonb_to_recordset(p_filas) as e (serie_id text)
  left join mercado.series s on s.id = e.serie_id
  where s.id is null
  limit 1;

  if found then
    raise exception 'Serie desconocida: %', coalesce(v_desconocida, '(null)');
  end if;

  return query
  with entrada as (
    -- Si una misma clave viene repetida, gana la última del arreglo.
    select distinct on (e.serie_id, e.fecha_dato, e.hora_dato) e.*
    from (
      select
        t.elem ->> 'serie_id'                  as serie_id,
        (t.elem ->> 'valor')::numeric          as valor,
        (t.elem ->> 'fecha_dato')::date        as fecha_dato,
        (t.elem ->> 'hora_dato')::timestamptz  as hora_dato,
        (t.elem ->> 'cambio')::numeric         as cambio,
        (t.elem ->> 'cambio_pct')::numeric     as cambio_pct,
        t.elem ->> 'url_dato'                  as url_dato,
        t.elem ->> 'estado'                    as estado,
        t.n
      from jsonb_array_elements(p_filas) with ordinality as t (elem, n)
    ) e
    order by e.serie_id, e.fecha_dato, e.hora_dato, e.n desc
  ),
  escritas as (
    insert into mercado.observaciones as o
      (serie_id, valor, cambio, cambio_pct, cambio_origen, fecha_dato, hora_dato,
       fuente_id, url_dato, estado, corrida_id)
    select
      e.serie_id, e.valor, e.cambio, e.cambio_pct,
      case when e.cambio is null then 'calculado' else 'fuente' end,
      e.fecha_dato, e.hora_dato, s.fuente_id, e.url_dato, coalesce(e.estado, 'ok'), p_corrida_id
    from entrada e
    join mercado.series s on s.id = e.serie_id
    on conflict (serie_id, fecha_dato, hora_dato) do update
      set valor         = excluded.valor,
          cambio        = excluded.cambio,
          cambio_pct    = excluded.cambio_pct,
          cambio_origen = excluded.cambio_origen,
          url_dato      = excluded.url_dato,
          estado        = excluded.estado,
          recogido_en   = now(),
          corrida_id    = excluded.corrida_id
      where (o.valor, o.estado, o.cambio_origen) is distinct from
            (excluded.valor, excluded.estado, excluded.cambio_origen)
         or (excluded.cambio_origen = 'fuente' and (o.cambio, o.cambio_pct) is distinct from (excluded.cambio, excluded.cambio_pct))
    returning (xmax = 0) as es_nueva
  )
  select
    (select count(*)::integer from entrada),
    (select count(*)::integer from escritas where es_nueva),
    (select count(*)::integer from escritas where not es_nueva);

  -- Cambio diario calculado. Solo filas diarias (sin hora) cuyo cambio no vino de la fuente.
  update mercado.observaciones o
  set cambio = c.cambio,
      cambio_pct = c.cambio_pct
  from (
    select
      x.id,
      x.valor - lag(x.valor) over w as cambio,
      case
        when lag(x.valor) over w is null or lag(x.valor) over w = 0 then null
        else round((x.valor - lag(x.valor) over w) / abs(lag(x.valor) over w) * 100, 6)
      end as cambio_pct
    from mercado.observaciones x
    where x.hora_dato is null
      and x.serie_id in (select distinct e.serie_id from jsonb_to_recordset(p_filas) as e (serie_id text))
    window w as (partition by x.serie_id order by x.fecha_dato)
  ) c
  where o.id = c.id
    and o.cambio_origen = 'calculado'
    and (o.cambio, o.cambio_pct) is distinct from (c.cambio, c.cambio_pct);
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------

revoke all on schema mercado from public;
revoke all on schema personal from public;
grant usage on schema mercado to authenticated, service_role;

grant select on all tables in schema mercado to authenticated;
grant insert, update, delete on mercado.carga_manual to authenticated;
grant update (umbral, activa, nota, actualizado_en) on mercado.reglas_alerta to authenticated;
grant all on all tables in schema mercado to service_role;
grant usage, select on all sequences in schema mercado to service_role;
grant usage on sequence mercado.carga_manual_id_seq to authenticated;

revoke all on function mercado.registrar_observaciones(bigint, jsonb) from public, anon, authenticated;
grant execute on function mercado.registrar_observaciones(bigint, jsonb) to service_role;
revoke all on function mercado.es_autorizado() from public, anon;
grant execute on function mercado.es_autorizado() to authenticated, service_role;

alter table mercado.usuarios_autorizados enable row level security;
alter table mercado.fuentes              enable row level security;
alter table mercado.series               enable row level security;
alter table mercado.corridas             enable row level security;
alter table mercado.observaciones        enable row level security;
alter table mercado.noticias             enable row level security;
alter table mercado.instituciones_feed   enable row level security;
alter table mercado.agenda               enable row level security;
alter table mercado.emisiones_rd         enable row level security;
alter table mercado.explicaciones        enable row level security;
alter table mercado.reglas_alerta        enable row level security;
alter table mercado.alertas_disparadas   enable row level security;
alter table mercado.carga_manual         enable row level security;

create policy "dueño ve su fila" on mercado.usuarios_autorizados
  for select to authenticated using (user_id = (select auth.uid()));

create policy "autorizado lee" on mercado.fuentes            for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.series             for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.corridas           for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.observaciones      for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.noticias           for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.instituciones_feed for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.agenda             for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.emisiones_rd       for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.explicaciones      for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.reglas_alerta      for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.alertas_disparadas for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado lee" on mercado.carga_manual       for select to authenticated using ((select mercado.es_autorizado()));

create policy "autorizado edita umbrales" on mercado.reglas_alerta
  for update to authenticated
  using ((select mercado.es_autorizado()))
  with check ((select mercado.es_autorizado()));

create policy "autorizado carga" on mercado.carga_manual
  for insert to authenticated with check ((select mercado.es_autorizado()));
create policy "autorizado corrige" on mercado.carga_manual
  for update to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));
create policy "autorizado borra" on mercado.carga_manual
  for delete to authenticated using ((select mercado.es_autorizado()));
