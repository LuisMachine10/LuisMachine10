// Piezas compartidas de los paneles de República Dominicana.

import { type DatosSello, SelloFuente } from "@/componentes/SelloFuente";
import type { EstadoTareaRD } from "@/lib/datos-rd";
import { cifraConSigno, direccion, puntosBasicos } from "@/lib/formato";
import type { DatoRD } from "@/lib/rd";

const FLECHA = { sube: "↑", baja: "↓", igual: "" } as const;

/** Cambio con flecha y signo (nunca solo color). `pb` = puntos básicos para tasas. */
export function Cambio({ cambio, decimales = 2, pb = false, sufijo = "" }: { cambio: string | null; decimales?: number; pb?: boolean; sufijo?: string }) {
  if (cambio === null) return <span className="tenue">—</span>;
  const dir = direccion(cambio);
  const texto = pb ? puntosBasicos(cambio) : `${cifraConSigno(cambio, decimales)}${sufijo}`;
  return (
    <span className={`mono ${dir}`}>
      {FLECHA[dir] ? `${FLECHA[dir]} ` : ""}
      {texto}
    </span>
  );
}

export function tareaDe(tareas: EstadoTareaRD[], nombre: string): EstadoTareaRD | undefined {
  return tareas.find((t) => t.tarea === nombre);
}

/** Datos del sello de una cifra. Un dato manual no depende de ninguna tarea automática. */
export function selloDe(dato: DatoRD, tarea?: EstadoTareaRD): DatosSello {
  const manual = dato.obs.fuente_id === "manual";
  // Los cuadros de tasas del BCRD comparten fuente: se nombra el cuadro para distinguir los sellos.
  const cuadro = /tasas_(activas|pasivas)_(mn|me)\.xlsx$/.exec(dato.obs.url_dato ?? "");
  const nombre = cuadro ? `${dato.fuente.nombre} · ${cuadro[1]} ${cuadro[2] === "mn" ? "RD$" : "US$"}` : dato.fuente.nombre;
  return {
    fuente: manual ? "Carga manual" : nombre,
    url: dato.obs.url_dato ?? (dato.fuente.url || null),
    fechaDato: dato.obs.fecha_dato,
    verificadoEn: manual ? dato.obs.recogido_en : (tarea?.ultima_ok ?? dato.obs.recogido_en),
    desactualizado: dato.desactualizado,
    ultimaCorridaFallo: !manual && tarea?.estado === "error",
  };
}

export function Sello({ dato, tarea, ahora }: { dato: DatoRD; tarea?: EstadoTareaRD; ahora: Date }) {
  return <SelloFuente d={selloDe(dato, tarea)} ahora={ahora} />;
}

/**
 * Un sello por cada grupo de cifras que comparten fuente, enlace y fecha (p. ej. un cuadro del BCRD
 * de un mes). Así cada cifra de una tabla queda con su procedencia sin repetir el sello en cada celda.
 */
export function SellosAgrupados({ datos, tareas, ahora }: { datos: DatoRD[]; tareas: EstadoTareaRD[]; ahora: Date }) {
  const grupos = new Map<string, DatoRD[]>();
  for (const d of datos) {
    const clave = `${d.obs.fuente_id}|${d.obs.url_dato ?? ""}|${d.obs.fecha_dato}`;
    const g = grupos.get(clave);
    if (g) g.push(d);
    else grupos.set(clave, [d]);
  }
  if (grupos.size === 0) return null;
  return (
    <div className="rd-sellos">
      {[...grupos.entries()].map(([clave, g]) => {
        const sello = selloDe(g[0], tareaDeSerie(tareas, g[0]));
        return <SelloFuente key={clave} d={{ ...sello, desactualizado: g.some((d) => d.desactualizado) }} ahora={ahora} />;
      })}
    </div>
  );
}

/** Mensaje de panel sin datos: dice por qué y cuándo llegan; nunca pinta ceros. */
export function SinDatos({ children, tarea }: { children: React.ReactNode; tarea?: EstadoTareaRD }) {
  return (
    <p className="rd-sin-dato">
      {children}
      {tarea?.estado === "error" && tarea.error ? <span className="baja chico"> Última lectura con error: {tarea.error}</span> : null}
    </p>
  );
}

/** Tarea que alimenta una serie (para el sello y los avisos de error). */
export function tareaDeSerie(tareas: EstadoTareaRD[], dato: DatoRD | undefined): EstadoTareaRD | undefined {
  if (!dato) return undefined;
  const f = dato.obs.fuente_id;
  if (f === "bcrd") return dato.obs.url_dato?.includes("cdn.bancentral") && dato.serie.id.startsWith("USDDOP")
    ? tareaDe(tareas, "bcrd-excel")
    : tareaDe(tareas, "bcrd-portada");
  if (f === "bcrd_excel") return tareaDe(tareas, "bcrd-excel");
  if (f === "micm") return tareaDe(tareas, "micm");
  return undefined;
}
