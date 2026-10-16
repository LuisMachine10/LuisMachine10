-- Strategya · Fase 3 · República Dominicana
--
-- Fuentes (ya en el catálogo): bcrd (portada), bcrd_excel, credito_publico, simv (solo el feed RSS),
-- micm (feed RSS) y manual. Esta migración agrega:
--   · Series de tasas activas y pasivas del BCRD (TASA_ACT_*, TASA_PAS_*), inflación subyacente y
--     precios de combustibles (COMB_*).
--   · Columnas descripcion/origen en mercado.emisiones_rd.
--   · mercado.fondos_rendimientos: rendimientos de fondos de inversión por SAFI (carga manual).
--   · Funciones de carga manual (SECURITY DEFINER con verificación de mercado.es_autorizado()).
--   · Horarios de las tareas.
--
-- Convenciones de fecha: dato mensual = último día del mes (inflación, tasas); la TPM se fecha el
-- primer día del mes en que rige; combustibles = primer día de la semana de vigencia.

-- ───────────────────────── Series ─────────────────────────
-- max_antiguedad_min: tasas mensuales del BCRD 100 días (salen ~6 semanas después del mes);
-- promedio ponderado e inflación (portada) 50 días; combustibles 10 días (aviso semanal).
insert into mercado.series (id, nombre, nombre_corto, categoria, unidad, moneda, fuente_id, frecuencia, max_antiguedad_min, orden, meta) values
  ('INFLACION_SUB_RD',          'Inflación subyacente interanual RD', 'Subyacente', 'rd', '%', 'DOP', 'bcrd', 'mensual', 72000, 805, '{}'),
  ('TASA_ACT_MN_PROMEDIO',      'Tasa activa promedio ponderado · bancos múltiples (RD$)', 'Activa B.M.', 'tasa', '%', 'DOP', 'bcrd', 'mensual', 72000, 811, '{"grupo":"activa","moneda":"MN"}'),
  ('TASA_PAS_MN_PROMEDIO',      'Tasa pasiva promedio ponderado · bancos múltiples (RD$)', 'Pasiva B.M.', 'tasa', '%', 'DOP', 'bcrd', 'mensual', 72000, 812, '{"grupo":"pasiva","moneda":"MN"}'),

  ('TASA_ACT_MN_TARJETA',       'Tasa activa RD$ · consumo con tarjeta de crédito', 'Tarjeta',      'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 821, '{"grupo":"activa","moneda":"MN","cuadro":"V.4"}'),
  ('TASA_ACT_MN_CONSUMO',       'Tasa activa RD$ · consumo (préstamos personales)', 'Consumo',      'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 822, '{"grupo":"activa","moneda":"MN","cuadro":"V.4"}'),
  ('TASA_ACT_MN_COMERCIAL',     'Tasa activa RD$ · comercio',                        'Comercial',    'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 823, '{"grupo":"activa","moneda":"MN","cuadro":"V.4"}'),
  ('TASA_ACT_MN_HIPOTECARIA',   'Tasa activa RD$ · vivienda (hipotecaria)',          'Hipotecaria',  'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 824, '{"grupo":"activa","moneda":"MN","cuadro":"V.4"}'),
  ('TASA_ACT_MN_INTERBANCARIA', 'Tasa interbancaria RD$ (ponderada)',                'Interbancaria','tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 825, '{"grupo":"activa","moneda":"MN","cuadro":"V.4"}'),
  ('TASA_ACT_ME_TARJETA',       'Tasa activa US$ · consumo con tarjeta de crédito',  'Tarjeta',      'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 831, '{"grupo":"activa","moneda":"ME","cuadro":"V.5"}'),
  ('TASA_ACT_ME_CONSUMO',       'Tasa activa US$ · consumo (préstamos personales)',  'Consumo',      'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 832, '{"grupo":"activa","moneda":"ME","cuadro":"V.5"}'),
  ('TASA_ACT_ME_COMERCIAL',     'Tasa activa US$ · comercio',                        'Comercial',    'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 833, '{"grupo":"activa","moneda":"ME","cuadro":"V.5"}'),
  ('TASA_ACT_ME_HIPOTECARIA',   'Tasa activa US$ · vivienda (hipotecaria)',          'Hipotecaria',  'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 834, '{"grupo":"activa","moneda":"ME","cuadro":"V.5"}'),

  ('TASA_PAS_MN_AHORRO',        'Tasa pasiva RD$ · ahorro',                 'Ahorro',   'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 841, '{"grupo":"pasiva","moneda":"MN","cuadro":"V.6","dias":0}'),
  ('TASA_PAS_MN_30D',           'Tasa pasiva RD$ · plazo un mes',           '30 días',  'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 842, '{"grupo":"pasiva","moneda":"MN","cuadro":"V.6","dias":30}'),
  ('TASA_PAS_MN_180D',          'Tasa pasiva RD$ · plazo seis meses',       '180 días', 'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 843, '{"grupo":"pasiva","moneda":"MN","cuadro":"V.6","dias":180}'),
  ('TASA_PAS_MN_360D',          'Tasa pasiva RD$ · plazo un año',           '1 año',    'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 844, '{"grupo":"pasiva","moneda":"MN","cuadro":"V.6","dias":360}'),
  ('TASA_PAS_MN_MAS360D',       'Tasa pasiva RD$ · plazo más de un año',    '+1 año',   'tasa', '%', 'DOP', 'bcrd_excel', 'mensual', 144000, 845, '{"grupo":"pasiva","moneda":"MN","cuadro":"V.6","dias":361}'),
  ('TASA_PAS_ME_AHORRO',        'Tasa pasiva US$ · ahorro',                 'Ahorro',   'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 851, '{"grupo":"pasiva","moneda":"ME","cuadro":"V.7","dias":0}'),
  ('TASA_PAS_ME_30D',           'Tasa pasiva US$ · plazo un mes',           '30 días',  'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 852, '{"grupo":"pasiva","moneda":"ME","cuadro":"V.7","dias":30}'),
  ('TASA_PAS_ME_180D',          'Tasa pasiva US$ · plazo seis meses',       '180 días', 'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 853, '{"grupo":"pasiva","moneda":"ME","cuadro":"V.7","dias":180}'),
  ('TASA_PAS_ME_360D',          'Tasa pasiva US$ · plazo un año',           '1 año',    'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 854, '{"grupo":"pasiva","moneda":"ME","cuadro":"V.7","dias":360}'),
  ('TASA_PAS_ME_MAS360D',       'Tasa pasiva US$ · plazo más de un año',    '+1 año',   'tasa', '%', 'USD', 'bcrd_excel', 'mensual', 144000, 855, '{"grupo":"pasiva","moneda":"ME","cuadro":"V.7","dias":361}'),

  ('COMB_GASOLINA_PREMIUM', 'Gasolina premium',              'Premium',     'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 861, '{"principal":true}'),
  ('COMB_GASOLINA_REGULAR', 'Gasolina regular',              'Regular',     'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 862, '{"principal":true}'),
  ('COMB_GASOIL_OPTIMO',    'Gasoil óptimo',                 'Gasoil ópt.', 'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 863, '{"principal":true}'),
  ('COMB_GASOIL_REGULAR',   'Gasoil regular',                'Gasoil reg.', 'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 864, '{"principal":true}'),
  ('COMB_GLP',              'Gas licuado de petróleo (GLP)', 'GLP',         'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 865, '{"principal":true}'),
  ('COMB_AVTUR',            'Avtur',                         'Avtur',       'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 866, '{}'),
  ('COMB_KEROSENE',         'Kerosene',                      'Kerosene',    'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 867, '{}'),
  ('COMB_FUEL_OIL_6',       'Fuel oil #6',                   'Fuel oil #6', 'energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 868, '{}'),
  ('COMB_FUEL_OIL_1S',      'Fuel oil 1%S',                  'Fuel oil 1%S','energia', 'RD$/galón', 'DOP', 'micm', 'semanal', 14400, 869, '{}'),
  ('COMB_GAS_NATURAL',      'Gas natural',                   'Gas natural', 'energia', 'RD$/m³',    'DOP', 'micm', 'semanal', 14400, 870, '{}');

update mercado.fuentes
   set notas_de_uso = 'La página lista cada resultado de subasta como PDF (fecha y enlace) y un Consolidado en Excel. '
                      'Monto y tasa de corte NO están en el HTML: se guardan sin cifras, con enlace al PDF oficial. Sin robots.txt real.'
 where id = 'credito_publico';

-- ───────────────────────── Emisiones ─────────────────────────
alter table mercado.emisiones_rd add column if not exists descripcion text;
alter table mercado.emisiones_rd add column if not exists origen text not null default 'automatica';
alter table mercado.emisiones_rd drop constraint if exists emisiones_rd_origen_check;
alter table mercado.emisiones_rd add constraint emisiones_rd_origen_check check (origen in ('automatica', 'manual'));
comment on column mercado.emisiones_rd.origen is
  'automatica = la escribió la ingesta (Crédito Público); manual = la cargó Mena (resoluciones SIMV, hechos BVRD).';
create index if not exists emisiones_rd_fecha on mercado.emisiones_rd (fecha desc);

-- ───────────────────────── Fondos de inversión (carga manual) ─────────────────────────
create table mercado.fondos_rendimientos (
  id           bigint generated always as identity primary key,
  safi         text not null check (length(btrim(safi)) > 0),
  fondo        text not null check (length(btrim(fondo)) > 0),
  moneda       text not null check (moneda in ('DOP', 'USD')),
  plazo_dias   smallint not null check (plazo_dias in (30, 360, 365)),
  rendimiento  numeric not null check (rendimiento between -100 and 1000),
  fecha_corte  date not null,
  url_fuente   text not null check (url_fuente ~ '^https?://[^[:space:]]+$'),
  nota         text,
  creado_por   uuid default auth.uid() references auth.users (id) on delete set null,
  creado_en    timestamptz not null default now(),
  unique (safi, fondo, moneda, plazo_dias, fecha_corte)
);

comment on table mercado.fondos_rendimientos is
  'Rendimiento anualizado (%) de fondos de inversión por SAFI, base 30/360/365 días. Lo carga Mena desde la fuente oficial (enlace obligatorio).';

create index fondos_rendimientos_corte on mercado.fondos_rendimientos (fecha_corte desc);

grant select, insert, update, delete on mercado.fondos_rendimientos to authenticated;
grant all on mercado.fondos_rendimientos to service_role;
grant usage on sequence mercado.fondos_rendimientos_id_seq to authenticated, service_role;

alter table mercado.fondos_rendimientos enable row level security;
create policy "autorizado lee" on mercado.fondos_rendimientos
  for select to authenticated using ((select mercado.es_autorizado()));
create policy "autorizado carga" on mercado.fondos_rendimientos
  for insert to authenticated with check ((select mercado.es_autorizado()));
create policy "autorizado corrige" on mercado.fondos_rendimientos
  for update to authenticated using ((select mercado.es_autorizado())) with check ((select mercado.es_autorizado()));
create policy "autorizado borra" on mercado.fondos_rendimientos
  for delete to authenticated using ((select mercado.es_autorizado()));

alter publication supabase_realtime add table mercado.fondos_rendimientos;

-- ───────────────────────── Carga manual de un dato de serie ─────────────────────────
-- Registra el dato en mercado.carga_manual (bitácora) y en mercado.observaciones con fuente_id
-- 'manual' y el enlace de origen, para que la terminal lo muestre con su SelloFuente.
-- No reemplaza un dato oficial ya leído de forma automática para la misma fecha.
create function mercado.cargar_dato_manual(
  p_serie_id text,
  p_fecha    date,
  p_valor    text,
  p_url      text,
  p_nota     text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valor  numeric;
  v_nombre text;
  v_previa record;
  v_id     bigint;
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado para cargar datos' using errcode = '42501';
  end if;

  select s.nombre into v_nombre from mercado.series s where s.id = p_serie_id;
  if v_nombre is null then
    raise exception 'Serie desconocida: %', coalesce(p_serie_id, '(vacía)');
  end if;
  if p_valor is null or btrim(p_valor) !~ '^-?\d+(\.\d+)?$' then
    raise exception 'El valor debe ser un número con punto decimal (p. ej. 5.25): «%»', coalesce(p_valor, '');
  end if;
  v_valor := btrim(p_valor)::numeric;
  if p_fecha is null or p_fecha < date '1950-01-01'
     or p_fecha > (now() at time zone 'America/Santo_Domingo')::date + 7 then
    raise exception 'Fecha del dato inválida: %', p_fecha;
  end if;
  if p_url is null or btrim(p_url) !~ '^https?://[^[:space:]]+$' then
    raise exception 'Falta el enlace de la fuente (http:// o https://)';
  end if;

  select o.fuente_id, o.valor into v_previa
    from mercado.observaciones o
   where o.serie_id = p_serie_id and o.fecha_dato = p_fecha and o.hora_dato is null;
  if found and v_previa.fuente_id <> 'manual' then
    raise exception 'Ya hay un dato oficial de «%» para el %: % (fuente %). No se reemplaza a mano.',
      v_nombre, p_fecha, v_previa.valor, v_previa.fuente_id;
  end if;

  insert into mercado.carga_manual (dato, serie_id, valor, fecha, nota, url_fuente)
  values (v_nombre, p_serie_id, v_valor, p_fecha, nullif(btrim(p_nota), ''), btrim(p_url))
  returning id into v_id;

  insert into mercado.observaciones as o (serie_id, valor, fecha_dato, hora_dato, fuente_id, url_dato, estado, cambio_origen)
  values (p_serie_id, v_valor, p_fecha, null, 'manual', btrim(p_url), 'ok', 'calculado')
  on conflict (serie_id, fecha_dato, hora_dato) do update
    set valor = excluded.valor, url_dato = excluded.url_dato, recogido_en = now(), estado = 'ok';

  -- Cambio contra la observación diaria anterior (misma regla que registrar_observaciones).
  update mercado.observaciones o
     set cambio = c.cambio, cambio_pct = c.cambio_pct
    from (
      select x.id,
             x.valor - lag(x.valor) over w as cambio,
             case when lag(x.valor) over w is null or lag(x.valor) over w = 0 then null
                  else round((x.valor - lag(x.valor) over w) / abs(lag(x.valor) over w) * 100, 6) end as cambio_pct
        from mercado.observaciones x
       where x.serie_id = p_serie_id and x.hora_dato is null
      window w as (partition by x.serie_id order by x.fecha_dato)
    ) c
   where o.id = c.id
     and o.cambio_origen = 'calculado'
     and (o.cambio, o.cambio_pct) is distinct from (c.cambio, c.cambio_pct);

  return v_id;
end;
$$;

revoke all on function mercado.cargar_dato_manual(text, date, text, text, text) from public, anon;
grant execute on function mercado.cargar_dato_manual(text, date, text, text, text) to authenticated, service_role;

-- ───────────────────────── Carga manual de una emisión (SIMV / BVRD) ─────────────────────────
create function mercado.cargar_emision_manual(
  p_fuente      text,
  p_numero      text,
  p_fecha       date,
  p_url         text,
  p_emisor      text default null,
  p_instrumento text default null,
  p_monto       text default null,
  p_moneda      text default null,
  p_tasa        text default null,
  p_descripcion text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     bigint;
  v_origen text;
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado para cargar datos' using errcode = '42501';
  end if;
  if p_fuente is null or p_fuente not in ('SIMV', 'BVRD') then
    raise exception 'A mano solo se cargan resoluciones de la SIMV o hechos de la BVRD (recibido: %)', coalesce(p_fuente, '(vacía)');
  end if;
  if p_numero is null or length(btrim(p_numero)) = 0 then
    raise exception 'Falta el número de la resolución o del hecho relevante';
  end if;
  if p_fecha is null or p_fecha < date '1990-01-01'
     or p_fecha > (now() at time zone 'America/Santo_Domingo')::date + 1 then
    raise exception 'Fecha inválida: %', p_fecha;
  end if;
  if p_url is null or btrim(p_url) !~ '^https?://[^[:space:]]+$' then
    raise exception 'Falta el enlace de la fuente (http:// o https://)';
  end if;
  if nullif(btrim(p_monto), '') is not null and btrim(p_monto) !~ '^\d+(\.\d+)?$' then
    raise exception 'Monto inválido: «%» (sin comas, punto decimal)', p_monto;
  end if;
  if nullif(btrim(p_tasa), '') is not null and btrim(p_tasa) !~ '^-?\d+(\.\d+)?$' then
    raise exception 'Tasa inválida: «%»', p_tasa;
  end if;
  if nullif(btrim(p_moneda), '') is not null and btrim(p_moneda) not in ('DOP', 'USD') then
    raise exception 'Moneda inválida: % (DOP o USD)', p_moneda;
  end if;

  select e.origen into v_origen from mercado.emisiones_rd e where e.fuente = p_fuente and e.numero = btrim(p_numero);
  if v_origen = 'automatica' then
    raise exception 'La emisión % ya la registró la lectura automática; no se reemplaza a mano', p_numero;
  end if;

  insert into mercado.emisiones_rd as e (fuente, numero, emisor, instrumento, monto, moneda, tasa, fecha, url, descripcion, origen)
  values (p_fuente, btrim(p_numero), nullif(btrim(p_emisor), ''), nullif(btrim(p_instrumento), ''),
          nullif(btrim(p_monto), '')::numeric, nullif(btrim(p_moneda), ''), nullif(btrim(p_tasa), '')::numeric,
          p_fecha, btrim(p_url), nullif(btrim(p_descripcion), ''), 'manual')
  on conflict (fuente, numero) do update
    set emisor = excluded.emisor, instrumento = excluded.instrumento, monto = excluded.monto,
        moneda = excluded.moneda, tasa = excluded.tasa, fecha = excluded.fecha, url = excluded.url,
        descripcion = excluded.descripcion, recogido_en = now()
  returning e.id into v_id;
  return v_id;
end;
$$;

revoke all on function mercado.cargar_emision_manual(text, text, date, text, text, text, text, text, text, text) from public, anon;
grant execute on function mercado.cargar_emision_manual(text, text, date, text, text, text, text, text, text, text) to authenticated, service_role;

-- ───────────────────────── Horarios (UTC; RD = UTC−4) ─────────────────────────
-- Portada del BCRD: 9:00 AM y 4:00 PM RD, todos los días.
select cron.schedule('strategya-bcrd-portada-manana', '0 13 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"bcrd-portada"}')$$);
select cron.schedule('strategya-bcrd-portada-tarde',  '0 20 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"bcrd-portada"}')$$);
-- Excel del BCRD: 10:00 AM RD de lunes a viernes.
select cron.schedule('strategya-bcrd-excel',          '0 14 * * 1-5', $$select mercado.invocar_tarea('ingesta', '{"tarea":"bcrd-excel"}')$$);
-- Crédito Público: 11:15 AM RD, todos los días.
select cron.schedule('strategya-credito-publico',     '15 15 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"credito-publico"}')$$);
-- SIMV (solo el feed): 11:45 AM RD, todos los días.
select cron.schedule('strategya-simv',                '45 15 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"simv"}')$$);
-- MICM: el aviso sale el viernes en la tarde. Viernes 7:30 PM RD y sábado 9:30 AM RD.
select cron.schedule('strategya-micm-viernes',        '30 23 * * 5', $$select mercado.invocar_tarea('ingesta', '{"tarea":"micm"}')$$);
select cron.schedule('strategya-micm-sabado',         '30 13 * * 6', $$select mercado.invocar_tarea('ingesta', '{"tarea":"micm"}')$$);
