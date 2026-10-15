// Panel principal de República Dominicana: dólar del BCRD (compra y venta), TPM e inflación.
// Server Component: lee sus datos (compartidos por petición con los demás paneles de RD).

import "@/estilos/rd.css";
import { PanelError } from "@/componentes/PanelError";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { brechaCambiaria, historial, mesLargo, ultimosDatos } from "@/lib/rd";
import { Cambio, Sello, SinDatos, tareaDe, tareaDeSerie } from "./comun";

export async function PanelRD() {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="República Dominicana" mensaje={(e as Error).message} />;
  }
  return <VistaPanelRD d={d} ahora={ahora} />;
}

export function VistaPanelRD({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  const compra = datos.get("USDDOP_COMPRA");
  const venta = datos.get("USDDOP_VENTA");
  const tpm = datos.get("TPM_BCRD");
  const inflacion = datos.get("INFLACION_RD");
  const subyacente = datos.get("INFLACION_SUB_RD");
  const brecha = brechaCambiaria(compra?.obs, venta?.obs);
  const portada = tareaDe(d.tareas, "bcrd-portada");
  const ultimosDias = historial(d.observaciones, "USDDOP_VENTA", 6);
  const compraPorFecha = new Map(historial(d.observaciones, "USDDOP_COMPRA", 30).map((o) => [o.fecha_dato, o]));

  return (
    <section className="panel" aria-labelledby="t-panel-rd">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-panel-rd">
          República Dominicana
        </h2>
        <span className="sello">Banco Central (BCRD) · tasa de referencia del mercado spot</span>
      </div>
      <div className="panel-cuerpo">
        <dl className="rd-cifras">
          {(
            [
              ["Dólar · compra", compra],
              ["Dólar · venta", venta],
            ] as const
          ).map(([titulo, dato]) => (
            <div className="rd-cifra" key={titulo}>
              <dt>{titulo}</dt>
              <dd>
                {dato ? (
                  <>
                    <span className="rd-valor">RD$ {cifra(dato.obs.valor, 4)}</span>
                    <span className="rd-detalle">
                      Día: <Cambio cambio={dato.obs.cambio} decimales={4} />
                      {dato.anterior ? <span className="tenue"> vs {fechaCorta(dato.anterior.fecha_dato, false)}</span> : null}
                    </span>
                    <Sello dato={dato} tarea={tareaDeSerie(d.tareas, dato)} ahora={ahora} />
                  </>
                ) : (
                  <SinDatos tarea={portada}>Sin datos todavía. La portada del BCRD se lee a las 9:00 AM y 4:00 PM (hora RD).</SinDatos>
                )}
              </dd>
            </div>
          ))}

          <div className="rd-cifra">
            <dt>Tasa de política monetaria</dt>
            <dd>
              {tpm ? (
                <>
                  <span className="rd-valor">{cifra(tpm.obs.valor, 2)}%</span>
                  <span className="rd-detalle">
                    Vigente en {mesLargo(tpm.obs.fecha_dato)} · <Cambio cambio={tpm.obs.cambio} pb />
                  </span>
                  <Sello dato={tpm} tarea={tareaDeSerie(d.tareas, tpm)} ahora={ahora} />
                </>
              ) : (
                <SinDatos tarea={tareaDe(d.tareas, "bcrd-excel")}>Sin datos: el Excel de la TPM se lee los días hábiles a las 10:00 AM.</SinDatos>
              )}
            </dd>
          </div>

          <div className="rd-cifra">
            <dt>Inflación interanual (IPC)</dt>
            <dd>
              {inflacion ? (
                <>
                  <span className="rd-valor">{cifra(inflacion.obs.valor, 2)}%</span>
                  <span className="rd-detalle">
                    {mesLargo(inflacion.obs.fecha_dato)} · <Cambio cambio={inflacion.obs.cambio} sufijo=" p.p." />
                  </span>
                  {subyacente ? (
                    <span className="rd-detalle">
                      Subyacente: <span className="mono">{cifra(subyacente.obs.valor, 2)}%</span> ({mesLargo(subyacente.obs.fecha_dato)})
                    </span>
                  ) : null}
                  <Sello dato={inflacion} tarea={portada} ahora={ahora} />
                </>
              ) : (
                <SinDatos tarea={portada}>
                  Sin datos: la inflación sale de la portada del BCRD; si la portada no la trae, queda sin dato.
                </SinDatos>
              )}
            </dd>
          </div>
        </dl>

        {brecha && compra ? (
          <p className="chico tenue">
            Diferencia venta − compra del {fechaCorta(compra.obs.fecha_dato)}: <span className="mono">RD$ {cifra(brecha, 4)}</span>
          </p>
        ) : null}

        {ultimosDias.length > 1 ? (
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
                      <th scope="row" className="mono chico">
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
        ) : null}
      </div>
    </section>
  );
}
