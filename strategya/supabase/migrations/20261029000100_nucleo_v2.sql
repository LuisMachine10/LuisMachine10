-- Strategya · Núcleo financiero v2 (manual de lógica financiera aprobado por Mena: docs/manual-financiero.md)
--
-- 1. CATÁLOGO DE TIPOS. Cada fila del registro único (personal.activos) tiene un TIPO (efectivo, corriente,
--    ahorro, alto rendimiento, certificado, mutuo/reporto, bono, fondo abierto, fondo cerrado, acción/ETF,
--    fideicomiso, tarjeta, préstamo, otra deuda, bien). El tipo fija el comportamiento por defecto; lo
--    «elegible» lo cambia Mena y queda anotado (cambios_tipo). La moneda es independiente del tipo.
--    Las filas que ya existían reciben su tipo SIN adivinar de más (personal.tipo_inicial, la misma regla que
--    lib/finanzas/catalogo.ts · tipoInicial): clase y subtipo deciden; en renta fija/variable se mira el nombre.
--    Cuando hubo que suponer, tipo_confirmado = false y la pantalla pide confirmarlo.
-- 2. LISTAS CON LÓGICA BANCARIA. personal.tipo_aparece(tipo, débito, formulario, papel) es la tabla de verdad
--    del manual, GENERADA de lib/finanzas/catalogo.ts (scripts/tabla-catalogo.ts). Una prueba compara este
--    archivo con el módulo. Los triggers caja_movimientos_validar y caja_recurrentes_validar rechazan lo que el
--    manual no permite (p. ej. pagar con una inversión). La importación restaura la historia tal cual.
-- 3. TODO EN EL PRESUPUESTO SOLO. personal.enlazar_registro() enlaza al Presupuesto cada fila que paga o recibe
--    (efectivo, cuentas, tarjetas, préstamos y las inversiones de saldo), sin pedirlo. Corre ahora (las filas de
--    hoy) y cada vez que se agrega o cambia una fila. Nada se borra ni se reescribe en el registro.
-- 4. Movimientos hacia/desde inversiones que no viven en el Presupuesto (acciones, fondos por cuotas):
--    registro_destino / registro_origen. Préstamos: cargos dentro de la cuota (seguro…) = gasto aparte que no
--    baja la deuda (cargos, categoria_cargos). El estado de resultados (personal.resultado_mes) los cuenta.
--
-- Sin tablas nuevas en `personal` (las pruebas de esquema fijan la lista): columnas, funciones y triggers.
-- Ninguna cifra de Mena vive en este archivo. RLS: las tablas ya tienen sus políticas.

-- ---------------------------------------------------------------------------
-- 1. Catálogo de tipos en el registro único
-- ---------------------------------------------------------------------------

alter table personal.activos drop constraint if exists activos_subtipo_check;
alter table personal.activos add constraint activos_subtipo_check check (
  subtipo is null
  or (clase = 'ahorros' and subtipo in ('corriente', 'ahorro', 'alto_rendimiento'))
  or (clase = 'otros' and subtipo in ('vehiculo', 'inmueble', 'otro'))
);

alter table personal.activos
  add column tipo            text,
  add column tipo_confirmado boolean not null default false,
  add column tiene_debito    boolean,
  add column paga_a          text references personal.activos (id) on update cascade on delete set null,
  add column retencion       numeric check (retencion >= 0 and retencion <= 1),
  add column comision_admin  numeric check (comision_admin >= 0 and comision_admin <= 1),
  add column plazo_dias      smallint check (plazo_dias between 1 and 3660),
  add column renovaciones    jsonb not null default '[]'::jsonb check (jsonb_typeof(renovaciones) = 'array'),
  add column cambios_tipo    jsonb not null default '{}'::jsonb check (jsonb_typeof(cambios_tipo) = 'object'),
  add column cargos_cuota    numeric check (cargos_cuota >= 0);

comment on column personal.activos.tipo is 'Tipo del catálogo (lib/finanzas/catalogo.ts): efectivo, corriente, ahorro, alto_rendimiento, certificado, mutuo, bono, fondo_abierto, fondo_cerrado, accion_etf, fideicomiso, tarjeta, prestamo, otra_deuda, bien.';
comment on column personal.activos.tipo_confirmado is 'false = el tipo se dedujo al migrar (clase y nombre): la pantalla pide confirmarlo.';
comment on column personal.activos.tiene_debito is 'Solo alto rendimiento: tiene tarjeta de débito (entonces aparece en «¿Con qué pagaste?»).';
comment on column personal.activos.paga_a is 'Cuenta (efectivo o banco) donde caen los intereses, cupones o dividendos de lo que no capitaliza.';
comment on column personal.activos.retencion is 'Retención del interés (fracción). null = la del tipo (certificados bancarios 10 %; puestos de bolsa 0).';
comment on column personal.activos.comision_admin is 'Puesto de bolsa: comisión de administración al año (fracción). null = no confirmado (no se inventa).';
comment on column personal.activos.plazo_dias is 'Certificado o mutuo: días del plazo (mutuo típico: 30).';
comment on column personal.activos.renovaciones is 'Mutuo/reporto: renovaciones que anotó Mena [{fecha, plazoDias, tasa, capitalAnterior, interes, dejaInteres, aporte, capitalNuevo}] (texto decimal).';
comment on column personal.activos.cambios_tipo is 'Lo «elegible» que Mena cambió del comportamiento por defecto del tipo: {campo: {valor, fecha}}.';
comment on column personal.activos.cargos_cuota is 'Préstamo: cargos dentro de la cuota (seguro y otros). Son gasto aparte: no bajan la deuda.';

-- Clases del motor que acepta cada tipo (la primera es la de una fila nueva).
create function personal.clases_de_tipo(p_tipo text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'efectivo' then array['efectivo']
    when 'corriente' then array['ahorros']
    when 'ahorro' then array['ahorros']
    when 'alto_rendimiento' then array['ahorros']
    when 'certificado' then array['rentafija']
    when 'mutuo' then array['rentafija']
    when 'bono' then array['rentafija']
    when 'fondo_abierto' then array['rentafija', 'rentavariable']
    when 'fondo_cerrado' then array['rentafija', 'rentavariable']
    when 'accion_etf' then array['rentavariable']
    when 'fideicomiso' then array['rentafija', 'rentavariable']
    when 'tarjeta' then array['tarjeta']
    when 'prestamo' then array['prestamo']
    when 'otra_deuda' then array['deuda']
    when 'bien' then array['otros']
  end
$$;

create function personal.grupo_fin(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_tipo in ('efectivo', 'corriente', 'ahorro', 'alto_rendimiento') then 'cuenta'
    when p_tipo in ('certificado', 'mutuo', 'bono', 'fondo_abierto', 'fondo_cerrado', 'accion_etf', 'fideicomiso') then 'inversion'
    when p_tipo in ('tarjeta', 'prestamo', 'otra_deuda') then 'deuda'
    when p_tipo = 'bien' then 'bien'
  end
$$;

create function personal.nombre_tipo_fin(p_tipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'efectivo' then 'efectivo' when 'corriente' then 'cuenta corriente' when 'ahorro' then 'cuenta de ahorro'
    when 'alto_rendimiento' then 'cuenta de alto rendimiento' when 'certificado' then 'certificado' when 'mutuo' then 'mutuo o reporto'
    when 'bono' then 'bono' when 'fondo_abierto' then 'fondo abierto' when 'fondo_cerrado' then 'fondo cerrado'
    when 'accion_etf' then 'acción o ETF' when 'fideicomiso' then 'fideicomiso' when 'tarjeta' then 'tarjeta de crédito'
    when 'prestamo' then 'préstamo' when 'otra_deuda' then 'deuda' when 'bien' then 'bien'
  end
$$;

-- Tipo de una fila que ya existía: misma regla que lib/finanzas/catalogo.ts · tipoInicial. [tipo, '1' = seguro].
create function personal.tipo_inicial(p_clase text, p_subtipo text, p_nombre text, p_inst text, p_simbolo text, p_tipo_rf text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  with t as (
    select translate(lower(coalesce(p_nombre, '') || ' ' || coalesce(p_inst, '')), 'áéíóúüñàèìòù', 'aeiouunaeiou') as x
  )
  select case
    when p_clase = 'efectivo' then array['efectivo', '1']
    when p_clase = 'tarjeta' then array['tarjeta', '1']
    when p_clase = 'prestamo' then array['prestamo', '1']
    when p_clase = 'deuda' then array['otra_deuda', '1']
    when p_clase = 'otros' then array['bien', '1']
    when p_clase = 'ahorros' then
      case
        when p_subtipo = 'corriente' then array['corriente', '1']
        when p_subtipo = 'alto_rendimiento' then array['alto_rendimiento', '1']
        when t.x ~ 'alto\s*rendimiento' then array['alto_rendimiento', '0']
        else array['ahorro', case when p_subtipo = 'ahorro' then '1' else '0' end]
      end
    when p_clase = 'rentafija' then
      case
        when t.x ~ 'mutuo|reporto' then array['mutuo', '0']
        when t.x ~ '\ybonos?\y' then array['bono', '0']
        when t.x ~ 'fideicomiso' then array['fideicomiso', '0']
        when t.x ~ 'fondo' then array[case when t.x ~ 'cerrado' then 'fondo_cerrado' else 'fondo_abierto' end, '0']
        when t.x ~ 'certificado|deposito a plazo|\ycd\y' then array['certificado', '0']
        else array[case when p_tipo_rf = 'cupon' then 'bono' else 'certificado' end, '0']
      end
    when p_clase = 'rentavariable' then
      case
        when t.x ~ 'fideicomiso' then array['fideicomiso', '0']
        when t.x ~ 'fondo' then array[case when t.x ~ 'cerrado' then 'fondo_cerrado' else 'fondo_abierto' end, '0']
        else array['accion_etf', case when p_simbolo is not null then '1' else '0' end]
      end
    else array['bien', '0']
  end
  from t
$$;

-- ¿El Presupuesto la usa sola? Cuentas y deudas siempre; inversiones de saldo en renta fija (precio 1), también.
-- Misma regla que lib/finanzas/catalogo.ts · seEnlazaSola (más la clase, que exige personal.caja_cuentas_antes).
create function personal.se_enlaza_sola(p_tipo text, p_precio numeric, p_clase text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case personal.grupo_fin(p_tipo)
    when 'cuenta' then true
    when 'deuda' then true
    when 'inversion' then p_tipo <> 'accion_etf' and p_clase = 'rentafija' and p_precio = 1
    else false
  end
$$;

-- Las filas que ya existían: su tipo (sin tocar nada más). Las de alto rendimiento por nombre pasan a ese subtipo
-- (el Presupuesto las sigue tratando igual: ahorro).
update personal.activos a
set tipo = (personal.tipo_inicial(a.clase, a.subtipo, a.nombre, a.institucion, a.simbolo, a.tipo_rf))[1],
    tipo_confirmado = (personal.tipo_inicial(a.clase, a.subtipo, a.nombre, a.institucion, a.simbolo, a.tipo_rf))[2] = '1';
update personal.activos set subtipo = 'alto_rendimiento' where tipo = 'alto_rendimiento' and clase = 'ahorros' and subtipo is distinct from 'alto_rendimiento';

alter table personal.activos alter column tipo set not null;
alter table personal.activos add constraint activos_tipo_check check (clase = any (personal.clases_de_tipo(tipo)));
alter table personal.activos add constraint activos_debito_check check (tiene_debito is null or tipo = 'alto_rendimiento');
alter table personal.activos add constraint activos_paga_a_check check (paga_a is null or paga_a <> id);
alter table personal.activos add constraint activos_cargos_check check (cargos_cuota is null or clase in ('prestamo', 'deuda'));

-- Antes de guardar: el tipo y la clase siempre de acuerdo. Una fila sin tipo (las que crean el Presupuesto o la
-- importación) lo recibe de su clase. Si cambia la clase (desde el Presupuesto) y el tipo ya no sirve, se
-- recalcula; si cambia el tipo y la clase no le sirve, la clase pasa a la del tipo. Las cuentas de banco llevan
-- su subtipo. Lo que no aplica al tipo se limpia (débito, cargos).
create function personal.activos_tipo_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ti text[];
begin
  if new.tipo is null then
    v_ti := personal.tipo_inicial(new.clase, new.subtipo, new.nombre, new.institucion, new.simbolo, new.tipo_rf);
    new.tipo := v_ti[1];
    new.tipo_confirmado := v_ti[2] = '1';
  elsif not (new.clase = any (personal.clases_de_tipo(new.tipo))) then
    if tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo then
      v_ti := personal.tipo_inicial(new.clase, new.subtipo, new.nombre, new.institucion, new.simbolo, new.tipo_rf);
      new.tipo := v_ti[1];
      new.tipo_confirmado := v_ti[2] = '1';
    else
      new.clase := (personal.clases_de_tipo(new.tipo))[1];
    end if;
  end if;
  if new.tipo in ('corriente', 'ahorro', 'alto_rendimiento') then
    new.subtipo := new.tipo;
  elsif new.clase <> 'otros' then
    new.subtipo := null;
  end if;
  if new.tipo <> 'alto_rendimiento' then
    new.tiene_debito := null;
  end if;
  if new.clase not in ('prestamo', 'deuda') then
    new.cargos_cuota := null;
  end if;
  if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo
     and exists (select 1 from personal.caja_cuentas c where c.registro_id = new.id)
     and not personal.se_enlaza_sola(new.tipo, new.precio, new.clase) then
    raise exception '«%» la usa el Presupuesto: no puede pasar a % (eso no lleva un saldo en el Presupuesto).', new.nombre, personal.nombre_tipo_fin(new.tipo)
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger activos_tipo_antes before insert or update on personal.activos
  for each row execute function personal.activos_tipo_antes();

-- ---------------------------------------------------------------------------
-- 2. Listas con lógica bancaria: la tabla de verdad del manual
-- ---------------------------------------------------------------------------
-- GENERADA de lib/finanzas/catalogo.ts · tablaDeVerdad() con scripts/tabla-catalogo.ts. No la edites a mano:
-- cambia el módulo, vuelve a generar y pégala aquí (la prueba lib/finanzas/catalogo.test.ts lo exige).
-- Formularios: pago (¿Con qué pagaste?), ingreso (¿A qué cuenta entra?), ahorro (¿A dónde va el ahorro?),
-- pago_deuda (Pago de tarjeta o préstamo), cambio (Cambio de moneda), rescate (Rescate o venta de inversión).

create function personal.tipo_aparece(p_tipo text, p_debito boolean, p_formulario text, p_rol text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from (values
    -- tabla-catalogo: inicio
    ('efectivo', false, 'pago', 'cuenta'),
    ('efectivo', false, 'ingreso', 'cuenta'),
    ('efectivo', false, 'ahorro', 'origen'),
    ('efectivo', false, 'ahorro', 'destino'),
    ('efectivo', false, 'pago_deuda', 'origen'),
    ('efectivo', false, 'cambio', 'origen'),
    ('efectivo', false, 'cambio', 'destino'),
    ('efectivo', false, 'rescate', 'destino'),
    ('efectivo', true, 'pago', 'cuenta'),
    ('efectivo', true, 'ingreso', 'cuenta'),
    ('efectivo', true, 'ahorro', 'origen'),
    ('efectivo', true, 'ahorro', 'destino'),
    ('efectivo', true, 'pago_deuda', 'origen'),
    ('efectivo', true, 'cambio', 'origen'),
    ('efectivo', true, 'cambio', 'destino'),
    ('efectivo', true, 'rescate', 'destino'),
    ('corriente', false, 'pago', 'cuenta'),
    ('corriente', false, 'ingreso', 'cuenta'),
    ('corriente', false, 'ahorro', 'origen'),
    ('corriente', false, 'pago_deuda', 'origen'),
    ('corriente', false, 'cambio', 'origen'),
    ('corriente', false, 'cambio', 'destino'),
    ('corriente', false, 'rescate', 'destino'),
    ('corriente', true, 'pago', 'cuenta'),
    ('corriente', true, 'ingreso', 'cuenta'),
    ('corriente', true, 'ahorro', 'origen'),
    ('corriente', true, 'pago_deuda', 'origen'),
    ('corriente', true, 'cambio', 'origen'),
    ('corriente', true, 'cambio', 'destino'),
    ('corriente', true, 'rescate', 'destino'),
    ('ahorro', false, 'pago', 'cuenta'),
    ('ahorro', false, 'ingreso', 'cuenta'),
    ('ahorro', false, 'ahorro', 'origen'),
    ('ahorro', false, 'ahorro', 'destino'),
    ('ahorro', false, 'pago_deuda', 'origen'),
    ('ahorro', false, 'cambio', 'origen'),
    ('ahorro', false, 'cambio', 'destino'),
    ('ahorro', false, 'rescate', 'destino'),
    ('ahorro', true, 'pago', 'cuenta'),
    ('ahorro', true, 'ingreso', 'cuenta'),
    ('ahorro', true, 'ahorro', 'origen'),
    ('ahorro', true, 'ahorro', 'destino'),
    ('ahorro', true, 'pago_deuda', 'origen'),
    ('ahorro', true, 'cambio', 'origen'),
    ('ahorro', true, 'cambio', 'destino'),
    ('ahorro', true, 'rescate', 'destino'),
    ('alto_rendimiento', false, 'ingreso', 'cuenta'),
    ('alto_rendimiento', false, 'ahorro', 'origen'),
    ('alto_rendimiento', false, 'ahorro', 'destino'),
    ('alto_rendimiento', false, 'pago_deuda', 'origen'),
    ('alto_rendimiento', false, 'cambio', 'origen'),
    ('alto_rendimiento', false, 'cambio', 'destino'),
    ('alto_rendimiento', false, 'rescate', 'destino'),
    ('alto_rendimiento', true, 'pago', 'cuenta'),
    ('alto_rendimiento', true, 'ingreso', 'cuenta'),
    ('alto_rendimiento', true, 'ahorro', 'origen'),
    ('alto_rendimiento', true, 'ahorro', 'destino'),
    ('alto_rendimiento', true, 'pago_deuda', 'origen'),
    ('alto_rendimiento', true, 'cambio', 'origen'),
    ('alto_rendimiento', true, 'cambio', 'destino'),
    ('alto_rendimiento', true, 'rescate', 'destino'),
    ('certificado', false, 'ahorro', 'destino'),
    ('certificado', false, 'rescate', 'origen'),
    ('certificado', true, 'ahorro', 'destino'),
    ('certificado', true, 'rescate', 'origen'),
    ('mutuo', false, 'ahorro', 'destino'),
    ('mutuo', false, 'rescate', 'origen'),
    ('mutuo', true, 'ahorro', 'destino'),
    ('mutuo', true, 'rescate', 'origen'),
    ('bono', false, 'ahorro', 'destino'),
    ('bono', false, 'rescate', 'origen'),
    ('bono', true, 'ahorro', 'destino'),
    ('bono', true, 'rescate', 'origen'),
    ('fondo_abierto', false, 'ahorro', 'destino'),
    ('fondo_abierto', false, 'rescate', 'origen'),
    ('fondo_abierto', true, 'ahorro', 'destino'),
    ('fondo_abierto', true, 'rescate', 'origen'),
    ('fondo_cerrado', false, 'ahorro', 'destino'),
    ('fondo_cerrado', false, 'rescate', 'origen'),
    ('fondo_cerrado', true, 'ahorro', 'destino'),
    ('fondo_cerrado', true, 'rescate', 'origen'),
    ('accion_etf', false, 'ahorro', 'destino'),
    ('accion_etf', false, 'rescate', 'origen'),
    ('accion_etf', true, 'ahorro', 'destino'),
    ('accion_etf', true, 'rescate', 'origen'),
    ('fideicomiso', false, 'ahorro', 'destino'),
    ('fideicomiso', false, 'rescate', 'origen'),
    ('fideicomiso', true, 'ahorro', 'destino'),
    ('fideicomiso', true, 'rescate', 'origen'),
    ('tarjeta', false, 'pago', 'cuenta'),
    ('tarjeta', false, 'pago_deuda', 'destino'),
    ('tarjeta', true, 'pago', 'cuenta'),
    ('tarjeta', true, 'pago_deuda', 'destino'),
    ('prestamo', false, 'pago_deuda', 'destino'),
    ('prestamo', true, 'pago_deuda', 'destino'),
    ('otra_deuda', false, 'pago_deuda', 'destino'),
    ('otra_deuda', true, 'pago_deuda', 'destino')
    -- tabla-catalogo: fin
    ) as v (tipo, debito, formulario, rol)
    where v.tipo = p_tipo and v.debito = coalesce(p_debito, false) and v.formulario = p_formulario and v.rol = p_rol
  )
$$;

comment on function personal.tipo_aparece(text, boolean, text, text) is
  'Tabla de verdad del manual (listas con lógica bancaria): ¿una fila de ese tipo aparece en ese formulario y papel? Generada de lib/finanzas/catalogo.ts.';

grant execute on function personal.clases_de_tipo(text) to authenticated, service_role;
grant execute on function personal.grupo_fin(text) to authenticated, service_role;
grant execute on function personal.nombre_tipo_fin(text) to authenticated, service_role;
grant execute on function personal.tipo_inicial(text, text, text, text, text, text) to authenticated, service_role;
grant execute on function personal.se_enlaza_sola(text, numeric, text) to authenticated, service_role;
grant execute on function personal.tipo_aparece(text, boolean, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Columnas nuevas del Presupuesto
-- ---------------------------------------------------------------------------

alter table personal.caja_movimientos
  add column registro_origen  text references personal.activos (id) on update cascade on delete set null,
  add column registro_destino text references personal.activos (id) on update cascade on delete set null,
  add column cargos           numeric check (cargos >= 0),
  add column categoria_cargos text;
alter table personal.caja_movimientos add constraint caja_movimientos_cargos_pago_check
  check (cargos is null or (tipo = 'pago_tarjeta' and coalesce(interes, 0) + cargos <= monto));
alter table personal.caja_movimientos add constraint caja_movimientos_registro_tipo_check
  check ((registro_origen is null and registro_destino is null) or tipo = 'transferencia');
comment on column personal.caja_movimientos.registro_origen is 'Rescate o venta de una inversión que no vive en el Presupuesto (acciones, fondos por cuotas): la fila del registro de donde sale.';
comment on column personal.caja_movimientos.registro_destino is 'Ahorro hacia una inversión que no vive en el Presupuesto: la fila del registro a donde va.';
comment on column personal.caja_movimientos.cargos is 'Pago de préstamo: cargos dentro de la cuota (seguro y otros). Gasto aparte: la deuda baja por monto − interes − cargos.';
comment on column personal.caja_movimientos.categoria_cargos is 'Categoría (de gasto) de los cargos de la cuota. Vacío = «Sin categoría».';

alter table personal.caja_recurrentes
  add column registro_destino text references personal.activos (id) on update cascade on delete set null;
alter table personal.caja_recurrentes add constraint caja_recurrentes_registro_tipo_check
  check (registro_destino is null or tipo = 'transferencia');
comment on column personal.caja_recurrentes.registro_destino is 'Línea del plan de ahorro hacia una inversión que no vive en el Presupuesto (acciones, fondos por cuotas).';

-- ---------------------------------------------------------------------------
-- 4. Validación: lo que el manual no permite, la base no lo guarda
-- ---------------------------------------------------------------------------

-- Lo que la validación necesita de una cuenta del Presupuesto o de una fila del registro: tipo, débito y nombre.
create function personal.fin_de_caja(p_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'tipo', coalesce(a.tipo, case c.tipo when 'banco' then 'corriente' when 'efectivo' then 'efectivo' when 'ahorro' then 'ahorro' when 'tarjeta' then 'tarjeta' else 'prestamo' end),
    'debito', coalesce(a.tiene_debito, false), 'nombre', c.nombre, 'moneda', c.moneda)
  from personal.caja_cuentas c
  left join personal.activos a on a.id = c.registro_id
  where c.id = p_id
$$;

create function personal.fin_de_registro(p_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('tipo', a.tipo, 'debito', coalesce(a.tiene_debito, false), 'nombre', a.nombre, 'moneda', a.moneda)
  from personal.activos a
  where a.id = p_id
$$;

create function personal.aparece_fin(p_fila jsonb, p_formulario text, p_rol text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_fila is null or personal.tipo_aparece(p_fila ->> 'tipo', (p_fila ->> 'debito')::boolean, p_formulario, p_rol) $$;

-- Movimientos y pagos fijos: cuentas según el formulario del manual. La importación (restaura la historia tal
-- cual) y la sincronización entre tablas no pasan por aquí. En una edición solo se revisa si cambió el tipo o
-- alguna cuenta (asignar una categoría a algo viejo siempre se puede).
create function personal.caja_validar_cuentas()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(new);
  v_rd text := j ->> 'registro_destino';
  v_ro text := j ->> 'registro_origen';
  o jsonb;
  d jsonb;
begin
  if personal.registro_sincronizando() or coalesce(current_setting('personal.importando', true), '') = '1' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.tipo is not distinct from old.tipo and new.cuenta is not distinct from old.cuenta and new.destino is not distinct from old.destino
       and v_rd is not distinct from (to_jsonb(old) ->> 'registro_destino') and v_ro is not distinct from (to_jsonb(old) ->> 'registro_origen') then
      return new;
    end if;
  end if;
  o := case when v_ro is not null then personal.fin_de_registro(v_ro) when new.cuenta is not null then personal.fin_de_caja(new.cuenta) end;
  d := case when new.destino is not null then personal.fin_de_caja(new.destino) when v_rd is not null then personal.fin_de_registro(v_rd) end;

  if new.tipo = 'gasto' then
    if not personal.aparece_fin(o, 'pago', 'cuenta') then
      if personal.grupo_fin(o ->> 'tipo') = 'inversion' then
        raise exception '«%» es una inversión: una inversión nunca se usa para pagar. Para gastar de ella, registra primero «Rescate o venta» hacia una cuenta.', o ->> 'nombre' using errcode = '22023';
      elsif o ->> 'tipo' = 'alto_rendimiento' then
        raise exception '«%» no tiene tarjeta de débito marcada: no sirve para pagar. Márcala en Mis cuentas o paga desde otra cuenta.', o ->> 'nombre' using errcode = '22023';
      end if;
      raise exception '«%» (%) no sirve para pagar: paga con efectivo, una cuenta o una tarjeta.', o ->> 'nombre', personal.nombre_tipo_fin(o ->> 'tipo') using errcode = '22023';
    end if;
  elsif new.tipo = 'ingreso' then
    if not personal.aparece_fin(o, 'ingreso', 'cuenta') then
      raise exception '«%» (%) no recibe ingresos: el dinero entra a efectivo o a una cuenta.', o ->> 'nombre', personal.nombre_tipo_fin(o ->> 'tipo') using errcode = '22023';
    end if;
  elsif new.tipo = 'pago_tarjeta' then
    if not personal.aparece_fin(o, 'pago_deuda', 'origen') then
      raise exception 'Un pago de tarjeta o préstamo sale de efectivo o de una cuenta, no de «%» (%).', o ->> 'nombre', personal.nombre_tipo_fin(o ->> 'tipo') using errcode = '22023';
    end if;
    if not personal.aparece_fin(d, 'pago_deuda', 'destino') then
      raise exception '«%» no es una tarjeta ni un préstamo: para mover dinero usa «Mover entre mis cuentas».', d ->> 'nombre' using errcode = '22023';
    end if;
  elsif new.tipo = 'transferencia' then
    if personal.grupo_fin(o ->> 'tipo') = 'inversion' then
      if not personal.aparece_fin(d, 'rescate', 'destino') then
        raise exception 'El dinero de un rescate o venta va a efectivo o a una cuenta, no a «%» (%).', d ->> 'nombre', personal.nombre_tipo_fin(d ->> 'tipo') using errcode = '22023';
      end if;
    elsif personal.grupo_fin(d ->> 'tipo') = 'inversion' then
      if not personal.aparece_fin(o, 'ahorro', 'origen') then
        raise exception 'El ahorro sale de efectivo o de una cuenta, no de «%» (%).', o ->> 'nombre', personal.nombre_tipo_fin(o ->> 'tipo') using errcode = '22023';
      end if;
    else
      if personal.grupo_fin(o ->> 'tipo') = 'deuda' or personal.grupo_fin(d ->> 'tipo') = 'deuda' then
        raise exception 'Para pagar una tarjeta o un préstamo usa «Pago de tarjeta o préstamo»; para gastar con la tarjeta, «Gasto».' using errcode = '22023';
      end if;
      if personal.grupo_fin(o ->> 'tipo') = 'bien' or personal.grupo_fin(d ->> 'tipo') = 'bien' then
        raise exception 'Un bien (casa, terreno, carro) no mueve dinero en el Presupuesto.' using errcode = '22023';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger caja_movimientos_validar before insert or update on personal.caja_movimientos
  for each row execute function personal.caja_validar_cuentas();
create trigger caja_recurrentes_validar before insert or update on personal.caja_recurrentes
  for each row execute function personal.caja_validar_cuentas();

-- ---------------------------------------------------------------------------
-- 5. Todo en el Presupuesto solo: enlazar cada fila que paga o recibe
-- ---------------------------------------------------------------------------
-- Sin escribir en el registro: la cuenta del Presupuesto empieza con el saldo escrito (como «Usar en el
-- Presupuesto» antes) y, si ese saldo es de después del inicio, entra como cuadre del día anterior (igual que el
-- trigger caja_cuentas_despues). Una deuda sin saldo escrito sigue «sin dato» en el registro.

create function personal.enlazar_registro()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_inicio date := (select inicio from personal.caja_config where id = 1);
  v_n integer := 0;
  v_id text;
begin
  if v_inicio is null then
    return 0;
  end if;
  for r in
    select a.*
    from personal.activos a
    where a.unido_a is null
      and a.moneda in ('DOP', 'USD')
      and personal.se_enlaza_sola(a.tipo, a.precio, a.clase)
      and not exists (select 1 from personal.caja_cuentas c where c.registro_id = a.id)
    order by a.orden, a.id
  loop
    v_id := case when exists (select 1 from personal.caja_cuentas c where c.id = r.id) then gen_random_uuid()::text else r.id end;
    perform set_config('personal.sinc', '1', true);
    insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden, moneda, registro_id)
    values (v_id, left(r.nombre, 120), personal.tipo_caja_de(r.clase, r.subtipo), r.cantidad, r.limite,
            coalesce((select max(c.orden) from personal.caja_cuentas c), 0) + 1, r.moneda, r.id);
    if r.saldo_fecha is not null and r.saldo_fecha > v_inicio then
      insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
      values (r.saldo_fecha - 1, v_id, r.cantidad)
      on conflict (fecha, cuenta_id) do update set saldo = excluded.saldo, actualizado_en = now();
    end if;
    perform set_config('personal.sinc', '', true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

comment on function personal.enlazar_registro() is
  'Enlaza al Presupuesto cada fila del registro que paga o recibe (manual, sección B). No escribe en el registro. Devuelve cuántas enlazó.';
revoke all on function personal.enlazar_registro() from public, anon;
grant execute on function personal.enlazar_registro() to authenticated, service_role;

create function personal.activos_enlazar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if personal.registro_sincronizando() or coalesce(current_setting('personal.importando', true), '') = '1' then
    return null;
  end if;
  perform personal.enlazar_registro();
  return null;
end;
$$;

create trigger activos_enlazar after insert or update of tipo, clase, moneda, precio, unido_a on personal.activos
  for each row execute function personal.activos_enlazar();

-- Si alguien enlaza a mano (el asistente, una importación vieja, una prueba) una fila que ya se había enlazado
-- SOLA y esa cuenta del Presupuesto todavía no tiene historia (ni movimientos, ni fijos, ni cuadres propios),
-- la nueva toma su lugar: no se pierde nada. Con historia, se rechaza con un mensaje claro.
create function personal.caja_cuentas_a_tomar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_otra text;
  r personal.activos;
begin
  if new.registro_id is null or personal.registro_sincronizando() then
    return new;
  end if;
  select c.id into v_otra from personal.caja_cuentas c where c.registro_id = new.registro_id and c.id <> new.id;
  if v_otra is null then
    return new;
  end if;
  select * into r from personal.activos a where a.id = new.registro_id;
  if exists (select 1 from personal.caja_movimientos m where m.cuenta = v_otra or m.destino = v_otra)
     or exists (select 1 from personal.caja_recurrentes x where x.cuenta = v_otra or x.destino = v_otra)
     or exists (select 1 from personal.caja_saldos_reales s where s.cuenta_id = v_otra
                and not (r.saldo_fecha is not null and s.fecha = r.saldo_fecha - 1 and s.saldo = r.cantidad)) then
    raise exception '«%» ya está en tu Presupuesto (se agrega sola): usa esa cuenta.', coalesce(r.nombre, new.nombre) using errcode = '23505';
  end if;
  delete from personal.caja_saldos_reales where cuenta_id = v_otra;
  delete from personal.caja_cuentas where id = v_otra;
  return new;
end;
$$;

-- Corre antes que caja_cuentas_antes (los triggers van en orden alfabético).
create trigger caja_cuentas_a_tomar before insert or update of registro_id on personal.caja_cuentas
  for each row execute function personal.caja_cuentas_a_tomar();
create trigger caja_config_enlazar after insert on personal.caja_config
  for each row execute function personal.activos_enlazar();

-- Las filas de hoy.
select personal.enlazar_registro();

-- ---------------------------------------------------------------------------
-- 6. Importación del Presupuesto: restaura tal cual (sin validar) y al final enlaza lo que falte
-- ---------------------------------------------------------------------------

create or replace function personal.caja_importar(p_datos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c jsonb := p_datos -> 'config';
  v_enlaces jsonb;
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado: solo la dueña o el dueño de Strategya puede importar la caja'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_datos) is distinct from 'object' or jsonb_typeof(v_c) is distinct from 'object' then
    raise exception 'Importación inválida: falta config';
  end if;
  perform set_config('personal.importando', '1', true);

  select coalesce(jsonb_object_agg(id, registro_id), '{}'::jsonb) into v_enlaces
  from personal.caja_cuentas where registro_id is not null;

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

  insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden, moneda, registro_id)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'saldo_inicial')::numeric, 0),
         (e ->> 'limite')::numeric, coalesce((e ->> 'orden')::integer, 0), coalesce(nullif(e ->> 'moneda', ''), 'DOP'),
         coalesce(nullif(e ->> 'registro_id', ''),
                  case when exists (select 1 from personal.activos a where a.id = v_enlaces ->> (e ->> 'id') and a.unido_a is null)
                       then v_enlaces ->> (e ->> 'id') end)
  from jsonb_array_elements(coalesce(p_datos -> 'cuentas', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_categorias (id, nombre, tipo, adicional)
  select e ->> 'id', e ->> 'nombre',
         coalesce(e ->> 'tipo', case e ->> 'grupo'
                                  when 'ingreso' then 'ingreso' when 'fijo' then 'gasto' when 'variable' then 'gasto'
                                  when 'ahorro' then 'ahorro_inversion' when 'deuda' then 'gasto_financiero'
                                end),
         nullif(coalesce(e ->> 'adicional', e ->> 'presupuesto'), '')::numeric
  from jsonb_array_elements(coalesce(p_datos -> 'categorias', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_recurrentes
    (id, nombre, tipo, monto, moneda, pago_total, cuenta, destino, categoria, frecuencia, dias, cada_n, fecha, desde, hasta, activo, parte, registro_destino)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'monto')::numeric, 0), coalesce(e ->> 'moneda', 'DOP'),
         coalesce((e ->> 'pago_total')::boolean, false), e ->> 'cuenta', e ->> 'destino', e ->> 'categoria',
         coalesce(e ->> 'frecuencia', 'mensual'), coalesce(e ->> 'dias', ''), (e ->> 'cada_n')::integer,
         (e ->> 'fecha')::date, (e ->> 'desde')::date, (e ->> 'hasta')::date, coalesce((e ->> 'activo')::boolean, true),
         nullif(e ->> 'parte', ''),
         case when exists (select 1 from personal.activos a where a.id = e ->> 'registro_destino') then e ->> 'registro_destino' end
  from jsonb_array_elements(coalesce(p_datos -> 'recurrentes', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_movimientos
    (id, fecha, tipo, monto, moneda, tasa, cuenta, destino, categoria, nota, recurrente_id, interes, parte, registro_origen, registro_destino, cargos, categoria_cargos)
  select e ->> 'id', (e ->> 'fecha')::date, e ->> 'tipo', (e ->> 'monto')::numeric, coalesce(e ->> 'moneda', 'DOP'),
         (e ->> 'tasa')::numeric, e ->> 'cuenta', e ->> 'destino', e ->> 'categoria', e ->> 'nota', e ->> 'recurrente_id',
         nullif(e ->> 'interes', '')::numeric, nullif(e ->> 'parte', ''),
         case when exists (select 1 from personal.activos a where a.id = e ->> 'registro_origen') then e ->> 'registro_origen' end,
         case when exists (select 1 from personal.activos a where a.id = e ->> 'registro_destino') then e ->> 'registro_destino' end,
         nullif(e ->> 'cargos', '')::numeric, nullif(e ->> 'categoria_cargos', '')
  from jsonb_array_elements(coalesce(p_datos -> 'movimientos', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_omitidos (fecha, recurrente_id)
  select distinct (e ->> 'fecha')::date, e ->> 'recurrente_id'
  from jsonb_array_elements(coalesce(p_datos -> 'omitidos', '[]')) as t (e);

  insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
  select (e ->> 'fecha')::date, e ->> 'cuenta_id', (e ->> 'saldo')::numeric
  from jsonb_array_elements(coalesce(p_datos -> 'saldos', '[]')) as t (e)
  on conflict (fecha, cuenta_id) do update set saldo = excluded.saldo;

  insert into personal.caja_notas (fecha, nota)
  select (e ->> 'fecha')::date, e ->> 'nota'
  from jsonb_array_elements(coalesce(p_datos -> 'notas', '[]')) as t (e);

  perform set_config('personal.importando', '', true);
  -- Lo del registro que paga o recibe y no vino en el archivo vuelve a estar en el Presupuesto (nada desaparece).
  perform personal.enlazar_registro();

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

-- ---------------------------------------------------------------------------
-- 7. Estado de resultados: cargos de los préstamos (gasto) y ahorro hacia inversiones fuera del Presupuesto
-- ---------------------------------------------------------------------------
-- Igual que en 20261027000100_deudas_y_dolares.sql, más:
--   · los cargos de un pago de préstamo (seguro…) son GASTO (su categoría o «Sin categoría»), no gasto financiero;
--   · una transferencia a una inversión que no vive en el Presupuesto (registro_destino) sin categoría cuenta
--     como ahorro (igual que pasar a una cuenta de ahorro).
-- La misma cuenta en lib/caja/resultados.ts · estadoDeResultados (las pruebas de base comparan).

create or replace function personal.resultado_mes(p_mes date)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with movs as (
    select m.*,
           case when m.moneda = 'USD' then coalesce(nullif(m.tasa, 0), personal.tasa_usd_bcrd(m.fecha)) else 1 end as fx
    from personal.caja_movimientos m
    where m.fecha >= date_trunc('month', p_mes)::date
      and m.fecha < (date_trunc('month', p_mes) + interval '1 month')::date
  ),
  montos as (
    select 'p'::text as k, f.tipo, f.categoria, f.destino, null::text as registro_destino, f.total as dop, false as adicional
    from personal.caja_fijos_mes(p_mes) f
    union all
    select 'r', m.tipo, m.categoria, m.destino, m.registro_destino, m.monto * m.fx, false
    from movs m
    union all
    -- La parte de interés de un pago de tarjeta o préstamo: gasto financiero.
    select 'r', 'interes', m.categoria, null, null, m.interes * m.fx, false
    from movs m
    where m.tipo = 'pago_tarjeta' and m.interes > 0
    union all
    -- Los cargos dentro de la cuota de un préstamo (seguro…): gasto.
    select 'r', 'cargos', m.categoria_cargos, null, null, m.cargos * m.fx, false
    from movs m
    where m.tipo = 'pago_tarjeta' and m.cargos > 0
    union all
    select 'p', null, c.id, null, null, c.adicional, true
    from personal.caja_categorias c
    where c.adicional is not null
  ),
  lineas as (
    select x.k, x.dop,
           case
             when x.adicional then c.tipo
             when x.tipo = 'interes' then 'gasto_financiero'
             when x.tipo = 'cargos' then case when c.tipo in ('gasto', 'costo', 'otro_gasto') then c.tipo else 'gasto' end
             when x.tipo in ('transferencia', 'pago_tarjeta') then
               case
                 when c.tipo = 'ahorro_inversion' then 'ahorro_inversion'
                 when c.id is null and (cu.tipo = 'ahorro' or (x.destino is null and x.registro_destino is not null)) then 'ahorro_inversion'
               end
             when c.id is null then case when x.tipo = 'ingreso' then 'ingreso' else 'gasto' end
             else c.tipo
           end as linea,
           case
             when not x.adicional and x.tipo in ('ingreso', 'gasto') and c.id is not null
                  and (c.tipo in ('ingreso', 'otro_ingreso')) <> (x.tipo = 'ingreso') then -1
             else 1
           end as signo
    from montos x
    left join personal.caja_categorias c on c.id = x.categoria
    left join personal.caja_cuentas cu on cu.id = x.destino
  ),
  t as (
    select k,
           coalesce(sum(signo * dop) filter (where linea = 'ingreso'), 0) as ing,
           coalesce(sum(signo * dop) filter (where linea = 'costo'), 0) as cos,
           coalesce(sum(signo * dop) filter (where linea = 'gasto'), 0) as gas,
           coalesce(sum(signo * dop) filter (where linea = 'gasto_financiero'), 0) as gfi,
           coalesce(sum(signo * dop) filter (where linea = 'otro_ingreso'), 0) as oin,
           coalesce(sum(signo * dop) filter (where linea = 'otro_gasto'), 0) as oga,
           coalesce(sum(signo * dop) filter (where linea = 'ahorro_inversion'), 0) as aho
    from (select * from lineas where linea is not null and dop is not null
          union all select 'p', 0, null, 1 union all select 'r', 0, null, 1) l
    group by k
  ),
  j as (
    select k, jsonb_build_object(
      'ingresos', ing::text,
      'costos', cos::text,
      'gastos', gas::text,
      'gastos_financieros', gfi::text,
      'otros_ingresos', oin::text,
      'otros_gastos', oga::text,
      'gastos_totales', (cos + gas + gfi + oga)::text,
      'utilidad_bruta', (ing - cos)::text,
      'utilidad_operativa', (ing - cos - gas)::text,
      'utilidad_neta', (ing - cos - gas - gfi + oin - oga)::text,
      'ahorro', aho::text,
      'disponible', (ing - cos - gas - gfi + oin - oga - aho)::text
    ) as v
    from t
  )
  select jsonb_build_object(
    'mes', to_char(date_trunc('month', p_mes), 'YYYY-MM'),
    'presupuestado', (select v from j where k = 'p'),
    'real', (select v from j where k = 'r')
  )
$$;

comment on function personal.resultado_mes(date) is
  'Contrato: estado de resultados del mes de p_mes (presupuestado y real; montos como texto; US$ con su tasa o el dólar del BCRD de su fecha; intereses de pagos de deudas como gasto financiero; cargos de la cuota como gasto). SECURITY INVOKER. Ver docs/caja.md.';
