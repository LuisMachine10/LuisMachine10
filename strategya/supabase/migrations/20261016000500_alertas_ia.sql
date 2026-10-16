-- Strategya · Fase 5 (alertas) y Fase 6 (IA con tope de gasto)
--
-- Alertas: reglas sembradas, evaluación en SQL con datos confirmados (estado ok, del día de mercado en
-- hora RD), una alerta por activo y día, envío por correo desde la Edge Function (Resend).
-- IA: la tabla mercado.explicaciones guarda texto redactado SOLO a partir de datos y titulares ya
-- guardados. El gasto mensual sale de sumar explicaciones.costo_usd; el tope lo aplica la tarea.
--
-- Hora RD = America/Santo_Domingo (UTC−4 todo el año). pg_cron corre en UTC.

-- ---------------------------------------------------------------------------
-- Fuentes de las tareas de este módulo (las corridas referencian una fuente)
-- ---------------------------------------------------------------------------

insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('resend', 'Resend · correo de alertas', 'https://resend.com/docs/api-reference/emails/send-email', 'api', true, true,
   'API oficial de envío de correo (RESEND_API_KEY). Solo envía las alertas a ALERTAS_EMAIL_DESTINO. Sin clave, las alertas quedan solo en pantalla.'),
  ('anthropic', 'Anthropic · Claude API', 'https://docs.claude.com/en/api/messages', 'api', true, true,
   'Redacta texto (porqués, Las 5 del día, Guerras) a partir de datos y titulares ya guardados. Nunca aporta cifras. Tope mensual IA_TOPE_MENSUAL_USD.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Alertas
-- ---------------------------------------------------------------------------

create unique index if not exists reglas_alerta_serie_tipo on mercado.reglas_alerta (serie_id, tipo);

alter table mercado.alertas_disparadas
  add column if not exists observacion_id bigint references mercado.observaciones (id) on delete set null,
  add column if not exists detalle jsonb not null default '{}'::jsonb;

comment on column mercado.alertas_disparadas.observacion_id is
  'Observación confirmada que disparó la alerta (fuente, fecha y hora del dato).';

create index if not exists alertas_disparadas_fecha on mercado.alertas_disparadas (fecha desc, disparada_en desc);

insert into mercado.reglas_alerta (serie_id, tipo, umbral, nota) values
  ('ORO',          'cambio_pct_dia',   2,    'Oro: movimiento de ±2 % en el día.'),
  ('ORO',          'nivel_bajo',       4000, 'Oro por debajo de US$4,000/oz.'),
  ('ORO',          'nivel_sobre',      4300, 'Oro por encima de US$4,300/oz.'),
  ('PLATA',        'cambio_pct_dia',   4,    'Plata: movimiento de ±4 % en el día.'),
  ('PLATA',        'nivel_bajo',       52,   'Plata por debajo de US$52/oz.'),
  ('PLATA',        'nivel_sobre',      62,   'Plata por encima de US$62/oz.'),
  ('COBRE_CPER',   'cambio_pct_dia',   2.5,
   'Cobre vía ETF CPER: ±2.5 % en el día. El umbral en US$/t de la LME no aplica: no hay fuente LME en Strategya, y el ETF no cotiza en US$/t.'),
  ('USDDOP_VENTA', 'nivel_sobre',      63,   'Dólar BCRD (venta) por encima de RD$63.'),
  ('USDDOP_VENTA', 'cambio_pct_dia',   0.5,  'Dólar BCRD (venta): movimiento de ±0.5 % en el día.'),
  ('TPM_BCRD',     'cualquier_cambio', null, 'Cualquier cambio de la tasa de política monetaria del BCRD.'),
  ('TASA_FED_SUP', 'cualquier_cambio', null, 'Cualquier cambio del techo del rango de la Fed.'),
  ('BRENT',        'nivel_sobre',      110,  'Brent por encima de US$110/bbl.'),
  ('BRENT',        'nivel_bajo',       90,   'Brent por debajo de US$90/bbl.'),
  ('IDX_SPX',      'cambio_pct_dia',   2,    'S&P 500: movimiento de ±2 % en el día.'),
  ('UST_10A',      'nivel_sobre',      5.40, 'Bono del Tesoro a 10 años por encima de 5.40 %.')
on conflict (serie_id, tipo) do nothing;

-- Texto corto de un número (sin ceros de relleno): 63.5000 → 63.5
create function mercado.num_texto(p numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select trim_scale(p)::text $$;

-- Evalúa las reglas activas contra el último dato confirmado de cada serie y registra las nuevas.
--   · Solo observaciones con estado 'ok' y recogidas hasta p_ahora.
--   · cambio_pct_dia / nivel_sobre / nivel_bajo: el dato debe ser del día de mercado (fecha_dato = hoy RD).
--   · cualquier_cambio: el último dato (de los últimos 7 días) cambió frente al anterior y se confirmó hoy.
--   · Una alerta por activo y día (restricción única serie_id, fecha): si varias reglas se cumplen, gana
--     la de menor id; lo ya registrado no se repite.
-- Devuelve un arreglo JSON con las alertas nuevas.
create function mercado.evaluar_alertas(p_ahora timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (p_ahora at time zone 'America/Santo_Domingo')::date;
  v_nuevas jsonb;
begin
  with candidatas as (
    select
      r.id as regla_id, r.serie_id, r.tipo, r.umbral,
      o.id as obs_id, o.valor, o.cambio, o.cambio_pct, o.fecha_dato, o.hora_dato,
      s.nombre_corto, s.unidad
    from mercado.reglas_alerta r
    join mercado.series s on s.id = r.serie_id and s.activa
    cross join lateral (
      select x.*
      from mercado.observaciones x
      where x.serie_id = r.serie_id
        and x.estado = 'ok'
        -- v_hoy + 1: los futuros (oro, plata, Brent) abren la sesión del día siguiente a las 6:00 PM
        -- de Nueva York, y su fecha_dato ya es mañana mientras en RD todavía es hoy.
        and x.fecha_dato between v_hoy - 7 and v_hoy + 1
        and x.recogido_en <= p_ahora
        and (x.hora_dato is null or x.hora_dato <= p_ahora)
      order by x.fecha_dato desc, x.hora_dato desc nulls last
      limit 1
    ) o
    where r.activa
      and case r.tipo
        when 'cambio_pct_dia' then o.fecha_dato >= v_hoy and o.cambio_pct is not null and abs(o.cambio_pct) >= r.umbral
        when 'nivel_sobre' then o.fecha_dato >= v_hoy and o.valor > r.umbral
        when 'nivel_bajo' then o.fecha_dato >= v_hoy and o.valor < r.umbral
        when 'cualquier_cambio' then o.cambio is not null and o.cambio <> 0
          and (o.recogido_en at time zone 'America/Santo_Domingo')::date = v_hoy
        else false
      end
  ),
  elegidas as (
    select distinct on (c.serie_id) c.*
    from candidatas c
    order by c.serie_id, c.regla_id
  ),
  insertadas as (
    insert into mercado.alertas_disparadas (regla_id, serie_id, fecha, valor, mensaje, observacion_id, detalle)
    select
      e.regla_id, e.serie_id, v_hoy, e.valor,
      case e.tipo
        when 'cambio_pct_dia' then format('cambio del día %s%s %% (umbral ±%s %%)',
          case when e.cambio_pct > 0 then '+' when e.cambio_pct < 0 then '−' else '' end,
          mercado.num_texto(round(abs(e.cambio_pct), 2)), mercado.num_texto(e.umbral))
        when 'nivel_sobre' then format('%s %s, por encima del umbral de %s %s',
          mercado.num_texto(e.valor), e.unidad, mercado.num_texto(e.umbral), e.unidad)
        when 'nivel_bajo' then format('%s %s, por debajo del umbral de %s %s',
          mercado.num_texto(e.valor), e.unidad, mercado.num_texto(e.umbral), e.unidad)
        else format('cambió de %s a %s %s (%s%s)',
          mercado.num_texto(e.valor - e.cambio), mercado.num_texto(e.valor), e.unidad,
          case when e.cambio > 0 then '+' else '−' end, mercado.num_texto(abs(e.cambio)))
      end,
      e.obs_id,
      jsonb_build_object('tipo', e.tipo, 'umbral', mercado.num_texto(e.umbral), 'fecha_dato', e.fecha_dato,
                         'cambio_pct', mercado.num_texto(e.cambio_pct), 'cambio', mercado.num_texto(e.cambio))
    from elegidas e
    on conflict (serie_id, fecha) do nothing
    returning *
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'regla_id', i.regla_id, 'serie_id', i.serie_id, 'fecha', i.fecha,
           'valor', i.valor::text, 'mensaje', i.mensaje, 'tipo', i.detalle ->> 'tipo') order by i.id), '[]'::jsonb)
    into v_nuevas
  from insertadas i;

  return v_nuevas;
end;
$$;

-- Alertas sin enviar de hoy y ayer (hora RD), con todo lo que necesita el correo.
create function mercado.alertas_pendientes(p_ahora timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', a.id, 'serie_id', a.serie_id, 'fecha', a.fecha, 'valor', a.valor::text, 'mensaje', a.mensaje,
      'disparada_en', a.disparada_en, 'tipo', r.tipo, 'umbral', r.umbral::text,
      'nombre', s.nombre, 'nombre_corto', s.nombre_corto, 'unidad', s.unidad, 'categoria', s.categoria,
      'fuente', f.nombre, 'fuente_url', f.url,
      'fecha_dato', o.fecha_dato, 'hora_dato', o.hora_dato, 'recogido_en', o.recogido_en, 'url_dato', o.url_dato,
      'cambio_pct', o.cambio_pct::text, 'cambio', o.cambio::text
    ) order by a.disparada_en, a.id), '[]'::jsonb)
  from mercado.alertas_disparadas a
  join mercado.reglas_alerta r on r.id = a.regla_id
  join mercado.series s on s.id = a.serie_id
  left join mercado.observaciones o on o.id = a.observacion_id
  left join mercado.fuentes f on f.id = coalesce(o.fuente_id, s.fuente_id)
  where a.enviada_en is null
    and a.fecha >= (p_ahora at time zone 'America/Santo_Domingo')::date - 1
$$;

create function mercado.marcar_alerta_enviada(p_id bigint, p_canal text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with u as (
    update mercado.alertas_disparadas set enviada_en = now(), canal = p_canal
    where id = p_id and enviada_en is null
    returning 1
  )
  select exists (select 1 from u)
$$;

-- ---------------------------------------------------------------------------
-- IA
-- ---------------------------------------------------------------------------

alter table mercado.explicaciones
  add column if not exists datos jsonb,
  add column if not exists confirmada boolean not null default true;

comment on column mercado.explicaciones.datos is
  'Estructura validada del texto: Las 5 del día (items) o Guerras (conflictos); en porqué, el dato explicado.';
comment on column mercado.explicaciones.confirmada is
  'false = la salida no pasó la validación o los titulares no explican el movimiento («causa no confirmada»).';

create index if not exists explicaciones_tipo_fecha on mercado.explicaciones (tipo, fecha desc);
create index if not exists explicaciones_serie_fecha on mercado.explicaciones (serie_id, fecha desc);

-- Gasto de IA del mes en curso (mes de RD), en US$, como texto exacto.
create function mercado.gasto_ia_mes(p_ahora timestamptz default now())
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(e.costo_usd), 0)::text
  from mercado.explicaciones e
  where e.fecha >= (date_trunc('month', p_ahora at time zone 'America/Santo_Domingo') at time zone 'America/Santo_Domingo')
    and e.fecha <= p_ahora
$$;

-- Series que se movieron más que su umbral (índices ±1 %, metales ±1.5 %, energía ±2 %, divisas ±0.5 %,
-- cripto ±3 %) y no tienen un porqué propio en los últimos 15 minutos ni uno para el mismo dato.
create function mercado.ia_candidatos_porque(p_ahora timestamptz default now(), p_limite integer default 8)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with umbrales (categoria, umbral) as (
    values ('indice', 1.0), ('metal', 1.5), ('energia', 2.0), ('divisa', 0.5), ('cripto', 3.0)
  ),
  ultima as (
    select distinct on (o.serie_id)
      o.serie_id, o.valor, o.cambio, o.cambio_pct, o.fecha_dato, o.hora_dato, o.url_dato,
      s.nombre, s.categoria, s.unidad, s.sustituto_de, u.umbral, f.nombre as fuente
    from mercado.observaciones o
    join mercado.series s on s.id = o.serie_id and s.activa
    join umbrales u on u.categoria = s.categoria
    join mercado.fuentes f on f.id = o.fuente_id
    where o.estado = 'ok'
      and o.fecha_dato >= (p_ahora at time zone 'America/Santo_Domingo')::date - 1
      and o.recogido_en <= p_ahora
      and (o.hora_dato is null or o.hora_dato between p_ahora - interval '20 hours' and p_ahora)
      and (s.id not like 'ETF\_%')
    order by o.serie_id, o.fecha_dato desc, o.hora_dato desc nulls last
  )
  select coalesce(jsonb_agg(c.fila order by c.orden desc), '[]'::jsonb)
  from (
    select abs(u.cambio_pct) as orden, jsonb_build_object(
      'serie_id', u.serie_id, 'nombre', u.nombre, 'categoria', u.categoria, 'unidad', u.unidad,
      'sustituto_de', u.sustituto_de, 'valor', u.valor::text, 'cambio', u.cambio::text,
      'cambio_pct', u.cambio_pct::text, 'umbral', u.umbral::text, 'fecha_dato', u.fecha_dato,
      'hora_dato', u.hora_dato, 'fuente', u.fuente) as fila
    from ultima u
    where u.cambio_pct is not null
      and abs(u.cambio_pct) > u.umbral
      and not exists (
        select 1 from mercado.explicaciones e
        where e.serie_id = u.serie_id and e.tipo = 'porque'
          and (e.fecha > p_ahora - interval '15 minutes'
               or (e.datos ->> 'fecha_dato' = u.fecha_dato::text and e.datos ->> 'valor' = u.valor::text))
      )
    order by abs(u.cambio_pct) desc
    limit greatest(p_limite, 0)
  ) c
$$;

-- Titulares guardados (solo titular, medio, fecha y enlace) para armar el mensaje a la IA.
-- p_categorias: arreglo JSON de categorías (["mercado","rd"]); jsonb para que PostgREST y SQL directo lo pasen igual.
create function mercado.ia_titulares(p_desde timestamptz, p_categorias jsonb, p_limite integer default 40)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.fila order by t.fecha desc), '[]'::jsonb)
  from (
    select n.fecha, jsonb_build_object('id', n.id, 'titular', n.titular, 'url', n.url, 'medio', n.medio,
      'fecha', n.fecha, 'pais', n.pais, 'categoria', n.categoria) as fila
    from mercado.noticias n
    where n.fecha >= p_desde
      and n.categoria in (select jsonb_array_elements_text(p_categorias))
    order by n.fecha desc
    limit greatest(p_limite, 0)
  ) t
$$;

-- Último dato confirmado de cada serie activa (de los últimos 4 días): «las observaciones del día».
create function mercado.ia_observaciones_dia(p_ahora timestamptz default now())
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(u.fila order by u.orden), '[]'::jsonb)
  from (
    select distinct on (o.serie_id) s.orden, jsonb_build_object(
      'serie_id', o.serie_id, 'nombre', s.nombre, 'unidad', s.unidad, 'valor', o.valor::text,
      'cambio', o.cambio::text, 'cambio_pct', o.cambio_pct::text, 'fecha_dato', o.fecha_dato,
      'fuente', f.nombre) as fila
    from mercado.observaciones o
    join mercado.series s on s.id = o.serie_id and s.activa
    join mercado.fuentes f on f.id = o.fuente_id
    where o.estado = 'ok'
      and o.fecha_dato >= (p_ahora at time zone 'America/Santo_Domingo')::date - 4
      and o.recogido_en <= p_ahora
      and s.id not like 'ETF\_%'
    order by o.serie_id, o.fecha_dato desc, o.hora_dato desc nulls last
  ) u
$$;

-- Pedidos manuales del resumen (botón de la terminal): uno cada 15 minutos como máximo.
create table mercado.pedidos_resumen_ia (
  id        bigint generated always as identity primary key,
  pedido_en timestamptz not null default now(),
  user_id   uuid references auth.users (id) on delete set null,
  pedido_red bigint
);

create function mercado.pedir_resumen_ia()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo timestamptz;
  v_pedido bigint;
begin
  if not mercado.es_autorizado() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('strategya_pedir_resumen_ia'));
  select max(p.pedido_en) into v_ultimo from mercado.pedidos_resumen_ia p;
  if v_ultimo is not null and v_ultimo > now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'motivo', 'espera', 'disponible_en', v_ultimo + interval '15 minutes');
  end if;
  v_pedido := mercado.invocar_tarea('ingesta', '{"tarea":"ia-resumen"}'::jsonb);
  if v_pedido is null then
    return jsonb_build_object('ok', false, 'motivo', 'sin_configurar');
  end if;
  insert into mercado.pedidos_resumen_ia (user_id, pedido_red) values ((select auth.uid()), v_pedido);
  return jsonb_build_object('ok', true, 'disponible_en', now() + interval '15 minutes');
end;
$$;

-- ---------------------------------------------------------------------------
-- Permisos y RLS
-- ---------------------------------------------------------------------------

grant select on mercado.pedidos_resumen_ia to authenticated;
grant all on mercado.pedidos_resumen_ia to service_role;
grant usage, select on all sequences in schema mercado to service_role;
alter table mercado.pedidos_resumen_ia enable row level security;
create policy "autorizado lee" on mercado.pedidos_resumen_ia
  for select to authenticated using ((select mercado.es_autorizado()));

revoke all on function mercado.num_texto(numeric) from public, anon;
grant execute on function mercado.num_texto(numeric) to authenticated, service_role;

revoke all on function mercado.evaluar_alertas(timestamptz) from public, anon, authenticated;
revoke all on function mercado.alertas_pendientes(timestamptz) from public, anon, authenticated;
revoke all on function mercado.marcar_alerta_enviada(bigint, text) from public, anon, authenticated;
revoke all on function mercado.ia_candidatos_porque(timestamptz, integer) from public, anon, authenticated;
revoke all on function mercado.ia_titulares(timestamptz, jsonb, integer) from public, anon, authenticated;
revoke all on function mercado.ia_observaciones_dia(timestamptz) from public, anon, authenticated;
grant execute on function mercado.evaluar_alertas(timestamptz) to service_role;
grant execute on function mercado.alertas_pendientes(timestamptz) to service_role;
grant execute on function mercado.marcar_alerta_enviada(bigint, text) to service_role;
grant execute on function mercado.ia_candidatos_porque(timestamptz, integer) to service_role;
grant execute on function mercado.ia_titulares(timestamptz, jsonb, integer) to service_role;
grant execute on function mercado.ia_observaciones_dia(timestamptz) to service_role;

-- Lectura del gasto: invoker, así que a Mena le aplica la RLS de explicaciones.
revoke all on function mercado.gasto_ia_mes(timestamptz) from public, anon;
grant execute on function mercado.gasto_ia_mes(timestamptz) to authenticated, service_role;

revoke all on function mercado.pedir_resumen_ia() from public, anon;
grant execute on function mercado.pedir_resumen_ia() to authenticated;

alter publication supabase_realtime add table mercado.alertas_disparadas;
alter publication supabase_realtime add table mercado.explicaciones;

-- ---------------------------------------------------------------------------
-- Horarios (UTC)
-- ---------------------------------------------------------------------------

-- Alertas: cada 5 minutos (evalúa y envía las pendientes).
select cron.schedule('strategya-alertas', '*/5 * * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"alertas"}')$$);
-- Porqués: cada 15 minutos (solo series que pasaron su umbral).
select cron.schedule('strategya-ia-porque', '*/15 * * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"ia-porque"}')$$);
-- Las 5 del día y Guerras: 11:35 UTC = 7:35 AM RD · 21:05 UTC = 5:05 PM RD, todos los días.
select cron.schedule('strategya-ia-resumen-manana', '35 11 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"ia-resumen"}')$$);
select cron.schedule('strategya-ia-resumen-tarde', '5 21 * * *', $$select mercado.invocar_tarea('ingesta', '{"tarea":"ia-resumen"}')$$);
