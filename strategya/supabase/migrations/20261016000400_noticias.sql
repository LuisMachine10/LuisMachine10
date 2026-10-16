-- Strategya · Fase 4 · noticias, instituciones, SEC (fusiones e IPO), agenda y mapa
--
-- Fuentes: GDELT DOC 2.0 (una consulta por corrida), prensa por RSS (robots.txt en cada corrida),
-- comunicados de la Fed, BCE, BoJ, BoE, BIS (RSS), Tesoro y CEPAL (lista HTML) y el índice diario de EDGAR.
-- Regla: de una noticia se guarda titular, enlace, medio y fecha. Nunca el texto del artículo.

-- ───────────────────────── Fuentes nuevas ─────────────────────────
insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('aljazeera_rss', 'Al Jazeera · RSS', 'https://www.aljazeera.com/xml/rss/all.xml', 'rss', false, true,
   'Feed público. Solo titular, enlace y fecha. robots.txt se revisa en cada lectura.'),
  ('france24_rss', 'France 24 · RSS (inglés)', 'https://www.france24.com/en/rss', 'rss', false, true,
   'Feed público. Solo titular, enlace y fecha. robots.txt se revisa en cada lectura.'),
  ('diariolibre_rss', 'Diario Libre · RSS', 'https://www.diariolibre.com/', 'rss', false, true,
   'URL del feed por confirmar con la sonda (sondas/lotes/22-prensa-rss.txt). Apagado hasta confirmarlo.'),
  ('listin_rss', 'Listín Diario · RSS', 'https://listindiario.com/', 'rss', false, true,
   'URL del feed por confirmar con la sonda (sondas/lotes/22-prensa-rss.txt). Apagado hasta confirmarlo.'),
  ('eldinero_rss', 'elDinero · RSS', 'https://eldinero.com.do/', 'rss', false, true,
   'URL del feed por confirmar con la sonda (sondas/lotes/22-prensa-rss.txt). Apagado hasta confirmarlo.'),
  ('dominicantoday_rss', 'Dominican Today · RSS', 'https://dominicantoday.com/', 'rss', false, true,
   'URL del feed por confirmar con la sonda (sondas/lotes/22-prensa-rss.txt). Apagado hasta confirmarlo.')
on conflict (id) do nothing;

update mercado.fuentes set notas_de_uso = coalesce(notas_de_uso || ' ', '') ||
  'Desde IP compartidas respondió 429 aun esperando 12 s: una sola consulta cada 10 min, rotando guerras, mercados y RD.'
where id = 'gdelt';

-- ───────────────────────── Noticias ─────────────────────────
-- Lo que necesita el módulo de IA («Las 5 del día», «Guerras en el mundo»): categoria, pais, lat, lon, lugar.
alter table mercado.noticias
  add column if not exists lugar  text,
  add column if not exists idioma text,
  add column if not exists origen text not null default 'rss';

alter table mercado.noticias drop constraint if exists noticias_origen_check;
alter table mercado.noticias add constraint noticias_origen_check check (origen in ('gdelt', 'rss', 'manual'));

comment on column mercado.noticias.lugar is 'Lugar del nomenclátor (_shared/geo.ts) que ubicó el pin: «Gaza», «Mar Rojo», «Kyiv»…';
comment on column mercado.noticias.pais is 'País (o zona, para mares y estrechos) del lugar; en español.';
comment on column mercado.noticias.categoria is
  'guerra · rd · instituciones · mercado, por reglas explícitas en _shared/geo.ts (categorizar).';
comment on column mercado.noticias.hash is 'SHA-256 de la URL normalizada (sin utm_*, sin www, https). Evita duplicados.';

create index if not exists noticias_categoria_fecha on mercado.noticias (categoria, fecha desc);

-- ───────────────────────── Instituciones ─────────────────────────
alter table mercado.instituciones_feed add column if not exists solo_fecha boolean not null default false;
comment on column mercado.instituciones_feed.solo_fecha is
  'true = la fuente publica solo el día (CEPAL, BIS). La hora guardada no es real y la pantalla no la muestra.';

-- ───────────────────────── SEC: fusiones e IPO ─────────────────────────
create table if not exists mercado.operaciones_sec (
  id           bigint generated always as identity primary key,
  form         text not null,
  tipo         text not null check (tipo in ('ipo', 'fusion')),
  empresa      text not null,
  cik          text not null check (cik ~ '^\d{1,10}$'),
  fecha        date not null,
  url          text not null,
  archivo      text not null,
  indice_fecha date not null,
  fuente_id    text not null default 'sec_edgar' references mercado.fuentes (id),
  recogido_en  timestamptz not null default now(),
  unique (archivo, cik, form)
);

comment on table mercado.operaciones_sec is
  'Presentaciones de IPO (S-1, F-1, 424B4) y de fusiones/adquisiciones (425, DEFM14A, PREM14A, SC TO-T, SC 14D9) '
  'tomadas del índice diario de EDGAR. url = página índice de la presentación en sec.gov.';

create index if not exists operaciones_sec_fecha on mercado.operaciones_sec (fecha desc, tipo);

alter table mercado.operaciones_sec enable row level security;
create policy "autorizado lee" on mercado.operaciones_sec for select to authenticated using ((select mercado.es_autorizado()));
grant select on mercado.operaciones_sec to authenticated;
grant all on mercado.operaciones_sec to service_role;
grant usage, select on sequence mercado.operaciones_sec_id_seq to service_role;

-- ───────────────────────── Agenda ─────────────────────────
alter table mercado.agenda
  add column if not exists hora_conocida boolean not null default true,
  add column if not exists zona text,
  add column if not exists nota text;

comment on column mercado.agenda.fecha_hora is 'Instante del evento en UTC. La pantalla lo muestra en hora RD.';
comment on column mercado.agenda.hora_conocida is
  'false = solo se conoce el día (la hora guardada es el inicio del día en la zona del evento y no se muestra).';
comment on column mercado.agenda.zona is 'Zona horaria de la institución (America/New_York, Europe/Berlin, Asia/Tokyo).';

-- Eventos de referencia cargados a mano, todos sin confirmar (confirmado = false) hasta verlos en el
-- calendario oficial. La hora local se convierte a UTC con las reglas de Postgres: Nueva York pasa a EST
-- el 1 nov 2026 y Europa a CET el 25 oct 2026.
--   FOMC 28 oct 14:00 Nueva York (EDT, UTC−4) = 18:00 UTC = 2:00 PM RD
--   FOMC  9 dic 14:00 Nueva York (EST, UTC−5) = 19:00 UTC = 3:00 PM RD
--   BCE  29 oct 14:15 Fráncfort (CET, UTC+1)  = 13:15 UTC = 9:15 AM RD
--   BCE  17 dic 14:15 Fráncfort (CET, UTC+1)  = 13:15 UTC = 9:15 AM RD
--   BoJ  28 oct (hora por anunciar)
insert into mercado.agenda (fecha_hora, institucion, evento, importancia, confirmado, url, fuente_id, hora_conocida, zona, nota) values
  (timestamp '2026-10-28 14:00' at time zone 'America/New_York', 'Fed', 'Decisión de tasas (FOMC)', 3, false,
   'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'fed_rss', true, 'America/New_York',
   'Fecha de referencia cargada a mano; confirmar en el calendario oficial del FOMC.'),
  (timestamp '2026-12-09 14:00' at time zone 'America/New_York', 'Fed', 'Decisión de tasas (FOMC)', 3, false,
   'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'fed_rss', true, 'America/New_York',
   'Fecha de referencia cargada a mano; confirmar en el calendario oficial del FOMC.'),
  (timestamp '2026-10-28 00:00' at time zone 'Asia/Tokyo', 'BoJ', 'Decisión de política monetaria', 3, false,
   'https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm', 'boj_rss', false, 'Asia/Tokyo',
   'Solo se conoce el día; el BoJ anuncia al terminar la reunión. Confirmar en el calendario oficial.'),
  (timestamp '2026-10-29 14:15' at time zone 'Europe/Berlin', 'BCE', 'Decisión de tipos de interés', 3, false,
   'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', 'bce_rss', true, 'Europe/Berlin',
   'Fecha de referencia cargada a mano; confirmar en el calendario oficial del BCE.'),
  (timestamp '2026-12-17 14:15' at time zone 'Europe/Berlin', 'BCE', 'Decisión de tipos de interés', 3, false,
   'https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html', 'bce_rss', true, 'Europe/Berlin',
   'Fecha de referencia cargada a mano; confirmar en el calendario oficial del BCE.')
on conflict (fecha_hora, institucion, evento) do nothing;

-- ───────────────────────── Qué vigilar / mapa de mercados ─────────────────────────
-- Última observación de cada serie activa (de los últimos 10 días), con su fuente y meta (lat/lon del pin).
create or replace view mercado.vigilar_movimientos
with (security_invoker = true) as
select distinct on (o.serie_id)
  o.serie_id,
  s.nombre,
  s.nombre_corto,
  s.categoria,
  s.unidad,
  s.sustituto_de,
  s.max_antiguedad_min,
  s.meta,
  o.valor,
  o.cambio,
  o.cambio_pct,
  o.fecha_dato,
  o.hora_dato,
  o.recogido_en,
  o.url_dato,
  o.estado,
  f.nombre as fuente_nombre,
  f.url    as fuente_url
from mercado.observaciones o
join mercado.series s on s.id = o.serie_id
join mercado.fuentes f on f.id = o.fuente_id
where s.activa
  and o.fecha_dato >= current_date - 10
order by o.serie_id, o.fecha_dato desc, o.hora_dato desc nulls last;

grant select on mercado.vigilar_movimientos to authenticated;
grant select on mercado.vigilar_movimientos to service_role;

-- ───────────────────────── Realtime ─────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['noticias', 'instituciones_feed', 'operaciones_sec'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'mercado' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table mercado.%I', t);
    end if;
  end loop;
end $$;

-- ───────────────────────── Horarios (UTC; RD = UTC−4) ─────────────────────────
-- GDELT: una consulta cada 10 min (rota guerras → mercados → RD).
select cron.schedule('strategya-noticias-gdelt', '*/10 * * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"noticias-gdelt"}')$$);
-- Prensa por RSS: cada 30 min.
select cron.schedule('strategya-noticias-prensa', '5,35 * * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"noticias-prensa"}')$$);
-- Instituciones: cada hora, escalonadas (el BCE pide Crawl-delay 5; el lector lo respeta). CEPAL cada 3 h.
select cron.schedule('strategya-instituciones-fed',    '20 * * * *',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"instituciones-fed"}')$$);
select cron.schedule('strategya-instituciones-bce',    '22 * * * *',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"instituciones-bce"}')$$);
select cron.schedule('strategya-instituciones-boj',    '24 * * * *',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"instituciones-boj"}')$$);
select cron.schedule('strategya-instituciones-boe',    '26 * * * *',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"instituciones-boe"}')$$);
select cron.schedule('strategya-instituciones-bis',    '28 * * * *',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"instituciones-bis"}')$$);
select cron.schedule('strategya-instituciones-tesoro', '30 * * * *',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"instituciones-tesoro"}')$$);
select cron.schedule('strategya-instituciones-cepal',  '32 */3 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"instituciones-cepal"}')$$);
-- SEC: el índice diario sale de noche (hora de Nueva York). 11:40 PM, 7:40 AM, 11:40 AM y 7:40 PM RD.
select cron.schedule('strategya-sec-edgar', '40 3,11,15,23 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"sec-edgar"}')$$);

-- Limpieza diaria (4:50 AM RD): noticias de más de 45 días que ninguna explicación de la IA cita,
-- comunicados de más de 180 días y operaciones SEC de más de 400 días.
select cron.schedule('strategya-noticias-limpieza', '50 8 * * *', $$
  delete from mercado.noticias n
   where n.fecha < now() - interval '45 days'
     and not exists (select 1 from mercado.explicaciones e where e.noticia_id = n.id);
  delete from mercado.instituciones_feed where fecha < now() - interval '180 days';
  delete from mercado.operaciones_sec where fecha < current_date - 400;
$$);
