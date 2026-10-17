// Mapa del mundo (Equal Earth, Natural Earth 50m) con pines: noticias, guerras, RD y mercados
// (sube / baja según su último cambio). Debajo, la lista equivalente para lectores de pantalla.

import { PanelError } from "@/componentes/PanelError";
import { leerMovimientos, leerNoticias } from "@/lib/datos-noticias";
import { fechaHoraRD, hace } from "@/lib/formato";
import { ALTO_MAPA, ANCHO_MAPA, proyectarPines } from "@/lib/mapa";
import { ETIQUETA_PIN, type Pin, pinesDeNoticias, pinesDeSeries, type TipoPin } from "@/lib/noticias";
import { algunaFallo, Cabecera, ultimaOk } from "./comun";
import { IconoPin, MapaInteractivo } from "./MapaInteractivo";

const ORDEN_TIPOS: TipoPin[] = ["guerra", "noticia", "rd", "sube", "baja", "igual"];
/** Mapa base estático (app/noticias/mapa.svg/route.ts). */
const URL_FONDO = "/noticias/mapa.svg";

function Leyenda({ conteo }: { conteo: Map<TipoPin, number> }) {
  return (
    <ul className="nt-leyenda" aria-label="Leyenda del mapa">
      {ORDEN_TIPOS.filter((t) => t !== "igual" || conteo.has("igual")).map((t) => (
        <li key={t} className={conteo.get(t) ? undefined : "nt-leyenda-vacia"}>
          <IconoPin tipo={t} />
          {ETIQUETA_PIN[t]}
          {conteo.get(t) ? <span className="mono nt-leyenda-n">{conteo.get(t)}</span> : null}
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
  const conteo = new Map(porTipo.map((g) => [g.tipo, g.pines.length]));

  return (
    <section className="panel panel-ancho nt-panel" aria-labelledby="titulo-mapa">
      <Cabecera id="titulo-mapa" titulo="Mapa">
        <div className="sello nt-sello-cabecera">
          <span title={`Titulares de las últimas ${horas} h con lugar identificado; mercados según su último cambio`}>
            Últimas {horas} h
          </span>
          {verificado ? <span title={fechaHoraRD(verificado)}>· verificado {hace(verificado, ahora)}</span> : null}
          {fallo ? <span className="etiqueta error">la última lectura falló (ver Estado)</span> : null}
        </div>
      </Cabecera>
      <div className="panel-cuerpo">
        <Leyenda conteo={conteo} />
        <MapaInteractivo pines={proyectados} ancho={ANCHO_MAPA} alto={ALTO_MAPA} fondo={URL_FONDO} />
        {proyectados.length === 0 ? (
          <p className="nt-vacio-mini">Sin lugares que marcar todavía: los pines aparecen cuando llegan titulares con un lugar reconocido o cotizaciones con su ubicación.</p>
        ) : (
          <details className="nt-detalles">
            <summary>
              Lista del mapa <span className="mono tenue">{proyectados.length}</span>
            </summary>
            <div className="nt-lista-mapa-rejilla">
              {porTipo.map((g) => (
                <div key={g.tipo} className="nt-bloque">
                  <h3 className="nt-subtitulo">
                    <IconoPin tipo={g.tipo} tam={12} />
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
            </div>
          </details>
        )}
        <p className="nt-credito">Mapa: Natural Earth vía world-atlas (dominio público).</p>
      </div>
    </section>
  );
}
