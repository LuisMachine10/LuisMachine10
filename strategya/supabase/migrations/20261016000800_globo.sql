-- Strategya · módulo Globo 3D «Ojo de Dios»
--
-- Mapa vivo con mercados, noticias y guerras, República Dominicana, pasos marítimos críticos,
-- sismos (USGS), ciclones (NOAA NHC) y, opcionalmente, conteos de buques en los pasos (AISStream).
-- Inspirado y adaptado de God's Eye View (MIT, © 2026 Bilawal Sidhu). Ver THIRD_PARTY_NOTICES.md.
--
-- Reglas que esta migración hace cumplir:
--   · Ningún evento sin enlace oficial (url not null).
--   · Magnitudes, coordenadas y vientos en numeric (nunca float).
--   · Nunca se guarda un nombre de buque ni un MMSI: AIS solo entra como CONTEO por paso (series AIS_*).
--   · Solo el usuario autorizado lee; solo service_role escribe.

-- ---------------------------------------------------------------------------
-- Fuentes
-- ---------------------------------------------------------------------------

insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('usgs', 'USGS · Earthquake Hazards Program (feeds GeoJSON)',
   'https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php', 'api', false, true,
   'Dominio público de EE. UU. («Data courtesy of the U.S. Geological Survey»). Feeds 4.5_day y significant_week, '
   'cada 15 min, con robots.txt revisado antes de leer. Se guardan sismos M2.5+ con su página oficial; retención 14 días.'),
  ('nhc', 'NOAA / NWS · Centro Nacional de Huracanes (NHC)',
   'https://www.nhc.noaa.gov/', 'api', false, true,
   'Datos públicos de NOAA/NWS (https://www.weather.gov/disclaimer); sin respaldo implícito de NOAA. '
   'CurrentStorms.json cada 30 min y, si está disponible, el pronóstico (puntos, trayectoria y cono) del MapServer '
   'NHC_tropical_weather_summary. Cobertura: Atlántico y Pacífico norte oriental/central, no mundial.'),
  ('aisstream', 'AISStream.io · AIS en vivo (WebSocket)',
   'https://aisstream.io/', 'api', true, true,
   'Clave gratuita (AISSTREAM_API_KEY), servicio beta sin términos formales; AIS es una emisión pública. '
   'Apagado por defecto: solo corre con GLOBO_AIS_ACTIVO=1. Muestra de 40 s por hora y por paso; '
   'solo se guardan CONTEOS (nunca nombres ni MMSI). La cobertura AIS terrestre es incompleta en alta mar.'),
  ('esri', 'Esri · World Imagery y World Dark Gray (mosaicos del mapa base)',
   'https://www.esri.com/en-us/legal/terms/full-master-agreement', 'api', false, false,
   'Mosaicos que carga el navegador para el mapa base del globo; no hay ingesta. Sin clave para el servicio clásico. '
   'Atribución obligatoria y visible: «Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community».');

-- ---------------------------------------------------------------------------
-- Coordenadas de bolsas que falten en el catálogo (no se pisa ninguna existente ni otras claves de meta)
-- ---------------------------------------------------------------------------

update mercado.series s
   set meta = jsonb_set(jsonb_set(s.meta, '{lat}', to_jsonb(u.lat)), '{lon}', to_jsonb(u.lon))
              || case when s.meta ? 'bolsa' then '{}'::jsonb else jsonb_build_object('bolsa', u.bolsa) end
  from (values
    -- Índices: ubicación de su bolsa
    ('IDX_SPX',      40.71::numeric,  -74.01::numeric, 'Nueva York (NYSE / Nasdaq)'),
    ('IDX_DJI',      40.71,  -74.01, 'Nueva York (NYSE / Nasdaq)'),
    ('IDX_IXIC',     40.71,  -74.01, 'Nueva York (NYSE / Nasdaq)'),
    ('IDX_RUT',      40.71,  -74.01, 'Nueva York (NYSE / Nasdaq)'),
    ('IDX_STOXX50E', 48.87,    2.34, 'París (Euronext)'),
    ('IDX_FTSE',     51.51,   -0.13, 'Londres (LSE)'),
    ('IDX_GDAXI',    50.11,    8.68, 'Fráncfort (Deutsche Börse)'),
    ('IDX_N225',     35.68,  139.69, 'Tokio (JPX)'),
    ('IDX_HSI',      22.32,  114.17, 'Hong Kong (HKEX)'),
    -- ETF de índices: cotizan en Nueva York (NYSE Arca / Nasdaq)
    ('ETF_SPY',      40.71,  -74.01, 'Nueva York (NYSE / Nasdaq)'),
    ('ETF_QQQ',      40.71,  -74.01, 'Nueva York (NYSE / Nasdaq)'),
    ('ETF_DIA',      40.71,  -74.01, 'Nueva York (NYSE / Nasdaq)'),
    ('ETF_IWM',      40.71,  -74.01, 'Nueva York (NYSE / Nasdaq)')
  ) as u (id, lat, lon, bolsa)
 where s.id = u.id
   and not (s.meta ? 'lat' and s.meta ? 'lon');

-- Nombre de la bolsa para las que ya traían coordenadas (solo agrega la clave si falta).
-- El catálogo ubica el Euro Stoxx 50 en Fráncfort (sus futuros cotizan en Eurex); se respeta y se rotula así.
update mercado.series s
   set meta = s.meta || jsonb_build_object('bolsa', u.bolsa)
  from (values
    ('IDX_SPX', 'Nueva York (NYSE / Nasdaq)'), ('IDX_DJI', 'Nueva York (NYSE / Nasdaq)'),
    ('IDX_IXIC', 'Nueva York (NYSE / Nasdaq)'), ('IDX_RUT', 'Nueva York (NYSE / Nasdaq)'),
    ('IDX_STOXX50E', 'Fráncfort (Eurex / Deutsche Börse)'), ('IDX_FTSE', 'Londres (LSE)'),
    ('IDX_GDAXI', 'Fráncfort (Deutsche Börse)'), ('IDX_N225', 'Tokio (JPX)'), ('IDX_HSI', 'Hong Kong (HKEX)')
  ) as u (id, bolsa)
 where s.id = u.id
   and not (s.meta ? 'bolsa');

-- ---------------------------------------------------------------------------
-- Eventos geográficos: sismos (USGS) y ciclones (NHC)
-- ---------------------------------------------------------------------------

create table mercado.eventos_geo (
  id           bigint generated always as identity primary key,
  tipo         text not null check (tipo in ('sismo', 'ciclon')),
  id_externo   text not null unique,
  titulo       text not null,
  lat          numeric not null check (lat between -90 and 90),
  lon          numeric not null check (lon between -180 and 180),
  magnitud     numeric,
  fecha_evento timestamptz not null,
  url          text not null check (url ~ '^https://'),
  datos        jsonb not null default '{}'::jsonb,
  fuente_id    text references mercado.fuentes (id),
  recogido_en  timestamptz not null default now()
);

comment on table mercado.eventos_geo is
  'Sismos (USGS) y ciclones activos (NOAA NHC) para el globo. Cada fila lleva la página oficial del evento.';
comment on column mercado.eventos_geo.id_externo is 'Id de la fuente: evento USGS (us7000abcd) o ciclón NHC (al052026).';
comment on column mercado.eventos_geo.magnitud is
  'Sismo: magnitud USGS. Ciclón: viento máximo sostenido en nudos según el último aviso del NHC.';
comment on column mercado.eventos_geo.datos is
  'Detalle tal como lo publicó la fuente (lugar, profundidad, aviso, pronóstico…). Números como texto.';

create index eventos_geo_tipo_fecha on mercado.eventos_geo (tipo, fecha_evento desc);

alter table mercado.eventos_geo enable row level security;
create policy "autorizado lee" on mercado.eventos_geo for select to authenticated using ((select mercado.es_autorizado()));

grant select on mercado.eventos_geo to authenticated;
grant all on mercado.eventos_geo to service_role;
grant usage, select on sequence mercado.eventos_geo_id_seq to service_role;

alter publication supabase_realtime add table mercado.eventos_geo;

-- Retención: sismos de más de 14 días (por fecha del evento, contados desde p_ahora). Devuelve cuántos borró.
create function mercado.globo_purgar_sismos(p_dias integer default 14, p_ahora timestamptz default now())
returns integer
language sql
set search_path = ''
as $$
  with borrados as (
    delete from mercado.eventos_geo
     where tipo = 'sismo' and fecha_evento < coalesce(p_ahora, now()) - make_interval(days => greatest(p_dias, 1))
    returning 1
  )
  select count(*)::integer from borrados;
$$;

-- Ciclones: el NHC dice cuáles están activos AHORA. Se reemplaza el conjunto completo en una sola
-- transacción: los que siguen se actualizan, los nuevos entran y los que el NHC ya no lista se borran.
-- p_filas: arreglo JSON de {id_externo, titulo, lat, lon, magnitud, fecha_evento, url, datos}.
-- Devuelve {"vigentes": n, "borrados": m}.
create function mercado.globo_reemplazar_ciclones(p_filas jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_borrados integer;
begin
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'p_filas debe ser un arreglo JSON';
  end if;

  insert into mercado.eventos_geo as e (tipo, id_externo, titulo, lat, lon, magnitud, fecha_evento, url, datos, fuente_id)
  select 'ciclon', f.id_externo, f.titulo, f.lat, f.lon, f.magnitud, f.fecha_evento, f.url,
         coalesce(f.datos, '{}'::jsonb), 'nhc'
    from jsonb_to_recordset(p_filas) as f (id_externo text, titulo text, lat numeric, lon numeric, magnitud numeric,
                                           fecha_evento timestamptz, url text, datos jsonb)
  on conflict (id_externo) do update
    set titulo = excluded.titulo, lat = excluded.lat, lon = excluded.lon, magnitud = excluded.magnitud,
        fecha_evento = excluded.fecha_evento, url = excluded.url, datos = excluded.datos, recogido_en = now();

  with fuera as (
    delete from mercado.eventos_geo e
     where e.tipo = 'ciclon'
       and e.id_externo not in (select f.id_externo from jsonb_to_recordset(p_filas) as f (id_externo text))
    returning 1
  )
  select count(*)::integer into v_borrados from fuera;

  return jsonb_build_object('vigentes', jsonb_array_length(p_filas), 'borrados', v_borrados);
end;
$$;

revoke all on function mercado.globo_purgar_sismos(integer, timestamptz) from public, anon, authenticated;
grant execute on function mercado.globo_purgar_sismos(integer, timestamptz) to service_role;
revoke all on function mercado.globo_reemplazar_ciclones(jsonb) from public, anon, authenticated;
grant execute on function mercado.globo_reemplazar_ciclones(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Buques en pasos críticos (AISStream): solo conteos por paso
-- ---------------------------------------------------------------------------
-- Los ids de paso coinciden con lib/globo/pasos.ts y _shared/fuentes/buques-ais.ts.
-- frecuencia 'intradia' (el catálogo no tiene «horaria»); meta.frecuencia_real = 'horaria'.

insert into mercado.series (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, meta)
select
  'AIS_' || p.id || '_' || m.sufijo,
  m.nombre || ' · ' || p.nombre,
  p.corto || ' ' || m.corto,
  'otro', 'buques', null, 'aisstream', 'intradia', 180, 900 + p.n * 3 + m.n,
  jsonb_build_object(
    'paso', p.id,
    'medida', m.medida,
    'frecuencia_real', 'horaria',
    'nota', 'muestra de 40 s; la cobertura AIS terrestre es incompleta en alta mar'
      || case when m.sufijo <> 'BUQUES'
              then '; el tipo de buque solo se conoce de los que enviaron sus datos estáticos durante la muestra'
              else '' end
  )
from (values
  (1, 'ORMUZ',           'Estrecho de Ormuz',              'Ormuz'),
  (2, 'BAB_EL_MANDEB',   'Estrecho de Bab el-Mandeb',      'Bab el-Mandeb'),
  (3, 'SUEZ',            'Canal de Suez',                  'Suez'),
  (4, 'MALACA',          'Estrecho de Malaca',             'Malaca'),
  (5, 'PANAMA',          'Canal de Panamá',                'Panamá'),
  (6, 'BOSFORO',         'Bósforo (estrechos turcos)',     'Bósforo'),
  (7, 'GIBRALTAR',       'Estrecho de Gibraltar',          'Gibraltar'),
  (8, 'BUENA_ESPERANZA', 'Cabo de Buena Esperanza',        'Buena Esperanza'),
  (9, 'DANESES',         'Estrechos daneses',              'Daneses')
) as p (n, id, nombre, corto)
cross join (values
  (0, 'BUQUES',    'Buques distintos observados (AIS)', 'buques',    'buques_distintos'),
  (1, 'TANQUEROS', 'Tanqueros observados (AIS 80–89)',  'tanqueros', 'tanqueros_distintos'),
  (2, 'CARGA',     'Buques de carga observados (AIS 70–79)', 'carga', 'carga_distintos')
) as m (n, sufijo, nombre, corto, medida);

-- ---------------------------------------------------------------------------
-- Horarios (UTC). RD = UTC−4.
-- ---------------------------------------------------------------------------

select cron.schedule('strategya-sismos-usgs',  '*/15 * * * *',  $$select mercado.invocar_tarea('ingesta', '{"tarea":"sismos-usgs"}')$$);
select cron.schedule('strategya-ciclones-nhc', '7,37 * * * *',  $$select mercado.invocar_tarea('ingesta', '{"tarea":"ciclones-nhc"}')$$);
-- La tarea termina en «parcial · desactivado» sin conectar mientras GLOBO_AIS_ACTIVO no sea 1.
select cron.schedule('strategya-buques-ais',   '20 * * * *',    $$select mercado.invocar_tarea('ingesta', '{"tarea":"buques-ais"}')$$);
-- Respaldo de la retención (la tarea de sismos ya purga en cada corrida): 4:40 AM RD.
select cron.schedule('strategya-globo-limpieza', '40 8 * * *',  $$select mercado.globo_purgar_sismos(14)$$);
