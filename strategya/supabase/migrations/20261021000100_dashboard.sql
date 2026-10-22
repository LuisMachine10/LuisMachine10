-- Strategya · Dashboard personalizable
--
-- personal.preferencias guarda cómo quiere ver Mena la app: la disposición del Dashboard (clave
-- «dashboard»: orden, tamaño y si se ve cada widget) y sus filtros de noticias (clave «noticias»:
-- medios, categorías y palabras clave). Ninguna cifra financiera vive aquí. Cada usuario ve y edita
-- solo sus filas, y además debe ser un usuario autorizado (mercado.es_autorizado()).

create table personal.preferencias (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  clave          text not null check (clave ~ '^[a-z][a-z0-9_-]{0,39}$'),
  valor          jsonb not null,
  actualizado_en timestamptz not null default now(),
  primary key (user_id, clave),
  -- Una preferencia es pequeña: si pasa de 32 KB algo anda mal (la app nunca escribe tanto).
  check (pg_column_size(valor) <= 32768)
);

comment on table personal.preferencias is 'Preferencias de pantalla por usuario (clave «dashboard», «noticias»…). Sin cifras financieras.';

alter table personal.preferencias enable row level security;

create policy "dueño lee" on personal.preferencias for select to authenticated
  using (user_id = (select auth.uid()) and (select mercado.es_autorizado()));
create policy "dueño agrega" on personal.preferencias for insert to authenticated
  with check (user_id = (select auth.uid()) and (select mercado.es_autorizado()));
create policy "dueño corrige" on personal.preferencias for update to authenticated
  using (user_id = (select auth.uid()) and (select mercado.es_autorizado()))
  with check (user_id = (select auth.uid()) and (select mercado.es_autorizado()));
create policy "dueño borra" on personal.preferencias for delete to authenticated
  using (user_id = (select auth.uid()) and (select mercado.es_autorizado()));

grant select, insert, update, delete on personal.preferencias to authenticated;
grant all on personal.preferencias to service_role;

-- Guardar una preferencia en un solo paso (crea o reemplaza). security invoker: RLS aplica igual.
create function personal.guardar_preferencia(p_clave text, p_valor jsonb)
returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  insert into personal.preferencias (user_id, clave, valor)
  values ((select auth.uid()), p_clave, p_valor)
  on conflict (user_id, clave) do update set valor = excluded.valor, actualizado_en = now()
  returning actualizado_en;
$$;

revoke all on function personal.guardar_preferencia(text, jsonb) from public, anon;
grant execute on function personal.guardar_preferencia(text, jsonb) to authenticated, service_role;
