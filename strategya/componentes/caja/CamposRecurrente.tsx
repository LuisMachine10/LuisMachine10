"use client";

// Campos de un pago o cobro fijo (recurrente). La categoría es la misma lista de Configuración y es
// obligatoria en ingresos y gastos: el monto del mes suma a lo presupuestado de esa categoría. La
// frecuencia decide si se piden días del mes, cada N días o una fecha.

import { useState } from "react";
import { FRECUENCIAS, MONEDAS, NOMBRE_FRECUENCIA, type Frecuencia, type Moneda, type Recurrente } from "@/lib/caja/tipos";
import { AYUDA_MOVER, cuentasDe, type Modo, modoDe, NOMBRE_MODO, type OpcionCategoria, type OpcionCuenta, SelectCategoria, SelectCuenta, SelectParte, TIPO_DE_MODO } from "./CamposMovimiento";

/** Lo que puede ser un pago o cobro fijo (una línea del plan de ahorro es un fijo de «Ahorro o inversión»). */
const MODOS_FIJO: readonly Modo[] = ["ingreso", "gasto", "ahorro", "mover", "pago_deuda"];

export function CamposRecurrente({
  r,
  inicial,
  cuentas,
  categorias,
}: {
  r?: Recurrente;
  /** Valores de arranque de uno nuevo (p. ej., la categoría desde la que se agrega). */
  inicial?: Partial<Pick<Recurrente, "tipo" | "categoria">> & { modo?: Modo };
  cuentas: OpcionCuenta[];
  categorias: OpcionCategoria[];
}) {
  const idDestino = r?.destino ?? (r?.registroDestino ? `r:${r.registroDestino}` : "");
  const [modo, setModo] = useState<Modo>(
    inicial?.modo ?? (r ? modoDe(r.tipo, cuentas.find((c) => c.id === r.cuenta), cuentas.find((c) => c.id === idDestino)) : inicial?.tipo === "transferencia" ? "mover" : inicial?.tipo === "pago_tarjeta" ? "pago_deuda" : (inicial?.tipo ?? "gasto")),
  );
  const tipo = TIPO_DE_MODO[modo];
  const [frecuencia, setFrecuencia] = useState<Frecuencia>(r?.frecuencia ?? "mensual");
  const [moneda, setMoneda] = useState<Moneda>(r?.moneda ?? "DOP");
  const [pagoTotal, setPagoTotal] = useState<boolean>(r?.pagoTotal ?? false);
  const [destino, setDestino] = useState<string>(idDestino);
  const conDestino = tipo === "transferencia" || tipo === "pago_tarjeta";
  const categoria = r?.categoria ?? inicial?.categoria ?? null;
  return (
    <div className="caja-campos">
      <label className="ancho">
        Nombre
        <input name="nombre" required maxLength={120} defaultValue={r?.nombre ?? ""} autoComplete="off" placeholder={tipo === "ingreso" ? "Ej.: Quincena" : "Ej.: Alquiler"} />
      </label>
      <input type="hidden" name="tipo" value={tipo} />
      <label>
        Tipo
        <select value={MODOS_FIJO.includes(modo) ? modo : "mover"} onChange={(e) => setModo(e.target.value as Modo)}>
          {MODOS_FIJO.map((t) => (
            <option key={t} value={t}>
              {NOMBRE_MODO[t]}
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
      {modo === "mover" ? (
        <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
          {AYUDA_MOVER}
        </p>
      ) : modo === "ahorro" ? (
        <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
          Una línea de tu plan de ahorro: el instrumento exacto y cuánto le pones. Cuando registres la transferencia, queda hecha.
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
        key={`o-${modo}`}
        nombre="cuenta"
        valor={r?.cuenta}
        cuentas={cuentasDe(cuentas, modo, "origen")}
        className={conDestino ? undefined : "ancho"}
        etiqueta={conDestino ? "Sale de" : tipo === "ingreso" ? "¿En qué cuenta te cae?" : "¿Con qué lo pagas?"}
      />
      {conDestino ? (
        <SelectCuenta
          key={`d-${modo}`}
          nombre="destino"
          valor={idDestino || null}
          cuentas={cuentasDe(cuentas, modo, "destino")}
          etiqueta={tipo === "pago_tarjeta" ? "Tarjeta o préstamo que pagas" : modo === "ahorro" ? "¿A dónde va el ahorro?" : "Entra a"}
          alCambiar={setDestino}
        />
      ) : null}
      {tipo === "pago_tarjeta" && cuentas.find((c) => c.id === destino)?.dobleMoneda ? <SelectParte valor={r?.parte} /> : null}
      {tipo === "pago_tarjeta" ? null : (
        <div className="ancho">
          <SelectCategoria key={modo} valor={categoria ?? (modo === "ahorro" ? (categorias.find((c) => c.tipo === "ahorro_inversion")?.id ?? null) : null)} categorias={categorias} tipo={tipo} />
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
