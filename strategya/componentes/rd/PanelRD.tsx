// Dólar y euro: mosaicos pequeños (dólar del BCRD, euro calculado, TPM e inflación) y UNA gráfica con
// el dólar (compra y venta) y el euro, con su tabla equivalente. El BCRD no publica el euro: el euro es
// el cruce calculado dólar del BCRD × EUR/USD del BCE, rotulado así (nunca como dato oficial).
// Server Component: lee sus datos (compartidos por petición con los demás paneles de RD).

import "@/estilos/rd.css";
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { brechaCambiaria, cruceEuro, type DatoRD, historial, mesLargo, type PuntoEuro, ultimosDatos } from "@/lib/rd";
import { Cabecera, Cambio, ICONOS_RD, QueEs, Sello, SinDatos, tareaDe, tareaDeSerie } from "./comun";
import { GraficoDivisas } from "./GraficoDivisas";

const URL_BCE = "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";

export async function PanelRD({ ancho = false }: { ancho?: boolean } = {}) {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Dólar y euro" mensaje={(e as Error).message} />;
  }
  return <VistaPanelRD d={d} ahora={ahora} ancho={ancho} />;
}

function Mosaico({ id, titulo, children, ayuda }: { id: string; titulo: string; children: React.ReactNode; ayuda?: React.ReactNode }) {
  return (
    <article className="rd-mosaico" aria-labelledby={id}>
      <div className="rd-mosaico-cabeza">
        <h3 className="rd-mosaico-titulo" id={id}>
          {titulo}
        </h3>
        {ayuda}
      </div>
      {children}
    </article>
  );
}

function MosaicoDolar({ venta, compra, d, ahora }: { venta?: DatoRD; compra?: DatoRD; d: DatosRD; ahora: Date }) {
  const principal = venta ?? compra;
  return (
    <Mosaico id="t-mos-dolar" titulo="Dólar (BCRD)">
      {principal ? (
        <>
          <p className="rd-mosaico-valor">
            <span className="rd-moneda">RD$</span>
            <span className="cifra-grande">{cifra(principal.obs.valor, 4)}</span>
            <span className="rd-moneda">{venta ? "venta" : "compra"}</span>
          </p>
          <p className="rd-mosaico-linea">
            <Cambio cambio={principal.obs.cambio} decimales={4} pastilla />
            {venta && compra ? (
              <span className="rd-mosaico-ref">
                compra <span className="mono">{cifra(compra.obs.valor, 4)}</span>
              </span>
            ) : null}
          </p>
          <Sello dato={principal} tarea={tareaDeSerie(d.tareas, principal)} ahora={ahora} />
        </>
      ) : (
        <SinDatos tarea={tareaDe(d.tareas, "bcrd-portada")}>Sin dato todavía. El BCRD se lee a las 9:00 AM y 4:00 PM.</SinDatos>
      )}
    </Mosaico>
  );
}

function MosaicoEuro({ euro, viejo, ahora }: { euro: PuntoEuro | undefined; viejo: boolean; ahora: Date }) {
  return (
    <Mosaico
      id="t-mos-euro"
      titulo="Euro (calculado)"
      ayuda={
        <QueEs titulo="Euro calculado">
          El Banco Central no publica el euro. Lo calculamos así: dólar del BCRD × cuántos dólares vale un euro según el Banco
          Central Europeo (BCE). Es una referencia, no una tasa oficial.
        </QueEs>
      }
    >
      {euro ? (
        <>
          <p className="rd-mosaico-valor">
            <span className="rd-moneda">RD$</span>
            <span className="cifra-grande">{cifra(euro.venta, 4)}</span>
            <span className="rd-moneda">venta</span>
          </p>
          <p className="rd-mosaico-linea">
            <span className="etiqueta neutra" title="Cruce calculado: dólar del BCRD × euro del BCE">
              cruce calculado
            </span>
            {euro.compra ? (
              <span className="rd-mosaico-ref">
                compra <span className="mono">{cifra(euro.compra, 4)}</span>
              </span>
            ) : null}
          </p>
          <SelloFuente
            ahora={ahora}
            d={{
              fuente: `BCRD (${fechaCorta(euro.fechaDolar, false)}) × BCE`,
              url: URL_BCE,
              fechaDato: euro.fecha,
              verificadoEn: null,
              desactualizado: viejo,
              ultimaCorridaFallo: false,
            }}
          />
        </>
      ) : (
        <SinDatos>Sin dato: hace falta la tasa del euro del BCE de los últimos días y el dólar del BCRD de esa fecha.</SinDatos>
      )}
    </Mosaico>
  );
}

export function VistaPanelRD({ d, ahora, ancho = false }: { d: DatosRD; ahora: Date; ancho?: boolean }) {
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  const compra = datos.get("USDDOP_COMPRA");
  const venta = datos.get("USDDOP_VENTA");
  const tpm = datos.get("TPM_BCRD");
  const inflacion = datos.get("INFLACION_RD");
  const subyacente = datos.get("INFLACION_SUB_RD");
  const brecha = brechaCambiaria(compra?.obs, venta?.obs);
  const portada = tareaDe(d.tareas, "bcrd-portada");
  const ultimosDias = historial(d.observaciones, "USDDOP_VENTA", 6);
  const serieVenta = historial(d.observaciones, "USDDOP_VENTA", 60);
  const serieCompra = historial(d.observaciones, "USDDOP_COMPRA", 60);
  const compraPorFecha = new Map(serieCompra.map((o) => [o.fecha_dato, o]));
  const desdeVenta = serieVenta.at(-1)?.fecha_dato;
  const euros = cruceEuro(d.observaciones, d.eurusd).filter((p) => !desdeVenta || p.fecha >= desdeVenta);
  const euro = euros[0];
  const maxEuro = d.seriesExtra.find((s) => s.id === "EURUSD")?.max_antiguedad_min ?? 5760;
  // El euro calculado es viejo si su tasa del BCE tiene más de 4 días (o lo que diga la serie, lo mayor) o si el dólar usado lo es.
  const euroViejo = euro
    ? frescura({ fecha_dato: euro.fecha }, Math.max(maxEuro, 5760), ahora).desactualizado || !!venta?.desactualizado
    : false;
  const hasta = serieVenta[0]?.fecha_dato;

  return (
    <section className={`panel rd-panel${ancho ? " panel-ancho" : ""}`} aria-labelledby="t-panel-rd">
      <Cabecera
        id="t-panel-rd"
        titulo="Dólar y euro"
        icono={ICONOS_RD.dolar}
        para="Cuántos pesos cuesta un dólar o un euro, y la tasa y la inflación del Banco Central."
      >
        {brecha && compra ? (
          <span className="rd-brecha" title={`Diferencia entre venta y compra del ${fechaCorta(compra.obs.fecha_dato)}`}>
            Diferencia venta − compra <span className="mono">RD$ {cifra(brecha, 4)}</span>
          </span>
        ) : null}
      </Cabecera>
      <div className="panel-cuerpo rd-contenedor">
        <div className="rd-mosaicos">
          <MosaicoDolar venta={venta} compra={compra} d={d} ahora={ahora} />
          <MosaicoEuro euro={euro} viejo={euroViejo} ahora={ahora} />
          <Mosaico
            id="t-mos-tpm"
            titulo="Tasa del Banco Central"
            ayuda={
              <QueEs titulo="Tasa de política monetaria (TPM)">
                La tasa que fija el Banco Central. Si sube, los préstamos tienden a encarecerse; si baja, a abaratarse.
              </QueEs>
            }
          >
            {tpm ? (
              <>
                <p className="rd-mosaico-valor">
                  <span className="cifra-grande">{cifra(tpm.obs.valor, 2)}%</span>
                </p>
                <p className="rd-mosaico-linea">
                  <Cambio cambio={tpm.obs.cambio} pb pastilla />
                  <span className="rd-mosaico-ref">{mesLargo(tpm.obs.fecha_dato)}</span>
                </p>
                <Sello dato={tpm} tarea={tareaDeSerie(d.tareas, tpm)} ahora={ahora} />
              </>
            ) : (
              <SinDatos tarea={tareaDe(d.tareas, "bcrd-excel")}>Sin dato: el Excel de la TPM se lee los días hábiles a las 10:00 AM.</SinDatos>
            )}
          </Mosaico>
          <Mosaico
            id="t-mos-inflacion"
            titulo="Inflación (12 meses)"
            ayuda={
              <QueEs titulo="Inflación interanual">
                Cuánto subieron los precios en los últimos 12 meses (IPC). La subyacente deja fuera alimentos y combustibles, que
                cambian mucho.
              </QueEs>
            }
          >
            {inflacion ? (
              <>
                <p className="rd-mosaico-valor">
                  <span className="cifra-grande">{cifra(inflacion.obs.valor, 2)}%</span>
                </p>
                <p className="rd-mosaico-linea">
                  <Cambio cambio={inflacion.obs.cambio} sufijo=" p.p." pastilla />
                  <span className="rd-mosaico-ref">
                    {mesLargo(inflacion.obs.fecha_dato)}
                    {subyacente ? (
                      <>
                        {" "}
                        · subyacente <span className="mono">{cifra(subyacente.obs.valor, 2)}%</span>
                      </>
                    ) : null}
                  </span>
                </p>
                <Sello dato={inflacion} tarea={portada} ahora={ahora} />
              </>
            ) : (
              <SinDatos tarea={portada}>Sin dato: la inflación sale de la portada del BCRD; si no la trae, queda sin dato.</SinDatos>
            )}
          </Mosaico>
        </div>

        {serieVenta.length > 1 ? (
          <div className="rd-grafico-bloque">
            <ul className="rd-leyenda" aria-label="Líneas del gráfico">
              <li>
                <span className="rd-clave rd-clave-venta" aria-hidden="true" />
                Dólar venta
              </li>
              {serieCompra.length ? (
                <li>
                  <span className="rd-clave rd-clave-compra" aria-hidden="true" />
                  Dólar compra
                </li>
              ) : null}
              {euros.length ? (
                <li title="Cruce calculado: dólar del BCRD × euro del BCE. Escala de la izquierda.">
                  <span className="rd-clave rd-clave-euro" aria-hidden="true" />
                  Euro venta (calculado, escala izq.)
                </li>
              ) : (
                <li className="tenue">Euro: sin tasas del BCE en estas fechas</li>
              )}
            </ul>
            <GraficoDivisas
              series={[
                { id: "venta", nombre: "Dólar venta", color: "--rd", puntos: serieVenta.map((o) => ({ fecha: o.fecha_dato, valor: o.valor })) },
                {
                  id: "compra",
                  nombre: "Dólar compra",
                  color: "--rd",
                  punteada: true,
                  puntos: serieCompra.map((o) => ({ fecha: o.fecha_dato, valor: o.valor })),
                },
                { id: "euro", nombre: "Euro venta", color: "--texto-2", escala: "left", puntos: euros.map((p) => ({ fecha: p.fecha, valor: p.venta })) },
              ]}
              etiqueta={`Gráfico del dólar del BCRD (compra y venta) y del euro calculado, en RD$, del ${desdeVenta ? fechaCorta(desdeVenta) : ""} al ${hasta ? fechaCorta(hasta) : ""}. Las tablas están debajo.`}
            />
            <details className="rd-detalles">
              <summary>Ver las cifras en tabla</summary>
              <div className="rd-tablas-dolar">
                <div className="desplazable">
                  <table className="tabla">
                    <caption className="rd-caption">Dólar del BCRD (RD$ por US$)</caption>
                    <thead>
                      <tr>
                        <th scope="col">Fecha</th>
                        <th scope="col" className="num">
                          Compra
                        </th>
                        <th scope="col" className="num">
                          Venta
                        </th>
                        <th scope="col" className="num">
                          Cambio
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ultimosDias.map((o) => {
                        const c = compraPorFecha.get(o.fecha_dato);
                        return (
                          <tr key={o.fecha_dato}>
                            <th scope="row" className="mono">
                              {fechaCorta(o.fecha_dato)}
                            </th>
                            <td className="num">{c ? cifra(c.valor, 4) : "—"}</td>
                            <td className="num">{cifra(o.valor, 4)}</td>
                            <td className="num">
                              <Cambio cambio={o.cambio} decimales={4} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {euros.length ? (
                  <div className="desplazable">
                    <table className="tabla">
                      <caption className="rd-caption">Euro calculado (RD$ por €) = dólar del BCRD × EUR/USD del BCE</caption>
                      <thead>
                        <tr>
                          <th scope="col">Fecha BCE</th>
                          <th scope="col" className="num">
                            EUR/USD
                          </th>
                          <th scope="col">Dólar del</th>
                          <th scope="col" className="num">
                            Compra
                          </th>
                          <th scope="col" className="num">
                            Venta
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {euros.slice(0, 6).map((p) => (
                          <tr key={p.fecha}>
                            <th scope="row" className="mono">
                              {fechaCorta(p.fecha)}
                            </th>
                            <td className="num">{cifra(p.eurusd, 4)}</td>
                            <td className="mono">{fechaCorta(p.fechaDolar, false)}</td>
                            <td className="num">{p.compra ? cifra(p.compra, 4) : "—"}</td>
                            <td className="num">{cifra(p.venta, 4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </section>
  );
}
