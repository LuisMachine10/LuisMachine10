import Big from "big.js";
import { describirTasa, FUENTE_BCRD } from "@/lib/caja/tasas";
import type { Metadata } from "next";
import Link from "next/link";
import { asignarCategoria } from "@/app/caja/acciones";
import { BotonesNuevo } from "@/componentes/caja/BotonesNuevo";
import { SelectCategoria } from "@/componentes/caja/CamposMovimiento";
import { FormAccion } from "@/componentes/caja/FormAccion";
import { Ayuda, Icono, type NombreIcono } from "@/componentes/caja/Iconos";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { NavMes } from "@/componentes/caja/NavMes";
import { NuevoMovimientoSuelto } from "@/componentes/caja/NuevoMovimientoSuelto";
import { SinDatosCaja } from "@/componentes/caja/SinDatosCaja";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { esMes, fechaLarga, hoyRD, mesDe, nombreMes } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import { type MovimientoAplicado, movimientosDelMes } from "@/lib/caja/motor";
import { NOMBRE_TIPO } from "@/lib/caja/tipos";
import { catalogos } from "@/lib/caja/vista";

export const metadata: Metadata = { title: "Movimientos · Presupuesto · Strategya" };
export const dynamic = "force-dynamic";

const SUB = "Aquí ves todo lo que anotaste o marcaste como hecho en el mes, día por día, con su categoría.";
const ICONO: Record<string, NombreIcono> = { ingreso: "ingreso", gasto: "gasto", transferencia: "transferir", pago_tarjeta: "tarjeta" };

export default async function PaginaMovimientos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const hoy = hoyRD();
  const q = await searchParams;
  const mes = esMes(q.mes) ? q.mes : mesDe(hoy);
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="movimientos" editadoEn={null} sub={SUB}>
        <PanelError titulo="Movimientos del mes" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  if (!datos.config) {
    return (
      <MarcoCaja actual="movimientos" editadoEn={editadoEn} sub={SUB}>
        <SinDatosCaja que="movimientos" />
      </MarcoCaja>
    );
  }
  const t = movimientosDelMes(datos, mes);
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c.nombre]));
  const categorias = new Map(datos.categorias.map((c) => [c.id, c.nombre]));
  const cuenta = (id: string | null) => (id ? (cuentas.get(id) ?? `«${id}»`) : "—");
  const cat = catalogos(datos);
  const sinCat = t.movimientos.filter((m) => (m.tipo === "ingreso" || m.tipo === "gasto") && !(m.categoria && categorias.has(m.categoria)));

  // Agrupado por día, del más reciente al más viejo.
  const porDia = new Map<string, MovimientoAplicado[]>();
  for (const m of t.movimientos) porDia.set(m.fecha, [...(porDia.get(m.fecha) ?? []), m]);
  const dias = [...porDia.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  const netoDia = (ms: MovimientoAplicado[]) =>
    ms.reduce((s, m) => (m.montoDOP == null ? s : m.tipo === "ingreso" ? s.plus(m.montoDOP) : m.tipo === "gasto" ? s.minus(m.montoDOP) : s), new Big(0));

  return (
    <MarcoCaja actual="movimientos" mes={mes} editadoEn={editadoEn} sub={SUB} acciones={<BotonesNuevo />}>
      <section className="panel panel-ancho" aria-labelledby="t-totales">
        <div className="panel-cabecera caja-cabecera-mes">
          <h2 className="sr-solo" id="t-totales">
            Totales de {nombreMes(mes)}
          </h2>
          <NavMes mes={mes} ruta="/caja/movimientos" hoyMes={mesDe(hoy)} />
          <span className="sello">
            Solo lo anotado o confirmado · fuente: tus registros{t.movimientos.some((m) => m.moneda === "USD") ? <> · US$ con la tasa que anotaste o el <a href={FUENTE_BCRD.url} target="_blank" rel="noreferrer">dólar de venta del BCRD</a> de su fecha</> : null}
          </span>
        </div>
        <div className="panel-cuerpo">
          <div className="caja-totales">
            <div className="caja-total">
              <div className="caja-mosaico-titulo">Te entró</div>
              <p className={`caja-mosaico-cifra chica ${new Big(t.ingresos).gt(0) ? "sube" : ""}`}>+{rd(t.ingresos)}</p>
            </div>
            <div className="caja-total">
              <div className="caja-mosaico-titulo">Gastaste</div>
              <p className={`caja-mosaico-cifra chica ${new Big(t.gastos).gt(0) ? "baja" : ""}`}>−{rd(t.gastos)}</p>
            </div>
            <div className="caja-total">
              <div className="caja-mosaico-titulo">Te quedó</div>
              <p className={`caja-mosaico-cifra chica ${new Big(t.neto).lt(0) ? "baja" : ""}`}>{rd(t.neto)}</p>
              <p className="caja-mosaico-nota">lo que entró menos lo gastado</p>
            </div>
            <div className="caja-total">
              <div className="caja-mosaico-titulo">
                Ahorraste
                <Ayuda que="«ahorraste»">Lo que pasaste a tus cuentas de ahorro o inversión este mes. El porcentaje es esa cifra dividida entre lo que te entró.</Ayuda>
              </div>
              <p className="caja-mosaico-cifra chica">{rd(t.ahorro)}</p>
              <p className="caja-mosaico-nota">{t.tasaAhorro != null ? `${t.tasaAhorro}% de lo que te entró` : "sin ingresos anotados"}</p>
            </div>
            <div className="caja-total">
              <div className="caja-mosaico-titulo">Pagos de tarjeta</div>
              <p className="caja-mosaico-cifra chica">{rd(t.pagosTarjeta)}</p>
            </div>
          </div>
          {t.sinTasa ? (
            <p className="caja-aviso">
              {t.sinTasa} movimiento(s) en dólares no entran en los totales en RD$: no hay tasa propia ni dólar del BCRD de su fecha (no confirmado). Puedes
              escribir la tasa que te cobró tu banco en el movimiento.
            </p>
          ) : null}
        </div>
      </section>

      {sinCat.length ? (
        <section className="panel panel-ancho caja-conf-sin" id="sin-categoria" aria-labelledby="t-mov-sin">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-mov-sin">
              <Icono n="aviso" tam={18} /> Asígnale una categoría ({sinCat.length})
            </h2>
            <span className="chico tenue">Sin categoría caen en «Sin categoría» del estado de resultados.</span>
          </div>
          <ul className="panel-cuerpo caja-lista caja-conf-rejilla">
            {sinCat.map((m) => (
              <li key={m.id} className="caja-item">
                <div className="caja-item-fila">
                  <span className="caja-item-texto">
                    <span className="caja-item-nombre">{m.nota || NOMBRE_TIPO[m.tipo]}</span>
                    <span className="caja-item-detalle">
                      {NOMBRE_TIPO[m.tipo]} · {fechaLarga(m.fecha).replace(/ de \d{4}$/, "")} · {cuenta(m.cuenta)}
                    </span>
                  </span>
                  <span className={`caja-item-monto ${m.tipo === "ingreso" ? "sube" : "baja"}`}>
                    {m.tipo === "ingreso" ? "+" : "−"}
                    {enMoneda(m.monto, m.moneda)}
                  </span>
                </div>
                <FormAccion accion={asignarCategoria} boton="Asignar" className="caja-asignar" etiqueta={`Categoría del movimiento de ${enMoneda(m.monto, m.moneda)}`}>
                  <input type="hidden" name="cual" value="movimiento" />
                  <input type="hidden" name="id" value={m.id} />
                  <label className="sr-solo" htmlFor={`asignar-${m.id}`}>
                    Categoría
                  </label>
                  <SelectCategoria id={`asignar-${m.id}`} valor={null} categorias={cat.categorias} tipo={m.tipo} />
                </FormAccion>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="panel panel-ancho" aria-labelledby="t-movs">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-movs">
            {t.movimientos.length ? `${t.movimientos.length} movimiento(s) en ${nombreMes(mes)}` : `Nada anotado en ${nombreMes(mes)}`}
          </h2>
        </div>
        {dias.length ? (
          <div className="caja-dias">
            {dias.map(([fecha, ms]) => {
              const n = netoDia(ms);
              return (
                <section key={fecha} className="caja-grupo-dia" aria-label={fechaLarga(fecha)}>
                  <div className="caja-grupo-cabeza">
                    <Link href={`/caja?mes=${mes}&dia=${fecha}`} className="caja-grupo-fecha" title="Ver este día en el calendario">
                      {fechaLarga(fecha).replace(/ de \d{4}$/, "")}
                    </Link>
                    <span className={`mono chico ${n.gt(0) ? "sube" : n.lt(0) ? "baja" : "tenue"}`} title="Entró menos gastado ese día">
                      {n.gt(0) ? "+" : ""}
                      {rd(n.toString())}
                    </span>
                  </div>
                  <ul className="caja-lista">
                    {ms.map((m) => {
                      const nombreCat = m.categoria ? (categorias.get(m.categoria) ?? `«${m.categoria}»`) : null;
                      return (
                        <li key={m.id} className="caja-item plano">
                          <div className="caja-item-fila">
                            <span className={`caja-item-icono ${m.tipo}`} aria-hidden="true">
                              <Icono n={ICONO[m.tipo]} tam={16} />
                            </span>
                            <span className="caja-item-texto">
                              <span className="caja-item-nombre">{m.nota || nombreCat || NOMBRE_TIPO[m.tipo]}</span>
                              <span className="caja-item-detalle">
                                {NOMBRE_TIPO[m.tipo]} · {cuenta(m.cuenta)}
                                {m.destino ? ` → ${cuenta(m.destino)}` : ""}
                                {nombreCat && m.nota ? ` · ${nombreCat}` : ""}
                              </span>
                            </span>
                            <span className="caja-item-monto-col">
                              <span className={`caja-item-monto ${m.tipo === "ingreso" ? "sube" : m.tipo === "gasto" ? "baja" : ""}`}>
                                {m.tipo === "ingreso" ? "+" : m.tipo === "gasto" ? "−" : ""}
                                {enMoneda(m.monto, m.moneda)}
                              </span>
                              {m.moneda === "USD" ? (
                                <span className="chico tenue mono">
                                  {m.montoDOP ? `≈ ${rd(m.montoDOP)} · ${describirTasa(m.tasaUsada ?? null)}` : <span className="baja">no confirmado: sin tasa</span>}
                                </span>
                              ) : null}
                              {m.tipo === "pago_tarjeta" && m.interes ? (
                                <span className="chico tenue">
                                  capital {enMoneda(new Big(m.monto).minus(m.interes).toFixed(), m.moneda)} · interés {enMoneda(m.interes, m.moneda)}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="caja-vacia dentro">
            <span className="caja-bienvenida-icono" aria-hidden="true">
              <Icono n="lista" tam={24} />
            </span>
            <p>Cuando anotes un gasto o confirmes un pago fijo, aparecerá aquí.</p>
            <p className="chico tenue">Ejemplos: el supermercado, la gasolina, un almuerzo, la quincena que te cayó.</p>
            <NuevoMovimientoSuelto cuentas={cat.cuentas} categorias={cat.categorias} hoy={hoy} conBoton />
          </div>
        )}
      </section>
      {dias.length ? <NuevoMovimientoSuelto cuentas={cat.cuentas} categorias={cat.categorias} hoy={hoy} /> : null}
    </MarcoCaja>
  );
}
