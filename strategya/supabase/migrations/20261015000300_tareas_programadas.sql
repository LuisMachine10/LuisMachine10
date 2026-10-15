-- Strategya · Fase 1 · tareas programadas
--
-- pg_cron dispara, pg_net llama a la Edge Function, Vault guarda la URL y el secreto.
-- Ninguna clave vive en este archivo: se cargan una vez con mercado.configurar_tareas(...)
-- (ver README, paso «Programar las tareas»).
--
-- pg_cron corre en UTC. República Dominicana es UTC−4 todo el año (sin horario de verano).

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Permisos que la documentación de Supabase indica para usar pg_cron como postgres.
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- ---------------------------------------------------------------------------
-- Configuración de secretos (solo el dueño de la base: postgres)
-- ---------------------------------------------------------------------------

create function mercado.configurar_tareas(p_url_proyecto text, p_secreto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_url_proyecto is null or p_url_proyecto !~ '^https?://[^/[:space:]]+$' then
    raise exception 'URL de proyecto inválida (esperado https://<ref>.supabase.co, sin barra final): %', p_url_proyecto;
  end if;
  if p_secreto is null or length(p_secreto) < 32 then
    raise exception 'El secreto de las tareas debe tener al menos 32 caracteres';
  end if;

  select s.id into v_id from vault.secrets s where s.name = 'strategya_url_proyecto';
  if v_id is null then
    perform vault.create_secret(p_url_proyecto, 'strategya_url_proyecto', 'URL base de las Edge Functions de Strategya');
  else
    perform vault.update_secret(v_id, p_url_proyecto);
  end if;

  v_id := null;
  select s.id into v_id from vault.secrets s where s.name = 'strategya_secreto_tareas';
  if v_id is null then
    perform vault.create_secret(p_secreto, 'strategya_secreto_tareas', 'Secreto que exigen las Edge Functions de ingesta');
  else
    perform vault.update_secret(v_id, p_secreto);
  end if;
end;
$$;

revoke all on function mercado.configurar_tareas(text, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Invocar una Edge Function de ingesta
-- ---------------------------------------------------------------------------

create function mercado.invocar_tarea(p_funcion text, p_cuerpo jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url     text;
  v_secreto text;
  v_pedido  bigint;
begin
  if p_funcion !~ '^[a-z0-9-]+$' then
    raise exception 'Nombre de función inválido: %', p_funcion;
  end if;

  select ds.decrypted_secret into v_url from vault.decrypted_secrets ds where ds.name = 'strategya_url_proyecto';
  select ds.decrypted_secret into v_secreto from vault.decrypted_secrets ds where ds.name = 'strategya_secreto_tareas';

  if v_url is null or v_secreto is null then
    insert into mercado.corridas (tarea, estado, fin, error)
    values (coalesce(p_cuerpo ->> 'tarea', p_funcion), 'error', now(),
            'No se pudo invocar: faltan los secretos en Vault. Correr mercado.configurar_tareas(url, secreto).');
    return null;
  end if;

  select net.http_post(
    url := v_url || '/functions/v1/' || p_funcion,
    body := p_cuerpo,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-strategya-secreto', v_secreto),
    timeout_milliseconds := 120000
  ) into v_pedido;

  return v_pedido;
end;
$$;

revoke all on function mercado.invocar_tarea(text, jsonb) from public, anon, authenticated;
grant execute on function mercado.invocar_tarea(text, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Horarios (UTC)
-- ---------------------------------------------------------------------------

-- Tesoro: la curva del día se publica al cierre de la tarde en Nueva York.
--   22:15 UTC = 6:15 PM RD · 23:45 UTC = 7:45 PM RD (segunda pasada por si se atrasa)
--   11:00 UTC = 7:00 AM RD de lunes a sábado (recupera lo que la noche no vio)
select cron.schedule('strategya-tesoro-tarde',  '15 22 * * 1-5', $$select mercado.invocar_tarea('ingesta', '{"tarea":"tesoro"}')$$);
select cron.schedule('strategya-tesoro-noche',  '45 23 * * 1-5', $$select mercado.invocar_tarea('ingesta', '{"tarea":"tesoro"}')$$);
select cron.schedule('strategya-tesoro-manana', '0 11 * * 1-6',  $$select mercado.invocar_tarea('ingesta', '{"tarea":"tesoro"}')$$);

-- Limpieza diaria (4:30 AM RD): corridas viejas, corridas colgadas y el historial de pg_cron.
select cron.schedule('strategya-limpieza', '30 8 * * *', $$
  update mercado.corridas
     set estado = 'error', fin = now(), error = 'Sin respuesta de la función (se marcó como colgada)'
   where estado = 'corriendo' and inicio < now() - interval '30 minutes';
  delete from mercado.corridas where inicio < now() - interval '90 days';
  delete from cron.job_run_details where end_time < now() - interval '7 days';
$$);
