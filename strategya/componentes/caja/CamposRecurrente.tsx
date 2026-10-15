"use client";

// Campos de un recurrente: la frecuencia decide si se piden días del mes, cada N días o una fecha.

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
import { type OpcionCategoria, type OpcionCuenta, SelectCategoria, SelectCuenta } from "./CamposMovimiento";

export function CamposRecurrente({ r, cuentas, categorias }: { r?: Recurrente; cuentas: OpcionCuenta[]; categorias: OpcionCategoria[] }) {
  const [tipo, setTipo] = useState<TipoMovimiento>(r?.tipo ?? "gasto");
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(r?.frecuencia ?? "mensual");
  const [moneda, setMoneda] = useState<Moneda>(r?.moneda ?? "DOP");
  const [pagoTotal, setPagoTotal] = useState<boolean>(r?.pagoTotal ?? false);
  const conDestino = tipo === "transferencia" || tipo === "pago_tarjeta";
  return (
    <div className="caja-campos">
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={r?.nombre ?? ""} autoComplete="off" />
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
          <option value="false">Inactivo</option>
        </select>
      </label>
      {tipo === "pago_tarjeta" ? (
        <label className="casilla ancho">
          <input type="checkbox" name="pagoTotal" checked={pagoTotal} onChange={(e) => setPagoTotal(e.target.checked)} />
          Pagar el total que se deba en la tarjeta ese día
        </label>
      ) : null}
      {tipo === "pago_tarjeta" && pagoTotal ? null : (
        <>
          <label>
            Monto
            <input name="monto" inputMode="decimal" required autoComplete="off" defaultValue={r && r.monto !== "0" ? r.monto : ""} />
          </label>
          <label>
            Moneda
            <select name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
              {MONEDAS.map((m) => (
                <option key={m} value={m}>
                  {m === "DOP" ? "RD$" : "US$ (tasa general)"}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <SelectCuenta nombre="cuenta" valor={r?.cuenta} cuentas={cuentas} etiqueta={conDestino ? "Desde la cuenta" : "Cuenta"} />
      {conDestino ? (
        <SelectCuenta key={tipo} nombre="destino" valor={r?.destino} cuentas={cuentas} soloTarjetas={tipo === "pago_tarjeta"} etiqueta={tipo === "pago_tarjeta" ? "Tarjeta" : "Hacia la cuenta"} />
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="ancho">
        <SelectCategoria valor={r?.categoria} categorias={categorias} />
      </div>
      <label>
        Frecuencia
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
          <input name="dias" required defaultValue={r?.dias ?? ""} placeholder="15, 30" autoComplete="off" aria-describedby="ayuda-dias" />
        </label>
      ) : frecuencia === "cada_n" ? (
        <label>
          Cada cuántos días
          <input name="cadaN" inputMode="numeric" required defaultValue={r?.cadaN ?? ""} placeholder="14" autoComplete="off" />
        </label>
      ) : (
        <label>
          Fecha
          <input type="date" name="fecha" required defaultValue={r?.fecha ?? ""} />
        </label>
      )}
      {frecuencia === "mensual" ? (
        <p id="ayuda-dias" className="ancho chico tenue" style={{ margin: 0 }}>
          El 31 (o el 29 y 30) cae el último día en los meses más cortos.
        </p>
      ) : frecuencia === "cada_n" ? (
        <p className="ancho chico tenue" style={{ margin: 0 }}>
          Se cuenta desde «Desde» (o desde la fecha de inicio).
        </p>
      ) : null}
      {frecuencia !== "unica" ? (
        <>
          <label>
            Desde
            <input type="date" name="desde" defaultValue={r?.desde ?? ""} />
          </label>
          <label>
            Hasta
            <input type="date" name="hasta" defaultValue={r?.hasta ?? ""} />
          </label>
        </>
      ) : null}
    </div>
  );
}
