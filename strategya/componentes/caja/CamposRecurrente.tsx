"use client";

// Campos de un pago o cobro fijo (recurrente). La categoría es la misma lista de Configuración y es
// obligatoria en ingresos y gastos: el monto del mes suma a lo presupuestado de esa categoría. La
// frecuencia decide si se piden días del mes, cada N días o una fecha.

import { useState } from "react";
import {
  FRECUENCIAS,
  MONEDAS,
  NOMBRE_FRECUENCIA,
  NOMBRE_TIPO,
  type Frecuencia,
  type Moneda,
  type Recurrente,
  TIPOS_MOVIMIENTO,
  type TipoMovimiento,
} from "@/lib/caja/tipos";
import { AYUDA_MOVER, type OpcionCategoria, type OpcionCuenta, SelectCategoria, SelectCuenta } from "./CamposMovimiento";

export function CamposRecurrente({
  r,
  inicial,
  cuentas,
  categorias,
}: {
  r?: Recurrente;
  /** Valores de arranque de uno nuevo (p. ej., la categoría desde la que se agrega). */
  inicial?: Partial<Pick<Recurrente, "tipo" | "categoria">>;
  cuentas: OpcionCuenta[];
  categorias: OpcionCategoria[];
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>(r?.tipo ?? inicial?.tipo ?? "gasto");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(r?.frecuencia ?? "mensual");
  const [moneda, setMoneda] = useState<Moneda>(r?.moneda ?? "DOP");
  const [pagoTotal, setPagoTotal] = useState<boolean>(r?.pagoTotal ?? false);
  const conDestino = tipo === "transferencia" || tipo === "pago_tarjeta";
  const categoria = r?.categoria ?? inicial?.categoria ?? null;
  return (
    <div className="caja-campos">
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={r?.nombre ?? ""} autoComplete="off" placeholder={tipo === "ingreso" ? "Ej.: Quincena" : "Ej.: Alquiler"} />
      </label>
      <label>
        Tipo
        <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoMovimiento)}>
          {TIPOS_MOVIMIENTO.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_TIPO[t]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estado
        <select name="activo" defaultValue={r?.activo === false ? "false" : "true"}>
          <option value="true">Activo</option>
          <option value="false">En pausa</option>
        </select>
      </label>
      {tipo === "transferencia" ? (
        <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
          {AYUDA_MOVER}
        </p>
      ) : null}
      {tipo === "pago_tarjeta" ? (
        <label className="casilla ancho">
          <input type="checkbox" name="pagoTotal" checked={pagoTotal} onChange={(e) => setPagoTotal(e.target.checked)} />
          Pagar el total que se deba en la tarjeta ese día
        </label>
      ) : null}
      {tipo === "pago_tarjeta" && pagoTotal ? null : (
        <>
          <div className="caja-campo">
            <label htmlFor={`rec-monto-${r?.id ?? "nuevo"}`}>Monto cada vez</label>
            <div className="caja-monto">
              <span aria-hidden="true">{moneda === "USD" ? "US$" : "RD$"}</span>
              <input id={`rec-monto-${r?.id ?? "nuevo"}`} name="monto" inputMode="decimal" required autoComplete="off" defaultValue={r && r.monto !== "0" ? r.monto : ""} placeholder="Ej.: 15,000" />
            </div>
          </div>
          <label>
            Moneda
            <select name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m === "DOP" ? "Pesos (RD$)" : "Dólares (US$, dólar del BCRD)"}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <SelectCuenta
        nombre="cuenta"
        valor={r?.cuenta}
        cuentas={cuentas}
        className={conDestino ? undefined : "ancho"}
        etiqueta={conDestino ? "Sale de" : tipo === "ingreso" ? "¿En qué cuenta te cae?" : "¿Con qué lo pagas?"}
      />
      {conDestino ? (
        <SelectCuenta key={tipo} nombre="destino" valor={r?.destino} cuentas={cuentas} soloTarjetas={tipo === "pago_tarjeta"} etiqueta={tipo === "pago_tarjeta" ? "Tarjeta que pagas" : "Entra a"} />
      ) : null}
      {tipo === "pago_tarjeta" ? null : (
        <div className="ancho">
          <SelectCategoria key={tipo} valor={categoria} categorias={categorias} tipo={tipo} />
        </div>
      )}
      <label>
        ¿Cada cuánto?
        <select name="frecuencia" value={frecuencia} onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}>
          {FRECUENCIAS.map((f) => (
            <option key={f} value={f}>
              {NOMBRE_FRECUENCIA[f]}
            </option>
          ))}
        </select>
      </label>
      {frecuencia === "mensual" ? (
        <label>
          Días del mes
          <input name="dias" required defaultValue={r?.dias ?? ""} placeholder="Ej.: 15, 30" autoComplete="off" title="El 31 (o el 29 y 30) cae el último día en los meses más cortos." />
        </label>
      ) : frecuencia === "cada_n" ? (
        <label>
          Cada cuántos días
          <input name="cadaN" inputMode="numeric" required defaultValue={r?.cadaN ?? ""} placeholder="Ej.: 14" autoComplete="off" title="Se cuenta desde «Desde» (o desde la fecha de inicio)." />
        </label>
      ) : (
        <label>
          Fecha
          <input type="date" name="fecha" required defaultValue={r?.fecha ?? ""} />
        </label>
      )}
      {frecuencia !== "unica" ? (
        <>
          <label>
            Desde <span className="tenue">(opcional)</span>
            <input type="date" name="desde" defaultValue={r?.desde ?? ""} />
          </label>
          <label>
            Hasta <span className="tenue">(opcional)</span>
            <input type="date" name="hasta" defaultValue={r?.hasta ?? ""} />
          </label>
        </>
      ) : null}
    </div>
  );
}
