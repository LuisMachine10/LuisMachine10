-- Strategya · respaldo gratuito de cotizaciones y prensa financiera internacional
--
-- Si FMP o Finnhub no tienen clave (o no entregan un símbolo), las mismas series se llenan desde fuentes
-- públicas y gratuitas, cada fila con SU fuente (no la de la serie):
--   · Cboe · cotizaciones diferidas 15 min (cdn.cboe.com, JSON público; robots.txt no publicado).
--     Índices ^SPX ^RUT ^NDX ^VIX y los ETF de la cinta (SPY, QQQ, GLD, USO…). Mismo origen que usa OpenBB
--     (proveedor «cboe», Apache-2.0).
--   · BCE · tipos de cambio de referencia diarios (eurofxref-daily.xml). EUR/USD directo; USD/JPY es el
--     cruce JPY÷USD de esas mismas tasas (rotulado).
--   · FRED (Fed de St. Louis) · cierres diarios: Dow (DJIA), Nasdaq Composite (NASDAQCOM), Brent
--     (DCOILBRENTEU), WTI (DCOILWTICO) y gas natural Henry Hub (DHHNGSP). Mismo origen que usa OpenBB
--     (proveedor «fred»).
-- Prensa: titulares (solo titular, enlace, medio y fecha) de los RSS públicos de WSJ, CNBC, FT,
-- Bloomberg Línea, elEconomista y Expansión. El texto de los artículos no se lee ni se guarda.

-- ───────────────────────── Fuente por fila ─────────────────────────
-- p_filas admite ahora fuente_id por fila; si falta, se usa la fuente de la serie (comportamiento anterior).
create or replace function mercado.registrar_observaciones(p_corrida_id bigint, p_filas jsonb)
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

  select e.fuente_id into v_desconocida
  from jsonb_to_recordset(p_filas) as e (fuente_id text)
  left join mercado.fuentes f on f.id = e.fuente_id
  where e.fuente_id is not null and f.id is null
  limit 1;

  if found then
    raise exception 'Fuente desconocida: %', v_desconocida;
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
        t.elem ->> 'fuente_id'                 as fuente_id,
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
      e.fecha_dato, e.hora_dato, coalesce(e.fuente_id, s.fuente_id), e.url_dato, coalesce(e.estado, 'ok'), p_corrida_id
    from entrada e
    join mercado.series s on s.id = e.serie_id
    on conflict (serie_id, fecha_dato, hora_dato) do update
      set valor         = excluded.valor,
          cambio        = excluded.cambio,
          cambio_pct    = excluded.cambio_pct,
          cambio_origen = excluded.cambio_origen,
          fuente_id     = excluded.fuente_id,
          url_dato      = excluded.url_dato,
          estado        = excluded.estado,
          recogido_en   = now(),
          corrida_id    = excluded.corrida_id
      where (o.valor, o.estado, o.cambio_origen, o.fuente_id) is distinct from
            (excluded.valor, excluded.estado, excluded.cambio_origen, excluded.fuente_id)
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

revoke all on function mercado.registrar_observaciones(bigint, jsonb) from public, anon, authenticated;
grant execute on function mercado.registrar_observaciones(bigint, jsonb) to service_role;

-- ───────────────────────── Fuentes ─────────────────────────
insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('cboe', 'Cboe · cotizaciones diferidas', 'https://www.cboe.com/us/indices/', 'api', false, true,
   'JSON público de cdn.cboe.com (el mismo que usa la web de Cboe y el proveedor «cboe» de OpenBB). '
   'Diferido 15 minutos. robots.txt no publicado (el CDN responde AccessDenied de S3). '
   'Respaldo de FMP/Finnhub; fuente propia de Nasdaq 100 y VIX.'),
  ('bce_fx', 'BCE · tipos de cambio de referencia', 'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html', 'xml', false, true,
   'eurofxref-daily.xml: una tasa por día hábil, publicada hacia las 16:00 CET. '
   'USD/JPY es un cruce calculado (JPY por € ÷ US$ por €) de esas mismas tasas. Respaldo de FMP.'),
  ('fred', 'FRED · Fed de St. Louis', 'https://fred.stlouisfed.org/', 'api', false, true,
   'CSV público (fredgraph.csv). Cierres diarios: DJIA, NASDAQCOM, DCOILBRENTEU, DCOILWTICO, DHHNGSP. '
   'Los precios de energía de la EIA llegan con unos días de retraso. Respaldo de FMP; fuente de WTI y gas natural.'),
  ('wsj_rss', 'The Wall Street Journal · RSS', 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain', 'rss', false, true,
   'Feeds públicos de Dow Jones (mercados y mundo). Solo titular, enlace y fecha: el artículo está tras muro de pago y no se lee.'),
  ('cnbc_rss', 'CNBC · RSS', 'https://www.cnbc.com/id/100003114/device/rss/rss.html', 'rss', false, true,
   'Feeds públicos (portada y mercados). Solo titular, enlace y fecha.'),
  ('ft_rss', 'Financial Times · RSS', 'https://www.ft.com/markets?format=rss', 'rss', false, true,
   'Feeds públicos de secciones (mercados y mundo). Solo titular, enlace y fecha: el artículo está tras muro de pago y no se lee.'),
  ('bloomberglinea_rss', 'Bloomberg Línea · RSS', 'https://www.bloomberglinea.com/arc/outboundfeeds/rss/?outputType=xml', 'rss', false, true,
   'Feed público en español. Solo titular, enlace y fecha.'),
  ('eleconomista_rss', 'elEconomista · Mercados · RSS', 'https://www.eleconomista.es/rss/rss-mercados.php', 'rss', false, true,
   'Feed público en español. Solo titular, enlace y fecha.'),
  ('expansion_rss', 'Expansión · Mercados · RSS', 'https://e00-expansion.uecdn.es/rss/mercados.xml', 'rss', false, true,
   'Feed público en español. Solo titular, enlace y fecha.')
on conflict (id) do nothing;

-- ───────────────────────── Series nuevas (Cboe) ─────────────────────────
insert into mercado.series (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, sustituto_de, meta) values
  ('IDX_NDX', 'Nasdaq 100', 'Nasdaq 100', 'indice', 'puntos', 'USD', 'cboe', 'intradia', 120, 210, null,
   '{"simbolo":"^NDX","mercado":"us_acciones","lat":40.71,"lon":-74.01,"pais":"EE. UU."}'),
  ('IDX_VIX', 'Índice de volatilidad (VIX)', 'VIX', 'indice', 'puntos', 'USD', 'cboe', 'intradia', 120, 211, null,
   '{"simbolo":"^VIX","mercado":"us_acciones","lat":41.88,"lon":-87.63,"pais":"EE. UU."}')
on conflict (id) do nothing;

-- WTI y gas natural: FMP no los entrega con el plan de Mena; vuelven con el cierre diario de FRED.
update mercado.series
   set activa = true, fuente_id = 'fred', frecuencia = 'diaria', max_antiguedad_min = 10080,
       meta = meta || '{"fred":"DCOILWTICO"}'::jsonb
 where id = 'WTI';
update mercado.series
   set activa = true, fuente_id = 'fred', frecuencia = 'diaria', max_antiguedad_min = 10080,
       meta = meta || '{"fred":"DHHNGSP"}'::jsonb
 where id = 'GAS_NATURAL';

-- ───────────────────────── Horarios (UTC) ─────────────────────────
-- Cboe: cada 5 min de 13:00 a 21:55 UTC, L–V (la tarea solo llama con el mercado abierto o hasta 30 min
-- después del cierre: el dato viene diferido 15 min).
select cron.schedule('strategya-cotizaciones-cboe', '*/5 13-21 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"cotizaciones-cboe"}')$$);
-- BCE: 15:20 y 16:50 UTC, L–V (la tasa sale hacia las 14:00–15:00 UTC).
select cron.schedule('strategya-divisas-bce', '20,50 15,16 * * 1-5',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"divisas-bce"}')$$);
-- FRED: 12:40 y 22:40 UTC todos los días (publica los cierres de la víspera por la mañana).
select cron.schedule('strategya-cierres-fred', '40 12,22 * * *',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"cierres-fred"}')$$);
