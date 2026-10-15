-- Strategya · Fase 1 · catálogo inicial
-- Fuente de punta a punta: curva diaria del Tesoro de EE. UU.
-- Más las dos fuentes que prohíben la lectura automática (quedan solo como carga manual).

insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('tesoro_eeuu',
   'Tesoro de EE. UU. · Daily Treasury Par Yield Curve Rates',
   'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_yield_curve',
   'xml', false, true,
   'Feed XML oficial (home.treasury.gov/treasury-daily-interest-rate-xml-feed), un mes por consulta. '
   'robots.txt: «Allow: /» (verificado el 15 oct 2026). Se consulta 3 veces por día hábil.'),
  ('bvrd_calculadora',
   'BVRD · calculadora',
   'https://www.calculadora.apislab.bvrd.com.do/',
   'manual', false, false,
   'El sitio bloquea la lectura automática. No se esquiva: los datos entran por carga manual.'),
  ('bhd_fondos',
   'BHD Fondos',
   'https://bhdfondos.com.do/',
   'manual', false, false,
   'El sitio prohíbe la lectura automática. No se esquiva: los datos entran por carga manual.');

-- 14 plazos de la curva par. meta.meses ordena el eje; meta.campo es el elemento del XML.
-- max_antiguedad_min = 5760 (4 días): cubre fin de semana + un feriado sin pintar «desactualizado».
insert into mercado.series
  (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, meta)
values
  ('UST_1M',   'Tesoro EE. UU. 1 mes',     '1M',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 101, '{"meses": 1,   "campo": "BC_1MONTH"}'),
  ('UST_1_5M', 'Tesoro EE. UU. 6 semanas', '1.5M', 'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 102, '{"meses": 1.5, "campo": "BC_1_5MONTH"}'),
  ('UST_2M',   'Tesoro EE. UU. 2 meses',   '2M',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 103, '{"meses": 2,   "campo": "BC_2MONTH"}'),
  ('UST_3M',   'Tesoro EE. UU. 3 meses',   '3M',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 104, '{"meses": 3,   "campo": "BC_3MONTH"}'),
  ('UST_4M',   'Tesoro EE. UU. 4 meses',   '4M',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 105, '{"meses": 4,   "campo": "BC_4MONTH"}'),
  ('UST_6M',   'Tesoro EE. UU. 6 meses',   '6M',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 106, '{"meses": 6,   "campo": "BC_6MONTH"}'),
  ('UST_1A',   'Tesoro EE. UU. 1 año',     '1A',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 107, '{"meses": 12,  "campo": "BC_1YEAR"}'),
  ('UST_2A',   'Tesoro EE. UU. 2 años',    '2A',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 108, '{"meses": 24,  "campo": "BC_2YEAR"}'),
  ('UST_3A',   'Tesoro EE. UU. 3 años',    '3A',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 109, '{"meses": 36,  "campo": "BC_3YEAR"}'),
  ('UST_5A',   'Tesoro EE. UU. 5 años',    '5A',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 110, '{"meses": 60,  "campo": "BC_5YEAR"}'),
  ('UST_7A',   'Tesoro EE. UU. 7 años',    '7A',   'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 111, '{"meses": 84,  "campo": "BC_7YEAR"}'),
  ('UST_10A',  'Tesoro EE. UU. 10 años',   '10A',  'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 112, '{"meses": 120, "campo": "BC_10YEAR"}'),
  ('UST_20A',  'Tesoro EE. UU. 20 años',   '20A',  'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 113, '{"meses": 240, "campo": "BC_20YEAR"}'),
  ('UST_30A',  'Tesoro EE. UU. 30 años',   '30A',  'tasa', '%', 'USD', 'tesoro_eeuu', 'diaria', 5760, 114, '{"meses": 360, "campo": "BC_30YEAR"}');
