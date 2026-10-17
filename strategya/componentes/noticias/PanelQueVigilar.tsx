// «Qué vigilar»: los 3 próximos eventos de los próximos 7 días y las series del catálogo que más se movieron hoy.
// Cada cifra con su fuente, fecha del dato y si está desactualizada. Solo datos guardados: no hay pronósticos.

import { PanelError } from "@/componentes/PanelError";
import { leerAgenda, leerMovimientos } from "@/lib/datos-noticias";
import { cifra, cifraConSigno, direccion, fechaCorta, fechaHoraRD, hace, horaRD } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { masMovidas, type Movimiento, proximosEventos } from "@/lib/noticias";
import { LineaEvento } from "./agenda-comun";
import { Cabecera } from "./comun";

const FLECHA = { sube: "↑", baja: "↓", igual: "→" } as const;

/** Decimales para mostrar (el valor guardado no se toca): EUR/USD se lee con 4, lo demás con 2. */
function decimales(m: Movimiento): number {
  return m.serie_id === "EURUSD" ? 4 : 2;
}

function Fila({ m, ahora }: { m: Movimiento; ahora: Date }) {
  const dir = direccion(m.cambio_pct);
  const f = frescura({ fecha_dato: m.fecha_dato, hora_dato: m.hora_dato }, m.max_antiguedad_min, ahora);
  return (
    <tr>
      <th scope="row">
        <span className="nt-serie">
          {m.nombre_corto}
          {m.sustituto_de ? <span className="tenue chico"> · sustituto de {m.sustituto_de}</span> : null}
        </span>
        <span className="sello nt-sello-fila">
          <a href={m.url_dato ?? m.fuente_url} target="_blank" rel="noopener noreferrer">
            {m.fuente_nombre} ↗
          </a>
          <span>· {m.hora_dato ? `${horaRD(m.hora_dato)} RD` : `dato del ${fechaCorta(m.fecha_dato)}`}</span>
          <span title={fechaHoraRD(m.recogido_en)}>· verificado {hace(m.recogido_en, ahora)}</span>
          {f.desactualizado ? <span className="etiqueta error nt-vencido">desactualizado</span> : null}
        </span>
      </th>
      <td className="num nt-ultimo">{cifra(m.valor, decimales(m))}</td>
      <td className="num">
        <span className={`pastilla ${dir}`}>
          {FLECHA[dir]} {cifraConSigno(m.cambio_pct!, 2)}%
        </span>
      </td>
    </tr>
  );
}

export async function PanelQueVigilar({ ahora = new Date() }: { ahora?: Date }) {
  let agenda: Awaited<ReturnType<typeof leerAgenda>>;
  let movimientos: Movimiento[];
  try {
    [agenda, movimientos] = await Promise.all([leerAgenda(14), leerMovimientos()]);
  } catch (e) {
    return <PanelError titulo="Qué vigilar" mensaje={(e as Error).message} />;
  }
  const eventos = proximosEventos(agenda, ahora, 7, 3);
  const movidas = masMovidas(movimientos, ahora, 5);

  return (
    <section className="panel nt-panel" aria-labelledby="titulo-vigilar">
      <Cabecera id="titulo-vigilar" titulo="Qué vigilar">
        <span className="sello" title="Datos y fechas de las fuentes; no es una recomendación de inversión">
          Solo datos guardados · sin pronósticos
        </span>
      </Cabecera>
      <div className="panel-cuerpo">
        <div className="nt-bloque">
          <h3 className="nt-subtitulo">Lo que más se movió hoy</h3>
          {movidas.length ? (
            <div className="desplazable">
              <table className="tabla nt-tabla-movidas">
                <caption className="sr-solo">Series con mayor cambio porcentual hoy, con su fuente</caption>
                <thead>
                  <tr>
                    <th scope="col">Serie</th>
                    <th scope="col" className="num">
                      Último
                    </th>
                    <th scope="col" className="num">
                      Cambio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {movidas.map((m) => (
                    <Fila key={m.serie_id} m={m} ahora={ahora} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="nt-vacio-mini">Todavía no hay cambios registrados hoy (hora RD) en las series del catálogo.</p>
          )}
        </div>
        <div className="nt-bloque">
          <h3 className="nt-subtitulo">Próximos 7 días</h3>
          {eventos.length ? (
            <ol className="nt-agenda">
              {eventos.map((e) => (
                <LineaEvento key={e.id} e={e} ahora={ahora} />
              ))}
            </ol>
          ) : (
            <p className="nt-vacio-mini">Ningún evento de la agenda en los próximos 7 días.</p>
          )}
        </div>
      </div>
    </section>
  );
}
