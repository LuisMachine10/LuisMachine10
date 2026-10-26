import Big from "big.js";
import type { Metadata } from "next";
import Link from "next/link";
import { BotonesNuevo } from "@/componentes/caja/BotonesNuevo";
import { Barra, Diferencia, TablaResultados } from "@/componentes/caja/EstadoResultados";
import { Icono } from "@/componentes/caja/Iconos";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { NavMes } from "@/componentes/caja/NavMes";
import { NuevoMovimientoSuelto } from "@/componentes/caja/NuevoMovimientoSuelto";
import { SinDatosCaja } from "@/componentes/caja/SinDatosCaja";
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { leerCaja } from "@/lib/caja/datos";
import { leerRegistro } from "@/lib/capital/datos-registro";
import { esMes, fechaLarga, hoyRD, mesDe, nombreMes, ultimoDia } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import { describirTasa, FUENTE_BCRD } from "@/lib/caja/tasas";
import { horizonte, simular } from "@/lib/caja/motor";
import { estadoDeResultados } from "@/lib/caja/resultados";
import { catalogos } from "@/lib/caja/vista";

export const metadata: Metadata = { title: "Estado de resultados · Presupuesto · Strategya" };
export const dynamic = "force-dynamic";

const SUB = "Aquí ves tu mes como un estado de resultados: lo que planificaste contra lo que de verdad pasó, hasta tu utilidad neta.";

export default async function PaginaResultados({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const ahora = new Date();
  const hoy = hoyRD(ahora);
  const q = await searchParams;
  const mes = esMes(q.mes) ? q.mes : mesDe(hoy);
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="resultados" editadoEn={null} sub={SUB}>
        <PanelError titulo="Estado de resultados" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  if (!datos.config) {
    return (
      <MarcoCaja actual="resultados" editadoEn={editadoEn} sub={SUB}>
        <SinDatosCaja que="resultados" />
      </MarcoCaja>
    );
  }
  const sim = simular(datos, { hoy, hasta: horizonte(mes, hoy) });
  const e = estadoDeResultados(datos, mes, { sim });
  const cat = catalogos(datos, await leerRegistro(datos, lectura.enlaces, hoy).catch(() => []));
  const un = e.utilidadNeta;
  const ultimoMov = datos.movimientos.filter((m) => mesDe(m.fecha) === mes).map((m) => m.fecha).sort().at(-1) ?? null;
  const porResponder = sim.dias.filter((d) => mesDe(d.fecha) === mes).reduce((n, d) => n + d.porConfirmar.length, 0);

  return (
    <MarcoCaja actual="resultados" mes={mes} editadoEn={editadoEn} sub={SUB} acciones={<BotonesNuevo />}>
      <div className="panel-ancho caja-er-cabeza">
        <NavMes mes={mes} ruta="/caja/resultados" hoyMes={mesDe(hoy)} />
        <SelloFuente
          ahora={ahora}
          d={{
            fuente: "Tus registros · categorías, fijos y movimientos",
            url: null,
            fechaDato: ultimoMov ?? (editadoEn ? hoyRD(new Date(editadoEn)) : hoy),
            verificadoEn: editadoEn,
            desactualizado: false,
            ultimaCorridaFallo: false,
          }}
        />
      </div>

      {e.vacio ? (
        <section className="panel panel-ancho caja-vacia" aria-labelledby="t-er-vacio">
          <span className="caja-bienvenida-icono" aria-hidden="true">
            <Icono n="balanza" tam={24} />
          </span>
          <h2 className="panel-titulo" id="t-er-vacio">
            Nada presupuestado ni anotado en {nombreMes(mes)}
          </h2>
          <p className="tenue">
            Escribe en Configuración cuánto esperas de cada categoría (o agrega tus pagos fijos) y aquí verás lo planificado contra lo real.
          </p>
          <p className="tenue chico">Ejemplos: Sueldo RD$ 60,000 · Alquiler RD$ 18,000 · Comida RD$ 12,000 · Intereses de la tarjeta RD$ 1,500.</p>
          <Link href="/caja/ajustes" className="boton caja-boton-grande">
            Poner lo que espero este mes
            <Icono n="derecha" tam={18} />
          </Link>
        </section>
      ) : (
        <>
          <section className="panel panel-ancho caja-er-resumen" aria-labelledby="t-er-neta">
            <div className="caja-er-heroe">
              <h2 className="caja-mosaico-titulo" id="t-er-neta">
                Utilidad neta de {nombreMes(mes)}
              </h2>
              <p className={`cifra-grande mono ${new Big(un.real).lt(0) ? "baja" : ""}`}>{rd(un.real)}</p>
              <p className="caja-er-heroe-nota">
                <span className="tenue">Presupuestado {rd(un.presupuestado)}</span> <Diferencia d={un.diferencia} />
              </p>
              {mes === mesDe(hoy) ? <p className="caja-er-heroe-nota tenue">Mes en curso: lo real sigue sumando hasta el {ultimoDia(mes).slice(8)}.</p> : null}
              <Barra l={{ presupuestado: un.presupuestado, real: un.real, pendiente: "0" }} entrada />
            </div>
            <dl className="caja-er-claves">
              <div>
                <dt>Ingresos</dt>
                <dd className="mono">{rd(e.secciones.ingreso.real)}</dd>
                <dd className="tenue chico mono">de {rd(e.secciones.ingreso.presupuestado)}</dd>
              </div>
              <div>
                <dt>Gastos totales</dt>
                <dd className="mono">{rd(e.gastosTotales.real)}</dd>
                <dd className="tenue chico mono">de {rd(e.gastosTotales.presupuestado)}</dd>
              </div>
              <div>
                <dt>Ahorro e inversión</dt>
                <dd className="mono">{rd(e.secciones.ahorro_inversion.real)}</dd>
                <dd className="tenue chico mono">de {rd(e.secciones.ahorro_inversion.presupuestado)}</dd>
              </div>
              <div>
                <dt>Te queda disponible</dt>
                <dd className={`mono ${new Big(e.disponible.real).lt(0) ? "baja" : ""}`}>{rd(e.disponible.real)}</dd>
                <dd className="tenue chico mono">de {rd(e.disponible.presupuestado)}</dd>
              </div>
            </dl>
          </section>

          {e.sinCategoria.recurrentes || e.sinCategoria.movimientos || e.sinTasa || porResponder ? (
            <ul className="panel-ancho caja-er-avisos">
              {e.sinCategoria.recurrentes ? (
                <li>
                  <Icono n="aviso" tam={16} />
                  <span>
                    {e.sinCategoria.recurrentes} pago(s) fijo(s) sin categoría: caen en «Sin categoría».{" "}
                    <Link href="/caja/ajustes#sin-categoria">Asígnales una categoría</Link>
                  </span>
                </li>
              ) : null}
              {e.sinCategoria.movimientos ? (
                <li>
                  <Icono n="aviso" tam={16} />
                  <span>
                    {e.sinCategoria.movimientos} movimiento(s) del mes sin categoría.{" "}
                    <Link href={`/caja/movimientos?mes=${mes}#sin-categoria`}>Asígnales una categoría</Link>
                  </span>
                </li>
              ) : null}
              {porResponder ? (
                <li>
                  <Icono n="aviso" tam={16} />
                  <span>
                    {porResponder} fijo(s) de días pasados sin responder «¿Ya se hizo?»: no cuentan en lo real.{" "}
                    <Link href={`/caja?mes=${mes}`}>Responder en el calendario</Link>
                  </span>
                </li>
              ) : null}
              {e.sinTasa ? (
                <li>
                  <Icono n="aviso" tam={16} />
                  <span>
                    {e.sinTasa} monto(s) en dólares sin tasa (ni la que anotaste ni el dólar del BCRD de su fecha: no confirmado) o de «pagar todo lo
                    que debas» no se suman.
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}

          <section className="panel panel-ancho" aria-labelledby="t-er">
            <div className="panel-cabecera">
              <h2 className="panel-titulo" id="t-er">
                Estado de resultados · {nombreMes(mes)}
              </h2>
              <Link href="/caja/ajustes" className="boton secundario caja-er-cambiar">
                Cambiar lo presupuestado
              </Link>
            </div>
            <div className="panel-cuerpo">
              <TablaResultados e={e} />
              {e.conversiones.length ? (
                <details className="caja-leyenda-caja">
                  <summary>Dólares de este mes: tasa usada ({e.conversiones.length})</summary>
                  <ul className="caja-er-ayuda chico">
                    {e.conversiones.map((x) => (
                      <li key={x.id}>
                        {fechaLarga(x.fecha).replace(/ de \d{4}$/, "")}: {enMoneda(x.monto, "USD")}{" "}
                        {x.dop ? (
                          <>
                            × {describirTasa(x.tasa)} = <span className="mono">{rd(x.dop)}</span>
                          </>
                        ) : (
                          <span className="baja">no confirmado: sin tasa, no se suma</span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <span className="sello">
                    Fuente: la tasa que anotaste o el <a href={FUENTE_BCRD.url} target="_blank" rel="noreferrer">dólar de venta del BCRD</a> del día (o el último publicado en los 7 días anteriores).
                  </span>
                </details>
              ) : null}
              <details className="caja-leyenda-caja">
                <summary>¿Cómo se lee?</summary>
                <ul className="caja-er-ayuda chico tenue">
                  <li>
                    <strong>Presupuestado</strong> = tus pagos fijos del mes en esa categoría + el monto adicional que escribiste en Configuración.
                  </li>
                  <li>
                    <strong>Real</strong> = lo que anotaste o marcaste con «Sí, ya se hizo». Los fijos sin responder no cuentan todavía.
                  </li>
                  <li>
                    <strong>Diferencia</strong>: en verde «a favor» (entró más o gastaste menos), en rojo «en contra». La barra clara es lo
                    programado que falta este mes; punteada gris, sin presupuesto.
                  </li>
                  <li>
                    <strong>% cumplido</strong> = real ÷ presupuestado. Montos en RD$; los dólares, con su tasa.
                  </li>
                  <li>
                    <strong>Pagos de tarjeta o préstamo</strong>: solo la parte de interés cuenta como gasto financiero; el capital no es gasto
                    (baja lo que debes).
                  </li>
                </ul>
              </details>
            </div>
          </section>
        </>
      )}
      <NuevoMovimientoSuelto cuentas={cat.cuentas} categorias={cat.categorias} hoy={hoy} />
    </MarcoCaja>
  );
}
