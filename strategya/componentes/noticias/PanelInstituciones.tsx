// Lo último de cada institución (Fed, BCE, BoJ, BoE, BIS, Tesoro, CEPAL). Las que bloquean la lectura
// automática (FMI, OCDE, OFAC) se rotulan y no se consultan; Banco Mundial y BID no tienen una vía legible.

import { PanelError } from "@/componentes/PanelError";
import { leerInstituciones } from "@/lib/datos-noticias";
import { fechaHoraRD, hace } from "@/lib/formato";
import { estadoInstituciones } from "@/lib/noticias";
import { algunaFallo, Cabecera, Hora, ICONO, Icono, ultimaOk } from "./comun";

/** Sigla del «logo» de cada institución (texto, no una marca registrada). */
function sigla(institucion: string): string {
  const base = institucion.split(" · ")[0];
  const fijas: Record<string, string> = { "Tesoro EE. UU.": "UST", CEPAL: "CEP", "Banco Mundial": "BM" };
  return fijas[base] ?? base.slice(0, 4);
}

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
  const activas = filas.filter((f) => f.via !== "bloqueada" && f.via !== "sin_feed");
  const cerradas = filas.filter((f) => f.via === "bloqueada" || f.via === "sin_feed");

  return (
    <section className="panel nt-panel" aria-labelledby="titulo-instituciones">
      <Cabecera id="titulo-instituciones" titulo="Instituciones">
        <div className="sello nt-sello-cabecera">
          <span title="Comunicados oficiales leídos de sus RSS y listas públicas">Comunicados oficiales</span>
          {verificado ? <span title={fechaHoraRD(verificado)}>· verificado {hace(verificado, ahora)}</span> : null}
          {algunaFallo(datos.tareas) ? <span className="etiqueta error">falló {fallidas.join(", ")} (ver Estado)</span> : null}
        </div>
      </Cabecera>
      <div className="panel-cuerpo">
        <ul className="nt-instituciones">
          {activas.map((f, i) => (
            <li key={f.institucion} className="nt-inst">
              <span className={`nt-logo nt-logo-${i % 6}`} aria-hidden="true">
                {sigla(f.institucion)}
              </span>
              <div className="nt-inst-cuerpo">
                <div className="nt-inst-cabeza">
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="nt-inst-nombre">
                    {f.institucion}
                  </a>
                  {f.ultimo ? (
                    <span className="nt-hora">
                      <Hora iso={f.ultimo.fecha} ahora={ahora} soloFecha={f.ultimo.solo_fecha} />
                    </span>
                  ) : null}
                </div>
                {f.ultimo ? (
                  <>
                    <a href={f.ultimo.url} target="_blank" rel="noopener noreferrer" className="nt-titular nt-titular-chico">
                      {f.ultimo.titulo}
                    </a>
                    {f.anteriores.length ? (
                      <details className="nt-anteriores">
                        <summary>
                          {f.anteriores.length} {f.anteriores.length === 1 ? "anterior" : "anteriores"}
                        </summary>
                        <ul>
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
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className="nt-inst-nota">Sin comunicados leídos todavía (se consulta cada hora).</p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {cerradas.length ? (
          <div className="nt-cerradas">
            <h3 className="nt-subtitulo">
              <Icono d={ICONO.candado} tam={13} />
              No se consultan
            </h3>
            <ul>
              {cerradas.map((f) => (
                <li key={f.institucion}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" title={`${f.motivo ?? ""}. Para verlo, abre su sitio.`}>
                    {f.institucion}
                  </a>
                  <span className={`etiqueta ${f.via === "bloqueada" ? "error" : "neutra"}`}>{f.via === "bloqueada" ? "bloquea (403)" : "sin feed"}</span>
                  <span className="sr-solo">
                    {f.motivo}. No se consulta. Para verlo, abre su sitio.
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
