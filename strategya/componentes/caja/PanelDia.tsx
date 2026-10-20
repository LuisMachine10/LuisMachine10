"use client";

// Panel del día: confirmar / ajustar / omitir lo programado, anotar, editar y eliminar, cuadrar con
// el banco y la nota del día. En el celular es una hoja que sube desde abajo.

import Big from "big.js";
import { useEffect, useRef } from "react";
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
import { NOMBRE_TIPO, NOMBRE_TIPO_CUENTA, type TipoMovimiento } from "@/lib/caja/tipos";
import type { PanelDiaVista } from "@/lib/caja/vista";
import { CamposMovimiento, type OpcionCategoria, type OpcionCuenta } from "./CamposMovimiento";
import { BotonEliminar, FormAccion } from "./FormAccion";
import { Ayuda, Icono, type NombreIcono } from "./Iconos";

type Catalogos = { cuentas: OpcionCuenta[]; categorias: OpcionCategoria[] };

function nombreCuenta(id: string | null, cuentas: OpcionCuenta[]): string {
  if (!id) return "—";
  return cuentas.find((c) => c.id === id)?.nombre ?? `«${id}» (no existe)`;
}
function nombreCategoria(id: string | null, categorias: OpcionCategoria[]): string | null {
  if (!id) return null;
  return categorias.find((c) => c.id === id)?.nombre ?? `«${id}» (no existe)`;
}

const ICONO_TIPO: Record<string, NombreIcono> = { ingreso: "ingreso", gasto: "gasto", transferencia: "transferir", pago_tarjeta: "tarjeta" };

function IconoTipo({ tipo }: { tipo: string }) {
  return (
    <span className={`caja-item-icono ${tipo}`} aria-hidden="true">
      <Icono n={ICONO_TIPO[tipo] ?? "lista"} tam={16} />
    </span>
  );
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
        <IconoTipo tipo={o.tipo} />
        <span className="caja-item-texto">
          <span className="caja-item-nombre">
            {o.nombre}
            {pendiente ? <span className="etiqueta alerta">por confirmar</span> : null}
            {o.pagoTotal ? <span className="tenue chico"> · paga todo lo que debas</span> : null}
          </span>
          <Ruta tipo={o.tipo} cuenta={o.cuenta} destino={o.destino} categoria={o.categoria} cat={cat} />
        </span>
        <MontoOcurrencia o={o} />
      </div>
      <div className="caja-acciones">
        {sinMonto ? (
          <span className="chico tenue">No hay deuda que pagar ese día.</span>
        ) : (
          <FormAccion accion={registrarMovimiento} boton={pendiente ? "Sí, se hizo" : "Ya se hizo"} className="caja-acciones" etiqueta={`Confirmar ${o.nombre}`}>
            {ocultos}
            <input type="hidden" name="tipo" value={o.tipo} />
            <input type="hidden" name="monto" value={o.monto} />
            <input type="hidden" name="moneda" value={o.moneda} />
            <input type="hidden" name="cuenta" value={o.cuenta ?? ""} />
            <input type="hidden" name="destino" value={o.destino ?? ""} />
            <input type="hidden" name="categoria" value={o.categoria ?? ""} />
          </FormAccion>
        )}
        <FormAccion accion={omitirRecurrente} boton={pendiente ? "No se hizo" : "Este mes no"} claseBoton="caja-boton secundario" className="caja-acciones" etiqueta={`Omitir ${o.nombre} este día`}>
          {ocultos}
        </FormAccion>
      </div>
      <details className="caja-desplegable">
        <summary>Fue otro monto o cuenta</summary>
        <FormAccion accion={registrarMovimiento} boton="Confirmar con estos datos" etiqueta={`Ajustar ${o.nombre}`}>
          {ocultos}
          <CamposMovimiento v={{ ...o, monto: sinMonto ? "" : o.monto }} cuentas={cat.cuentas} categorias={cat.categorias} />
        </FormAccion>
      </details>
    </li>
  );
}

export function PanelDia({
  p,
  cat,
  abierta = false,
  cerrar,
  nuevo,
}: {
  p: PanelDiaVista;
  cat: Catalogos;
  /** Celular: la hoja está a la vista. */
  abierta?: boolean;
  cerrar?: () => void;
  nuevo?: (tipo: TipoMovimiento) => void;
}) {
  const hayCuentas = cat.cuentas.length > 0;
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!abierta) return;
    titulo.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && cerrar?.();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierta, cerrar]);
  const vacio = !p.porConfirmar.length && !p.planificados.length && !p.omitidos.length && !p.registrados.length;

  return (
    <section
      className={`panel caja-panel-dia ${abierta ? "abierta" : ""}`}
      aria-labelledby="t-panel-dia"
      role={abierta ? "dialog" : undefined}
      aria-modal={abierta ? true : undefined}
    >
      <div className="caja-hoja-asa" aria-hidden="true" />
      <div className="caja-dia-cabeza">
        <div>
          <h2 className="panel-titulo" id="t-panel-dia" ref={titulo} tabIndex={-1}>
            {p.titulo.replace(/ de \d{4}$/, "")}
            {p.esHoy ? <span className="etiqueta neutra">hoy</span> : null}
          </h2>
          {p.estado ? <span className={`caja-estado ${p.estado}`}>{NOMBRE_ESTADO[p.estado]}</span> : null}
        </div>
        {cerrar ? (
          <button type="button" className="caja-quitar caja-hoja-cerrar" onClick={cerrar} aria-label="Cerrar el día">
            <Icono n="cerrar" />
          </button>
        ) : null}
      </div>
      <div className="panel-cuerpo">
        {p.antesDelInicio ? (
          <p className="caja-aviso">Este día es antes de que empezara tu calendario: lo que anotes aquí no cambia los saldos.</p>
        ) : (
          <div className="caja-dia-cifras">
            <div>
              <div className="caja-mosaico-titulo">
                Al final del día tendrás
                <Ayuda que="«al final del día tendrás»">
                  Lo que quedará en tus cuentas de banco y en efectivo cuando termine este día, con todo lo anotado y lo programado.
                </Ayuda>
              </div>
              <p className={`cifra-grande ${p.estado === "bajo" ? "baja" : ""}`}>{p.disponible ? rd(p.disponible) : "—"}</p>
            </div>
            <div className="caja-dia-flujo">
              <span className="pastilla sube" title="Lo que entra este día">
                <Icono n="ingreso" tam={14} /> entra {rd(p.entradas)}
              </span>
              <span className="pastilla baja" title="Lo que sale este día">
                <Icono n="gasto" tam={14} /> sale {rd(p.salidas)}
              </span>
            </div>
          </div>
        )}

        {nuevo && hayCuentas ? (
          <div className="caja-botones-nuevo" role="group" aria-label="Anotar en este día">
            <button type="button" className="boton caja-boton-grande" onClick={() => nuevo("gasto")}>
              <Icono n="mas" tam={18} /> Gasto
            </button>
            <button type="button" className="boton secundario caja-boton-grande" onClick={() => nuevo("ingreso")}>
              <Icono n="mas" tam={18} /> Ingreso
            </button>
            <button type="button" className="boton secundario caja-boton-grande" onClick={() => nuevo("transferencia")}>
              <Icono n="transferir" tam={18} /> Transferir
            </button>
          </div>
        ) : null}

        {p.porConfirmar.length ? (
          <div className="caja-bloque">
            <h3>
              ¿Se hizo? ({p.porConfirmar.length})
              <Ayuda que="«por confirmar»">
                Son pagos o cobros fijos de un día que ya pasó. No se cuentan en tus saldos hasta que digas si se hicieron.
              </Ayuda>
            </h3>
            <ul className="caja-lista">
              {p.porConfirmar.map((o) => (
                <Planificado key={o.recurrenteId} o={o} fecha={p.fecha} pendiente cat={cat} />
              ))}
            </ul>
          </div>
        ) : null}

        {p.planificados.length ? (
          <div className="caja-bloque">
            <h3>Programado ({p.planificados.length})</h3>
            <ul className="caja-lista">
              {p.planificados.map((o) => (
                <Planificado key={o.recurrenteId} o={o} fecha={p.fecha} pendiente={false} cat={cat} />
              ))}
            </ul>
          </div>
        ) : null}

        {p.omitidos.length ? (
          <div className="caja-bloque">
            <h3>No se hizo este día</h3>
            <ul className="caja-lista">
              {p.omitidos.map((o) => (
                <li key={o.recurrenteId} className="caja-item omitido">
                  <div className="caja-item-fila">
                    <IconoTipo tipo={o.tipo} />
                    <span className="caja-item-texto">
                      <span className="caja-item-nombre">
                        <s>{o.nombre}</s>
                      </span>
                    </span>
                    <MontoOcurrencia o={o} />
                  </div>
                  <FormAccion
                    accion={deshacerOmitido}
                    boton="Deshacer"
                    claseBoton="caja-boton secundario"
                    className="caja-acciones"
                    etiqueta={`Deshacer omitir ${o.nombre}`}
                  >
                    <input type="hidden" name="fecha" value={p.fecha} />
                    <input type="hidden" name="recurrenteId" value={o.recurrenteId} />
                  </FormAccion>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {p.registrados.length ? (
          <div className="caja-bloque">
            <h3>Anotado ({p.registrados.length})</h3>
            <ul className="caja-lista">
              {p.registrados.map((m) => (
                <li key={m.id} className="caja-item">
                  <div className="caja-item-fila">
                    <IconoTipo tipo={m.tipo} />
                    <span className="caja-item-texto">
                      <span className="caja-item-nombre">
                        {m.nota || nombreCategoria(m.categoria, cat.categorias) || NOMBRE_TIPO[m.tipo]}
                        {m.recurrenteId ? <span className="etiqueta ok">fijo confirmado</span> : null}
                      </span>
                      <Ruta tipo={m.tipo} cuenta={m.cuenta} destino={m.destino} categoria={m.categoria} cat={cat} />
                    </span>
                    <span className={`caja-item-monto ${m.tipo === "ingreso" ? "sube" : m.tipo === "gasto" ? "baja" : ""}`}>
                      <Signo tipo={m.tipo} />
                      {enMoneda(m.monto, m.moneda)}
                      {m.moneda === "USD" ? <span className="tenue chico"> {m.montoDOP ? `≈ ${rd(m.montoDOP)}` : "sin tasa"}</span> : null}
                    </span>
                  </div>
                  <details className="caja-desplegable">
                    <summary>Cambiar o borrar</summary>
                    <FormAccion accion={editarMovimiento} boton="Guardar cambios" etiqueta="Editar movimiento">
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="recurrenteId" value={m.recurrenteId ?? ""} />
                      <label>
                        Día
                        <input type="date" name="fecha" defaultValue={m.fecha} required />
                      </label>
                      <CamposMovimiento v={m} cuentas={cat.cuentas} categorias={cat.categorias} />
                    </FormAccion>
                    <div className="caja-form">
                      <BotonEliminar accion={eliminarMovimiento} id={m.id} que={`el movimiento de ${enMoneda(m.monto, m.moneda)}`} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {vacio ? (
          <p className="caja-vacio-dia">
            <Icono n="calendario" tam={18} />
            {hayCuentas ? "Nada programado ni anotado este día. Usa «+ Gasto» si pagaste algo." : "Primero agrega una cuenta en Ajustes."}
          </p>
        ) : null}

        {hayCuentas ? (
          <>
            <details className="caja-desplegable">
              <summary>Saldo de cada cuenta al final del día</summary>
              <ul className="caja-cuentas-dia">
                {p.cuentas.map((c) => (
                  <li key={c.id}>
                    <span>
                      {c.nombre}
                      <span className="chico tenue"> · {c.tipo === "tarjeta" ? "lo que debes" : NOMBRE_TIPO_CUENTA[c.tipo].toLowerCase()}</span>
                    </span>
                    <span className={`mono ${new Big(c.saldo).lt(0) && c.tipo !== "tarjeta" ? "baja" : ""}`}>
                      {rd(c.saldo)}
                      {c.real != null ? (
                        <span className="sube" title="Cuadrado con tu banco este día">
                          {" "}
                          ✓
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </details>

            <details className="caja-desplegable" open={p.ajustes.length > 0}>
              <summary>Cuadrar con tu banco</summary>
              <div className="caja-form">
                <p className="chico tenue" style={{ margin: 0 }}>
                  ¿Tu banco dice otra cifra? Escribe lo que dice al cierre de este día y el calendario se corrige desde aquí. En tarjetas, lo
                  que debes. Déjalo vacío para quitar el cuadre.
                </p>
                <FormAccion accion={cuadrarSaldos} boton="Guardar lo que dice el banco" etiqueta="Cuadrar con tu banco">
                  <input type="hidden" name="fecha" value={p.fecha} />
                  <div className="caja-campos">
                    {p.cuentas.map((c) => {
                      const aj = p.ajustes.find((a) => a.cuentaId === c.id);
                      return (
                        <label key={c.id}>
                          {c.nombre}
                          <span className="caja-monto">
                            <span aria-hidden="true">RD$</span>
                            <input
                              name={`saldo:${c.id}`}
                              inputMode="decimal"
                              autoComplete="off"
                              defaultValue={c.real ?? ""}
                              placeholder={`Ej.: ${rd(c.saldo).replace(/^−?RD\$ /, "")}`}
                              aria-describedby={aj ? `dif-${c.id}` : undefined}
                            />
                          </span>
                          {aj ? (
                            <span id={`dif-${c.id}`} className={`chico ${new Big(aj.diferencia).eq(0) ? "tenue" : "alerta"}`}>
                              Esperaba {rd(aj.esperado)} · diferencia {new Big(aj.diferencia).gt(0) ? "+" : ""}
                              {rd(aj.diferencia)}
                            </span>
                          ) : null}
                        </label>
                      );
                    })}
                  </div>
                </FormAccion>
              </div>
            </details>
          </>
        ) : null}

        <details className="caja-desplegable" open={!!p.nota}>
          <summary>{p.nota ? "Nota del día" : "Agregar una nota"}</summary>
          <FormAccion accion={guardarNota} boton="Guardar nota" claseBoton="caja-boton secundario" etiqueta="Nota del día">
            <input type="hidden" name="fecha" value={p.fecha} />
            <label className="sr-solo" htmlFor={`nota-${p.fecha}`}>
              Nota del día
            </label>
            <textarea id={`nota-${p.fecha}`} name="nota" maxLength={2000} defaultValue={p.nota} placeholder="Ej.: Me pagaron tarde la quincena" />
          </FormAccion>
        </details>
      </div>
    </section>
  );
}
