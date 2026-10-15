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

export function EtiquetaCategoria({ c }: { c: CategoriaNoticia }) {
  return <span className={`nt-cat nt-cat-${c}`}>{ETIQUETA_CATEGORIA[c]}</span>;
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
