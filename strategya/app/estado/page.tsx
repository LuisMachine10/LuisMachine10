import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { Encabezado } from "@/componentes/Encabezado";
import { PanelError } from "@/componentes/PanelError";
import { estadoTareas } from "@/lib/datos";
import { fechaHoraRD, hace } from "@/lib/formato";

export const metadata: Metadata = { title: "Estado · Strategya" };
export const dynamic = "force-dynamic";

const COLGADA_MIN = 30;

function Etiqueta({ estado, inicio, ahora }: { estado: string; inicio: string; ahora: Date }) {
  const colgada = estado === "corriendo" && ahora.getTime() - new Date(inicio).getTime() > COLGADA_MIN * 60_000;
  const [clase, texto] = colgada
    ? ["error", "✕ colgada"]
    : estado === "ok"
      ? ["ok", "✓ ok"]
      : estado === "parcial"
        ? ["alerta", "! parcial"]
        : estado === "error"
          ? ["error", "✕ error"]
          : ["neutra", estado];
  return <span className={`etiqueta ${clase}`}>{texto}</span>;
}

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
          <PanelError titulo="Tareas de ingesta" mensaje={(e as Error).message} />
        </main>
      </>
    );
  }
  const { tareas, corridas, fuentes } = datos;
  const ultima = tareas.map((t) => t.ultima_ok).filter((x): x is string => !!x).sort().at(-1) ?? null;

  return (
    <>
      <Encabezado actual="estado" ultimaActualizacion={ultima} />
      <main className="terminal">
        <section className="panel panel-ancho" aria-labelledby="t-tareas">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-tareas">
              Tareas de ingesta
            </h2>
            <span className="sello">Última corrida de cada fuente</span>
          </div>
          <div className="panel-cuerpo desplazable">
            {tareas.length === 0 ? (
              <p className="vacio">Ninguna tarea ha corrido todavía.</p>
            ) : (
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Tarea</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Última corrida</th>
                    <th scope="col">Última buena</th>
                    <th scope="col" className="num" title="Filas que trajo la fuente / filas nuevas o corregidas en la base">
                      Leídas / escritas
                    </th>
                    <th scope="col" className="num">
                      Errores 24 h
                    </th>
                    <th scope="col">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {tareas.map((t) => (
                    <tr key={t.tarea}>
                      <th scope="row" className="mono chico">
                        {t.tarea}
                      </th>
                      <td>
                        <Etiqueta estado={t.estado} inicio={t.inicio} ahora={ahora} />
                      </td>
                      <td title={fechaHoraRD(t.inicio)}>{hace(t.inicio, ahora)}</td>
                      <td title={t.ultima_ok ? fechaHoraRD(t.ultima_ok) : undefined}>
                        {t.ultima_ok ? hace(t.ultima_ok, ahora) : <span className="baja">nunca</span>}
                      </td>
                      <td className="num">
                        {typeof t.detalle?.recibidas === "number" ? `${t.detalle.recibidas} / ${t.filas}` : t.filas}
                      </td>
                      <td className={`num ${Number(t.errores_24h) > 0 ? "baja" : ""}`}>{t.errores_24h}</td>
                      <td className="chico">{t.error ?? <span className="tenue">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="panel panel-ancho" aria-labelledby="t-corridas">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-corridas">
              Últimas 25 corridas
            </h2>
          </div>
          <div className="panel-cuerpo desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Inicio (hora RD)</th>
                  <th scope="col">Tarea</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="num">
                    Duración
                  </th>
                  <th scope="col" className="num">
                    Escritas
                  </th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {corridas.map((c) => (
                  <tr key={c.id}>
                    <td className="mono chico">{fechaHoraRD(c.inicio)}</td>
                    <td className="mono chico">{c.tarea}</td>
                    <td>
                      <Etiqueta estado={c.estado} inicio={c.inicio} ahora={ahora} />
                    </td>
                    <td className="num">
                      {c.fin ? `${((new Date(c.fin).getTime() - new Date(c.inicio).getTime()) / 1000).toFixed(1)} s` : "—"}
                    </td>
                    <td className="num">{c.filas}</td>
                    <td className="chico">{c.error ?? <span className="tenue">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel panel-ancho" aria-labelledby="t-fuentes">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-fuentes">
              Fuentes
            </h2>
          </div>
          <div className="panel-cuerpo desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Fuente</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Lectura</th>
                  <th scope="col">Notas de uso</th>
                </tr>
              </thead>
              <tbody>
                {fuentes.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <a href={f.url} target="_blank" rel="noopener noreferrer">
                        {f.nombre}
                      </a>
                    </td>
                    <td className="mono chico">{f.tipo}</td>
                    <td>
                      {f.lectura_automatica ? (
                        <span className="etiqueta ok">automática</span>
                      ) : (
                        <span className="etiqueta alerta">solo manual</span>
                      )}
                    </td>
                    <td className="chico">{f.notas_de_uso ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <Actualizador />
    </>
  );
}
