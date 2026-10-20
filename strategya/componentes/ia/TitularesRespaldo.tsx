// Respaldo sin IA: titulares guardados tal cual (titular, medio, hora y enlace), agrupados. Ningún texto propio.

import type { TitularGuardado } from "@/lib/alertas-ia";
import { fechaHoraRD, hace } from "@/lib/formato";

export function TitularesRespaldo({
  grupos,
  ahora,
  vacio,
}: {
  grupos: Array<{ nombre: string; titulares: TitularGuardado[] }>;
  ahora: Date;
  vacio: string;
}) {
  if (!grupos.length)
    return (
      <div className="aj-vacio">
        <p className="aj-vacio-titulo">Sin titulares por ahora</p>
        <p className="tenue">{vacio}</p>
      </div>
    );
  return (
    <div className="respaldo">
      {grupos.map((g) => (
        <section key={g.nombre} className="grupo-titulares" aria-label={g.nombre}>
          <h3 className="grupo-nombre">{g.nombre}</h3>
          <ul>
            {g.titulares.map((t) => (
              <li key={t.id}>
                <a href={t.url} target="_blank" rel="noopener noreferrer" className="titular-enlace">
                  {t.titular}
                  <span aria-hidden="true"> ↗</span>
                </a>
                <span className="sello">
                  <span>{t.medio}</span>
                  <span title={fechaHoraRD(t.fecha)}>{hace(t.fecha, ahora)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
