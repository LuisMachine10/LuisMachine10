-- Strategya · Etapa E · Boletín y Bitácora por reglas (sin IA)
--
-- Cuatro ediciones armadas SOLO con plantillas y datos ya guardados en la base; ninguna llama a un
-- modelo de lenguaje. Las arma y las envía (Resend) la Edge Function `ingesta` con las tareas
-- boletin-am, boletin-cierre, boletin-finde y boletin-tasas; boletin-prueba atiende «Enviar prueba».
--
--   Bitácora Financiera · AM                         lunes a viernes 7:35 AM RD  = 11:35 UTC
--   Bitácora Financiera · Cierre                     lunes a viernes 5:05 PM RD  = 21:05 UTC
--   Bitácora Financiera · Fin de semana · Materias   sábado y domingo 7:35 AM RD = 11:35 UTC
--   Boletín de Tasas RD                              lunes 6:40 AM RD            = 10:40 UTC
-- RD es UTC−4 todo el año (sin horario de verano). Cada edición tiene una segunda pasada 10 minutos
-- después: solo reenvía si la primera falló (idempotencia en mercado.boletin_reservar).
--
-- Dónde viven las ediciones: mercado.boletin_ediciones. La prueba del esquema personal
-- (pruebas/db/capital-esquema.test.ts) fija la lista de tablas de `personal`, y una edición es en su
-- mayor parte información de mercado. Las ediciones que llevan «Tu dinero» quedan protegidas por RLS:
-- solo las lee su dueño (dueno = auth.uid()) y además debe ser un usuario autorizado.
-- «Tu dinero» se calcula en la app con el mismo motor del Portafolio (patrimonio, aportes, matriz de
-- riesgo) y se guarda como foto en mercado.boletin_tu_dinero (una fila por dueño, misma RLS); la
-- utilidad neta del mes sale en vivo de personal.resultado_mes.
--
-- Ninguna cifra, correo ni cuenta de Mena vive en este archivo. El destino del correo sale del
-- secreto BOLETIN_PARA o del correo del usuario dueño en auth.users (nunca del código).

insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('boletin', 'Strategya · Boletín por reglas', 'https://resend.com/docs/api-reference/emails/send-email', 'api', true, true,
   'Arma las ediciones del Boletín y la Bitácora con plantillas y datos guardados (sin IA) y las envía con Resend (RESEND_API_KEY).')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ediciones
-- ---------------------------------------------------------------------------

create table mercado.boletin_ediciones (
  id            bigint generated always as identity primary key,
  tipo          text not null check (tipo in ('am', 'cierre', 'finde', 'tasas')),
  fecha         date not null,
  prueba        boolean not null default false,
  asunto        text,
  contenido     jsonb not null default '{}'::jsonb,
  texto         text,
  html          text,
  palabras      integer,
  con_tu_dinero boolean not null default false,
  dueno         uuid references auth.users (id) on delete cascade,
  estado        text not null default 'armando' check (estado in ('armando', 'lista', 'enviada', 'sin_envio', 'error')),
  error         text,
  resend_id     text,
  intentos      integer not null default 1,
  creado_en     timestamptz not null default now(),
  armado_en     timestamptz,
  enviado_en    timestamptz,
  check (not con_tu_dinero or dueno is not null),
  check (pg_column_size(contenido) <= 262144)
);

comment on table mercado.boletin_ediciones is
  'Ediciones del Boletín y la Bitácora (por reglas, sin IA): asunto, contenido estructurado, texto plano, HTML y estado del envío. Una por tipo y día (las pruebas aparte).';
comment on column mercado.boletin_ediciones.fecha is 'Día de la edición en hora RD.';
comment on column mercado.boletin_ediciones.estado is
  'armando = reservada; lista = guardada, sin enviar aún; enviada; sin_envio = guardada pero sin RESEND_API_KEY o sin destino; error = falló el armado o Resend (ver error).';
comment on column mercado.boletin_ediciones.con_tu_dinero is 'true = trae la sección personal «Tu dinero»: solo la lee su dueño.';

create unique index boletin_una_por_dia on mercado.boletin_ediciones (tipo, fecha) where not prueba;
create index boletin_ediciones_reciente on mercado.boletin_ediciones (creado_en desc);

alter table mercado.boletin_ediciones enable row level security;
create policy "autorizado lee; Tu dinero solo su dueño" on mercado.boletin_ediciones
  for select to authenticated
  using ((select mercado.es_autorizado()) and (not con_tu_dinero or dueno = (select auth.uid())));

grant select on mercado.boletin_ediciones to authenticated;
grant all on mercado.boletin_ediciones to service_role;
grant usage, select on sequence mercado.boletin_ediciones_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- Foto de «Tu dinero» (la escribe la app, con el motor del Portafolio)
-- ---------------------------------------------------------------------------

create table mercado.boletin_tu_dinero (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  datos        jsonb not null,
  calculado_en timestamptz not null default now(),
  check (pg_column_size(datos) <= 16384)
);

comment on table mercado.boletin_tu_dinero is
  'Última foto de «Tu dinero» para el Boletín: patrimonio y su cambio del mes, aportes pendientes y riesgos altos, calculados por la app. Solo la lee y escribe su dueño.';

alter table mercado.boletin_tu_dinero enable row level security;
create policy "dueño lee" on mercado.boletin_tu_dinero for select to authenticated
  using (user_id = (select auth.uid()) and (select mercado.es_autorizado()));
create policy "dueño agrega" on mercado.boletin_tu_dinero for insert to authenticated
  with check (user_id = (select auth.uid()) and (select mercado.es_autorizado()));
create policy "dueño corrige" on mercado.boletin_tu_dinero for update to authenticated
  using (user_id = (select auth.uid()) and (select mercado.es_autorizado()))
  with check (user_id = (select auth.uid()) and (select mercado.es_autorizado()));

grant select, insert, update on mercado.boletin_tu_dinero to authenticated;
grant all on mercado.boletin_tu_dinero to service_role;

create function mercado.boletin_guardar_tu_dinero(p_datos jsonb)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  insert into mercado.boletin_tu_dinero (user_id, datos, calculado_en)
  values ((select auth.uid()), p_datos, now())
  on conflict (user_id) do update set datos = excluded.datos, calculado_en = excluded.calculado_en
  returning calculado_en;
$$;

revoke all on function mercado.boletin_guardar_tu_dinero(jsonb) from public, anon;
grant execute on function mercado.boletin_guardar_tu_dinero(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Pedidos de «Enviar prueba» (botón de /boletin)
-- ---------------------------------------------------------------------------

create table mercado.boletin_pedidos (
  id          bigint generated always as identity primary key,
  tipo        text not null check (tipo in ('am', 'cierre', 'finde', 'tasas')),
  user_id     uuid references auth.users (id) on delete cascade,
  pedido_en   timestamptz not null default now(),
  atendido_en timestamptz,
  edicion_id  bigint references mercado.boletin_ediciones (id) on delete set null,
  error       text
);

alter table mercado.boletin_pedidos enable row level security;
create policy "autorizado lee" on mercado.boletin_pedidos for select to authenticated using ((select mercado.es_autorizado()));
grant select on mercado.boletin_pedidos to authenticated;
grant all on mercado.boletin_pedidos to service_role;
grant usage, select on sequence mercado.boletin_pedidos_id_seq to service_role;

-- Una prueba cada 2 minutos como máximo; solo el dueño autorizado. La envía la Edge Function.
create function mercado.boletin_pedir_prueba(p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo timestamptz;
  v_pedido bigint;
  v_id     bigint;
begin
  if not mercado.es_autorizado() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_tipo is null or p_tipo not in ('am', 'cierre', 'finde', 'tasas') then
    raise exception 'Tipo de edición desconocido: %', coalesce(p_tipo, '(vacío)');
  end if;
  perform pg_advisory_xact_lock(hashtext('strategya_boletin_prueba'));
  select max(p.pedido_en) into v_ultimo from mercado.boletin_pedidos p;
  if v_ultimo is not null and v_ultimo > now() - interval '2 minutes' then
    return jsonb_build_object('ok', false, 'motivo', 'espera', 'disponible_en', v_ultimo + interval '2 minutes');
  end if;
  insert into mercado.boletin_pedidos (tipo, user_id) values (p_tipo, (select auth.uid())) returning id into v_id;
  v_pedido := mercado.invocar_tarea('ingesta', '{"tarea":"boletin-prueba"}'::jsonb);
  if v_pedido is null then
    update mercado.boletin_pedidos set atendido_en = now(), error = 'Las tareas no están configuradas (faltan los secretos en Vault).' where id = v_id;
    return jsonb_build_object('ok', false, 'motivo', 'sin_configurar');
  end if;
  return jsonb_build_object('ok', true, 'pedido', v_id);
end;
$$;

revoke all on function mercado.boletin_pedir_prueba(text) from public, anon;
grant execute on function mercado.boletin_pedir_prueba(text) to authenticated;

create function mercado.boletin_pedidos_pendientes()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'pedido_en', p.pedido_en) order by p.id), '[]'::jsonb)
  from mercado.boletin_pedidos p
  where p.atendido_en is null and p.pedido_en > now() - interval '1 hour'
$$;

create function mercado.boletin_atender_pedido(p_id bigint, p_edicion bigint, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update mercado.boletin_pedidos set atendido_en = now(), edicion_id = p_edicion, error = p_error where id = p_id
$$;

-- ---------------------------------------------------------------------------
-- Idempotencia y guardado (los llama la Edge Function con service_role)
-- ---------------------------------------------------------------------------

-- Reserva la edición del día. Devuelve su id si hay que armarla (nueva, o la anterior falló, o quedó
-- colgada más de 15 minutos) y null si ya se envió o se está armando: así nunca sale dos veces.
-- Las pruebas (p_prueba) no cuentan: siempre se crean aparte.
create function mercado.boletin_reservar(p_tipo text, p_fecha date, p_prueba boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_previa record;
begin
  if p_prueba then
    insert into mercado.boletin_ediciones (tipo, fecha, prueba) values (p_tipo, p_fecha, true) returning id into v_id;
    return v_id;
  end if;
  perform pg_advisory_xact_lock(hashtext('strategya_boletin_' || p_tipo || '_' || p_fecha::text));
  insert into mercado.boletin_ediciones (tipo, fecha) values (p_tipo, p_fecha)
  on conflict (tipo, fecha) where not prueba do nothing
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;
  select e.id, e.estado, e.creado_en, e.armado_en into v_previa
    from mercado.boletin_ediciones e
   where e.tipo = p_tipo and e.fecha = p_fecha and not e.prueba;
  if v_previa.estado = 'error'
     or (v_previa.estado in ('armando', 'lista') and coalesce(v_previa.armado_en, v_previa.creado_en) < now() - interval '15 minutes') then
    update mercado.boletin_ediciones
       set estado = 'armando', error = null, intentos = intentos + 1, creado_en = now()
     where id = v_previa.id;
    return v_previa.id;
  end if;
  return null;
end;
$$;

create function mercado.boletin_guardar(
  p_id bigint, p_asunto text, p_contenido jsonb, p_texto text, p_html text, p_palabras integer, p_con_tu_dinero boolean
)
returns void
language sql
security definer
set search_path = ''
as $$
  update mercado.boletin_ediciones
     set asunto = p_asunto, contenido = p_contenido, texto = p_texto, html = p_html, palabras = p_palabras,
         con_tu_dinero = p_con_tu_dinero,
         dueno = (select ua.user_id from mercado.usuarios_autorizados ua order by ua.creado_en, ua.user_id limit 1),
         estado = 'lista', armado_en = now()
   where id = p_id
$$;

create function mercado.boletin_marcar(p_id bigint, p_estado text, p_error text default null, p_resend_id text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update mercado.boletin_ediciones
     set estado = p_estado, error = p_error, resend_id = coalesce(p_resend_id, resend_id),
         enviado_en = case when p_estado = 'enviada' then now() else enviado_en end
   where id = p_id
$$;

-- Correo del usuario dueño (el primero autorizado). Solo el servidor lo lee; nunca va en el código.
create function mercado.boletin_destino()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from mercado.usuarios_autorizados ua
  join auth.users u on u.id = ua.user_id
  where u.email is not null
  order by ua.creado_en, ua.user_id
  limit 1
$$;

-- ---------------------------------------------------------------------------
-- Datos para armar una edición (un solo viaje a la base)
-- ---------------------------------------------------------------------------
-- La usan la Edge Function (service_role) y la «Vista previa» de la app (el dueño, con RLS).
-- Solo lee: últimos datos de cada serie activa, cierres semanales, umbrales, alertas, titulares,
-- agenda, emisiones, avisos, fondos, la edición anterior del mismo tipo, la AM de hoy (para el
-- Cierre), las preferencias del dueño y, si toca, «Tu dinero». Las cifras viajan como texto.
create function mercado.boletin_datos(p_tipo text, p_ahora timestamptz default now(), p_tu_dinero boolean default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_hoy     date := (p_ahora at time zone 'America/Santo_Domingo')::date;
  v_dueno   uuid;
  v_pref    jsonb;
  v_viernes date;
  v_incluir boolean;
  v_previa  jsonb;
  v_salida  jsonb;
begin
  if p_tipo is null or p_tipo not in ('am', 'cierre', 'finde', 'tasas') then
    raise exception 'Tipo de edición desconocido: %', coalesce(p_tipo, '(vacío)');
  end if;
  if (select auth.uid()) is not null and not mercado.es_autorizado() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_dueno := coalesce((select auth.uid()),
    (select ua.user_id from mercado.usuarios_autorizados ua order by ua.creado_en, ua.user_id limit 1));
  select p.valor into v_pref from personal.preferencias p where p.user_id = v_dueno and p.clave = 'boletin';
  -- Último viernes en o antes de hoy (cierre semanal).
  v_viernes := v_hoy - ((extract(isodow from v_hoy)::integer + 2) % 7);
  v_incluir := coalesce(p_tu_dinero, p_tipo in ('am', 'finde') and coalesce((v_pref ->> 'tu_dinero')::boolean, true));

  select jsonb_build_object('id', e.id, 'fecha', e.fecha, 'creado_en', e.creado_en)
    into v_previa
    from mercado.boletin_ediciones e
   where e.tipo = p_tipo and not e.prueba and e.fecha < v_hoy and e.estado in ('enviada', 'sin_envio', 'lista')
   order by e.fecha desc
   limit 1;

  select jsonb_build_object(
    'tipo', p_tipo,
    'ahora', p_ahora,
    'hoy', v_hoy,
    'viernes', v_viernes,
    'preferencias', coalesce(v_pref, '{}'::jsonb),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'serie_id', s.id, 'nombre', s.nombre, 'nombre_corto', s.nombre_corto, 'categoria', s.categoria,
        'unidad', s.unidad, 'frecuencia', s.frecuencia, 'max_antiguedad_min', s.max_antiguedad_min,
        'sustituto_de', s.sustituto_de, 'meta', s.meta,
        'valor', o.valor::text, 'cambio', o.cambio::text, 'cambio_pct', o.cambio_pct::text,
        'fecha_dato', o.fecha_dato, 'hora_dato', o.hora_dato, 'recogido_en', o.recogido_en,
        'url_dato', o.url_dato, 'estado', o.estado, 'fuente_id', o.fuente_id,
        'fuente_nombre', f.nombre, 'fuente_url', f.url) order by s.orden, s.id)
      from mercado.series s
      cross join lateral (
        select x.* from mercado.observaciones x
         where x.serie_id = s.id
           and x.recogido_en <= p_ahora
           and (x.hora_dato is null or x.hora_dato <= p_ahora)
           and x.fecha_dato <= v_hoy + 1
         order by x.fecha_dato desc, x.hora_dato desc nulls last
         limit 1
      ) o
      join mercado.fuentes f on f.id = o.fuente_id
      where s.activa and s.categoria <> 'otro' and s.id not like 'AIS\_%'
    ), '[]'::jsonb),
    'semana', case when p_tipo = 'finde' then coalesce((
      select jsonb_agg(jsonb_build_object(
        'serie_id', s.id, 'valor_fin', fin.valor::text, 'fecha_fin', fin.fecha_dato,
        'valor_ini', ini.valor::text, 'fecha_ini', ini.fecha_dato) order by s.orden)
      from mercado.series s
      cross join lateral (
        select x.valor, x.fecha_dato from mercado.observaciones x
         where x.serie_id = s.id and x.fecha_dato <= v_viernes and x.fecha_dato > v_viernes - 7 and x.recogido_en <= p_ahora
         order by x.fecha_dato desc, (x.hora_dato is null) desc, x.hora_dato desc
         limit 1
      ) fin
      left join lateral (
        select x.valor, x.fecha_dato from mercado.observaciones x
         where x.serie_id = s.id and x.fecha_dato <= v_viernes - 7 and x.fecha_dato > v_viernes - 14 and x.recogido_en <= p_ahora
         order by x.fecha_dato desc, (x.hora_dato is null) desc, x.hora_dato desc
         limit 1
      ) ini on true
      where s.activa and s.categoria in ('energia', 'metal', 'indice', 'divisa') and s.id not like 'COMB\_%'
    ), '[]'::jsonb) else '[]'::jsonb end,
    'umbrales', coalesce((
      select jsonb_agg(jsonb_build_object('serie_id', r.serie_id, 'umbral', r.umbral::text))
      from mercado.reglas_alerta r where r.tipo = 'cambio_pct_dia' and r.activa and r.umbral is not null
    ), '[]'::jsonb),
    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'serie_id', a.serie_id, 'nombre', s.nombre, 'nombre_corto', s.nombre_corto, 'unidad', s.unidad,
        'valor', a.valor::text, 'mensaje', a.mensaje, 'disparada_en', a.disparada_en,
        'fecha_dato', coalesce(o.fecha_dato, a.fecha), 'fuente_nombre', f.nombre,
        'fuente_url', coalesce(o.url_dato, f.url)) order by a.disparada_en desc)
      from mercado.alertas_disparadas a
      join mercado.series s on s.id = a.serie_id
      left join mercado.observaciones o on o.id = a.observacion_id
      left join mercado.fuentes f on f.id = coalesce(o.fuente_id, s.fuente_id)
      where a.disparada_en > p_ahora - interval '24 hours' and a.disparada_en <= p_ahora
    ), '[]'::jsonb),
    'titulares', coalesce((
      select jsonb_agg(t order by t.fecha desc) from (
        select n.id, n.titular, n.url, n.medio, n.fecha, n.categoria, n.fuente_id
        from mercado.noticias n
        where n.fecha > p_ahora - interval '48 hours' and n.fecha <= p_ahora
        order by n.fecha desc
        limit 500
      ) t
    ), '[]'::jsonb),
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fecha_hora', g.fecha_hora, 'institucion', g.institucion, 'evento', g.evento, 'importancia', g.importancia,
        'confirmado', g.confirmado, 'url', g.url, 'hora_conocida', g.hora_conocida, 'zona', g.zona) order by g.fecha_hora)
      from mercado.agenda g
      where g.fecha_hora >= date_trunc('day', p_ahora at time zone 'America/Santo_Domingo') at time zone 'America/Santo_Domingo'
        and g.fecha_hora < p_ahora + interval '9 days'
    ), '[]'::jsonb),
    'emisiones', coalesce((
      select jsonb_agg(e order by e.fecha desc, e.id desc) from (
        select x.id, x.fuente, x.numero, x.emisor, x.instrumento, x.monto::text as monto, x.moneda, x.tasa::text as tasa,
               x.fecha, x.url, x.descripcion, x.recogido_en
        from mercado.emisiones_rd x
        where x.recogido_en <= p_ahora
        order by x.fecha desc, x.id desc
        limit 40
      ) e
    ), '[]'::jsonb),
    'avisos', coalesce((
      select jsonb_agg(v order by v.fecha desc) from (
        select i.institucion, i.titulo, i.url, i.fecha
        from mercado.instituciones_feed i
        where i.institucion in ('SIMV', 'MICM') and i.fecha > p_ahora - interval '14 days' and i.fecha <= p_ahora
        order by i.fecha desc
        limit 40
      ) v
    ), '[]'::jsonb),
    'fondos', case when p_tipo = 'tasas' then coalesce((
      select jsonb_agg(u order by u.safi, u.fondo, u.moneda, u.plazo_dias) from (
        select distinct on (r.safi, r.fondo, r.moneda, r.plazo_dias)
               r.safi, r.fondo, r.moneda, r.plazo_dias, r.rendimiento::text as rendimiento, r.fecha_corte, r.url_fuente, r.origen
        from mercado.fondos_rendimientos r
        where r.plazo_dias in (30, 360, 365) and r.fecha_corte > v_hoy - 400 and r.fecha_corte <= v_hoy
        order by r.safi, r.fondo, r.moneda, r.plazo_dias, r.fecha_corte desc
      ) u
    ), '[]'::jsonb) else '[]'::jsonb end,
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nombre', f.nombre, 'url', f.url) order by f.id) from mercado.fuentes f), '[]'::jsonb),
    'previa', v_previa,
    'am_hoy', case when p_tipo = 'cierre' then (
      select jsonb_build_object('id', e.id, 'creado_en', coalesce(e.armado_en, e.creado_en), 'niveles', coalesce(e.contenido -> 'niveles', '{}'::jsonb))
      from mercado.boletin_ediciones e
      where e.tipo = 'am' and e.fecha = v_hoy and not e.prueba and e.estado in ('enviada', 'sin_envio', 'lista')
      limit 1
    ) end,
    'tu_dinero', case when v_incluir then jsonb_build_object(
      'configurado', exists (select 1 from personal.caja_config),
      'presupuesto', personal.resultado_mes(v_hoy),
      'foto', (select t.datos from mercado.boletin_tu_dinero t where t.user_id = v_dueno),
      'foto_en', (select t.calculado_en from mercado.boletin_tu_dinero t where t.user_id = v_dueno)
    ) end
  ) into v_salida;

  return v_salida;
end;
$$;

revoke all on function mercado.boletin_datos(text, timestamptz, boolean) from public, anon;
grant execute on function mercado.boletin_datos(text, timestamptz, boolean) to authenticated, service_role;

revoke all on function mercado.boletin_reservar(text, date, boolean) from public, anon, authenticated;
revoke all on function mercado.boletin_guardar(bigint, text, jsonb, text, text, integer, boolean) from public, anon, authenticated;
revoke all on function mercado.boletin_marcar(bigint, text, text, text) from public, anon, authenticated;
revoke all on function mercado.boletin_destino() from public, anon, authenticated;
revoke all on function mercado.boletin_pedidos_pendientes() from public, anon, authenticated;
revoke all on function mercado.boletin_atender_pedido(bigint, bigint, text) from public, anon, authenticated;
grant execute on function mercado.boletin_reservar(text, date, boolean) to service_role;
grant execute on function mercado.boletin_guardar(bigint, text, jsonb, text, text, integer, boolean) to service_role;
grant execute on function mercado.boletin_marcar(bigint, text, text, text) to service_role;
grant execute on function mercado.boletin_destino() to service_role;
grant execute on function mercado.boletin_pedidos_pendientes() to service_role;
grant execute on function mercado.boletin_atender_pedido(bigint, bigint, text) to service_role;

-- La lista de /boletin se refresca sola cuando sale una edición.
alter publication supabase_realtime add table mercado.boletin_ediciones;

-- ---------------------------------------------------------------------------
-- Horarios (UTC). Primera pasada a la hora pedida; la segunda, 10 minutos después, solo reenvía si falló.
-- ---------------------------------------------------------------------------

select cron.schedule('strategya-boletin-am',              '35 11 * * 1-5', $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-am"}')$$);
select cron.schedule('strategya-boletin-am-reintento',    '45 11 * * 1-5', $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-am"}')$$);
select cron.schedule('strategya-boletin-cierre',          '5 21 * * 1-5',  $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-cierre"}')$$);
select cron.schedule('strategya-boletin-cierre-reintento','15 21 * * 1-5', $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-cierre"}')$$);
select cron.schedule('strategya-boletin-finde',           '35 11 * * 0,6', $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-finde"}')$$);
select cron.schedule('strategya-boletin-finde-reintento', '45 11 * * 0,6', $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-finde"}')$$);
select cron.schedule('strategya-boletin-tasas',           '40 10 * * 1',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-tasas"}')$$);
select cron.schedule('strategya-boletin-tasas-reintento', '50 10 * * 1',   $$select mercado.invocar_tarea('ingesta', '{"tarea":"boletin-tasas"}')$$);

-- Limpieza: las pruebas viejas no se guardan para siempre (las ediciones reales sí).
select cron.schedule('strategya-boletin-limpieza', '55 8 * * *', $$
  delete from mercado.boletin_ediciones where prueba and creado_en < now() - interval '30 days';
  delete from mercado.boletin_pedidos where pedido_en < now() - interval '30 days';
$$);
