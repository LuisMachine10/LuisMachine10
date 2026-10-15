// Arma la curva del Tesoro para la pantalla a partir de las observaciones guardadas.
// Solo reordena y empareja datos existentes: no interpola ni rellena plazos que falten.

export interface SerieCurva {
  id: string;
  nombre: string;
  nombre_corto: string;
  orden: number;
  max_antiguedad_min: number;
}

export interface ObservacionCurva {
  serie_id: string;
  valor: string;
  cambio: string | null;
  fecha_dato: string;
  recogido_en: string;
  url_dato: string | null;
  estado: string;
}

export interface PuntoCurva {
  serieId: string;
  plazo: string;
  nombre: string;
  valor: string;
  cambio: string | null;
  /** Valor del mismo plazo en la fecha de comparación, si existe. */
  valorComparacion: string | null;
  estado: string;
}

export interface Curva {
  fecha: string;
  fechaComparacion: string | null;
  puntos: PuntoCurva[];
  /** Plazos del catálogo sin dato publicado en `fecha`. */
  faltantes: string[];
  urlDato: string | null;
  recogidoEn: string;
  maxAntiguedadMin: number;
}

/** La fecha más reciente que exista en los datos y sea <= (fecha − dias). */
export function fechaComparacion(fechas: string[], fecha: string, dias: number): string | null {
  const limite = new Date(`${fecha}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() - dias);
  const tope = limite.toISOString().slice(0, 10);
  const candidatas = fechas.filter((f) => f <= tope).sort();
  return candidatas.at(-1) ?? null;
}

export function armarCurva(series: SerieCurva[], obs: ObservacionCurva[], diasComparacion = 30): Curva | null {
  if (obs.length === 0 || series.length === 0) return null;
  const fechas = [...new Set(obs.map((o) => o.fecha_dato))].sort();
  const fecha = fechas.at(-1)!;
  const comparacion = fechaComparacion(fechas, fecha, diasComparacion);
  const porClave = new Map(obs.map((o) => [`${o.serie_id}|${o.fecha_dato}`, o]));

  const ordenadas = [...series].sort((a, b) => a.orden - b.orden);
  const puntos: PuntoCurva[] = [];
  const faltantes: string[] = [];
  for (const s of ordenadas) {
    const o = porClave.get(`${s.id}|${fecha}`);
    if (!o) {
      faltantes.push(s.nombre_corto);
      continue;
    }
    puntos.push({
      serieId: s.id,
      plazo: s.nombre_corto,
      nombre: s.nombre,
      valor: o.valor,
      cambio: o.cambio,
      valorComparacion: comparacion ? (porClave.get(`${s.id}|${comparacion}`)?.valor ?? null) : null,
      estado: o.estado,
    });
  }
  const delDia = obs.filter((o) => o.fecha_dato === fecha);
  const recogidoEn = delDia.map((o) => o.recogido_en).sort().at(-1)!;
  return {
    fecha,
    fechaComparacion: comparacion,
    puntos,
    faltantes,
    urlDato: delDia.find((o) => o.url_dato)?.url_dato ?? null,
    recogidoEn,
    maxAntiguedadMin: Math.min(...ordenadas.map((s) => s.max_antiguedad_min)),
  };
}
