import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { Ayuda, IntroPagina } from "@/componentes/alertas/Ayuda";
import { Encabezado } from "@/componentes/Encabezado";
import { armarLecturas, FamiliaLecturas, Motivo, porFamilia, Punto, ResumenLecturas } from "@/componentes/estado/Lecturas";
import { describirTarea, salud } from "@/componentes/estado/tareas";
import { PanelError } from "@/componentes/PanelError";
import { estadoTareas } from "@/lib/datos";
import { fechaHoraRD, hace } from "@/lib/formato";

export const metadata: Metadata = { title: "Estado · Strategya" };
export const dynamic = "force-dynamic";

const INTRO =
  "Aquí ves si Strategya pudo leer hoy cada fuente de datos. Verde: llegó bien. Ámbar: llegó a medias. Rojo: falló, y las cifras de esa fuente pueden estar viejas.";

export default async function Estado() {
  const ahora = new Date();
  let datos: Awaited<ReturnType<typeof estadoTareas>>;
  try {
    datos = await estadoTareas();
  } catch (e) {
    return (
      <>
        <Encabezado actual="estado" ultimaActualizacion={null} />
        <main className="terminal">
          <IntroPagina titulo="Estado">{INTRO}</IntroPagina>
          <PanelError titulo="Lecturas automáticas" mensaje={(e as Error).message} />
        </main>
      </>
    );
  }
  const { tareas, corridas, fuentes } = datos;
  const ultima = tareas.map((t) => t.ultima_ok).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const lecturas = armarLecturas(tareas, ahora);

  return (
    <>
      <Encabezado actual="estado" ultimaActualizacion={ultima} />
      <main className="terminal">
        <IntroPagina titulo="Estado">{INTRO}</IntroPagina>

        {lecturas.length === 0 ? (
          <section className="panel panel-ancho" aria-labelledby="t-sin-lecturas">
            <div className="panel-cuerpo es-vacio">
              <h2 className="panel-titulo" id="t-sin-lecturas">
                Todavía no ha corrido ninguna lectura
              </h2>
              <p className="tenue">
                Las lecturas automáticas salen solas según su horario (cada 5 minutos las de mercado, varias veces al día las demás). Cuando
                corra la primera, aparecerá aquí con su color.
              </p>
            </div>
          </section>
        ) : (
          <>
            <ResumenLecturas lecturas={lecturas} />
            <div className="es-familias panel-ancho">
              {porFamilia(lecturas).map((g) => (
                <FamiliaLecturas key={g.familia} familia={g.familia} lecturas={g.lecturas} ahora={ahora} />
              ))}
            </div>
          </>
        )}

        <section className="panel panel-ancho" aria-labelledby="t-detalle">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-detalle">
              Detalle técnico
            </h2>
            <Ayuda titulo="¿Qué es una corrida?">
              Cada vez que Strategya va a buscar datos a una fuente, eso es una corrida. Aquí quedan las últimas, con cuánto duró y qué guardó.
              Sirve para revisar un problema; en el día a día no hace falta mirarlo.
            </Ayuda>
          </div>
          <div className="panel-cuerpo es-detalles">
            <details className="es-desplegable">
              <summary>
                Últimas {corridas.length} corridas <span className="tenue chico">· hora RD</span>
              </summary>
              <ul className="es-corridas">
                {corridas.map((c) => {
                  const s = salud(c.estado, c.inicio, ahora);
                  return (
                    <li key={c.id}>
                      <Punto s={s.salud} />
                      <div className="es-corrida-cuerpo">
                        <div className="es-fila-arriba">
                          <span className="es-nombre">{describirTarea(c.tarea).nombre}</span>
                          <span className={`es-estado es-${s.salud}`}>{s.texto}</span>
                        </div>
                        <div className="es-fila-meta">
                          <span className="mono" title={hace(c.inicio, ahora)}>
                            {fechaHoraRD(c.inicio)}
                          </span>
                          <span>
                            duró{" "}
                            <span className="mono">
                              {c.fin ? `${((new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 1000).toFixed(1)} s` : "—"}
                            </span>
                          </span>
                          <span>
                            guardó <span className="mono">{c.filas}</span>
                          </span>
                          <span className="es-id mono">{c.tarea}</span>
                        </div>
                        {c.error ? <Motivo texto={c.error} /> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </details>

            <details className="es-desplegable">
              <summary>
                Fuentes de datos <span className="tenue chico">· {fuentes.length}</span>
              </summary>
              <ul className="es-fuentes">
                {fuentes.map((f) => (
                  <li key={f.id}>
                    <div className="es-fila-arriba">
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="es-nombre">
                        {f.nombre} <span aria-hidden="true">↗</span>
                      </a>
                      {f.lectura_automatica ? (
                        <span className="etiqueta ok">Automática</span>
                      ) : (
                        <span className="etiqueta alerta" title="Esta fuente no se lee sola: sus datos se cargan a mano en Carga">
                          Solo a mano
                        </span>
                      )}
                    </div>
                    <div className="es-fila-meta">
                      <span className="es-id mono">{f.tipo}</span>
                    </div>
                    {f.notas_de_uso ? <p className="es-motivo">{f.notas_de_uso}</p> : null}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      </main>
      <Actualizador />
    </>
  );
}
