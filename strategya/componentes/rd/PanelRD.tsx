// Panel principal de República Dominicana: dólar del BCRD (compra y venta), TPM e inflación, en tarjetas
// grandes, y el gráfico del dólar de las últimas semanas con su tabla equivalente.
// Server Component: lee sus datos (compartidos por petición con los demás paneles de RD).

import "@/estilos/rd.css";
import { PanelError } from "@/componentes/PanelError";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { brechaCambiaria, type DatoRD, historial, mesLargo, ultimosDatos } from "@/lib/rd";
import { Cambio, Icono, ICONOS_RD, Sello, SinDatos, tareaDe, tareaDeSerie } from "./comun";
import { GraficoDolar } from "./GraficoDolar";

export async function PanelRD({ ancho = false }: { ancho?: boolean } = {}) {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="República Dominicana" mensaje={(e as Error).message} />;
  }
  return <VistaPanelRD d={d} ahora={ahora} ancho={ancho} />;
}

function Tarjeta({ id, titulo, icono, children }: { id: string; titulo: string; icono: string; children: React.ReactNode }) {
  return (
    <article className="rd-kpi" aria-labelledby={id}>
      <h3 className="rd-kpi-titulo" id={id}>
        <span className="rd-kpi-icono">
          <Icono d={icono} tam={15} />
        </span>
        {titulo}
      </h3>
      {children}
    </article>
  );
}

function TarjetaDolar({ id, titulo, dato, d, ahora }: { id: string; titulo: string; dato: DatoRD | undefined; d: DatosRD; ahora: Date }) {
  return (
    <Tarjeta id={id} titulo={titulo} icono={ICONOS_RD.dolar}>
      {dato ? (
        <>
          <p className="rd-kpi-valor">
            <span className="rd-moneda">RD$</span>
            <span className="cifra-grande">{cifra(dato.obs.valor, 4)}</span>
          </p>
          <p className="rd-kpi-cambio">
            <Cambio cambio={dato.obs.cambio} decimales={4} pastilla />
            {dato.anterior ? <span className="rd-kpi-ref">vs {fechaCorta(dato.anterior.fecha_dato, false)}</span> : null}
          </p>
          <Sello dato={dato} tarea={tareaDeSerie(d.tareas, dato)} ahora={ahora} />
        </>
      ) : (
        <SinDatos tarea={tareaDe(d.tareas, "bcrd-portada")}>Sin datos todavía. La portada del BCRD se lee a las 9:00 AM y 4:00 PM (hora RD).</SinDatos>
      )}
    </Tarjeta>
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
  const desde = serieVenta.at(-1)?.fecha_dato;
  const hasta = serieVenta[0]?.fecha_dato;

  return (
    <section className={`panel rd-panel${ancho ? " panel-ancho" : ""}`} aria-labelledby="t-panel-rd">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-panel-rd">
          República Dominicana
        </h2>
        <span className="sello" title="Banco Central de la República Dominicana · tasa de referencia del mercado spot">
          Banco Central (BCRD)
        </span>
      </div>
      <div className="panel-cuerpo">
        <div className="rd-kpis">
          <TarjetaDolar id="t-kpi-compra" titulo="Dólar · compra" dato={compra} d={d} ahora={ahora} />
          <TarjetaDolar id="t-kpi-venta" titulo="Dólar · venta" dato={venta} d={d} ahora={ahora} />

          <Tarjeta id="t-kpi-tpm" titulo="Tasa de política monetaria" icono={ICONOS_RD.banco}>
            {tpm ? (
              <>
                <p className="rd-kpi-valor">
                  <span className="cifra-grande">{cifra(tpm.obs.valor, 2)}%</span>
                </p>
                <p className="rd-kpi-cambio">
                  <Cambio cambio={tpm.obs.cambio} pb pastilla />
                  <span className="rd-kpi-ref">vigente en {mesLargo(tpm.obs.fecha_dato)}</span>
                </p>
                <Sello dato={tpm} tarea={tareaDeSerie(d.tareas, tpm)} ahora={ahora} />
              </>
            ) : (
              <SinDatos tarea={tareaDe(d.tareas, "bcrd-excel")}>Sin datos: el Excel de la TPM se lee los días hábiles a las 10:00 AM.</SinDatos>
            )}
          </Tarjeta>

          <Tarjeta id="t-kpi-inflacion" titulo="Inflación interanual (IPC)" icono={ICONOS_RD.precios}>
            {inflacion ? (
              <>
                <p className="rd-kpi-valor">
                  <span className="cifra-grande">{cifra(inflacion.obs.valor, 2)}%</span>
                </p>
                <p className="rd-kpi-cambio">
                  <Cambio cambio={inflacion.obs.cambio} sufijo=" p.p." pastilla />
                  <span className="rd-kpi-ref">{mesLargo(inflacion.obs.fecha_dato)}</span>
                </p>
                {subyacente ? (
                  <p className="rd-kpi-extra">
                    Subyacente <span className="mono">{cifra(subyacente.obs.valor, 2)}%</span>
                    <span className="tenue"> · {mesLargo(subyacente.obs.fecha_dato)}</span>
                  </p>
                ) : null}
                <Sello dato={inflacion} tarea={portada} ahora={ahora} />
              </>
            ) : (
              <SinDatos tarea={portada}>Sin datos: la inflación sale de la portada del BCRD; si la portada no la trae, queda sin dato.</SinDatos>
            )}
          </Tarjeta>
        </div>

        {serieVenta.length > 1 ? (
          <div className="rd-grafico-bloque">
            <div className="rd-grafico-cabeza">
              <h3 className="rd-h3">Dólar de referencia</h3>
              <ul className="rd-leyenda" aria-label="Series del gráfico">
                <li>
                  <span className="rd-clave rd-clave-venta" aria-hidden="true" />
                  Venta
                </li>
                {serieCompra.length ? (
                  <li>
                    <span className="rd-clave rd-clave-compra" aria-hidden="true" />
                    Compra
                  </li>
                ) : null}
              </ul>
              {brecha && compra ? (
                <span className="rd-brecha" title={`Diferencia venta − compra del ${fechaCorta(compra.obs.fecha_dato)}`}>
                  Brecha <span className="mono">RD$ {cifra(brecha, 4)}</span>
                </span>
              ) : null}
            </div>
            <GraficoDolar
              venta={serieVenta.map((o) => ({ fecha: o.fecha_dato, valor: o.valor }))}
              compra={serieCompra.map((o) => ({ fecha: o.fecha_dato, valor: o.valor }))}
              etiqueta={`Gráfico del dólar de referencia del BCRD (RD$ por US$), compra y venta, del ${desde ? fechaCorta(desde) : ""} al ${hasta ? fechaCorta(hasta) : ""}. La tabla de los últimos días está debajo.`}
            />
            <details className="rd-detalles">
              <summary>Últimos días publicados</summary>
              <div className="desplazable">
                <table className="tabla">
                  <caption className="sr-solo">Dólar de referencia del BCRD, últimos días publicados (RD$ por US$)</caption>
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
                        Día (venta)
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
            </details>
          </div>
        ) : null}
      </div>
    </section>
  );
}
