// Lee las cifras que la tarea credito-publico ya guardó en el texto de la subasta (resumen del
// Consolidado de Subastas). No calcula ni estima nada: solo separa lo que la fuente dijo para mostrarlo
// en la tarjeta. Si el texto no trae una cifra, queda null y la tarjeta no la muestra.

export interface ResumenSubasta {
  /** Monto ofrecido, en millones de RD$, tal como lo escribió la tarea (p. ej. "30,000.0"). */
  subastadoMM: string | null;
  /** Monto demandado, en millones de RD$. */
  demandadoMM: string | null;
  /** Veces que la demanda cubrió lo subastado (p. ej. "4.47"). */
  cobertura: string | null;
  /** Fecha de vencimiento AAAA-MM-DD. */
  vence: string | null;
  /** Aviso del Consolidado (p. ej. vencimiento que no coincide con el código del título). */
  aviso: string | null;
}

const VACIO: ResumenSubasta = { subastadoMM: null, demandadoMM: null, cobertura: null, vence: null, aviso: null };

export function leerResumenSubasta(descripcion: string | null | undefined): ResumenSubasta {
  if (!descripcion) return VACIO;
  const subastado = /subastado RD\$([\d,]+(?:\.\d+)?) MM/i.exec(descripcion);
  const demandado = /demandado RD\$([\d,]+(?:\.\d+)?) MM/i.exec(descripcion);
  const cobertura = /cobertura (\d+(?:\.\d+)?) veces/i.exec(descripcion);
  const vence = /Vence el (\d{4}-\d{2}-\d{2})/.exec(descripcion);
  const ini = descripcion.indexOf("El Consolidado indica");
  const fin = descripcion.indexOf("revisar el PDF oficial.");
  const aviso = ini >= 0 && fin > ini && /no coincide/.test(descripcion) ? descripcion.slice(ini, fin + "revisar el PDF oficial.".length) : null;
  return {
    subastadoMM: subastado?.[1] ?? null,
    demandadoMM: demandado?.[1] ?? null,
    cobertura: cobertura?.[1] ?? null,
    vence: vence?.[1] ?? null,
    aviso,
  };
}
