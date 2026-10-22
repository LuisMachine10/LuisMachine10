-- Strategya · Mercados: «Mi lista» de acciones y «Mis posiciones» de EE. UU.
--
--   · personal.watchlist: los símbolos que Mena sigue (solo el símbolo, una nota opcional y el orden).
--   · mercado.cotizaciones_cartera: suma máximo y mínimo del día (Cboe los publica).
--   · mercado.simbolos_sin_cotizacion: símbolos que una fuente no publica (404), para no pedirlos 24 h.
--   · mercado.simbolos_lista(): la lista de símbolos para la ingesta (watchlist + Renta Variable con símbolo).
--   · Horario de la tarea «cotizaciones-lista» (Cboe, diferido 15 min).
--
-- Ninguna cifra de nadie vive aquí: la lista la arma Mena desde /mercado.

-- ───────────────────────── Mi lista ─────────────────────────
create table personal.watchlist (
  simbolo   text primary key check (simbolo ~ '^[A-Z.]{1,6}$'),
  nota      text not null default '' check (length(nota) <= 140),
  orden     integer not null default 0,
  creado_en timestamptz not null default now()
);
comment on table personal.watchlist is
  'Mi lista (Mercados): símbolos de acciones o ETF de EE. UU. que Mena sigue. Sin cantidades ni montos.';
create index watchlist_orden on personal.watchlist (orden, simbolo);

grant select, insert, update, delete on personal.watchlist to authenticated;
grant all on personal.watchlist to service_role;
alter table personal.watchlist enable row level security;
create policy "autorizado administra" on personal.watchlist
  for all to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));

-- ───────────────────────── Máximo y mínimo del día ─────────────────────────
alter table mercado.cotizaciones_cartera
  add column maximo numeric check (maximo is null or maximo > 0),
  add column minimo numeric check (minimo is null or minimo > 0);
comment on column mercado.cotizaciones_cartera.maximo is 'Máximo del día según la fuente (Cboe «high»). Finnhub no lo guarda.';
comment on column mercado.cotizaciones_cartera.minimo is 'Mínimo del día según la fuente (Cboe «low»). Finnhub no lo guarda.';

-- ───────────────────────── Símbolos que la fuente no publica ─────────────────────────
create table mercado.simbolos_sin_cotizacion (
  simbolo    text not null check (simbolo ~ '^[A-Z0-9][A-Z0-9.-]{0,14}$'),
  fuente     text not null references mercado.fuentes (id),
  motivo     text not null check (length(motivo) between 1 and 200),
  marcado_en timestamptz not null default now(),
  primary key (simbolo, fuente)
);
comment on table mercado.simbolos_sin_cotizacion is
  'Símbolos por los que la fuente respondió 404. La ingesta no los vuelve a pedir hasta 24 h después de marcado_en.';

grant select on mercado.simbolos_sin_cotizacion to authenticated;
grant all on mercado.simbolos_sin_cotizacion to service_role;
alter table mercado.simbolos_sin_cotizacion enable row level security;
create policy "autorizado lee" on mercado.simbolos_sin_cotizacion
  for select to authenticated using ((select mercado.es_autorizado()));

-- ───────────────────────── Símbolos para la ingesta ─────────────────────────
-- {simbolos: [...], omitidos: [...], ultimo_ok: timestamptz | null}
--   simbolos  = Mi lista ∪ Renta Variable con símbolo, sin los marcados «no publica» en las últimas 24 h.
--   ultimo_ok = la lectura Cboe más vieja entre ellos (null si alguno nunca se leyó): decide si toca leer
--               con el mercado cerrado (captura del cierre o primera lectura de un símbolo nuevo).
-- La ingesta (service_role) no lee personal: esta función le da solo los símbolos.
create function mercado.simbolos_lista()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with todos as (
    select w.simbolo from personal.watchlist w
    union
    select upper(a.simbolo) from personal.activos a where a.clase = 'rentavariable' and a.simbolo is not null
  ),
  marcados as (
    select t.simbolo,
           exists (
             select 1 from mercado.simbolos_sin_cotizacion x
             where x.simbolo = t.simbolo and x.fuente = 'cboe' and x.marcado_en > now() - interval '24 hours'
           ) as omitido
    from todos t
  ),
  lecturas as (
    select m.simbolo,
           (select max(c.recogido_en) from mercado.cotizaciones_cartera c where c.simbolo = m.simbolo and c.fuente = 'cboe') as ultima
    from marcados m
    where not m.omitido
  )
  select jsonb_build_object(
    'simbolos', coalesce((select jsonb_agg(l.simbolo order by l.simbolo) from lecturas l), '[]'::jsonb),
    'omitidos', coalesce((select jsonb_agg(m.simbolo order by m.simbolo) from marcados m where m.omitido), '[]'::jsonb),
    'ultimo_ok', (select case when bool_or(l.ultima is null) then null else min(l.ultima) end from lecturas l)
  );
$$;
revoke all on function mercado.simbolos_lista() from public, anon, authenticated;
grant execute on function mercado.simbolos_lista() to service_role;

-- ───────────────────────── Horario ─────────────────────────
-- Cada 5 min de 13:00 a 21:55 UTC, L–V. La tarea decide con el horario de Nueva York (verano e invierno):
-- lee con la bolsa abierta y una vez tras el cierre (+20 min, el dato llega diferido 15 min).
select cron.schedule('strategya-cotizaciones-lista', '*/5 13-21 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"cotizaciones-lista"}')$$);
