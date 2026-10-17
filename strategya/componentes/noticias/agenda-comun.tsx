// Un evento de la agenda en la línea de tiempo: fecha y hora en RD (o «hora por anunciar»),
// institución, evento y si está confirmado.

import { fechaCorta, fechaHoraRD, horaRD, ZONA_RD } from "@/lib/formato";
import { type EventoAgenda, fechaEnZona } from "@/lib/noticias";

const DIAS = new Intl.DateTimeFormat("es-DO", { timeZone: ZONA_RD, weekday: "short" });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «en 3 d», «en 5 h», «hoy», «hace 1 h». */
export function faltan(iso: string, ahora: Date): string {
  const min = Math.round((new Date(iso).getTime() - ahora.getTime()) / 60_000);
  if (min < -5) return `hace ${Math.max(1, Math.round(-min / 60))} h`;
  if (min < 60) return "ahora";
  if (min < 24 * 60) return `en ${Math.round(min / 60)} h`;
  return `en ${Math.round(min / 1440)} d`;
}

/** Día del evento (AAAA-MM-DD) en RD, o en la zona de la institución si solo se conoce el día. */
function diaEvento(e: EventoAgenda): string {
  return e.hora_conocida ? fechaEnZona(e.fecha_hora, ZONA_RD) : fechaEnZona(e.fecha_hora, e.zona ?? ZONA_RD);
}

/** Bloque de fecha a la izquierda de la línea de tiempo: «28 / oct». */
function Calendario({ e }: { e: EventoAgenda }) {
  const [, m, d] = diaEvento(e).split("-").map(Number);
  return (
    <span className="nt-cal" aria-hidden="true">
      <span className="nt-cal-dia mono">{d}</span>
      <span className="nt-cal-mes">{MESES[m - 1]}</span>
    </span>
  );
}

export function FechaEvento({ e, ahora }: { e: EventoAgenda; ahora: Date }) {
  if (!e.hora_conocida) {
    // Solo se conoce el día en la zona de la institución: se muestra ese día, sin hora.
    const dia = diaEvento(e);
    return (
      <span className="nt-fecha-evento">
        <time dateTime={dia}>{fechaCorta(dia, false)}</time>
        <span> · hora por anunciar</span>
      </span>
    );
  }
  return (
    <span className="nt-fecha-evento" title={`${fechaHoraRD(e.fecha_hora)} (hora RD)`}>
      <time dateTime={e.fecha_hora}>
        {DIAS.format(new Date(e.fecha_hora)).replace(".", "")}
        <span className="sr-solo"> {fechaCorta(fechaEnZona(e.fecha_hora, ZONA_RD))}</span> · {horaRD(e.fecha_hora)} RD
      </time>
      <span className="nt-faltan">{faltan(e.fecha_hora, ahora)}</span>
    </span>
  );
}

export function LineaEvento({ e, ahora }: { e: EventoAgenda; ahora: Date }) {
  const alta = e.importancia >= 3;
  return (
    <li className={`nt-evento${alta ? " nt-evento-alta" : ""}`}>
      <Calendario e={e} />
      <span className="nt-evento-punto" aria-hidden="true" />
      <div className="nt-evento-cuerpo">
        <FechaEvento e={e} ahora={ahora} />
        <span className="nt-evento-que">
          <strong>{e.institucion}</strong> · {e.evento}
          {alta ? <span className="sr-solo"> (importancia alta)</span> : null}
        </span>
        <span className="nt-evento-meta">
          {e.confirmado ? <span className="etiqueta ok">confirmado</span> : <span className="etiqueta alerta">no confirmado</span>}
          {e.url ? (
            <a href={e.url} target="_blank" rel="noopener noreferrer">
              calendario oficial ↗
            </a>
          ) : null}
          {e.nota ? (
            <span className="nt-evento-nota" title={e.nota}>
              {e.nota}
            </span>
          ) : null}
        </span>
      </div>
    </li>
  );
}
