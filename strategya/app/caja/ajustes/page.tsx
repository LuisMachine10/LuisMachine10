import Big from "big.js";
import type { Metadata } from "next";
import Link from "next/link";
import {
  asignarCategoria,
  eliminarCategoria,
  eliminarRecurrente,
  guardarCategoria,
  guardarConfig,
  guardarCuenta,
  guardarRecurrente,
} from "@/app/caja/acciones";
import { SelectCategoria } from "@/componentes/caja/CamposMovimiento";
import { CamposRecurrente } from "@/componentes/caja/CamposRecurrente";
import { BotonEliminar, FormAccion } from "@/componentes/caja/FormAccion";
import { Ayuda, Icono } from "@/componentes/caja/Iconos";
import { ImportarCaja } from "@/componentes/caja/ImportarCaja";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { leerRegistro } from "@/lib/capital/datos-registro";
import { fechaBreve, hoyRD, mesDe } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import { estadoDeResultados, fijosDelMes } from "@/lib/caja/resultados";
import {
  AYUDA_TIPO_CATEGORIA,
  type Categoria,
  type Cuenta,
  esDeuda,
  NOMBRE_FRECUENCIA,
  NOMBRE_TIPO_CATEGORIA,
  NOMBRE_TIPO_CATEGORIA_UNO,
  NOMBRE_TIPO_CUENTA,
  type Recurrente,
  TIPOS_CATEGORIA,
  monedaDe,
  TIPOS_CUENTA,
  type TipoCategoria,
} from "@/lib/caja/tipos";
import { catalogos } from "@/lib/caja/vista";
import { cicloVigente, lineaCiclo } from "@/lib/caja/ciclo";
import { nombreDeMovimiento } from "@/lib/caja/nombre-movimiento";

export const metadata: Metadata = { title: "Configuración · Presupuesto · Strategya" };
export const dynamic = "force-dynamic";


const EJEMPLO_CATEGORIA: Record<TipoCategoria, string> = {
  ingreso: "Ej.: Sueldo",
  costo: "Ej.: Mercancía",
  gasto: "Ej.: Comida",
  gasto_financiero: "Ej.: Intereses de la tarjeta",
  otro_ingreso: "Ej.: Venta de algo usado",
  otro_gasto: "Ej.: Arreglo del carro",
  ahorro_inversion: "Ej.: Ahorro e inversión",
};

function CamposCuenta({ c }: { c?: Cuenta }) {
  return (
    <div className="caja-campos">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={c?.nombre ?? ""} autoComplete="off" placeholder="Ej.: Banco Popular" aria-describedby="ayuda-nombre-cuenta" />
        <span id="ayuda-nombre-cuenta" className="caja-campo-ayuda">
          Basta un nombre que reconozcas: nunca pongas números de cuenta, de tarjeta ni cédula.
        </span>
      </label>
      <label>
        Tipo
        <select name="tipo" defaultValue={c?.tipo ?? "banco"}>
          {TIPOS_CUENTA.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TIPO_CUENTA[t]}
            </option>
          ))}
        </select>
      </label>
      <div className="caja-campo">
        <label htmlFor={`saldo-${c?.id ?? "nueva"}`}>Saldo el día de inicio (en tarjeta, lo que debías)</label>
        <div className="caja-monto">
          <span aria-hidden="true">{c?.moneda === "USD" ? "US$" : "RD$"}</span>
          <input id={`saldo-${c?.id ?? "nueva"}`} name="saldoInicial" inputMode="decimal" defaultValue={c?.saldoInicial ?? ""} placeholder="Ej.: 25,000" autoComplete="off" />
        </div>
      </div>
      <div className="caja-campo">
        <label htmlFor={`limite-${c?.id ?? "nueva"}`}>
          Límite de la tarjeta <span className="tenue">(opcional)</span>
        </label>
        <div className="caja-monto">
          <span aria-hidden="true">RD$</span>
          <input id={`limite-${c?.id ?? "nueva"}`} name="limite" inputMode="decimal" defaultValue={c?.limite ?? ""} placeholder="Ej.: 80,000" autoComplete="off" />
        </div>
      </div>
      <label>
        Posición en la lista
        <input name="orden" inputMode="numeric" defaultValue={c ? String(c.orden) : ""} placeholder="Ej.: 1" autoComplete="off" />
      </label>
      {c?.tipo === "tarjeta" ? (
        <>
          <input type="hidden" name="conCiclo" value="si" />
          <div className="caja-campo">
            <label htmlFor={`limiteUsd-${c.id}`}>
              Límite en US$ <span className="tenue">(si tu tarjeta también tiene parte en dólares)</span>
            </label>
            <div className="caja-monto">
              <span aria-hidden="true">US$</span>
              <input id={`limiteUsd-${c.id}`} name="limiteUsd" inputMode="decimal" defaultValue={c.usd?.limite ?? ""} placeholder="Ej.: 2,000" autoComplete="off" />
            </div>
          </div>
          <label>
            Día de corte <span className="tenue">(1 al 31)</span>
            <input name="diaCorte" inputMode="numeric" maxLength={2} defaultValue={c.ciclo ? String(c.ciclo.diaCorte) : ""} placeholder="Ej.: 15" autoComplete="off" />
          </label>
          <label>
            Días para pagar después del corte
            <input name="diasParaPagar" inputMode="numeric" maxLength={2} defaultValue={c.ciclo ? String(c.ciclo.diasParaPagar) : ""} placeholder="Ej.: 28" autoComplete="off" />
          </label>
          <label>
            Día en que quieres pagar <span className="tenue">(opcional)</span>
            <input name="diaPago" inputMode="numeric" maxLength={2} defaultValue={c.ciclo?.diaPago ? String(c.ciclo.diaPago) : (c.diaPago ? String(c.diaPago) : "")} placeholder="Ej.: 30" autoComplete="off" />
          </label>
          <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
            Con el corte y los días para pagar calculamos tu fecha límite; el calendario marca el corte (C), el día en que quieres pagar (P) y la fecha límite (L). Si tienes
            un pago fijo de esta tarjeta, su día sigue al día en que quieres pagar. Lo que debes en US$ se escribe en Portafolio → Mis cuentas.
          </p>
        </>
      ) : null}
    </div>
  );
}

function CamposCategoria({ c, tipo }: { c?: Categoria; tipo: TipoCategoria }) {
  const id = c?.id ?? `nueva-${tipo}`;
  return (
    <div className="caja-campos">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={c?.nombre ?? ""} autoComplete="off" placeholder={EJEMPLO_CATEGORIA[c?.tipo ?? tipo]} />
      </label>
      <label>
        Tipo
        <select name="tipo" defaultValue={c?.tipo ?? tipo}>
          {TIPOS_CATEGORIA.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TIPO_CATEGORIA_UNO[t]}
            </option>
          ))}
        </select>
      </label>
      <div className="caja-campo">
        <label htmlFor={`adicional-${id}`}>
          Monto adicional al mes <span className="tenue">(opcional)</span>
        </label>
        <div className="caja-monto">
          <span aria-hidden="true">RD$</span>
          <input id={`adicional-${id}`} name="adicional" inputMode="decimal" defaultValue={c?.adicional ?? ""} autoComplete="off" placeholder="Ej.: 12,000" aria-describedby={`adicional-${id}-ayuda`} />
        </div>
      </div>
      <p id={`adicional-${id}-ayuda`} className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
        Lo que esperas además de sus pagos fijos (por ejemplo, la comida del mes). Lo presupuestado = fijos + este monto.
      </p>
    </div>
  );
}

function describirRecurrente(r: Recurrente): string {
  const cuando =
    r.frecuencia === "mensual"
      ? `${/[,\s]/.test(r.dias.trim()) ? "los días" : "el día"} ${r.dias}`
      : r.frecuencia === "cada_n"
        ? `cada ${r.cadaN ?? 1} días`
        : r.fecha
          ? `el ${fechaBreve(r.fecha)} de ${r.fecha.slice(0, 4)}`
          : "sin fecha";
  const rango = [r.desde ? `desde ${r.desde}` : null, r.hasta ? `hasta ${r.hasta}` : null].filter(Boolean).join(" ");
  const base = r.frecuencia === "mensual" ? `cada mes, ${cuando}` : `${NOMBRE_FRECUENCIA[r.frecuencia].toLowerCase()}: ${cuando}`;
  return `${base}${rango ? ` · ${rango}` : ""}`;
}

export default async function PaginaConfiguracion() {
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="configuracion" editadoEn={null}>
        <PanelError titulo="Configuración del presupuesto" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  const cfg = datos.config;
  // Las cuentas salen del registro único del Portafolio: saldo de hoy y las que aún no usa el Presupuesto.
  const registro = await leerRegistro(datos, lectura.enlaces, hoyRD()).catch(() => null);
  const saldoHoy = new Map((registro ?? []).filter((i) => i.cajaId).map((i) => [i.cajaId!, i.cantidad]));
  const { cuentas, categorias } = catalogos(datos, registro ?? []);
  const hayDatos = !!datos.config || datos.cuentas.length > 0 || datos.movimientos.length > 0;
  const nombreCuenta = (id: string | null) => (id ? (datos.cuentas.find((c) => c.id === id)?.nombre ?? `«${id}»`) : "—");
  const mes = mesDe(hoyRD());
  const e = estadoDeResultados(datos, mes);
  const alMes = new Map(fijosDelMes(datos, mes).map((f) => [f.recurrente.id, f]));
  const idsCat = new Set(datos.categorias.map((c) => c.id));
  const sinCategoria = datos.recurrentes.filter((r) => (r.tipo === "ingreso" || r.tipo === "gasto") && !(r.categoria && idsCat.has(r.categoria)));
  const entreCuentas = datos.recurrentes.filter((r) => (r.tipo === "transferencia" || r.tipo === "pago_tarjeta") && !(r.categoria && idsCat.has(r.categoria)));
  const lineaDe = (c: Categoria) => e.secciones[c.tipo].lineas.find((l) => l.clave === c.id);

  const Fijo = ({ r }: { r: Recurrente }) => {
    const f = alMes.get(r.id);
    return (
      <li className={`caja-conf-fijo ${r.activo ? "" : "omitido"}`}>
        <div className="caja-item-fila">
          <span className="caja-item-texto">
            <span className="caja-item-nombre">
              {r.nombre}
              {r.activo ? null : <span className="etiqueta neutra">en pausa</span>}
            </span>
            <span className="caja-item-detalle">
              {nombreDeMovimiento(r, datos.cuentas, datos.categorias)} · {nombreCuenta(r.cuenta)}
              {r.destino ? ` → ${nombreCuenta(r.destino)}` : ""} · {describirRecurrente(r)}
            </span>
          </span>
          <span className="caja-item-monto-col">
            <span className={`caja-item-monto ${r.tipo === "ingreso" ? "sube" : ""}`}>{r.pagoTotal ? "todo lo que debas" : enMoneda(r.monto, r.moneda)}</span>
            {f && f.veces > 1 && f.totalDOP ? <span className="chico tenue mono">{rd(f.totalDOP)} este mes</span> : null}
          </span>
        </div>
        <details className="caja-desplegable">
          <summary>Editar o borrar</summary>
          <FormAccion accion={guardarRecurrente} boton="Guardar" etiqueta={`Editar ${r.nombre}`}>
            <input type="hidden" name="id" value={r.id} />
            <CamposRecurrente r={r} cuentas={cuentas} categorias={categorias} />
          </FormAccion>
          <div className="caja-form">
            <BotonEliminar accion={eliminarRecurrente} id={r.id} que={`el pago fijo ${r.nombre}`} />
          </div>
        </details>
      </li>
    );
  };

  return (
    <MarcoCaja actual="configuracion" editadoEn={editadoEn}>
      {!cfg ? (
        <section className="panel panel-ancho caja-aviso-panel">
          <div>
            <h2 className="panel-titulo">¿Primera vez?</h2>
            <p className="chico tenue">El asistente te pide lo necesario en 4 pasos cortos: ingresos, gastos, cuentas y ahorro.</p>
          </div>
          <Link href="/caja" className="boton caja-boton-grande">
            Usar el asistente
            <Icono n="derecha" tam={18} />
          </Link>
        </section>
      ) : null}

      {sinCategoria.length ? (
        <section className="panel panel-ancho caja-conf-sin" id="sin-categoria" aria-labelledby="t-sin-cat">
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id="t-sin-cat">
              <Icono n="aviso" tam={18} /> Asígnale una categoría ({sinCategoria.length})
            </h2>
          </div>
          <ul className="panel-cuerpo caja-lista caja-conf-rejilla">
            {sinCategoria.map((r) => (
              <li key={r.id} className="caja-item">
                <div className="caja-item-fila">
                  <span className="caja-item-texto">
                    <span className="caja-item-nombre">{r.nombre}</span>
                    <span className="caja-item-detalle">
                      {nombreDeMovimiento(r, datos.cuentas, datos.categorias)} · {describirRecurrente(r)}
                    </span>
                  </span>
                  <span className={`caja-item-monto ${r.tipo === "ingreso" ? "sube" : ""}`}>{enMoneda(r.monto, r.moneda)}</span>
                </div>
                <FormAccion accion={asignarCategoria} boton="Asignar" className="caja-asignar" etiqueta={`Categoría de ${r.nombre}`}>
                  <input type="hidden" name="cual" value="recurrente" />
                  <input type="hidden" name="id" value={r.id} />
                  <label className="sr-solo" htmlFor={`asignar-${r.id}`}>
                    Categoría de {r.nombre}
                  </label>
                  <SelectCategoria id={`asignar-${r.id}`} valor={null} categorias={categorias} tipo={r.tipo} />
                </FormAccion>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="panel-ancho caja-conf-tipos">
        {TIPOS_CATEGORIA.map((t) => {
          const cats = datos.categorias.filter((c) => c.tipo === t);
          const s = e.secciones[t];
          return (
            <section key={t} className="panel panel-ancho caja-conf-tipo" id={`tipo-${t}`} aria-labelledby={`t-tipo-${t}`}>
              <div className="panel-cabecera">
                <h2 className="panel-titulo" id={`t-tipo-${t}`}>
                  {NOMBRE_TIPO_CATEGORIA[t]}
                  <Ayuda que={NOMBRE_TIPO_CATEGORIA[t].toLowerCase()}>{AYUDA_TIPO_CATEGORIA[t]}</Ayuda>
                </h2>
                <span className="mono chico caja-conf-total" title="Presupuestado este mes">
                  {rd(s.presupuestado)} al mes
                </span>
              </div>
              <div className="panel-cuerpo">
                {cats.length ? (
                  <ul className="caja-conf-cats">
                    {cats.map((c) => {
                      const l = lineaDe(c);
                      const fijos = datos.recurrentes.filter((r) => r.categoria === c.id);
                      return (
                        <li key={c.id} className="caja-conf-cat">
                          <div className="caja-item-fila">
                            <span className="caja-item-texto">
                              <span className="caja-item-nombre">{c.nombre}</span>
                              <span className="caja-item-detalle">
                                {fijos.length ? `${fijos.length} fijo(s) ${rd(l?.fijos ?? "0")}` : "Sin fijos"}
                                {c.adicional ? ` + adicional ${rd(c.adicional)}` : ""}
                              </span>
                            </span>
                            <span className="caja-item-monto">{l && new Big(l.presupuestado).gt(0) ? rd(l.presupuestado) : <span className="tenue">sin monto</span>}</span>
                          </div>
                          {fijos.length ? (
                            <ul className="caja-conf-fijos">
                              {fijos.map((r) => (
                                <Fijo key={r.id} r={r} />
                              ))}
                            </ul>
                          ) : null}
                          <div className="caja-conf-acciones">
                            <details className="caja-desplegable">
                              <summary>Editar</summary>
                              <FormAccion accion={guardarCategoria} boton="Guardar" etiqueta={`Editar ${c.nombre}`}>
                                <CamposCategoria c={c} tipo={t} />
                              </FormAccion>
                              <div className="caja-form">
                                <BotonEliminar accion={eliminarCategoria} id={c.id} que={`la categoría ${c.nombre}`} />
                              </div>
                            </details>
                            {
                              <details className="caja-desplegable">
                                <summary>+ Pago o cobro fijo</summary>
                                {cuentas.length ? (
                                  <FormAccion accion={guardarRecurrente} boton="Guardar fijo" reiniciar etiqueta={`Nuevo fijo en ${c.nombre}`}>
                                    <CamposRecurrente
                                      inicial={{ tipo: t === "ingreso" || t === "otro_ingreso" ? "ingreso" : t === "ahorro_inversion" ? "transferencia" : "gasto", categoria: c.id, ...(t === "ahorro_inversion" ? { modo: "ahorro" as const } : {}) }}
                                      cuentas={cuentas}
                                      categorias={categorias}
                                    />
                                  </FormAccion>
                                ) : (
                                  <p className="caja-form chico">Primero agrega una cuenta (abajo).</p>
                                )}
                              </details>
                            }
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                <details className="caja-desplegable caja-conf-nueva" open={!cats.length && (t === "ingreso" || t === "gasto")}>
                  <summary>+ Agregar en {NOMBRE_TIPO_CATEGORIA[t].toLowerCase()}</summary>
                  <FormAccion accion={guardarCategoria} boton="Crear categoría" reiniciar etiqueta={`Nueva categoría en ${NOMBRE_TIPO_CATEGORIA[t]}`}>
                    <CamposCategoria tipo={t} />
                  </FormAccion>
                </details>
              </div>
            </section>
          );
        })}
      </div>

      <section className="panel panel-ancho caja-conf-cuentas" aria-labelledby="t-cuentas">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-cuentas">
            Tus cuentas ({datos.cuentas.length})
          </h2>
          <Link href="/capital/cuentas" className="chico">
            Abrir en el Portafolio →
          </Link>
        </div>
        <div className="panel-cuerpo">
          <p className="chico tenue" style={{ marginTop: 0 }}>Salen solas de Mis cuentas según su tipo.</p>
          <ul className="caja-lista">
            {[...datos.cuentas]
              .sort((a, b) => a.orden - b.orden)
              .map((c) => (
                <li key={c.id} className="caja-item">
                  <div className="caja-item-fila">
                    <span className="caja-item-texto">
                      <span className="caja-item-nombre">{c.nombre}</span>
                      <span className="caja-item-detalle" title={`Identificador interno: ${c.id}`}>
                        {NOMBRE_TIPO_CUENTA[c.tipo]}
                        {c.limite ? ` · límite ${rd(c.limite)}` : ""}
                        {c.usd?.limite ? ` · límite ${enMoneda(c.usd.limite, "USD")}` : ""}
                        {c.ciclo ? ` · ${lineaCiclo(cicloVigente(hoyRD(), c.ciclo), hoyRD())}` : ""} · {esDeuda(c.tipo) ? "debes" : "tiene"} hoy
                        {` · al empezar: ${enMoneda(c.saldoInicial, monedaDe(c))}`}
                        {c.moneda === "USD" ? " · en dólares" : ""}
                      </span>
                    </span>
                    <span className="caja-item-monto">{enMoneda(saldoHoy.get(c.id) ?? c.saldoInicial, monedaDe(c))}</span>
                  </div>
                  <details className="caja-desplegable">
                    <summary>Editar o borrar</summary>
                    <FormAccion accion={guardarCuenta} boton="Guardar cuenta" etiqueta={`Editar ${c.nombre}`}>
                      <CamposCuenta c={c} />
                    </FormAccion>
                    <p className="chico tenue caja-form">Para borrarla, hazlo en Portafolio → Mis cuentas (si no tiene movimientos aquí).</p>
                  </details>
                </li>
              ))}
          </ul>
          <details className="caja-desplegable caja-conf-nueva" open={datos.cuentas.length === 0}>
            <summary>+ Agregar una cuenta nueva (queda también en el Portafolio)</summary>
            <FormAccion accion={guardarCuenta} boton="Crear cuenta" reiniciar etiqueta="Nueva cuenta">
              <CamposCuenta />
            </FormAccion>
          </details>
          <h3 className="caja-subtitulo" id="t-entre">
            Fijos entre tus cuentas ({entreCuentas.length})
          </h3>
          <p className="chico tenue caja-conf-vacio">Pagos de tarjeta y dinero que mueves solo de lugar: no son ingreso ni gasto.</p>
          {entreCuentas.length ? (
            <ul className="caja-conf-fijos sueltos">
              {entreCuentas.map((r) => (
                <Fijo key={r.id} r={r} />
              ))}
            </ul>
          ) : (
            <p className="chico tenue caja-conf-vacio">Ninguno. Ej.: pagar la tarjeta completa cada día 28.</p>
          )}
          <details className="caja-desplegable">
            <summary>+ Agregar un fijo entre cuentas</summary>
            {cuentas.length ? (
              <FormAccion accion={guardarRecurrente} boton="Guardar fijo" reiniciar etiqueta="Nuevo fijo entre cuentas">
                <CamposRecurrente inicial={{ tipo: "pago_tarjeta" }} cuentas={cuentas} categorias={categorias} />
              </FormAccion>
            ) : (
              <p className="caja-form chico">Primero agrega una cuenta.</p>
            )}
          </details>
        </div>
      </section>

      <section className="panel panel-ancho caja-conf-general" aria-labelledby="t-general">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-general">
            General
          </h2>
          <span className="chico tenue">Tu mínimo y desde cuándo cuenta el calendario</span>
        </div>
        <div className="panel-cuerpo">
          <FormAccion accion={guardarConfig} boton="Guardar" etiqueta="Ajustes generales">
            <div className="caja-campos">
              <label>
                Día en que empieza tu calendario
                <input type="date" name="inicio" required defaultValue={cfg?.inicio ?? ""} />
              </label>
              <div className="caja-campo">
                <label htmlFor="cfg-colchon">
                  Colchón mínimo{" "}
                  <Ayuda que="el colchón">El dinero de reserva que no quieres tocar. Los días en que quedarías por debajo se pintan de rojo.</Ayuda>
                </label>
                <div className="caja-monto">
                  <span aria-hidden="true">RD$</span>
                  <input id="cfg-colchon" name="colchon" inputMode="decimal" required defaultValue={cfg?.colchon ?? ""} autoComplete="off" placeholder="Ej.: 10,000" />
                </div>
              </div>
              <div className="caja-campo">
                <label htmlFor="cfg-margen">
                  Aviso antes del colchón{" "}
                  <Ayuda que="el aviso antes del colchón">
                    Un margen extra: si quedas a menos de esta cifra por encima del colchón, el día se marca en ámbar («cerca del mínimo»).
                  </Ayuda>
                </label>
                <div className="caja-monto">
                  <span aria-hidden="true">RD$</span>
                  <input id="cfg-margen" name="margen" inputMode="decimal" required defaultValue={cfg?.margen ?? "3000"} autoComplete="off" placeholder="Ej.: 3,000" />
                </div>
              </div>
              {/* La tasa general de antes ya no se usa para convertir; se conserva tal cual (importar/exportar). */}
              <input type="hidden" name="tasaUSD" value={cfg?.tasaUSD ?? ""} />
              <p className="caja-campo-ayuda ancho" style={{ margin: 0 }}>
                <strong>Dólares:</strong> se pasan a pesos con la tasa que anotes en cada movimiento o, si no la anotas, con el dólar de venta oficial
                del Banco Central (BCRD) de ese día. Si no hay dato del BCRD, el monto queda «no confirmado» y no se suma.
              </p>
            </div>
          </FormAccion>
        </div>
      </section>

      <section className="panel panel-ancho" aria-labelledby="importar" id="avanzado">
        <details className="caja-avanzado">
          <summary>
            <h2 className="panel-titulo" id="importar">
              Avanzado: importar desde el artefacto anterior
            </h2>
            <span className="chico tenue">Solo si usabas el artefacto «Calendario de Caja» y tienes su archivo JSON</span>
          </summary>
          <div className="panel-cuerpo">
            <p className="chico">
              Primero se revisa el archivo y se muestra un resumen; nada se guarda hasta que confirmes. Al confirmar se reemplaza todo lo del
              presupuesto de una sola vez: si algo falla, no cambia nada. Los grupos viejos se convierten solos (fijo y variable → gasto,
              ahorro → ahorro e inversión, deuda → gasto financiero).
            </p>
            {hayDatos ? (
              <p className="caja-aviso">
                Ya tienes datos ({datos.cuentas.length} cuentas, {datos.movimientos.length} movimientos). Importar los reemplaza todos.
              </p>
            ) : null}
            <ImportarCaja hayDatos={hayDatos} />
          </div>
        </details>
      </section>
    </MarcoCaja>
  );
}
