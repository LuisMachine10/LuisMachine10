-- Strategya · Registro único «Mis cuentas, activos y deudas» (Portafolio Financiero ⇄ Presupuesto)
--
-- Pedido de Mena: las cuentas, inversiones, tarjetas y deudas se anotan UNA sola vez, en el Portafolio,
-- y el Presupuesto las usa para «de dónde sale / a dónde entra» cada movimiento.
--
-- Diseño (el más sólido con lo que ya hay en producción):
--   1. personal.activos pasa a ser el REGISTRO ÚNICO: además de las 4 clases de inversión guarda
--      «otros» (vehículo, inmueble…) y las deudas: «tarjeta», «prestamo» y «deuda» (otra deuda).
--      En una deuda, cantidad = lo que se debe (positivo). Columnas nuevas: subtipo, saldo_fecha,
--      limite, dia_pago, cuota, origen, unido_a y el plan de aportes por instrumento.
--   2. personal.caja_cuentas sigue existiendo (el motor del Presupuesto y personal.resultado_mes la
--      leen), pero cada fila queda ENLAZADA a una fila del registro (registro_id, llave foránea, única).
--      Nombre, tipo y límite salen del registro: triggers los mantienen iguales en los dos sentidos.
--      Una cuenta creada desde el Presupuesto (asistente, Configuración o importación) se crea en el
--      registro en el mismo paso: nunca se anota dos veces.
--   3. Saldo: la línea de tiempo de una cuenta enlazada vive en el Presupuesto (saldo inicial +
--      movimientos + «cuadrar con tu banco»). Cuando Mena escribe el saldo en el Portafolio (cantidad y
--      saldo_fecha = «saldo al empezar ese día»), el trigger lo anota como cuadre al cierre del día
--      anterior (o como saldo inicial si es la fecha de inicio). El saldo vigente = esa línea de tiempo
--      hasta hoy (lib/capital/registro.ts). Una sola verdad.
--   4. UNIR LO QUE YA EXISTE sin adivinar: cada cuenta del Presupuesto y cada tarjeta de los parámetros
--      del Portafolio se copia como fila propia del registro (origen = presupuesto | tarjetas). Nada se
--      borra ni se empareja en silencio: la pantalla «Unir cuentas repetidas» sugiere los pares y Mena
--      confirma (personal.unir_registro) o descarta. La fila que se une no se borra: queda archivada
--      (unido_a) con todos sus datos.
--
-- Ninguna cifra de Mena vive en este archivo. RLS: las tablas ya tienen sus políticas (mercado.es_autorizado()).

-- ---------------------------------------------------------------------------
-- 1. Registro único: personal.activos
-- ---------------------------------------------------------------------------

alter table personal.activos drop constraint if exists activos_clase_check;
alter table personal.activos add constraint activos_clase_check
  check (clase in ('efectivo', 'ahorros', 'rentafija', 'rentavariable', 'otros', 'tarjeta', 'prestamo', 'deuda'));
comment on column personal.activos.clase is
  'Registro único. Inversiones (4 clases): efectivo, ahorros, rentafija, rentavariable. Otros activos: otros. Deudas: tarjeta, prestamo, deuda (en una deuda, cantidad = lo que se debe).';

alter table personal.activos
  add column subtipo         text,
  add column saldo_fecha     date,
  add column limite          numeric check (limite >= 0),
  add column dia_pago        smallint check (dia_pago between 1 and 31),
  add column cuota           numeric check (cuota >= 0),
  add column origen          text not null default 'portafolio' check (origen in ('portafolio', 'presupuesto', 'tarjetas')),
  add column unido_a         text references personal.activos (id) on update cascade on delete set null,
  add column capitaliza      boolean,
  add column frecuencia_pago text check (frecuencia_pago in ('mensual', 'trimestral', 'semestral', 'anual', 'vencimiento')),
  add column reinvierte      boolean,
  add column aporte_pct      numeric check (aporte_pct >= 0 and aporte_pct <= 1),
  add column plan_inicio     date;

alter table personal.activos add constraint activos_subtipo_check check (
  subtipo is null
  or (clase = 'ahorros' and subtipo in ('corriente', 'ahorro'))
  or (clase = 'otros' and subtipo in ('vehiculo', 'inmueble', 'otro'))
);
alter table personal.activos add constraint activos_unido_check check (unido_a is null or unido_a <> id);

comment on column personal.activos.subtipo is 'Cuentas de ahorro: corriente (para el día a día) o ahorro. Otros activos: vehiculo, inmueble u otro.';
comment on column personal.activos.saldo_fecha is 'Fecha del saldo escrito (saldo al EMPEZAR ese día). Lo que el Presupuesto anote desde ese día lo mueve.';
comment on column personal.activos.limite is 'Tarjeta: límite de crédito (RD$).';
comment on column personal.activos.dia_pago is 'Tarjeta o préstamo: día del mes en que se paga.';
comment on column personal.activos.cuota is 'Préstamo: cuota mensual.';
comment on column personal.activos.origen is 'De dónde vino la fila al crear el registro único: portafolio, presupuesto (caja_cuentas) o tarjetas (parámetros del Portafolio). Sirve para sugerir pares repetidos.';
comment on column personal.activos.unido_a is 'Si Mena la unió con otra fila repetida: la fila que quedó. Las filas unidas no se borran ni cuentan.';
comment on column personal.activos.capitaliza is 'Plan: ¿el instrumento capitaliza los intereses dentro de sí mismo? null = sin configurar (la pantalla usa un supuesto y lo dice).';
comment on column personal.activos.frecuencia_pago is 'Plan, si no capitaliza: cada cuánto paga los intereses.';
comment on column personal.activos.reinvierte is 'Plan, si no capitaliza: ¿Mena reinvierte los intereses que cobra?';
comment on column personal.activos.aporte_pct is 'Plan: parte (fracción) del aporte mensual de su clase que va a este instrumento.';
comment on column personal.activos.plan_inicio is 'Plan: desde qué fecha recibe aportes.';

create index activos_unido_a on personal.activos (unido_a) where unido_a is not null;

-- Las clases de deuda.
create function personal.es_deuda(p_clase text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_clase in ('tarjeta', 'prestamo', 'deuda') $$;
grant execute on function personal.es_deuda(text) to authenticated, service_role;

-- Fecha de hoy en RD (UTC−4, sin horario de verano).
create function personal.hoy_rd()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'America/Santo_Domingo')::date $$;
grant execute on function personal.hoy_rd() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Presupuesto: caja_cuentas enlazada al registro
-- ---------------------------------------------------------------------------

alter table personal.caja_cuentas drop constraint if exists caja_cuentas_tipo_check;
alter table personal.caja_cuentas add constraint caja_cuentas_tipo_check
  check (tipo in ('banco', 'efectivo', 'ahorro', 'tarjeta', 'prestamo'));
alter table personal.caja_cuentas
  add column registro_id text unique references personal.activos (id) on update cascade on delete restrict;
comment on column personal.caja_cuentas.registro_id is
  'Fila del registro único (personal.activos) que es esta cuenta. Nombre, tipo y límite salen de ahí (triggers). No se puede borrar del Portafolio una cuenta que usa el Presupuesto.';
comment on column personal.caja_cuentas.tipo is 'banco, efectivo, ahorro, tarjeta o prestamo. Se deriva de la clase del registro.';

-- Tipo de cuenta del Presupuesto según la fila del registro.
create function personal.tipo_caja_de(p_clase text, p_subtipo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_clase = 'efectivo' then 'efectivo'
    when p_clase = 'ahorros' and p_subtipo = 'corriente' then 'banco'
    when p_clase = 'tarjeta' then 'tarjeta'
    when p_clase in ('prestamo', 'deuda') then 'prestamo'
    else 'ahorro'
  end
$$;
grant execute on function personal.tipo_caja_de(text, text) to authenticated, service_role;

-- Clase y subtipo del registro para una cuenta nueva del Presupuesto.
create function personal.clase_de_tipo_caja(p_tipo text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'banco' then array['ahorros', 'corriente']
    when 'efectivo' then array['efectivo', null]
    when 'ahorro' then array['ahorros', 'ahorro']
    when 'tarjeta' then array['tarjeta', null]
    when 'prestamo' then array['prestamo', null]
  end
$$;
grant execute on function personal.clase_de_tipo_caja(text) to authenticated, service_role;

-- Id de fila del registro a partir de un id de otra tabla: el mismo si sirve y está libre.
create function personal.id_registro_libre(p_base text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v text := p_base;
  i integer := 0;
begin
  if v is null or v !~ '^[A-Za-z0-9_.:-]{1,80}$' then
    v := 'reg-' || substr(md5(coalesce(p_base, '') || clock_timestamp()::text), 1, 20);
  end if;
  while exists (select 1 from personal.activos a where a.id = v) loop
    i := i + 1;
    v := left(coalesce(nullif(regexp_replace(coalesce(p_base, ''), '[^A-Za-z0-9_.:-]', '', 'g'), ''), 'reg'), 70) || '-' || i;
  end loop;
  return v;
end;
$$;
grant execute on function personal.id_registro_libre(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Conversión de lo que ya existe (antes de crear los triggers)
-- ---------------------------------------------------------------------------

-- 3a. Saldo de los instrumentos actuales: la fecha en que Mena lo escribió por última vez.
update personal.activos
set saldo_fecha = (actualizado_en at time zone 'America/Santo_Domingo')::date
where saldo_fecha is null;

-- 3b. Cada cuenta del Presupuesto pasa a ser una fila del registro, con su id si está libre.
do $$
declare
  c record;
  v_id text;
  v_cs text[];
  v_inicio date := (select inicio from personal.caja_config where id = 1);
begin
  for c in select * from personal.caja_cuentas order by orden, n loop
    v_id := personal.id_registro_libre(c.id);
    v_cs := personal.clase_de_tipo_caja(c.tipo);
    insert into personal.activos (id, clase, subtipo, nombre, institucion, moneda, cantidad, precio, tasa, limite, saldo_fecha, origen, orden)
    values (v_id, v_cs[1], v_cs[2], c.nombre, '', 'DOP', c.saldo_inicial, 1, 0, c.limite, coalesce(v_inicio, personal.hoy_rd()), 'presupuesto', 1000 + c.orden);
    update personal.caja_cuentas set registro_id = v_id where id = c.id;
  end loop;
end;
$$;

-- 3c. Cada tarjeta de los parámetros del Portafolio (objeto P · tarjetas) pasa a ser una deuda del
-- registro con su mismo id (los cierres guardan el uso de cada tarjeta por ese id). Sin saldo conocido:
-- cantidad 0 y saldo_fecha vacío («sin dato» en pantalla). Los parámetros NO se tocan.
do $$
declare
  t jsonb;
  v_id text;
  v_viejo text;
begin
  for t in
    select e from personal.parametros p
    cross join lateral jsonb_array_elements(case when jsonb_typeof(p.datos -> 'tarjetas') = 'array' then p.datos -> 'tarjetas' else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'object' and coalesce(e ->> 'nombre', '') <> ''
  loop
    v_viejo := t ->> 'id';
    v_id := personal.id_registro_libre(v_viejo);
    insert into personal.activos (id, clase, nombre, institucion, moneda, cantidad, precio, tasa, limite, saldo_fecha, origen, orden)
    values (v_id, 'tarjeta', left(t ->> 'nombre', 200), '', 'DOP', 0, 1, 0,
            case when coalesce(t ->> 'limite', '') ~ '^-?[0-9]+(\.[0-9]+)?$' then greatest((t ->> 'limite')::numeric, 0) end,
            null, 'tarjetas', 2000);
    -- Si el id tuvo que cambiar, el uso guardado en los cierres pasa a la clave nueva.
    if v_viejo is not null and v_id <> v_viejo then
      update personal.cierres c
      set datos = jsonb_set(c.datos, '{tarjetas}',
                            (select coalesce(jsonb_object_agg(case when k.key = v_viejo then v_id else k.key end, k.value), '{}'::jsonb)
                             from jsonb_each(c.datos -> 'tarjetas') k))
      where jsonb_typeof(c.datos -> 'tarjetas') = 'object' and c.datos -> 'tarjetas' ? v_viejo;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Triggers: una sola verdad en los dos sentidos
-- ---------------------------------------------------------------------------
-- «personal.sinc» = '1' mientras un trigger escribe en la otra tabla, para que no se llamen en bucle.

create function personal.registro_sincronizando()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('personal.sinc', true), '') = '1' $$;

-- Cuenta del Presupuesto nueva o re-enlazada: si no trae registro_id se crea en el registro; si lo trae,
-- nombre, tipo y límite salen del registro (el saldo inicial es el del Presupuesto).
create function personal.caja_cuentas_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r personal.activos;
  v_cs text[];
  v_id text;
begin
  if personal.registro_sincronizando() then
    return new;
  end if;
  if new.registro_id is null and tg_op = 'INSERT' then
    -- Tipo inválido: no se toca nada y la restricción caja_cuentas_tipo_check lo rechaza.
    if new.tipo is null or new.tipo not in ('banco', 'efectivo', 'ahorro', 'tarjeta', 'prestamo') then
      return new;
    end if;
    v_cs := personal.clase_de_tipo_caja(new.tipo);
    v_id := personal.id_registro_libre(new.id);
    perform set_config('personal.sinc', '1', true);
    insert into personal.activos (id, clase, subtipo, nombre, institucion, moneda, cantidad, precio, tasa, limite, saldo_fecha, origen, orden)
    values (v_id, v_cs[1], v_cs[2], coalesce(new.nombre, 'Cuenta'), '', 'DOP', coalesce(new.saldo_inicial, 0), 1, 0, new.limite,
            coalesce((select inicio from personal.caja_config where id = 1), personal.hoy_rd()), 'presupuesto', 1000 + coalesce(new.orden, 0));
    perform set_config('personal.sinc', '', true);
    new.registro_id := v_id;
    return new;
  end if;
  if new.registro_id is not null and (tg_op = 'INSERT' or new.registro_id is distinct from old.registro_id) then
    select * into r from personal.activos a where a.id = new.registro_id;
    if not found then
      raise exception 'Esa cuenta no está en tu Portafolio (registro %).', new.registro_id using errcode = '23503';
    end if;
    if r.unido_a is not null then
      raise exception '«%» se unió con otra cuenta: elige la que quedó.', r.nombre using errcode = '22023';
    end if;
    if r.clase = 'rentavariable' or r.clase = 'otros' or (r.precio is distinct from 1 and not personal.es_deuda(r.clase)) then
      raise exception '«%» no es una cuenta con saldo en pesos (son unidades o un bien): no puede ser cuenta del Presupuesto.', r.nombre using errcode = '22023';
    end if;
    if r.moneda <> 'DOP' then
      raise exception 'El Presupuesto lleva sus cuentas en RD$: «%» está en %.', r.nombre, r.moneda using errcode = '22023';
    end if;
    new.nombre := left(r.nombre, 120);
    new.tipo := personal.tipo_caja_de(r.clase, r.subtipo);
    new.limite := r.limite;
    return new;
  end if;
  return new;
end;
$$;

-- Después de enlazar una cuenta que ya existía en el registro: el saldo escrito en el Portafolio entra
-- a la línea de tiempo del Presupuesto (saldo inicial si es de la fecha de inicio o antes; si es
-- posterior, un cuadre al cierre del día anterior).
create function personal.caja_cuentas_despues()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  r personal.activos;
  v_inicio date := (select inicio from personal.caja_config where id = 1);
begin
  if personal.registro_sincronizando() or new.registro_id is null then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.registro_id is not distinct from old.registro_id then
    -- Cambios hechos desde el Presupuesto (Configuración): pasan al registro.
    perform set_config('personal.sinc', '1', true);
    update personal.activos a
    set nombre = new.nombre,
        limite = case when personal.es_deuda(a.clase) then new.limite else a.limite end,
        clase = case when personal.tipo_caja_de(a.clase, a.subtipo) <> new.tipo then (personal.clase_de_tipo_caja(new.tipo))[1] else a.clase end,
        subtipo = case when personal.tipo_caja_de(a.clase, a.subtipo) <> new.tipo then (personal.clase_de_tipo_caja(new.tipo))[2] else a.subtipo end,
        cantidad = case when new.saldo_inicial is distinct from old.saldo_inicial and (a.saldo_fecha is null or v_inicio is null or a.saldo_fecha <= v_inicio)
                        then new.saldo_inicial else a.cantidad end,
        saldo_fecha = case when new.saldo_inicial is distinct from old.saldo_inicial and (a.saldo_fecha is null or v_inicio is null or a.saldo_fecha <= v_inicio)
                           then coalesce(v_inicio, a.saldo_fecha) else a.saldo_fecha end,
        actualizado_en = now()
    where a.id = new.registro_id
      and (a.nombre is distinct from new.nombre
           or (personal.es_deuda(a.clase) and a.limite is distinct from new.limite)
           or personal.tipo_caja_de(a.clase, a.subtipo) <> new.tipo
           or (new.saldo_inicial is distinct from old.saldo_inicial and (a.saldo_fecha is null or v_inicio is null or a.saldo_fecha <= v_inicio)));
    perform set_config('personal.sinc', '', true);
    return null;
  end if;
  -- Recién enlazada (insert con registro_id, o re-enlace).
  select * into r from personal.activos a where a.id = new.registro_id;
  perform set_config('personal.sinc', '1', true);
  if r.saldo_fecha is not null and v_inicio is not null and r.saldo_fecha > v_inicio then
    insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
    values (r.saldo_fecha - 1, new.id, r.cantidad)
    on conflict (fecha, cuenta_id) do update set saldo = excluded.saldo, actualizado_en = now();
  else
    update personal.activos a set cantidad = new.saldo_inicial, saldo_fecha = coalesce(v_inicio, personal.hoy_rd()), actualizado_en = now()
    where a.id = r.id and (a.cantidad is distinct from new.saldo_inicial or a.saldo_fecha is distinct from coalesce(v_inicio, personal.hoy_rd()));
  end if;
  perform set_config('personal.sinc', '', true);
  return null;
end;
$$;

create trigger caja_cuentas_antes before insert or update on personal.caja_cuentas
  for each row execute function personal.caja_cuentas_antes();
create trigger caja_cuentas_despues after insert or update on personal.caja_cuentas
  for each row execute function personal.caja_cuentas_despues();

-- Cambios en el registro (Portafolio) que el Presupuesto debe ver: nombre, tipo, límite y saldo.
create function personal.activos_despues()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_caja text;
  v_inicio date := (select inicio from personal.caja_config where id = 1);
begin
  if personal.registro_sincronizando() then
    return null;
  end if;
  select c.id into v_caja from personal.caja_cuentas c where c.registro_id = new.id;
  if v_caja is null then
    return null;
  end if;
  if new.moneda <> 'DOP' then
    raise exception '«%» la usa el Presupuesto, que lleva sus cuentas en RD$: no puede pasar a %.', new.nombre, new.moneda using errcode = '22023';
  end if;
  if new.unido_a is not null and old.unido_a is null then
    raise exception '«%» la usa el Presupuesto: primero pasa sus movimientos a la cuenta que queda.', new.nombre using errcode = '22023';
  end if;
  perform set_config('personal.sinc', '1', true);
  update personal.caja_cuentas c
  set nombre = left(new.nombre, 120), tipo = personal.tipo_caja_de(new.clase, new.subtipo), limite = new.limite, actualizado_en = now()
  where c.id = v_caja
    and (c.nombre is distinct from left(new.nombre, 120) or c.tipo is distinct from personal.tipo_caja_de(new.clase, new.subtipo) or c.limite is distinct from new.limite);
  if new.cantidad is distinct from old.cantidad or new.saldo_fecha is distinct from old.saldo_fecha then
    if new.saldo_fecha is not null and v_inicio is not null and new.saldo_fecha > v_inicio then
      insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
      values (new.saldo_fecha - 1, v_caja, new.cantidad)
      on conflict (fecha, cuenta_id) do update set saldo = excluded.saldo, actualizado_en = now();
    else
      update personal.caja_cuentas c set saldo_inicial = new.cantidad, actualizado_en = now()
      where c.id = v_caja and c.saldo_inicial is distinct from new.cantidad;
    end if;
  end if;
  perform set_config('personal.sinc', '', true);
  return null;
end;
$$;

create trigger activos_despues after update on personal.activos
  for each row execute function personal.activos_despues();

-- ---------------------------------------------------------------------------
-- 5. Unir dos filas repetidas (lo confirma Mena en «Unir cuentas repetidas»)
-- ---------------------------------------------------------------------------
-- p_queda: la fila que se queda (la del Portafolio: conserva su id, sus transacciones y el uso de
-- tarjetas de los cierres). p_se_va: la repetida (normalmente la que vino del Presupuesto). Su enlace
-- con el Presupuesto pasa a p_queda (si las dos estaban en el Presupuesto, los movimientos, fijos y
-- cuadres de una pasan a la otra). p_saldo/p_fecha: el saldo correcto que Mena confirma (opcional).
-- La fila que se va NO se borra: queda archivada con unido_a = p_queda. Todo en una transacción.
create function personal.unir_registro(p_queda text, p_se_va text, p_saldo numeric default null, p_fecha date default null)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  q personal.activos;
  s personal.activos;
  v_cq text;
  v_cs text;
  v_mov integer := 0;
begin
  if not (select mercado.es_autorizado()) then
    raise exception 'No autorizado para unir cuentas' using errcode = '42501';
  end if;
  if p_queda is null or p_se_va is null or p_queda = p_se_va then
    raise exception 'Elige dos cuentas distintas para unir' using errcode = '22023';
  end if;
  select * into q from personal.activos a where a.id = p_queda for update;
  select * into s from personal.activos a where a.id = p_se_va for update;
  if q.id is null or s.id is null then
    raise exception 'Una de las dos cuentas ya no existe. Recarga la página.' using errcode = '22023';
  end if;
  if q.unido_a is not null or s.unido_a is not null then
    raise exception 'Una de las dos cuentas ya se unió con otra. Recarga la página.' using errcode = '22023';
  end if;
  if personal.es_deuda(q.clase) <> personal.es_deuda(s.clase) then
    raise exception 'No se puede unir una deuda con algo que tienes: «%» y «%» son de tipos distintos.', q.nombre, s.nombre using errcode = '22023';
  end if;
  if q.moneda <> s.moneda then
    raise exception '«%» está en % y «%» en %: no son la misma cuenta.', q.nombre, q.moneda, s.nombre, s.moneda using errcode = '22023';
  end if;

  select c.id into v_cq from personal.caja_cuentas c where c.registro_id = p_queda;
  select c.id into v_cs from personal.caja_cuentas c where c.registro_id = p_se_va;

  -- Lo que solo tenía la repetida pasa a la que queda (sin pisar lo que ya tiene).
  update personal.activos a
  set institucion = case when a.institucion = '' then s.institucion else a.institucion end,
      subtipo = coalesce(a.subtipo, case when a.clase = s.clase then s.subtipo end),
      limite = coalesce(a.limite, s.limite),
      dia_pago = coalesce(a.dia_pago, s.dia_pago),
      cuota = coalesce(a.cuota, s.cuota),
      tasa = case when a.tasa = 0 then s.tasa else a.tasa end,
      vencimiento = coalesce(a.vencimiento, s.vencimiento),
      actualizado_en = now()
  where a.id = p_queda;

  if v_cs is not null then
    select * into q from personal.activos a where a.id = p_queda;
    if q.moneda <> 'DOP' or q.clase in ('rentavariable', 'otros') or (q.precio is distinct from 1 and not personal.es_deuda(q.clase)) then
      raise exception '«%» no es una cuenta con saldo en pesos: no puede tomar el lugar de «%» en el Presupuesto.', q.nombre, s.nombre using errcode = '22023';
    end if;
    if v_cq is null then
      -- El enlace pasa tal cual (sin crear cuadres): la línea de tiempo del Presupuesto no cambia.
      perform set_config('personal.sinc', '1', true);
      update personal.caja_cuentas
      set registro_id = p_queda, nombre = left(q.nombre, 120), tipo = personal.tipo_caja_de(q.clase, q.subtipo), limite = q.limite, actualizado_en = now()
      where id = v_cs;
      perform set_config('personal.sinc', '', true);
      v_cq := v_cs;
    else
      -- Las dos estaban en el Presupuesto: todo lo de la repetida pasa a la que queda.
      update personal.caja_movimientos set cuenta = v_cq where cuenta = v_cs;
      get diagnostics v_mov = row_count;
      update personal.caja_movimientos set destino = v_cq where destino = v_cs;
      update personal.caja_recurrentes set cuenta = v_cq where cuenta = v_cs;
      update personal.caja_recurrentes set destino = v_cq where destino = v_cs;
      insert into personal.caja_saldos_reales (fecha, cuenta_id, saldo)
      select fecha, v_cq, saldo from personal.caja_saldos_reales where cuenta_id = v_cs
      on conflict (fecha, cuenta_id) do nothing;
      delete from personal.caja_saldos_reales where cuenta_id = v_cs;
      delete from personal.caja_cuentas where id = v_cs;
    end if;
  end if;

  update personal.transacciones set activo_id = p_queda where activo_id = p_se_va;
  update personal.activos set unido_a = p_queda, actualizado_en = now() where id = p_se_va;

  -- El saldo que Mena confirma (el trigger lo lleva a la línea de tiempo del Presupuesto). Sin saldo
  -- confirmado y con la repetida en el Presupuesto, manda el saldo del Presupuesto.
  if p_saldo is not null then
    update personal.activos a set cantidad = p_saldo, saldo_fecha = coalesce(p_fecha, personal.hoy_rd()), actualizado_en = now()
    where a.id = p_queda;
  elsif v_cs is not null and v_cq = v_cs then
    perform set_config('personal.sinc', '1', true);
    update personal.activos a set cantidad = s.cantidad, saldo_fecha = s.saldo_fecha, actualizado_en = now() where a.id = p_queda;
    perform set_config('personal.sinc', '', true);
  end if;

  return jsonb_build_object('queda', p_queda, 'archivada', p_se_va, 'cuenta_presupuesto', v_cq, 'movimientos_pasados', v_mov);
end;
$$;

comment on function personal.unir_registro(text, text, numeric, date) is
  'Une dos filas repetidas del registro único (la segunda queda archivada, no se borra). SECURITY INVOKER: RLS aplica. Ver docs/capital.md.';

revoke all on function personal.unir_registro(text, text, numeric, date) from public, anon;
grant execute on function personal.unir_registro(text, text, numeric, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Importaciones: ninguna borra lo que usa el otro módulo
-- ---------------------------------------------------------------------------

-- Portafolio: la sección «activos» reemplaza los instrumentos del Portafolio, pero NO borra ni pisa el
-- saldo de las cuentas que usa el Presupuesto (ese saldo es su línea de tiempo), ni las deudas, otros
-- activos o filas que vinieron del Presupuesto. Una fila con el mismo id se actualiza.
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
    delete from personal.activos a
    where a.origen = 'portafolio'
      and a.clase in ('efectivo', 'ahorros', 'rentafija', 'rentavariable')
      and not exists (select 1 from personal.caja_cuentas c where c.registro_id = a.id)
      and not exists (select 1 from personal.activos u where u.unido_a = a.id);
    insert into personal.activos
      (id, clase, nombre, institucion, simbolo, moneda, cantidad, precio, tasa, vencimiento, tipo_rf, orden, saldo_fecha)
    select x.id, personal.clase_capital(x.clase), x.nombre, coalesce(x.institucion, ''), nullif(x.simbolo, ''), x.moneda, x.cantidad,
           coalesce(x.precio, 1), coalesce(x.tasa, 0), x.vencimiento,
           case when personal.clase_capital(x.clase) = 'rentafija' then x.tipo_rf end, coalesce(x.orden, 0), personal.hoy_rd()
    from jsonb_to_recordset(p_datos -> 'activos') as x (
      id text, clase text, nombre text, institucion text, simbolo text, moneda text, cantidad numeric,
      precio numeric, tasa numeric, vencimiento date, tipo_rf text, orden integer)
    on conflict (id) do update set
      clase = excluded.clase, nombre = excluded.nombre, institucion = excluded.institucion, simbolo = excluded.simbolo,
      moneda = case when exists (select 1 from personal.caja_cuentas c where c.registro_id = personal.activos.id) then personal.activos.moneda else excluded.moneda end,
      cantidad = case when exists (select 1 from personal.caja_cuentas c where c.registro_id = personal.activos.id) then personal.activos.cantidad else excluded.cantidad end,
      saldo_fecha = case when exists (select 1 from personal.caja_cuentas c where c.registro_id = personal.activos.id) then personal.activos.saldo_fecha else excluded.saldo_fecha end,
      precio = excluded.precio, tasa = excluded.tasa, vencimiento = excluded.vencimiento, tipo_rf = excluded.tipo_rf,
      orden = excluded.orden, actualizado_en = now();
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

-- Presupuesto: reemplaza todo lo suyo como antes, pero el enlace de cada cuenta con el registro se
-- conserva por el id de la cuenta (o llega en cuentas[].registro_id, desde el asistente). Las filas del
-- registro NUNCA se borran desde aquí: una cuenta que ya no viene en el archivo deja de estar en el
-- Presupuesto, pero sigue en el Portafolio.
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

  insert into personal.caja_cuentas (id, nombre, tipo, saldo_inicial, limite, orden, registro_id)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'saldo_inicial')::numeric, 0),
         (e ->> 'limite')::numeric, coalesce((e ->> 'orden')::integer, 0),
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
    (id, nombre, tipo, monto, moneda, pago_total, cuenta, destino, categoria, frecuencia, dias, cada_n, fecha, desde, hasta, activo)
  select e ->> 'id', e ->> 'nombre', e ->> 'tipo', coalesce((e ->> 'monto')::numeric, 0), coalesce(e ->> 'moneda', 'DOP'),
         coalesce((e ->> 'pago_total')::boolean, false), e ->> 'cuenta', e ->> 'destino', e ->> 'categoria',
         coalesce(e ->> 'frecuencia', 'mensual'), coalesce(e ->> 'dias', ''), (e ->> 'cada_n')::integer,
         (e ->> 'fecha')::date, (e ->> 'desde')::date, (e ->> 'hasta')::date, coalesce((e ->> 'activo')::boolean, true)
  from jsonb_array_elements(coalesce(p_datos -> 'recurrentes', '[]')) with ordinality as t (e, i)
  order by i;

  insert into personal.caja_movimientos (id, fecha, tipo, monto, moneda, tasa, cuenta, destino, categoria, nota, recurrente_id)
  select e ->> 'id', (e ->> 'fecha')::date, e ->> 'tipo', (e ->> 'monto')::numeric, coalesce(e ->> 'moneda', 'DOP'),
         (e ->> 'tasa')::numeric, e ->> 'cuenta', e ->> 'destino', e ->> 'categoria', e ->> 'nota', e ->> 'recurrente_id'
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
-- 7. Precios de mercado: solo la renta variable vigente (no las filas archivadas)
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
  where a.clase = 'rentavariable' and a.simbolo is not null and a.unido_a is null;
$$;
revoke all on function mercado.simbolos_cartera() from public, anon, authenticated;
grant execute on function mercado.simbolos_cartera() to service_role;

-- ---------------------------------------------------------------------------
-- 8. Aportes del plan confirmados por Mena («Sí, lo hice»)
-- ---------------------------------------------------------------------------
-- Un aporte confirmado es una transacción del Portafolio (compra) que recuerda de qué mes del plan es
-- y, si salió de una cuenta del Presupuesto, el movimiento que lo refleja allí (ahorro realizado). Así
-- no se anota dos veces: el movimiento mueve el saldo de las cuentas y la transacción queda en el libro.

alter table personal.transacciones
  add column aporte_mes    text check (aporte_mes ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  add column movimiento_id text;
comment on column personal.transacciones.aporte_mes is 'Si es un aporte del plan confirmado con «Sí, lo hice»: el mes del plan (AAAA-MM).';
comment on column personal.transacciones.movimiento_id is 'Movimiento del Presupuesto (caja_movimientos.id) que refleja este aporte como ahorro realizado.';
create index transacciones_aporte on personal.transacciones (aporte_mes, activo_id) where aporte_mes is not null;
