// Lo último de cada institución (Fed, BCE, BoJ, BoE, BIS, Tesoro, CEPAL). Las que bloquean la lectura
// automática (FMI, OCDE, OFAC) se rotulan y no se consultan; Banco Mundial y BID no tienen una vía legible.

import { PanelError } from "@/componentes/PanelError";
import { leerInstituciones } from "@/lib/datos-noticias";
import { fechaHoraRD, hace } from "@/lib/formato";
import { estadoInstituciones } from "@/lib/noticias";
import { algunaFallo, Cabecera, Hora, ultimaOk } from "./comun";

export async function PanelInstituciones({ ahora = new Date() }: { ahora?: Date }) {
  let datos: Awaited<ReturnType<typeof leerInstituciones>>;
  try {
    datos = await leerInstituciones();
  } catch (e) {
    return <PanelError titulo="Instituciones" mensaje={(e as Error).message} />;
  }
  const filas = estadoInstituciones(datos.items, datos.bloqueadas);
  const verificado = ultimaOk(datos.tareas);
  const fallidas = datos.tareas.filter((t) => t.estado === "error").map((t) => t.tarea.replace("instituciones-", ""));

  return (
    <section className="panel" aria-labelledby="titulo-instituciones">
      <Cabecera id="titulo-instituciones" titulo="Instituciones">
        <div className="sello">
          <span>Comunicados oficiales (RSS y listas públicas)</span>
          {verificado ? <span title={fechaHoraRD(verificado)}>· verificado {hace(verificado, ahora)}</span> : null}
          {algunaFallo(datos.tareas) ? <span className="vencido">· falló la lectura de {fallidas.join(", ")} (ver Estado)</span> : null}
        </div>
      </Cabecera>
      <div className="panel-cuerpo">
        <ul className="nt-instituciones">
          {filas.map((f) => (
            <li key={f.institucion} className="nt-inst">
              <div className="nt-inst-cabeza">
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="nt-inst-nombre">
                  {f.institucion} ↗
                </a>
                {f.via === "bloqueada" ? <span className="etiqueta error">✕ {f.motivo}</span> : null}
                {f.via === "sin_feed" ? <span className="etiqueta neutra">{f.motivo}</span> : null}
              </div>
              {f.via === "bloqueada" || f.via === "sin_feed" ? (
                <p className="chico tenue">No se consulta. Para verlo, abre su sitio.</p>
              ) : f.ultimo ? (
                <>
                  <a href={f.ultimo.url} target="_blank" rel="noopener noreferrer" className="nt-titular">
                    {f.ultimo.titulo}
                  </a>
                  <span className="nt-meta">
                    <Hora iso={f.ultimo.fecha} ahora={ahora} soloFecha={f.ultimo.solo_fecha} />
                  </span>
                  {f.anteriores.length ? (
                    <ul className="nt-anteriores">
                      {f.anteriores.map((a) => (
                        <li key={a.url}>
                          <a href={a.url} target="_blank" rel="noopener noreferrer">
                            {a.titulo}
                          </a>{" "}
                          <span className="tenue">
                            · <Hora iso={a.fecha} ahora={ahora} soloFecha={a.solo_fecha} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p className="chico tenue">Sin comunicados leídos todavía (se consulta cada hora).</p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
