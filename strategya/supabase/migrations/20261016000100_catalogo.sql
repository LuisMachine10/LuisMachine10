-- Strategya · catálogo común de fuentes y series (fases 2 a 6)
--
-- Los identificadores de esta migración son el contrato entre módulos: la ingesta escribe en estas
-- series, las alertas y la IA las leen y la pantalla las muestra. Cambiar un id rompe ese contrato.
-- meta.simbolo = símbolo en el proveedor · meta.mercado = horario que aplica (ver lib/mercados.ts)
-- meta.lat/lon = dónde va el pin en el mapa.

alter table mercado.series add column if not exists activa boolean not null default true;
comment on column mercado.series.activa is
  'false = el proveedor no la entrega con el plan actual; no se consulta ni se muestra.';

insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('fmp', 'Financial Modeling Prep', 'https://site.financialmodelingprep.com/', 'api', true, true,
   'API oficial con la clave de Mena. Plan actual: quote-short símbolo por símbolo (índices, divisas, oro, plata, Brent, BTC); sin cobre, sin lotes. Presupuesto diario en FMP_LLAMADAS_DIA.'),
  ('finnhub', 'Finnhub', 'https://finnhub.io/', 'api', true, true,
   'API oficial, plan gratuito (60 llamadas/min, uso personal). Cotizaciones de ETF de EE. UU. en horario de mercado.'),
  ('ecb_api', 'BCE · Data Portal', 'https://data.ecb.europa.eu/', 'api', false, true,
   'API pública del BCE para tipos de referencia (facilidad de depósito).'),
  ('fed_h15', 'Reserva Federal · H.15', 'https://www.federalreserve.gov/releases/h15/', 'api', false, true,
   'Descarga oficial de datos (Data Download Program). robots.txt: no publicado (404).'),
  ('bcrd', 'Banco Central RD · portada', 'https://www.bancentral.gov.do/', 'html', false, true,
   'USD/DOP del día (compra y venta) en la portada. Sin robots.txt real (responde HTML). Lectura 2 veces al día.'),
  ('bcrd_excel', 'Banco Central RD · estadísticas (Excel)', 'https://www.bancentral.gov.do/a/CustomView/2536-sector-monetario-y-financiero', 'xlsx', false, true,
   'Series oficiales en Excel: tasa del dólar, TPM y tasas activas y pasivas. Lectura 1 vez al día.'),
  ('credito_publico', 'Dirección General de Crédito Público', 'https://www.creditopublico.gob.do/emisiones/subastas', 'html', false, true,
   'Resultados de subastas de bonos del Gobierno. Sin robots.txt real.'),
  ('simv', 'SIMV · Superintendencia del Mercado de Valores', 'https://simv.gob.do/', 'rss', false, true,
   'La página de resoluciones y robots.txt responden 403 (Cloudflare): no se leen. El feed RSS público sí responde y es el único punto que se consulta.'),
  ('micm', 'MICM · precios de combustibles', 'https://micm.gob.do/', 'rss', false, true,
   'robots.txt permite todo. Los avisos semanales se publican los viernes en su feed RSS.'),
  ('gdelt', 'GDELT Project', 'https://www.gdeltproject.org/', 'api', false, true,
   'DOC 2.0 API gratuita. Límite estricto por IP: una consulta cada 5 s o más.'),
  ('fed_rss', 'Reserva Federal · comunicados', 'https://www.federalreserve.gov/feeds/press_all.xml', 'rss', false, true, null),
  ('bce_rss', 'BCE · comunicados', 'https://www.ecb.europa.eu/rss/press.html', 'rss', false, true, 'robots.txt pide Crawl-delay: 5.'),
  ('boj_rss', 'Banco de Japón · novedades', 'https://www.boj.or.jp/en/rss/whatsnew.xml', 'rss', false, true, null),
  ('boe_rss', 'Banco de Inglaterra · noticias', 'https://www.bankofengland.co.uk/rss/news', 'rss', false, true, null),
  ('bis_rss', 'BIS · comunicados', 'https://www.bis.org/doclist/all_pressrels.rss', 'rss', false, true, null),
  ('tesoro_prensa', 'Tesoro de EE. UU. · comunicados', 'https://home.treasury.gov/news/press-releases', 'html', false, true, 'robots.txt: Allow /.'),
  ('cepal', 'CEPAL · comunicados', 'https://www.cepal.org/es/comunicados', 'html', false, true, 'Sin feed RSS público encontrado; se lee la lista de comunicados.'),
  ('imf', 'FMI · noticias', 'https://www.imf.org/en/News', 'rss', false, false, 'El feed responde 403 a lectura automática (15 oct 2026). No se esquiva.'),
  ('oecd', 'OCDE · noticias', 'https://www.oecd.org/en/about/news.html', 'rss', false, false, 'Responde 403 a lectura automática (15 oct 2026). No se esquiva.'),
  ('ofac', 'OFAC · acciones recientes', 'https://ofac.treasury.gov/recent-actions', 'rss', false, false, 'Responde 403 a lectura automática (15 oct 2026). No se esquiva.'),
  ('sec_edgar', 'SEC EDGAR · índice diario', 'https://www.sec.gov/Archives/edgar/daily-index/', 'html', false, true,
   'robots.txt prohíbe /cgi-bin (feeds Atom); los índices diarios en /Archives/edgar/daily-index/ están permitidos. Exige User-Agent con correo.'),
  ('manual', 'Carga manual de Mena', 'https://strategya.local/carga', 'manual', false, false,
   'Datos que ninguna fuente entrega de forma automática y legítima. Cada dato lleva su enlace de origen.');

-- ───────────────────────── Mercados (FMP: nivel real) ─────────────────────────
insert into mercado.series (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, sustituto_de, meta) values
  ('IDX_SPX',     'S&P 500',              'S&P 500',   'indice', 'puntos', 'USD', 'fmp', 'intradia', 120, 201, null, '{"simbolo":"^GSPC","mercado":"us_acciones","lat":40.71,"lon":-74.01,"pais":"EE. UU."}'),
  ('IDX_DJI',     'Dow Jones Industrial', 'Dow',       'indice', 'puntos', 'USD', 'fmp', 'intradia', 120, 202, null, '{"simbolo":"^DJI","mercado":"us_acciones","lat":40.71,"lon":-74.01,"pais":"EE. UU."}'),
  ('IDX_IXIC',    'Nasdaq Composite',     'Nasdaq',    'indice', 'puntos', 'USD', 'fmp', 'intradia', 120, 203, null, '{"simbolo":"^IXIC","mercado":"us_acciones","lat":40.71,"lon":-74.01,"pais":"EE. UU."}'),
  ('IDX_RUT',     'Russell 2000',         'Russell',   'indice', 'puntos', 'USD', 'fmp', 'intradia', 120, 204, null, '{"simbolo":"^RUT","mercado":"us_acciones","lat":40.71,"lon":-74.01,"pais":"EE. UU."}'),
  ('IDX_STOXX50E','Euro Stoxx 50',        'Stoxx 50',  'indice', 'puntos', 'EUR', 'fmp', 'intradia', 120, 205, null, '{"simbolo":"^STOXX50E","mercado":"europa","lat":50.11,"lon":8.68,"pais":"Zona euro"}'),
  ('IDX_FTSE',    'FTSE 100',             'FTSE',      'indice', 'puntos', 'GBP', 'fmp', 'intradia', 120, 206, null, '{"simbolo":"^FTSE","mercado":"europa","lat":51.51,"lon":-0.13,"pais":"Reino Unido"}'),
  ('IDX_GDAXI',   'DAX',                  'DAX',       'indice', 'puntos', 'EUR', 'fmp', 'intradia', 120, 207, null, '{"simbolo":"^GDAXI","mercado":"europa","lat":50.11,"lon":8.68,"pais":"Alemania"}'),
  ('IDX_N225',    'Nikkei 225',           'Nikkei',    'indice', 'puntos', 'JPY', 'fmp', 'intradia', 120, 208, null, '{"simbolo":"^N225","mercado":"asia","lat":35.68,"lon":139.69,"pais":"Japón"}'),
  ('IDX_HSI',     'Hang Seng',            'Hang Seng', 'indice', 'puntos', 'HKD', 'fmp', 'intradia', 120, 209, null, '{"simbolo":"^HSI","mercado":"asia","lat":22.32,"lon":114.17,"pais":"Hong Kong"}'),
  ('ORO',         'Oro',                  'Oro',       'metal',  'US$/oz', 'USD', 'fmp', 'intradia', 120, 301, null, '{"simbolo":"GCUSD","mercado":"futuros"}'),
  ('PLATA',       'Plata',                'Plata',     'metal',  'US$/oz', 'USD', 'fmp', 'intradia', 120, 302, null, '{"simbolo":"SIUSD","mercado":"futuros"}'),
  ('BRENT',       'Petróleo Brent',       'Brent',     'energia','US$/bbl','USD', 'fmp', 'intradia', 120, 401, null, '{"simbolo":"BZUSD","mercado":"futuros"}'),
  ('WTI',         'Petróleo WTI',         'WTI',       'energia','US$/bbl','USD', 'fmp', 'intradia', 120, 402, null, '{"simbolo":"CLUSD","mercado":"futuros"}'),
  ('GAS_NATURAL', 'Gas natural (Henry Hub)','Gas nat.','energia','US$/MMBtu','USD','fmp','intradia', 120, 403, null, '{"simbolo":"NGUSD","mercado":"futuros"}'),
  ('EURUSD',      'Euro / Dólar',         'EUR/USD',   'divisa', 'US$ por €', 'USD', 'fmp', 'intradia', 120, 501, null, '{"simbolo":"EURUSD","mercado":"fx"}'),
  ('USDJPY',      'Dólar / Yen',          'USD/JPY',   'divisa', '¥ por US$', 'JPY', 'fmp', 'intradia', 120, 502, null, '{"simbolo":"USDJPY","mercado":"fx"}'),
  ('DXY',         'Índice dólar (DXY)',   'DXY',       'divisa', 'puntos', 'USD', 'fmp', 'intradia', 120, 503, null, '{"simbolo":"DX-Y.NYB","mercado":"fx"}'),
  ('BTC',         'Bitcoin',              'BTC',       'cripto', 'US$',    'USD', 'fmp', 'intradia', 120, 601, null, '{"simbolo":"BTCUSD","mercado":"cripto"}');

-- ───────────────────────── ETF en vivo (Finnhub) ─────────────────────────
-- El cobre entra por su ETF (pedido de Mena: «sacarlo del stock»). Se rotula siempre como sustituto.
insert into mercado.series (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, sustituto_de, meta) values
  ('COBRE_CPER', 'Cobre · ETF CPER',            'Cobre (CPER)', 'metal',  'US$', 'USD', 'finnhub', 'intradia', 30, 303, 'Cobre (no hay cotización directa del metal en los planes gratuitos)', '{"simbolo":"CPER","mercado":"us_acciones"}'),
  ('ETF_SPY',    'SPDR S&P 500 (SPY)',          'SPY',  'indice',  'US$', 'USD', 'finnhub', 'intradia', 30, 251, 'S&P 500', '{"simbolo":"SPY","mercado":"us_acciones"}'),
  ('ETF_QQQ',    'Invesco QQQ (Nasdaq 100)',    'QQQ',  'indice',  'US$', 'USD', 'finnhub', 'intradia', 30, 252, 'Nasdaq 100', '{"simbolo":"QQQ","mercado":"us_acciones"}'),
  ('ETF_DIA',    'SPDR Dow Jones (DIA)',        'DIA',  'indice',  'US$', 'USD', 'finnhub', 'intradia', 30, 253, 'Dow Jones', '{"simbolo":"DIA","mercado":"us_acciones"}'),
  ('ETF_IWM',    'iShares Russell 2000 (IWM)',  'IWM',  'indice',  'US$', 'USD', 'finnhub', 'intradia', 30, 254, 'Russell 2000', '{"simbolo":"IWM","mercado":"us_acciones"}'),
  ('ETF_GLD',    'SPDR Gold (GLD)',             'GLD',  'metal',   'US$', 'USD', 'finnhub', 'intradia', 30, 351, 'Oro', '{"simbolo":"GLD","mercado":"us_acciones"}'),
  ('ETF_SLV',    'iShares Silver (SLV)',        'SLV',  'metal',   'US$', 'USD', 'finnhub', 'intradia', 30, 352, 'Plata', '{"simbolo":"SLV","mercado":"us_acciones"}'),
  ('ETF_USO',    'United States Oil (USO)',     'USO',  'energia', 'US$', 'USD', 'finnhub', 'intradia', 30, 451, 'Petróleo WTI', '{"simbolo":"USO","mercado":"us_acciones"}'),
  ('ETF_BNO',    'United States Brent (BNO)',   'BNO',  'energia', 'US$', 'USD', 'finnhub', 'intradia', 30, 452, 'Petróleo Brent', '{"simbolo":"BNO","mercado":"us_acciones"}'),
  ('ETF_UNG',    'United States Nat. Gas (UNG)','UNG',  'energia', 'US$', 'USD', 'finnhub', 'intradia', 30, 453, 'Gas natural', '{"simbolo":"UNG","mercado":"us_acciones"}'),
  ('ETF_UUP',    'Invesco DB US Dollar (UUP)',  'UUP',  'divisa',  'US$', 'USD', 'finnhub', 'intradia', 30, 551, 'Índice dólar', '{"simbolo":"UUP","mercado":"us_acciones"}'),
  ('ETF_IBIT',   'iShares Bitcoin (IBIT)',      'IBIT', 'cripto',  'US$', 'USD', 'finnhub', 'intradia', 30, 651, 'Bitcoin', '{"simbolo":"IBIT","mercado":"us_acciones"}');

-- ───────────────────────── Tasas de política ─────────────────────────
insert into mercado.series (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, meta) values
  ('TASA_FED_SUP', 'Fed · rango objetivo (techo)', 'Fed techo', 'tasa', '%', 'USD', 'fed_h15', 'eventual', 525600, 701, '{"serie_h15":"DFEDTARU"}'),
  ('TASA_FED_INF', 'Fed · rango objetivo (piso)',  'Fed piso',  'tasa', '%', 'USD', 'fed_h15', 'eventual', 525600, 702, '{"serie_h15":"DFEDTARL"}'),
  ('TASA_BCE_DEP', 'BCE · facilidad de depósito',  'BCE',       'tasa', '%', 'EUR', 'ecb_api', 'eventual', 525600, 703, '{"clave_ecb":"FM.D.U2.EUR.4F.KR.DFR.LEV"}'),
  ('TASA_BOJ',     'BoJ · tasa de política',       'BoJ',       'tasa', '%', 'JPY', 'manual',  'eventual', 525600, 704, '{}');

-- ───────────────────────── República Dominicana ─────────────────────────
insert into mercado.series (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, meta) values
  ('USDDOP_COMPRA', 'Dólar BCRD · compra', 'US$ compra', 'rd', 'RD$ por US$', 'DOP', 'bcrd', 'diaria', 5760, 801, '{"lat":18.47,"lon":-69.89,"pais":"República Dominicana"}'),
  ('USDDOP_VENTA',  'Dólar BCRD · venta',  'US$ venta',  'rd', 'RD$ por US$', 'DOP', 'bcrd', 'diaria', 5760, 802, '{"lat":18.47,"lon":-69.89,"pais":"República Dominicana"}'),
  ('TPM_BCRD',      'Tasa de política monetaria (BCRD)', 'TPM', 'rd', '%', 'DOP', 'bcrd_excel', 'eventual', 525600, 803, '{}'),
  ('INFLACION_RD',  'Inflación interanual RD (IPC)', 'Inflación', 'rd', '%', 'DOP', 'bcrd', 'mensual', 64800, 804, '{}');

-- Esquema personal (Mena Capital y Calendario de Caja): cada módulo agrega sus tablas con RLS.
grant usage on schema personal to authenticated, service_role;
