"use client";

// Panel del día: confirmar / ajustar / omitir lo planificado, registrar, editar y eliminar, cuadrar
// con el banco y la nota del día.

import Big from "big.js";
import {
  cuadrarSaldos,
  deshacerOmitido,
  editarMovimiento,
  eliminarMovimiento,
  guardarNota,
  omitirRecurrente,
  registrarMovimiento,
} from "@/app/caja/acciones";
import { enMoneda, rd } from "@/lib/caja/formato";
import { NOMBRE_ESTADO, type Ocurrencia } from "@/lib/caja/motor";
import { NOMBRE_TIPO, NOMBRE_TIPO_CUENTA } from "@/lib/caja/tipos";
import type { PanelDiaVista } from "@/lib/caja/vista";
import { CamposMovimiento, type OpcionCategoria, type OpcionCuenta } from "./CamposMovimiento";
import { BotonEliminar, FormAccion } from "./FormAccion";

type Catalogos = { cuentas: OpcionCuenta[]; categorias: OpcionCategoria[] };

function nombreCuenta(id: string | null, cuentas: OpcionCuenta[]): string {
  if (!id) return "—";
  return cuentas.find((c) => c.id === id)?.nombre ?? `«${id}» (no existe)`;
}
function nombreCategoria(id: string | null, categorias: OpcionCategoria[]): string | null {
  if (!id) return null;
  return categorias.find((c) => c.id === id)?.nombre ?? `«${id}» (no existe)`;
}

function Signo({ tipo }: { tipo: string }) {
  return <>{tipo === "ingreso" ? "+" : tipo === "gasto" ? "−" : "⇄ "}</>;
}

function Ruta({ tipo, cuenta, destino, categoria, cat }: { tipo: string; cuenta: string | null; destino: string | null; categoria: string | null; cat: Catalogos }) {
  const c = nombreCategoria(categoria, cat.categorias);
  return (
    <span className="caja-item-detalle">
      {NOMBRE_TIPO[tipo as keyof typeof NOMBRE_TIPO]} · {nombreCuenta(cuenta, cat.cuentas)}
      {tipo === "transferencia" || tipo === "pago_tarjeta" ? ` → ${nombreCuenta(destino, cat.cuentas)}` : ""}
      {c ? ` · ${c}` : ""}
    </span>
  );
}

function MontoOcurrencia({ o }: { o: Ocurrencia }) {
  return (
    <span className={`caja-item-monto ${o.tipo === "ingreso" ? "sube" : ""}`}>
      <Signo tipo={o.tipo} />
      {o.moneda === "USD" ? enMoneda(o.monto, "USD") : rd(o.monto)}
      {o.moneda === "USD" ? <span className="tenue chico"> {o.montoDOP ? `≈ ${rd(o.montoDOP)}` : "sin tasa"}</span> : null}
    </span>
  );
}

function Planificado({ o, fecha, pendiente, cat }: { o: Ocurrencia; fecha: string; pendiente: boolean; cat: Catalogos }) {
  const sinMonto = new Big(o.monto).lte(0);
  const ocultos = (
    <>
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="recurrenteId" value={o.recurrenteId} />
    </>
  );
  return (
    <li className={`caja-item ${pendiente ? "pendiente" : ""}`}>
      <div className="caja-item-fila">
        <span className="caja-item-nombre">
          {o.nombre}
          {pendiente ? <span className="etiqueta alerta" style={{ marginLeft: 6 }}>por confirmar</span> : null}
          {o.pagoTotal ? <span className="tenue chico"> · pago total</span> : null}
        </span>
        <MontoOcurrencia o={o} />
      </div>
      <Ruta tipo={o.tipo} cuenta={o.cuenta} destino={o.destino} categoria={o.categoria} cat={cat} />
      <div className="caja-acciones">
        {sinMonto ? (
          <span className="chico tenue">No hay deuda que pagar ese día.</span>
        ) : (
          <FormAccion accion={registrarMovimiento} boton="Confirmar" className="caja-acciones" etiqueta={`Confirmar ${o.nombre}`}>
            {ocultos}
            <input type="hidden" name="tipo" value={o.tipo} />
            <input type="hidden" name="monto" value={o.monto} />
            <input type="hidden" name="moneda" value={o.moneda} />
            <input type="hidden" name="cuenta" value={o.cuenta ?? ""} />
            <input type="hidden" name="destino" value={o.destino ?? ""} />
            <input type="hidden" name="categoria" value={o.categoria ?? ""} />
          </FormAccion>
        )}
        <FormAccion accion={omitirRecurrente} boton="Omitir" claseBoton="caja-boton secundario" className="caja-acciones" etiqueta={`Omitir ${o.nombre} este día`}>
          {ocultos}
        </FormAccion>
      </div>
      <details className="caja-desplegable">
        <summary>Ajustar (otro monto o cuenta)</summary>
        <FormAccion accion={registrarMovimiento} boton="Confirmar con estos datos" etiqueta={`Ajustar ${o.nombre}`}>
          {ocultos}
          <CamposMovimiento v={{ ...o, monto: sinMonto ? "" : o.monto }} cuentas={cat.cuentas} categorias={cat.categorias} />
        </FormAccion>
      </details>
    </li>
  );
}

export function PanelDia({ p, cat }: { p: PanelDiaVista; cat: Catalogos }) {
  const hayCuentas = cat.cuentas.length > 0;
  return (
    <section className="panel caja-panel-dia" aria-labelledby="t-panel-dia" aria-live="polite">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-panel-dia">
          {p.titulo}
          {p.esHoy ? " · hoy" : ""}
        </h2>
        {p.estado ? <span className={`caja-estado ${p.estado}`}>{NOMBRE_ESTADO[p.estado]}</span> : null}
      </div>
      <div className="panel-cuerpo">
        {p.antesDelInicio ? (
          <p className="caja-mensaje error">Este día es anterior al inicio de la simulación: lo que registres aquí no mueve saldos.</p>
        ) : (
          <div className="caja-tiles" style={{ marginBottom: 8 }}>
            <div className="caja-tile">
              <p className="caja-tile-titulo">Disponible al cierre</p>
              <p className="caja-tile-cifra">{p.disponible ? rd(p.disponible) : "—"}</p>
            </div>
            <div className="caja-tile">
              <p className="caja-tile-titulo">Entra / sale</p>
              <p className="caja-tile-cifra chico">
                <span className="sube">+{rd(p.entradas)}</span>
                <br />
                <span className="baja">−{rd(p.salidas)}</span>
              </p>
            </div>
          </div>
        )}

        {p.porConfirmar.length ? (
          <>
            <h3>Por confirmar ({p.porConfirmar.length})</h3>
            <p className="chico tenue">Pasaron sin confirmarse: no se cuentan en los saldos hasta que los confirmes.</p>
            <ul className="caja-lista">
              {p.porConfirmar.map((o) => (
                <Planificado key={o.recurrenteId} o={o} fecha={p.fecha} pendiente cat={cat} />
              ))}
            </ul>
          </>
        ) : null}

        {p.planificados.length ? (
          <>
            <h3>Planificado ({p.planificados.length})</h3>
            <ul className="caja-lista">
              {p.planificados.map((o) => (
                <Planificado key={o.recurrenteId} o={o} fecha={p.fecha} pendiente={false} cat={cat} />
              ))}
            </ul>
          </>
        ) : null}

        {p.omitidos.length ? (
          <>
            <h3>Omitido este día</h3>
            <ul className="caja-lista">
              {p.omitidos.map((o) => (
                <li key={o.recurrenteId} className="caja-item omitido">
                  <div className="caja-item-fila">
                    <span className="caja-item-nombre">
                      <s>{o.nombre}</s>
                    </span>
                    <MontoOcurrencia o={o} />
                  </div>
                  <FormAccion accion={deshacerOmitido} boton="Deshacer" claseBoton="caja-boton secundario" className="caja-acciones" etiqueta={`Deshacer omitir ${o.nombre}`}>
                    <input type="hidden" name="fecha" value={p.fecha} />
                    <input type="hidden" name="recurrenteId" value={o.recurrenteId} />
                  </FormAccion>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h3>Registrado ({p.registrados.length})</h3>
        {p.registrados.length ? (
          <ul className="caja-lista">
            {p.registrados.map((m) => (
              <li key={m.id} className="caja-item">
                <div className="caja-item-fila">
                  <span className="caja-item-nombre">{m.nota || NOMBRE_TIPO[m.tipo]}</span>
                  <span className={`caja-item-monto ${m.tipo === "ingreso" ? "sube" : ""}`}>
                    <Signo tipo={m.tipo} />
                    {enMoneda(m.monto, m.moneda)}
                    {m.moneda === "USD" ? <span className="tenue chico"> {m.montoDOP ? `≈ ${rd(m.montoDOP)}` : "sin tasa"}</span> : null}
                  </span>
                </div>
                <Ruta tipo={m.tipo} cuenta={m.cuenta} destino={m.destino} categoria={m.categoria} cat={cat} />
                {m.recurrenteId ? <span className="caja-item-detalle">✓ confirma un recurrente</span> : null}
                <div className="caja-acciones">
                  <BotonEliminar accion={eliminarMovimiento} id={m.id} que={`el movimiento de ${enMoneda(m.monto, m.moneda)}`} />
                </div>
                <details className="caja-desplegable">
                  <summary>Editar</summary>
                  <FormAccion accion={editarMovimiento} boton="Guardar cambios" etiqueta="Editar movimiento">
                    <input type="hidden" name="id" value={m.id} />
                    <input type="hidden" name="recurrenteId" value={m.recurrenteId ?? ""} />
                    <label>
                      Fecha
                      <input type="date" name="fecha" defaultValue={m.fecha} required />
                    </label>
                    <CamposMovimiento v={m} cuentas={cat.cuentas} categorias={cat.categorias} />
                  </FormAccion>
                </details>
              </li>
            ))}
          </ul>
        ) : (
          <p className="chico tenue">Nada registrado este día.</p>
        )}

        <details className="caja-desplegable" style={{ marginTop: 8 }}>
          <summary>Registrar gasto, ingreso o transferencia</summary>
          {hayCuentas ? (
            <FormAccion accion={registrarMovimiento} boton="Registrar" reiniciar etiqueta="Registrar movimiento">
              <input type="hidden" name="fecha" value={p.fecha} />
              <CamposMovimiento cuentas={cat.cuentas} categorias={cat.categorias} />
            </FormAccion>
          ) : (
            <p className="caja-form chico">Primero crea una cuenta en Ajustes.</p>
          )}
        </details>

        {hayCuentas ? (
          <>
            <h3>Cuadrar con tu banco</h3>
            <p className="chico tenue">
              Escribe lo que dice tu banco al cierre de este día; corrige la posición desde aquí en adelante. En tarjetas, lo que
              debes. Déjalo vacío para quitar el cuadre.
            </p>
            <FormAccion accion={cuadrarSaldos} boton="Guardar saldos reales" etiqueta="Cuadrar con tu banco">
              <input type="hidden" name="fecha" value={p.fecha} />
              <div className="caja-campos">
                {p.cuentas.map((c) => {
                  const aj = p.ajustes.find((a) => a.cuentaId === c.id);
                  return (
                    <label key={c.id}>
                      {c.nombre}
                      <input
                        name={`saldo:${c.id}`}
                        inputMode="decimal"
                        autoComplete="off"
                        defaultValue={c.real ?? ""}
                        placeholder={rd(c.saldo).replace("RD$ ", "")}
                        aria-describedby={aj ? `dif-${c.id}` : undefined}
                      />
                      {aj ? (
                        <span id={`dif-${c.id}`} className={`chico ${new Big(aj.diferencia).eq(0) ? "tenue" : "alerta"}`}>
                          Esperado {rd(aj.esperado)} · diferencia {new Big(aj.diferencia).gt(0) ? "+" : ""}
                          {rd(aj.diferencia)}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </FormAccion>

            <h3>Saldos al cierre</h3>
            <div className="desplazable">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Cuenta</th>
                    <th scope="col">Tipo</th>
                    <th scope="col" className="num">
                      Saldo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {p.cuentas.map((c) => (
                    <tr key={c.id}>
                      <th scope="row">{c.nombre}</th>
                      <td className="chico tenue">{c.tipo === "tarjeta" ? "Tarjeta (deuda)" : NOMBRE_TIPO_CUENTA[c.tipo]}</td>
                      <td className={`num ${new Big(c.saldo).lt(0) && c.tipo !== "tarjeta" ? "baja" : ""}`}>
                        {rd(c.saldo)}
                        {c.real != null ? " ✓" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        <h3>Nota del día</h3>
        <FormAccion accion={guardarNota} boton="Guardar nota" claseBoton="caja-boton secundario" etiqueta="Nota del día">
          <input type="hidden" name="fecha" value={p.fecha} />
          <label className="sr-solo" htmlFor={`nota-${p.fecha}`}>
            Nota del día
          </label>
          <textarea id={`nota-${p.fecha}`} name="nota" maxLength={2000} defaultValue={p.nota} />
        </FormAccion>
      </div>
    </section>
  );
}
