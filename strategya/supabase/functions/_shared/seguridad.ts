// Autenticación de las llamadas de pg_cron a las Edge Functions de ingesta.

/** Compara el secreto recibido con el esperado sin cortar en el primer carácter distinto. */
export function secretoValido(recibido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recibido || !esperado || esperado.length < 32) return false;
  if (recibido.length !== esperado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < esperado.length; i++) diferencia |= recibido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferencia === 0;
}

/**
 * Clave con permisos de servidor para escribir en la base.
 * Supabase la inyecta como SUPABASE_SERVICE_ROLE_KEY (claves antiguas) o dentro de
 * SUPABASE_SECRET_KEYS (claves nuevas, JSON {"default": "sb_secret_…"}).
 */
export function claveServidor(leer: (nombre: string) => string | undefined): string {
  const directa = leer("SUPABASE_SERVICE_ROLE_KEY");
  if (directa) return directa;
  const json = leer("SUPABASE_SECRET_KEYS");
  if (json) {
    try {
      const claves = JSON.parse(json) as Record<string, string>;
      const clave = claves.default ?? Object.values(claves)[0];
      if (clave) return clave;
    } catch {
      // cae al error de abajo
    }
  }
  throw new Error("Falta la clave de servidor (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEYS)");
}
