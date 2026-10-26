-- Strategya · Mantenimiento: el historial de pg_cron no crece sin límite
--
-- pg_cron guarda una fila en cron.job_run_details por cada corrida (cotizaciones cada 5 minutos, noticias
-- cada 10, sismos cada 15…): miles por semana. Esta tarea semanal borra las de más de 14 días.
-- La limpieza diaria «strategya-limpieza» (20261015000300) ya recorta a 7 días; esta es la red de
-- seguridad semanal pedida en la Fase F por si la diaria falla o se cambia. Domingo 4:17 AM UTC
-- (12:17 AM en RD), fuera de los horarios de ingesta. No toca datos de Mena ni de mercado.

select cron.schedule('strategya-limpiar-historial-cron', '17 4 * * 0', $$
  delete from cron.job_run_details where end_time < now() - interval '14 days';
$$);
