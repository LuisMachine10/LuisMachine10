// Mapa del mundo (Equal Earth) con pines: noticias (ámbar), guerras (rojo), RD (azul) y mercados
// (verde si su último cambio sube, rojo si baja). Debajo, la lista equivalente para lectores de pantalla.

import { PanelError } from "@/componentes/PanelError";
import { leerMovimientos, leerNoticias } from "@/lib/datos-noticias";
import { ALTO_MAPA, ANCHO_MAPA, geometriaMapa, proyectarPines } from "@/lib/mapa";
import { ETIQUETA_PIN, type Pin, pinesDeNoticias, pinesDeSeries, type TipoPin } from "@/lib/noticias";
import { algunaFallo, Cabecera, ultimaOk } from "./comun";
import { FormaPin, MapaInteractivo } from "./MapaInteractivo";
import { fechaHoraRD, hace } from "@/lib/formato";

const ORDEN_TIPOS: TipoPin[] = ["guerra", "noticia", "rd", "sube", "baja", "igual"];

function Fondo() {
  const g = geometriaMapa();
  return (
    <g aria-hidden="true">
      <path d={g.esfera} className="nt-mar" />
      <path d={g.reticula} className="nt-reticula" />
      {g.paises.map((p) => (
        <path key={p.id} d={p.d} className="nt-pais">
          <title>{p.nombre}</title>
        </path>
      ))}
      <path d={g.fronteras} className="nt-fronteras" />
    </g>
  );
}

function Leyenda({ presentes }: { presentes: Set<TipoPin> }) {
  return (
    <ul className="leyenda nt-leyenda" aria-label="Leyenda del mapa">
      {ORDEN_TIPOS.filter((t) => t !== "igual" || presentes.has("igual")).map((t) => (
        <li key={t}>
          <svg width={14} height={14} viewBox="-9 -9 18 18" aria-hidden="true">
            <FormaPin tipo={t} />
          </svg>
          {ETIQUETA_PIN[t]}
        </li>
      ))}
    </ul>
  );
}

export async function Mapa({ horas = 24, ahora = new Date() }: { horas?: number; ahora?: Date }) {
  let pines: Pin[];
  let verificado: string | null;
  let fallo: boolean;
  try {
    const [{ noticias, tareas }, movs] = await Promise.all([leerNoticias(horas), leerMovimientos()]);
    pines = [...pinesDeNoticias(noticias), ...pinesDeSeries(movs)];
    verificado = ultimaOk(tareas);
    fallo = algunaFallo(tareas);
  } catch (e) {
    return <PanelError titulo="Mapa" mensaje={(e as Error).message} />;
  }
  const proyectados = proyectarPines(pines);
  const porTipo = ORDEN_TIPOS.map((t) => ({ tipo: t, pines: proyectados.filter((p) => p.tipo === t) })).filter((g) => g.pines.length);

  return (
    <section className="panel panel-ancho" aria-labelledby="titulo-mapa">
      <Cabecera id="titulo-mapa" titulo="Mapa">
        <div className="sello">
          <span>Titulares de las últimas {horas} h con lugar identificado · mercados según su último cambio</span>
          {verificado ? <span title={fechaHoraRD(verificado)}>· verificado {hace(verificado, ahora)}</span> : null}
          {fallo ? <span className="vencido">· la última lectura de noticias falló (ver Estado)</span> : null}
        </div>
      </Cabecera>
      <div className="panel-cuerpo">
        <Leyenda presentes={new Set(proyectados.map((p) => p.tipo))} />
        <MapaInteractivo pines={proyectados} ancho={ANCHO_MAPA} alto={ALTO_MAPA}>
          <Fondo />
        </MapaInteractivo>
        {proyectados.length === 0 ? (
          <p className="chico tenue">Sin lugares que marcar todavía: los pines aparecen cuando llegan titulares con un lugar reconocido o cotizaciones con su ubicación.</p>
        ) : (
          <details className="nt-detalles">
            <summary>Lista del mapa ({proyectados.length} lugares)</summary>
            {porTipo.map((g) => (
              <div key={g.tipo} className="nt-bloque">
                <h3 className="nt-subtitulo">
                  <svg width={12} height={12} viewBox="-9 -9 18 18" aria-hidden="true">
                    <FormaPin tipo={g.tipo} />
                  </svg>{" "}
                  {ETIQUETA_PIN[g.tipo]}
                </h3>
                <ul className="nt-lista-mapa">
                  {g.pines.map((p) => (
                    <li key={p.id}>
                      <strong>{p.lugar}</strong>
                      <ul>
                        {p.elementos.map((el, i) => (
                          <li key={`${el.url}-${i}`}>
                            {el.url ? (
                              <a href={el.url} target="_blank" rel="noopener noreferrer">
                                {el.texto}
                              </a>
                            ) : (
                              el.texto
                            )}
                            <span className="tenue chico"> · {el.detalle}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        )}
      </div>
    </section>
  );
}
