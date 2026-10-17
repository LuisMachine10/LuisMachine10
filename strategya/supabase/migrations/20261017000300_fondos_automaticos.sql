-- Strategya · rendimientos de fondos abiertos leídos de las páginas públicas de cada SAFI
--
-- Verificado con la sonda del 16 oct 2026 (sondas/lotes/hechos/33-safis-fondos.txt):
--   · Excel (fondosabiertos.excel.com.do): valor cuota del día y rentabilidad anualizada a 30/60/90/180/365 días
--     de Dinámico y Liquidez, en pesos y dólares, con su fecha («Información al 4 de octubre de 2026»).
--     robots.txt permite todo.
--   · AFI Reservas (afireservas.com/fondos/fondo-…): rentabilidad neta anualizada a 30/90/180/365 días.
--     La página NO publica fecha de corte: se guarda con la fecha en que Strategya la vio por primera vez
--     (y solo cuando cambian las cifras), y la nota lo dice. robots.txt no publicado (404).
-- BHD Fondos sigue solo por carga manual (dominio prohibido). AFI Universal, AFI Popular y Pioneer: pendientes
-- (sus páginas cargan los rendimientos con JavaScript o no se confirmaron).

alter table mercado.fondos_rendimientos drop constraint if exists fondos_rendimientos_plazo_dias_check;
alter table mercado.fondos_rendimientos
  add constraint fondos_rendimientos_plazo_dias_check check (plazo_dias in (30, 60, 90, 180, 360, 365));

alter table mercado.fondos_rendimientos
  add column if not exists valor_cuota numeric check (valor_cuota is null or valor_cuota > 0),
  add column if not exists origen text not null default 'manual' check (origen in ('manual', 'automatica')),
  add column if not exists fuente_id text references mercado.fuentes (id);

comment on column mercado.fondos_rendimientos.valor_cuota is 'Valor de la cuota en la fecha de corte, en la moneda del fondo (si la SAFI lo publica).';
comment on column mercado.fondos_rendimientos.origen is 'automatica = lo leyó la ingesta de la página de la SAFI; manual = lo cargó Mena.';

insert into mercado.fuentes (id, nombre, url, tipo, requiere_clave, lectura_automatica, notas_de_uso) values
  ('excel_fondos', 'Excel · Fondos Abiertos', 'https://fondosabiertos.excel.com.do/', 'html', false, true,
   'Página pública con valor cuota y rentabilidad anualizada (30/60/90/180/365 días) de Dinámico y Liquidez, '
   'en pesos y dólares, con fecha de la información. robots.txt permite todo. Lectura 2 veces al día.'),
  ('afi_reservas', 'AFI Reservas · fondos abiertos', 'https://www.afireservas.com/', 'html', false, true,
   'Página de cada fondo con la rentabilidad neta anualizada (30/90/180/365 días). No publica fecha de corte: '
   'se registra la fecha en que se vio la cifra por primera vez. robots.txt no publicado (404).')
on conflict (id) do nothing;

-- Última cifra guardada por fondo y plazo de una SAFI (para no repetir un corte que la página no fecha).
create or replace function mercado.ultimos_rendimientos_safi(p_safi text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'fondo', u.fondo, 'moneda', u.moneda, 'plazo_dias', u.plazo_dias,
           'rendimiento', u.rendimiento::text, 'fecha_corte', u.fecha_corte)), '[]'::jsonb)
  from (
    select distinct on (f.fondo, f.moneda, f.plazo_dias) f.fondo, f.moneda, f.plazo_dias, f.rendimiento, f.fecha_corte
    from mercado.fondos_rendimientos f
    where f.safi = p_safi
    order by f.fondo, f.moneda, f.plazo_dias, f.fecha_corte desc
  ) u;
$$;

revoke all on function mercado.ultimos_rendimientos_safi(text) from public, anon, authenticated;
grant execute on function mercado.ultimos_rendimientos_safi(text) to service_role;

-- 13:10 y 22:10 UTC (9:10 AM y 6:10 PM RD), todos los días.
select cron.schedule('strategya-fondos-safis', '10 13,22 * * *',
  $$select mercado.invocar_tarea('ingesta', '{"tarea":"fondos-safis"}')$$);
