// Piezas comunes de los paneles de noticias (Server Components sin estado).

import "@/estilos/noticias.css";
import { fechaCorta, fechaHoraRD, hace, horaRD, ZONA_RD } from "@/lib/formato";
import { type CategoriaNoticia, ETIQUETA_CATEGORIA, fechaEnZona, hoyRD } from "@/lib/noticias";
import type { EstadoTareaNombrada } from "@/lib/datos-noticias";

/** «3:15 p. m.» si es de hoy (RD); si no, «14 oct · 3:15 p. m.». */
export function cuando(iso: string, ahora: Date): string {
  const dia = fechaEnZona(iso, ZONA_RD);
  return dia === hoyRD(ahora) ? horaRD(iso) : `${fechaCorta(dia, false)} · ${horaRD(iso)}`;
}

/** Fecha de un comunicado: solo el día si la fuente no da hora. */
export function fechaComunicado(iso: string, soloFecha: boolean, ahora: Date): string {
  return soloFecha ? fechaCorta(iso.slice(0, 10), false) : cuando(iso, ahora);
}

export function Hora({ iso, ahora, soloFecha = false }: { iso: string; ahora: Date; soloFecha?: boolean }) {
  return (
    <time dateTime={iso} title={soloFecha ? fechaCorta(iso.slice(0, 10)) : `${fechaHoraRD(iso)} (hora RD) · ${hace(iso, ahora)}`}>
      {fechaComunicado(iso, soloFecha, ahora)}
    </time>
  );
}

/** Categoría en píldora de color suave, siempre con su nombre (nunca solo color). */
export function EtiquetaCategoria({ c }: { c: CategoriaNoticia }) {
  return <span className={`etiqueta nt-cat nt-cat-${c}`}>{ETIQUETA_CATEGORIA[c]}</span>;
}

/** La corrida más reciente que terminó bien, de un grupo de tareas. */
export function ultimaOk(tareas: EstadoTareaNombrada[]): string | null {
  return tareas.map((t) => t.ultima_ok).filter((x): x is string => !!x).sort().at(-1) ?? null;
}

export function algunaFallo(tareas: EstadoTareaNombrada[]): boolean {
  return tareas.some((t) => t.estado === "error");
}

export function Cabecera({ id, titulo, children }: { id: string; titulo: string; children?: React.ReactNode }) {
  return (
    <div className="panel-cabecera">
      <h2 className="panel-titulo" id={id}>
        {titulo}
      </h2>
      {children}
    </div>
  );
}

/** Ícono de trazo 24×24 (stroke currentColor 1.8). */
export function Icono({ d, tam = 14, className }: { d: string; tam?: number; className?: string }) {
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

export const ICONO = {
  lugar: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  externo: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  reloj: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  calendario: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  candado: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  chevron: "M9 6l6 6-6 6",
  libro: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M19 19v2H6",
} as const;

/** Estado vacío amable: qué pasa y cuándo llegan los datos. */
export function Vacio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="nt-vacio">
      <p className="nt-vacio-titulo">{titulo}</p>
      {children ? <div className="nt-vacio-texto">{children}</div> : null}
    </div>
  );
}
