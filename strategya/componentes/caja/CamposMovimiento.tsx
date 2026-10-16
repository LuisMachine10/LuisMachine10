"use client";

// Campos de un movimiento (registrar, ajustar un planificado o editar). El destino solo aparece en
// transferencias y pagos de tarjeta; la tasa, solo en US$.

import { useId, useState } from "react";
import { MONEDAS, NOMBRE_GRUPO, NOMBRE_TIPO, TIPOS_MOVIMIENTO, type Grupo, type Moneda, type TipoCuenta, type TipoMovimiento } from "@/lib/caja/tipos";

export interface OpcionCuenta {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
}
export interface OpcionCategoria {
  id: string;
  nombre: string;
  grupo: Grupo;
}

export interface ValoresMovimiento {
  tipo?: TipoMovimiento;
  monto?: string;
  moneda?: Moneda;
  tasa?: string | null;
  cuenta?: string | null;
  destino?: string | null;
  categoria?: string | null;
  nota?: string | null;
}

export function SelectCuenta({ nombre, valor, cuentas, soloTarjetas = false, etiqueta }: { nombre: string; valor?: string | null; cuentas: OpcionCuenta[]; soloTarjetas?: boolean; etiqueta: string }) {
  const lista = soloTarjetas ? cuentas.filter((c) => c.tipo === "tarjeta") : cuentas;
  const desconocida = valor && !cuentas.some((c) => c.id === valor);
  return (
    <label>
      {etiqueta}
      <select name={nombre} defaultValue={valor ?? ""} required>
        <option value="" disabled>
          Elige…
        </option>
        {desconocida ? <option value={valor}>«{valor}» (ya no existe)</option> : null}
        {lista.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SelectCategoria({ valor, categorias }: { valor?: string | null; categorias: OpcionCategoria[] }) {
  const grupos = [...new Set(categorias.map((c) => c.grupo))];
  return (
    <label>
      Categoría
      <select name="categoria" defaultValue={valor ?? ""}>
        <option value="">Sin categoría</option>
        {valor && !categorias.some((c) => c.id === valor) ? <option value={valor}>«{valor}» (ya no existe)</option> : null}
        {grupos.map((g) => (
          <optgroup key={g} label={NOMBRE_GRUPO[g]}>
            {categorias
              .filter((c) => c.grupo === g)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export function CamposMovimiento({
  v = {},
  cuentas,
  categorias,
  conNota = true,
}: {
  v?: ValoresMovimiento;
  cuentas: OpcionCuenta[];
  categorias: OpcionCategoria[];
  conNota?: boolean;
}) {
  const [tipo, setTipo] = useState<TipoMovimiento>(v.tipo ?? "gasto");
  const [moneda, setMoneda] = useState<Moneda>(v.moneda ?? "DOP");
  const id = useId();
  const conDestino = tipo === "transferencia" || tipo === "pago_tarjeta";
  return (
    <div className="caja-campos">
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
      <label htmlFor={`${id}-monto`}>
        Monto
        <input id={`${id}-monto`} name="monto" inputMode="decimal" autoComplete="off" required defaultValue={v.monto ?? ""} placeholder="0.00" />
      </label>
      <label>
        Moneda
        <select name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m === "DOP" ? "RD$" : "US$"}
            </option>
          ))}
        </select>
      </label>
      {moneda === "USD" ? (
        <label>
          Tasa RD$/US$
          <input name="tasa" inputMode="decimal" autoComplete="off" defaultValue={v.tasa ?? ""} placeholder="la general" />
        </label>
      ) : (
        <span aria-hidden="true" />
      )}
      <SelectCuenta nombre="cuenta" valor={v.cuenta} cuentas={cuentas} etiqueta={conDestino ? "Desde la cuenta" : "Cuenta"} />
      {conDestino ? (
        <SelectCuenta key={tipo} nombre="destino" valor={v.destino} cuentas={cuentas} soloTarjetas={tipo === "pago_tarjeta"} etiqueta={tipo === "pago_tarjeta" ? "Tarjeta" : "Hacia la cuenta"} />
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="ancho">
        <SelectCategoria valor={v.categoria} categorias={categorias} />
      </div>
      {conNota ? (
        <label className="ancho">
          Nota
          <input name="nota" maxLength={500} defaultValue={v.nota ?? ""} autoComplete="off" />
        </label>
      ) : null}
    </div>
  );
}
