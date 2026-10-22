// «Mis posiciones»: las acciones y ETF de EE. UU. de Portafolio Financiero, valoradas con la cotización
// del día: lo que valen, cuánto se movieron hoy y cuánto ganas o pierdes contra lo que pagaste.
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { datosMiLista } from "@/lib/datos-mercado";
import { armarPosiciones, contextoLista, ultimaPorSimbolo } from "@/lib/mercado-vista";
import { Icono, ICONO, MontoConSigno, PastillaCambio, QueEs, SelloCotizacion } from "./piezas-lista";
import { vistaMercado } from "./vista";

const RUTA_PORTAFOLIO = "/capital/cartera";

export async function PanelPosiciones() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  let d: Awaited<ReturnType<typeof datosMiLista>>;
  try {
    [v, d] = await Promise.all([vistaMercado(), datosMiLista()]);
  } catch (e) {
    return <PanelError titulo="Mis posiciones" mensaje={(e as Error).message} />;
  }
  const r = armarPosiciones(d.activos, ultimaPorSimbolo(d.cotizaciones), d.costos, d.marcas, contextoLista(v.ctx, d.tarea?.estado));
  const hay = r.filas.length > 0;

  return (
    <section className="panel panel-ancho ml-panel" aria-labelledby="t-posiciones" id="mis-posiciones">
      <div className="panel-cabecera ml-cabecera">
        <div className="ml-cabecera-texto">
          <h2 className="panel-titulo" id="t-posiciones">
            Mis posiciones
            {hay ? <span className="ml-cuenta">{r.filas.length}</span> : null}
          </h2>
          <p className="ml-para">Las acciones que tienes en Portafolio Financiero, con su valor de hoy. Solo tú lo ves.</p>
        </div>
        {hay ? (
          <a className="ml-enlace-cab" href={RUTA_PORTAFOLIO}>
            Editar en Portafolio <span aria-hidden="true">→</span>
          </a>
        ) : null}
      </div>
      <div className="panel-cuerpo">
        {!hay ? (
          <div className="ml-vacio">
            <span className="ml-vacio-icono" aria-hidden="true">
              <Icono d={ICONO.cartera} tam={22} />
            </span>
            <div className="ml-vacio-texto">
              <h3>Aún no tienes acciones con símbolo</h3>
              <p>
                Cuando anotas en Portafolio Financiero una acción o un ETF de EE. UU. con su símbolo (por ejemplo VOO), aquí ves
                cuánto vale hoy, cuánto subió o bajó en el día y cuánto ganas contra lo que pagaste.
              </p>
              <ol className="ml-pasos">
                <li>
                  Abre <strong>Portafolio Financiero</strong> y agrega un instrumento de <strong>Renta Variable</strong>.
                </li>
                <li>
                  Escribe la cantidad de acciones y, en «Más detalles», el <strong>símbolo</strong>.
                </li>
                <li>Para ver tu ganancia, anota también tus compras (fecha, cantidad y precio).</li>
              </ol>
              <a className="boton secundario ml-boton-alto" href={RUTA_PORTAFOLIO}>
                Ir a Portafolio Financiero
              </a>
            </div>
          </div>
        ) : (
          <>
            <dl className="ml-kpis">
              <div className="ml-kpi">
                <dt>
                  Valen hoy
                  <QueEs tema="lo que valen hoy">
                    <p>Cantidad de acciones × precio de hoy, sumado. En dólares (US$).</p>
                  </QueEs>
                </dt>
                <dd>
                  <span className="cifra-grande">
                    <span className="ml-moneda">US$</span>
                    {r.valor}
                  </span>
                </dd>
              </div>
              <div className="ml-kpi">
                <dt>Hoy</dt>
                <dd>
                  <span className="ml-kpi-cifra">
                    <MontoConSigno monto={r.dia} dir={r.direccionDia} />
                    <PastillaCambio pct={r.diaPct} dir={r.direccionDia} />
                  </span>
                  {r.sinCambio ? (
                    <span className="ml-kpi-nota">
                      {r.sinCambio === 1 ? "1 posición sin cambio del día" : `${r.sinCambio} posiciones sin cambio del día`}
                    </span>
                  ) : (
                    <span className="ml-kpi-nota">desde el cierre de ayer</span>
                  )}
                </dd>
              </div>
              <div className="ml-kpi">
                <dt>
                  Ganas o pierdes
                  <QueEs tema="ganas o pierdes">
                    <p>
                      Lo que valen hoy menos lo que pagaste por ellas (precio promedio de tus compras anotadas en Portafolio, con
                      comisiones).
                    </p>
                  </QueEs>
                </dt>
                <dd>
                  <span className="ml-kpi-cifra">
                    <MontoConSigno monto={r.ganancia} dir={r.direccionGanancia} />
                    {r.gananciaPct ? <PastillaCambio pct={r.gananciaPct} dir={r.direccionGanancia} /> : null}
                  </span>
                  <span className="ml-kpi-nota">
                    {r.ganancia === null
                      ? "Anota tus compras en Portafolio para verlo"
                      : r.sinCosto
                        ? `contra lo que pagaste · ${r.sinCosto} sin compras anotadas`
                        : "contra lo que pagaste"}
                  </span>
                </dd>
              </div>
            </dl>

            <div className="ml-tabla ml-tabla-pos" role="table" aria-label="Mis posiciones: valor y cambio del día">
              <div className="ml-fila ml-encabezados" role="row">
                <span role="columnheader">Acción</span>
                <span role="columnheader" className="ml-der">
                  Cantidad × precio
                </span>
                <span role="columnheader" className="ml-der">
                  Valen hoy US$
                </span>
                <span role="columnheader" className="ml-der">
                  Hoy
                </span>
                <span role="columnheader" className="ml-der">
                  Ganas o pierdes
                </span>
                <span role="columnheader">Dato</span>
              </div>
              {r.filas.map((f) => (
                <div className="ml-fila" role="row" key={f.id}>
                  <span role="cell" className="ml-c-simbolo">
                    <strong className="ml-simbolo">{f.simbolo}</strong>
                    <span className="ml-nota" title={f.nombre}>
                      {f.nombre}
                    </span>
                  </span>
                  <span role="cell" className="ml-c-cantidad ml-der">
                    <span className="mono">
                      {f.cantidad} <span className="tenue">×</span> {f.precio}
                    </span>
                  </span>
                  <span role="cell" className="ml-c-precio ml-der">
                    <span className="mono ml-precio">{f.valor}</span>
                  </span>
                  <span role="cell" className="ml-c-cambio ml-der">
                    <span className="ml-etq">Hoy</span>
                    {f.dia === null && f.diaPct === null ? (
                      <span className="ml-sin" title="Sin cotización del día: no se sabe cuánto cambió">
                        sin dato
                      </span>
                    ) : (
                      <>
                        <PastillaCambio pct={f.diaPct} dir={f.direccionDia} />
                        <MontoConSigno monto={f.dia} dir={f.direccionDia} />
                      </>
                    )}
                  </span>
                  <span role="cell" className="ml-c-ganancia ml-der">
                    <span className="ml-etq">Ganas o pierdes</span>
                    {f.ganancia === null ? (
                      <span className="ml-sin" title="Anota tus compras en Portafolio Financiero para ver cuánto ganas">
                        sin compras anotadas
                      </span>
                    ) : (
                      <>
                        <MontoConSigno monto={f.ganancia} dir={f.direccionGanancia} />
                        <span className={`ml-pct mono ${f.direccionGanancia}`}>{f.gananciaPct}</span>
                      </>
                    )}
                  </span>
                  <span role="cell" className="ml-c-sello">
                    {f.cotizacion ? (
                      <SelloCotizacion c={f.cotizacion} ahora={v.ahora} />
                    ) : (
                      <div className="ml-sello">
                        <SelloFuente
                          ahora={v.ahora}
                          d={{
                            fuente: "Precio manual · Portafolio",
                            url: RUTA_PORTAFOLIO,
                            fechaDato: (f.actualizadoEn ?? v.ahora.toISOString()).slice(0, 10),
                            verificadoEn: f.actualizadoEn,
                            desactualizado: false,
                            ultimaCorridaFallo: false,
                          }}
                        />
                        <span className="mv-hora">{f.sinCotizacion ?? "Sin cotización de Cboe todavía"}</span>
                      </div>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {r.conPrecioManual ? (
              <p className="ml-nota-pie">
                {r.conPrecioManual === 1 ? "Una posición usa" : `${r.conPrecioManual} posiciones usan`} el precio que anotaste a mano
                en Portafolio, hasta que llegue su cotización.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
