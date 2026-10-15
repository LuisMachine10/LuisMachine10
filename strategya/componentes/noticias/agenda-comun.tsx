// Una línea de la agenda: fecha y hora en RD (o «hora por anunciar»), institución, evento y si está confirmado.

import { fechaCorta, fechaHoraRD, horaRD, ZONA_RD } from "@/lib/formato";
import { type EventoAgenda, fechaEnZona } from "@/lib/noticias";

const DIAS = new Intl.DateTimeFormat("es-DO", { timeZone: ZONA_RD, weekday: "short" });

/** «en 3 d», «en 5 h», «hoy», «hace 1 h». */
export function faltan(iso: string, ahora: Date): string {
  const min = Math.round((new Date(iso).getTime() - ahora.getTime()) / 60_000);
  if (min < -5) return `hace ${Math.max(1, Math.round(-min / 60))} h`;
  if (min < 60) return "ahora";
  if (min < 24 * 60) return `en ${Math.round(min / 60)} h`;
  return `en ${Math.round(min / 1440)} d`;
}

export function FechaEvento({ e, ahora }: { e: EventoAgenda; ahora: Date }) {
  if (!e.hora_conocida) {
    // Solo se conoce el día en la zona de la institución: se muestra ese día, sin hora.
    const dia = fechaEnZona(e.fecha_hora, e.zona ?? ZONA_RD);
    return (
      <span className="nt-fecha-evento">
        <time dateTime={dia}>{fechaCorta(dia)}</time> <span className="tenue chico">· hora por anunciar</span>
      </span>
    );
  }
  return (
    <span className="nt-fecha-evento" title={`${fechaHoraRD(e.fecha_hora)} (hora RD)`}>
      <time dateTime={e.fecha_hora}>
        {DIAS.format(new Date(e.fecha_hora)).replace(".", "")} {fechaCorta(fechaEnZona(e.fecha_hora, ZONA_RD))} · {horaRD(e.fecha_hora)}
      </time>{" "}
      <span className="tenue chico">RD · {faltan(e.fecha_hora, ahora)}</span>
    </span>
  );
}

export function LineaEvento({ e, ahora }: { e: EventoAgenda; ahora: Date }) {
  return (
    <li className="nt-evento">
      <FechaEvento e={e} ahora={ahora} />
      <span className="nt-evento-que">
        <strong>{e.institucion}</strong> · {e.evento}
        {e.importancia >= 3 ? <span className="sr-solo"> (importancia alta)</span> : null}
      </span>
      <span className="nt-meta">
        {e.confirmado ? <span className="etiqueta ok">✓ confirmado</span> : <span className="etiqueta alerta">no confirmado</span>}
        {e.url ? (
          <a href={e.url} target="_blank" rel="noopener noreferrer">
            calendario oficial ↗
          </a>
        ) : null}
      </span>
      {e.nota ? <span className="chico tenue">{e.nota}</span> : null}
    </li>
  );
}
