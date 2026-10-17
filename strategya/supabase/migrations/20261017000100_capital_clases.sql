-- Strategya · Mena Capital · las 4 clases de instrumentos
--
-- Mena trabaja con exactamente 4 clases: Efectivo, Cuentas de Ahorro, Renta Fija y Renta Variable.
-- Ids en la base (el contrato con lib/capital/tipos.ts · CLASES):
--   efectivo      → Efectivo
--   ahorros       → Cuentas de Ahorro
--   rentafija     → Renta Fija       (bonos, certificados, mutuos, fondos de renta fija)
--   rentavariable → Renta Variable   (acciones, ETF, fondos de renta variable; antes «accionesusa»)
--
-- Esta migración no trae cifras de nadie: solo traduce lo que ya esté guardado.

-- ---------------------------------------------------------------------------
-- Traducción de nombres de clase (los del artefacto y los comunes) a las 4
-- ---------------------------------------------------------------------------

-- Devuelve el id de una de las 4 clases, o el texto tal cual si no lo reconoce (el CHECK lo rechaza).
-- Misma tabla que ALIAS_CLASE en lib/capital/tipos.ts. «fondo» a secas o «mixto» son ambiguos: no se
-- traducen y la importación falla con el motivo.
create function personal.clase_capital(p_clase text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case regexp_replace(lower(translate(coalesce(p_clase, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '[^a-z0-9]', '', 'g')
    when 'efectivo' then 'efectivo'
    when 'cash' then 'efectivo'
    when 'caja' then 'efectivo'
    when 'billetera' then 'efectivo'
    when 'ahorros' then 'ahorros'
    when 'ahorro' then 'ahorros'
    when 'cuentasdeahorro' then 'ahorros'
    when 'cuentadeahorro' then 'ahorros'
    when 'cuentasdeahorros' then 'ahorros'
    when 'cuentadeahorros' then 'ahorros'
    when 'ahorrosbancarios' then 'ahorros'
    when 'cuentaahorro' then 'ahorros'
    when 'rentafija' then 'rentafija'
    when 'rentafijard' then 'rentafija'
    when 'bono' then 'rentafija'
    when 'bonos' then 'rentafija'
    when 'certificado' then 'rentafija'
    when 'certificados' then 'rentafija'
    when 'certificadofinanciero' then 'rentafija'
    when 'fondorentafija' then 'rentafija'
    when 'fondoderentafija' then 'rentafija'
    when 'fondosderentafija' then 'rentafija'
    when 'rentavariable' then 'rentavariable'
    when 'accionesusa' then 'rentavariable'
    when 'accioneseeuu' then 'rentavariable'
    when 'acciones' then 'rentavariable'
    when 'accion' then 'rentavariable'
    when 'etf' then 'rentavariable'
    when 'etfs' then 'rentavariable'
    when 'fondorentavariable' then 'rentavariable'
    when 'fondoderentavariable' then 'rentavariable'
    when 'fondosderentavariable' then 'rentavariable'
    else p_clase
  end;
$$;
comment on function personal.clase_capital(text) is
  'Traduce un nombre de clase (artefacto Mena Capital o común) a efectivo | ahorros | rentafija | rentavariable.';

grant execute on function personal.clase_capital(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Instrumentos guardados: mapeo y nueva restricción
-- ---------------------------------------------------------------------------

alter table personal.activos drop constraint if exists activos_clase_check;
update personal.activos set clase = personal.clase_capital(clase) where clase is distinct from personal.clase_capital(clase);
alter table personal.activos add constraint activos_clase_check
  check (clase in ('efectivo', 'ahorros', 'rentafija', 'rentavariable'));
comment on column personal.activos.clase is
  'Una de las 4 clases: efectivo (Efectivo), ahorros (Cuentas de Ahorro), rentafija (Renta Fija), rentavariable (Renta Variable).';

-- La estructura de renta fija (acumula / cupón) solo tiene sentido en Renta Fija.
update personal.activos set tipo_rf = null where clase <> 'rentafija' and tipo_rf is not null;

-- ---------------------------------------------------------------------------
-- Metas de la política (parametros.datos.metaAsignacion) por las 4 clases
-- ---------------------------------------------------------------------------

-- Cada meta guardada con un nombre anterior pasa a su clase nueva; si dos caen en la misma, se suman.
-- Los números siguen como TEXTO decimal (numeric → text, sin float). Las 4 claves quedan presentes.
update personal.parametros p
set datos = jsonb_set(p.datos, '{metaAsignacion}', m.metas, true),
    actualizado_en = now()
from (
  select x.id,
         jsonb_build_object(
           'efectivo', coalesce(sum(x.v) filter (where x.clase = 'efectivo'), 0)::text,
           'ahorros', coalesce(sum(x.v) filter (where x.clase = 'ahorros'), 0)::text,
           'rentafija', coalesce(sum(x.v) filter (where x.clase = 'rentafija'), 0)::text,
           'rentavariable', coalesce(sum(x.v) filter (where x.clase = 'rentavariable'), 0)::text
         ) as metas
  from (
    select q.id, personal.clase_capital(e.key) as clase,
           case when jsonb_typeof(e.value) in ('string', 'number') then nullif(e.value #>> '{}', '')::numeric end as v
    from personal.parametros q
    cross join lateral jsonb_each(case when jsonb_typeof(q.datos -> 'metaAsignacion') = 'object' then q.datos -> 'metaAsignacion' else '{}'::jsonb end) e
  ) x
  group by x.id
) m
where p.id = m.id;

-- ---------------------------------------------------------------------------
-- Símbolos para la ingesta de precios: ahora la Renta Variable
-- ---------------------------------------------------------------------------

create or replace function mercado.simbolos_cartera()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct a.simbolo order by a.simbolo), '{}'::text[])
  from personal.activos a
  where a.clase = 'rentavariable' and a.simbolo is not null;
$$;
revoke all on function mercado.simbolos_cartera() from public, anon, authenticated;
grant execute on function mercado.simbolos_cartera() to service_role;

-- ---------------------------------------------------------------------------
-- Importación: traduce las clases del archivo a las 4 (misma firma y mismos permisos)
-- ---------------------------------------------------------------------------

create or replace function personal.importar_capital(p_datos jsonb)
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
    select x.id, personal.clase_capital(x.clase), x.nombre, coalesce(x.institucion, ''), nullif(x.simbolo, ''), x.moneda, x.cantidad,
           coalesce(x.precio, 1), coalesce(x.tasa, 0), x.vencimiento,
           case when personal.clase_capital(x.clase) = 'rentafija' then x.tipo_rf end, coalesce(x.orden, 0)
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

revoke all on function personal.importar_capital(jsonb) from public, anon;
grant execute on function personal.importar_capital(jsonb) to authenticated;
