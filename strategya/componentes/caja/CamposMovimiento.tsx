"use client";

// Campos de un movimiento (anotar, ajustar un fijo o editar). El destino solo aparece al mover entre
// cuentas y en pagos de tarjeta; la tasa, solo en US$; la categoría es obligatoria en ingresos y gastos.

import { useId, useState } from "react";
import {
  MONEDAS,
  NOMBRE_TIPO,
  NOMBRE_TIPO_CATEGORIA,
  TIPOS_CATEGORIA,
  TIPOS_MOVIMIENTO,
  type Moneda,
  type TipoCategoria,
  type TipoCuenta,
  type TipoMovimiento,
} from "@/lib/caja/tipos";

export interface OpcionCuenta {
  id: string;
  nombre: string;
  tipo: TipoCuenta;
}
export interface OpcionCategoria {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
}

/** Qué categorías tienen sentido para cada tipo de movimiento. */
export const CATEGORIAS_PARA: Record<TipoMovimiento, readonly TipoCategoria[]> = {
  ingreso: ["ingreso", "otro_ingreso"],
  gasto: ["gasto", "costo", "gasto_financiero", "otro_gasto", "ahorro_inversion"],
  transferencia: ["ahorro_inversion"],
  pago_tarjeta: [],
};

export const AYUDA_MOVER = "Pasar dinero de una cuenta tuya a otra (del banco a la cartera o al ahorro). No es ingreso ni gasto: solo cambia de lugar.";

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

export function SelectCuenta({ nombre, valor, cuentas, soloTarjetas = false, etiqueta, className }: { nombre: string; valor?: string | null; cuentas: OpcionCuenta[]; soloTarjetas?: boolean; etiqueta: string; className?: string }) {
  const lista = soloTarjetas ? cuentas.filter((c) => c.tipo === "tarjeta") : cuentas;
  const desconocida = valor && !cuentas.some((c) => c.id === valor);
  return (
    <label className={className}>
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

/**
 * Selector de categoría (la misma lista de Configuración). En ingresos y gastos es obligatorio: así el
 * monto cae solo en el estado de resultados. Al mover entre cuentas solo se ofrece «ahorro e inversión».
 */
export function SelectCategoria({ valor, categorias, tipo = "gasto", nombre = "categoria", id }: { valor?: string | null; categorias: OpcionCategoria[]; tipo?: TipoMovimiento; nombre?: string; id?: string }) {
  const permitidos = CATEGORIAS_PARA[tipo];
  const lista = categorias.filter((c) => permitidos.includes(c.tipo) || c.id === valor);
  const obligatoria = tipo === "ingreso" || tipo === "gasto";
  const tipos = TIPOS_CATEGORIA.filter((t) => lista.some((c) => c.tipo === t));
  const select = (
    <select id={id} name={nombre} defaultValue={valor ?? ""} required={obligatoria}>
      <option value="" disabled={obligatoria}>
        {obligatoria ? "Elige…" : "No, solo muevo dinero"}
      </option>
      {valor && !categorias.some((c) => c.id === valor) ? <option value={valor}>«{valor}» (ya no existe)</option> : null}
      {tipos.map((t) => (
        <optgroup key={t} label={NOMBRE_TIPO_CATEGORIA[t]}>
          {lista
            .filter((c) => c.tipo === t)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
  if (id) return select;
  return (
    <label>
      {obligatoria ? "Categoría" : "¿Es ahorro o inversión? (opcional)"}
      {select}
      {obligatoria && !lista.length ? <span className="caja-campo-ayuda">Aún no tienes categorías de este tipo: créalas en Configuración.</span> : null}
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
      <div className="caja-campo ancho caja-campo-monto">
        <label htmlFor={`${id}-monto`}>Monto</label>
        <div className="caja-monto">
          <span aria-hidden="true">{moneda === "USD" ? "US$" : "RD$"}</span>
          <input id={`${id}-monto`} name="monto" inputMode="decimal" autoComplete="off" required defaultValue={v.monto ?? ""} placeholder="Ej.: 1,250" />
        </div>
      </div>
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
        Moneda
        <select name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
          {MONEDAS.map((m) => (
            <option key={m} value={m}>
              {m === "DOP" ? "Pesos (RD$)" : "Dólares (US$)"}
            </option>
          ))}
        </select>
      </label>
      {moneda === "USD" ? (
        <label className="ancho">
          Tasa: cuántos RD$ por US$ (opcional)
          <input name="tasa" inputMode="decimal" autoComplete="off" defaultValue={v.tasa ?? ""} placeholder="Vacío = la tasa general de Configuración" />
        </label>
      ) : null}
      <SelectCuenta nombre="cuenta" valor={v.cuenta} cuentas={cuentas} className={conDestino ? undefined : "ancho"} etiqueta={conDestino ? "Sale de" : tipo === "ingreso" ? "¿A qué cuenta entra?" : "¿Con qué pagaste?"} />
      {conDestino ? (
        <SelectCuenta key={tipo} nombre="destino" valor={v.destino} cuentas={cuentas} soloTarjetas={tipo === "pago_tarjeta"} etiqueta={tipo === "pago_tarjeta" ? "Tarjeta que pagas" : "Entra a"} />
      ) : null}
      {tipo === "transferencia" ? (
        <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
          {AYUDA_MOVER}
        </p>
      ) : null}
      {tipo === "pago_tarjeta" ? null : (
        <div className="ancho">
          <SelectCategoria key={tipo} valor={v.categoria} categorias={categorias} tipo={tipo} />
        </div>
      )}
      {conNota ? (
        <label className="ancho">
          ¿En qué fue? (opcional)
          <input name="nota" maxLength={500} defaultValue={v.nota ?? ""} autoComplete="off" placeholder="Ej.: Supermercado" />
        </label>
      ) : null}
    </div>
  );
}
