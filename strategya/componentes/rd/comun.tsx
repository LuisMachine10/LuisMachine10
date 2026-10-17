// Piezas compartidas de los paneles de República Dominicana.

import "@/estilos/rd.css";
import Link from "next/link";
import { type DatosSello, SelloFuente } from "@/componentes/SelloFuente";
import type { EstadoTareaRD } from "@/lib/datos-rd";
import { cifraConSigno, direccion, puntosBasicos } from "@/lib/formato";
import type { DatoRD } from "@/lib/rd";

const FLECHA = { sube: "↑", baja: "↓", igual: "" } as const;

/**
 * Cambio con flecha y signo (nunca solo color). `pb` = puntos básicos para tasas.
 * `pastilla`: en una píldora de color suave (para las cifras principales).
 */
export function Cambio({
  cambio,
  decimales = 2,
  pb = false,
  sufijo = "",
  pastilla = false,
}: {
  cambio: string | null;
  decimales?: number;
  pb?: boolean;
  sufijo?: string;
  pastilla?: boolean;
}) {
  if (cambio === null) return <span className={pastilla ? "pastilla igual" : "tenue"}>—</span>;
  const dir = direccion(cambio);
  const texto = pb ? puntosBasicos(cambio) : `${cifraConSigno(cambio, decimales)}${sufijo}`;
  return (
    <span className={pastilla ? `pastilla ${dir}` : `mono ${dir}`}>
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

/**
 * Mensaje de panel sin datos: dice por qué y cuándo llegan; nunca pinta ceros.
 * `accion`: un enlace claro para resolverlo (p. ej. ir a Carga manual).
 */
export function SinDatos({
  children,
  tarea,
  accion,
}: {
  children: React.ReactNode;
  tarea?: EstadoTareaRD;
  accion?: { href: string; texto: string };
}) {
  return (
    <div className="rd-sin-dato">
      <p>{children}</p>
      {tarea?.estado === "error" && tarea.error ? <p className="rd-sin-dato-error">Última lectura con error: {tarea.error}</p> : null}
      {accion ? (
        <Link href={accion.href} className="boton secundario rd-boton-chico">
          {accion.texto}
        </Link>
      ) : null}
    </div>
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

/** Ícono de trazo 24×24 (stroke currentColor 1.8). */
export function Icono({ d, tam = 16, className }: { d: string; tam?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

export const ICONOS_RD = {
  dolar: "M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.3-2-2.6 0-4.2 1.3-4.2 3.1 0 4.4 8.8 2.4 8.8 6.8 0 1.9-1.8 3.1-4.5 3.1-2.1 0-3.8-.8-4.6-2.2",
  banco: "M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  precios: "M4 19l5-6 4 3 7-9M15 7h5v5",
  combustible: "M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 10h10M15 8l3 2v8a1.5 1.5 0 0 0 3 0V9l-3-3",
  subasta: "M14 4l6 6M11 7l6 6M4 20l7-7M9 9l6 6-2 2-6-6zM14 20h7",
  documento: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  aviso: "M12 4l9 16H3zM12 10v4M12 17.5v.01",
  externo: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  mas: "M12 5v14M5 12h14",
} as const;
