// ¿El dato que se ve está al día? Se decide con la fecha del dato, no con la hora en que se recogió:
// un dato viejo recogido hace un minuto sigue siendo viejo.

export interface DatoConFecha {
  fecha_dato: string; // AAAA-MM-DD
  hora_dato?: string | null;
}

export interface Frescura {
  desactualizado: boolean;
  /** Minutos transcurridos desde el momento de referencia del dato. */
  minutos: number;
}

/** Momento de referencia: la hora exacta si la hay; si no, el fin del día del dato (00:00 UTC del día siguiente). */
export function momentoDelDato(d: DatoConFecha): Date {
  if (d.hora_dato) return new Date(d.hora_dato);
  const fin = new Date(`${d.fecha_dato}T00:00:00Z`);
  fin.setUTCDate(fin.getUTCDate() + 1);
  return fin;
}

export function frescura(d: DatoConFecha, maxAntiguedadMin: number, ahora: Date): Frescura {
  const minutos = Math.max(0, Math.floor((ahora.getTime() - momentoDelDato(d).getTime()) / 60_000));
  return { desactualizado: minutos > maxAntiguedadMin, minutos };
}
