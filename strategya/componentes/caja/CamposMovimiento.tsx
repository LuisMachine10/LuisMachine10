"use client";

// Campos de un movimiento (anotar, ajustar un fijo o editar). El destino solo aparece al mover entre
// cuentas y en pagos de tarjeta o préstamo; la tasa, solo en US$; la categoría es obligatoria en ingresos y
// gastos. En un pago de tarjeta o préstamo se pregunta cuánto fue capital (lo que baja la deuda): vacío =
// todo, o, en un préstamo con tasa en el Portafolio, el interés del mes con esa tasa.

import Big from "big.js";
import { useId, useState } from "react";
import {
  esDeuda,
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
  /** Moneda de la cuenta (vacío = RD$). */
  moneda?: Moneda;
  /** Préstamo u otra deuda con tasa en el Portafolio (fracción anual). */
  tasaAnual?: string | null;
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
  // La categoría de un pago de tarjeta o préstamo es la del INTERÉS (gasto financiero), si hubo.
  pago_tarjeta: ["gasto_financiero"],
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
  interes?: string | null;
}

export function SelectCuenta({
  nombre,
  valor,
  cuentas,
  soloTarjetas = false,
  etiqueta,
  className,
  alCambiar,
}: {
  nombre: string;
  valor?: string | null;
  cuentas: OpcionCuenta[];
  /** Solo deudas (tarjetas y préstamos): el destino de un pago. */
  soloTarjetas?: boolean;
  etiqueta: string;
  className?: string;
  alCambiar?: (id: string) => void;
}) {
  const lista = soloTarjetas ? cuentas.filter((c) => esDeuda(c.tipo)) : cuentas;
  const desconocida = valor && !cuentas.some((c) => c.id === valor);
  return (
    <label className={className}>
      {etiqueta}
      <select name={nombre} defaultValue={valor ?? ""} required onChange={alCambiar ? (e) => alCambiar(e.target.value) : undefined}>
        <option value="" disabled>
          Elige…
        </option>
        {desconocida ? <option value={valor}>«{valor}» (ya no existe)</option> : null}
        {lista.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.moneda === "USD" ? " (US$)" : ""}
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
        {obligatoria ? "Elige…" : tipo === "pago_tarjeta" ? "«Intereses de tus deudas»" : "No, solo muevo dinero"}
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
      {obligatoria ? "Categoría" : tipo === "pago_tarjeta" ? "Si hubo interés, ¿en qué categoría va? (opcional)" : "¿Es ahorro o inversión? (opcional)"}
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
  const [destino, setDestino] = useState<string>(v.destino ?? "");
  const [origen, setOrigen] = useState<string>(v.cuenta ?? "");
  const enDolares = (cid: string) => cuentas.find((c) => c.id === cid)?.moneda === "USD";
  // La tasa se pide si el monto es en US$ o si el dinero entra o sale de una cuenta en US$.
  const pideTasa = moneda === "USD" || enDolares(origen) || (tipo !== "ingreso" && tipo !== "gasto" && enDolares(destino));
  const id = useId();
  const conDestino = tipo === "transferencia" || tipo === "pago_tarjeta";
  const deuda = tipo === "pago_tarjeta" ? cuentas.find((c) => c.id === destino && esDeuda(c.tipo)) : undefined;
  const tasaDeuda = deuda && deuda.tipo === "prestamo" && deuda.tasaAnual ? new Big(deuda.tasaAnual) : null;
  const capitalPrevio = v.interes && v.monto ? new Big(v.monto).minus(v.interes).toFixed() : "";
  // Al elegir una cuenta en US$, el monto pasa a US$ (y al revés): se puede cambiar a mano.
  const alCambiarCuenta = (cid: string) => {
    setOrigen(cid);
    const c = cuentas.find((x) => x.id === cid);
    if (c) setMoneda(c.moneda ?? "DOP");
  };
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
      {pideTasa ? (
        <label className="ancho">
          Tasa: cuántos RD$ por US$ (opcional)
          <input name="tasa" inputMode="decimal" autoComplete="off" defaultValue={v.tasa ?? ""} placeholder="Vacío = el dólar oficial del BCRD de ese día" />
          <span className="caja-campo-ayuda">Si tu banco te cobró otra tasa, escríbela. Sin ninguna, el monto queda «no confirmado» en tus totales en RD$.</span>
        </label>
      ) : null}
      <SelectCuenta
        nombre="cuenta"
        valor={v.cuenta}
        cuentas={cuentas}
        className={conDestino ? undefined : "ancho"}
        etiqueta={conDestino ? "Sale de" : tipo === "ingreso" ? "¿A qué cuenta entra?" : "¿Con qué pagaste?"}
        alCambiar={alCambiarCuenta}
      />
      {conDestino ? (
        <SelectCuenta
          key={tipo}
          nombre="destino"
          valor={v.destino}
          cuentas={cuentas}
          soloTarjetas={tipo === "pago_tarjeta"}
          etiqueta={tipo === "pago_tarjeta" ? "Tarjeta o préstamo que pagas" : "Entra a"}
          alCambiar={setDestino}
        />
      ) : null}
      {tipo === "transferencia" ? (
        <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
          {AYUDA_MOVER}
        </p>
      ) : null}
      {tipo === "pago_tarjeta" ? (
        <label className="ancho">
          ¿Cuánto de este pago fue capital? (opcional)
          <input name="capital" inputMode="decimal" autoComplete="off" defaultValue={capitalPrevio} placeholder={tasaDeuda ? "Vacío = lo calculamos con tu tasa" : "Vacío = todo fue capital"} />
          <span className="caja-campo-ayuda">
            {tasaDeuda
              ? `Lo que debes baja solo por el capital. Vacío: el interés del mes se calcula con la tasa de «${deuda!.nombre}» en tu Portafolio (${tasaDeuda.times(100).toFixed(2)} % al año: lo que debías × tasa ÷ 12) y va a gastos financieros.`
              : "Lo que debes baja solo por el capital. Si tu estado de cuenta dice que una parte fue interés o cargos, escribe aquí solo el capital: el resto va a gastos financieros. Vacío = todo fue capital."}
          </span>
        </label>
      ) : null}
      <div className="ancho">
        <SelectCategoria key={tipo} valor={v.categoria} categorias={categorias} tipo={tipo} />
      </div>
      {conNota ? (
        <label className="ancho">
          ¿En qué fue? (opcional)
          <input name="nota" maxLength={500} defaultValue={v.nota ?? ""} autoComplete="off" placeholder="Ej.: Supermercado" />
        </label>
      ) : null}
    </div>
  );
}
