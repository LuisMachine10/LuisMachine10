"use client";

// Campos de un movimiento (anotar, ajustar un fijo o editar). Núcleo v2: «¿Qué pasó?» tiene los formularios del manual
// (ingreso, gasto, ahorro o inversión, mover entre mis cuentas, pago de tarjeta o préstamo, cambio de moneda y rescate o
// venta de inversión) y CADA LISTA de cuentas sale sola del tipo de cada cuenta (lib/finanzas/catalogo.ts · aparece):
// por ejemplo, una inversión nunca sale en «¿Con qué pagaste?». En la base se guarda el tipo de siempre (ingreso, gasto,
// transferencia, pago_tarjeta); la base vuelve a revisar las listas.

import Big from "big.js";
import { useId, useState } from "react";
import { aparece, type Formulario, formularioDeTransferencia, PREGUNTA, type Rol, type TipoFin } from "@/lib/finanzas/catalogo";
import {
  esDeuda,
  NOMBRE_TIPO_CATEGORIA,
  TIPOS_CATEGORIA,
  type Moneda,
  type TipoCategoria,
  type TipoCuenta,
  type TipoMovimiento,
} from "@/lib/caja/tipos";

export interface OpcionCuenta {
  /** Cuenta del Presupuesto, o «r:<id>» para una inversión que no vive en el Presupuesto (acciones, fondos por cuotas). */
  id: string;
  nombre: string;
  tipo: TipoCuenta;
  /** Moneda de la cuenta (vacío = RD$). */
  moneda?: Moneda;
  /** Préstamo u otra deuda con tasa en el Portafolio (fracción anual). */
  tasaAnual?: string | null;
  /** Tarjeta en RD$ con parte en dólares. */
  dobleMoneda?: boolean;
  /** Tipo del catálogo (decide en qué listas aparece). */
  tipoFin?: TipoFin;
  /** Alto rendimiento con tarjeta de débito. */
  debito?: boolean;
  /** Préstamo: cargos dentro de la cuota (seguro…). */
  cargosCuota?: string | null;
  /** Inversión por unidades (acciones, fondos por cuotas): se pueden anotar las unidades. */
  porUnidades?: boolean;
}
export interface OpcionCategoria {
  id: string;
  nombre: string;
  tipo: TipoCategoria;
}

/** Lo que Mena elige en «¿Qué pasó?»: los formularios del manual. */
export const MODOS = ["ingreso", "gasto", "ahorro", "mover", "pago_deuda", "cambio", "rescate"] as const;
export type Modo = (typeof MODOS)[number];

export const NOMBRE_MODO: Record<Modo, string> = {
  ingreso: "Ingreso",
  gasto: "Gasto",
  ahorro: "Ahorro o inversión",
  mover: "Mover entre mis cuentas",
  pago_deuda: "Pago de tarjeta o préstamo",
  cambio: "Cambio de moneda",
  rescate: "Rescate o venta de inversión",
};

/** El tipo que se guarda en la base. */
export const TIPO_DE_MODO: Record<Modo, TipoMovimiento> = {
  ingreso: "ingreso",
  gasto: "gasto",
  ahorro: "transferencia",
  mover: "transferencia",
  pago_deuda: "pago_tarjeta",
  cambio: "transferencia",
  rescate: "transferencia",
};

/** Formulario del catálogo de cada modo («mover» usa la lista de cuentas: efectivo y bancos). */
const FORMULARIO_DE: Record<Modo, Formulario> = { ingreso: "ingreso", gasto: "pago", ahorro: "ahorro", mover: "cambio", pago_deuda: "pago_deuda", cambio: "cambio", rescate: "rescate" };

const TIPO_DE_CAJA: Record<TipoCuenta, TipoFin> = { banco: "corriente", efectivo: "efectivo", ahorro: "ahorro", tarjeta: "tarjeta", prestamo: "prestamo" };
export const tipoFinDe = (c: Pick<OpcionCuenta, "tipo" | "tipoFin">): TipoFin => c.tipoFin ?? TIPO_DE_CAJA[c.tipo];

/** Las cuentas que aparecen en ese modo y papel (manual, sección B). */
export function cuentasDe(cuentas: readonly OpcionCuenta[], modo: Modo, rol: Rol): OpcionCuenta[] {
  const f = FORMULARIO_DE[modo];
  const r: Rol = modo === "ingreso" || modo === "gasto" ? "cuenta" : rol;
  // Lo que no vive en el Presupuesto solo entra en un ahorro (destino) o en un rescate (origen).
  return cuentas.filter((c) => aparece({ tipo: tipoFinDe(c), debito: c.debito }, f, r) && (!c.id.startsWith("r:") || (modo === "ahorro" && rol === "destino") || (modo === "rescate" && rol === "origen")));
}

/** El modo de un movimiento guardado (para editarlo con el formulario que le corresponde). */
export function modoDe(tipo: TipoMovimiento, cuenta: OpcionCuenta | undefined, destino: OpcionCuenta | undefined): Modo {
  if (tipo === "ingreso" || tipo === "gasto") return tipo;
  if (tipo === "pago_tarjeta") return "pago_deuda";
  const f = formularioDeTransferencia(cuenta ? { tipo: tipoFinDe(cuenta) } : null, destino ? { tipo: tipoFinDe(destino) } : null, cuenta?.moneda ?? "DOP", destino?.moneda ?? "DOP");
  return f;
}

/** Qué categorías tienen sentido para cada tipo de movimiento. */
export const CATEGORIAS_PARA: Record<TipoMovimiento, readonly TipoCategoria[]> = {
  ingreso: ["ingreso", "otro_ingreso"],
  gasto: ["gasto", "costo", "gasto_financiero", "otro_gasto", "ahorro_inversion"],
  transferencia: ["ahorro_inversion"],
  // La categoría de un pago de tarjeta o préstamo es la del INTERÉS (gasto financiero), si hubo.
  pago_tarjeta: ["gasto_financiero"],
};

export const AYUDA_MOVER = "Pasar dinero de una cuenta tuya a otra (del banco al efectivo o a otra cuenta). No es ingreso ni gasto: solo cambia de lugar.";

const AYUDA_MODO: Record<Modo, string> = {
  ingreso: "Dinero que te entró: cae en efectivo o en una cuenta.",
  gasto: "Lo que pagaste con efectivo, una cuenta o una tarjeta. Con tarjeta es gasto del mes y sube lo que debes.",
  ahorro: "Lo que apartas: sale de efectivo o de una cuenta y va a tu ahorro o a una inversión. Es ahorro, no gasto.",
  mover: AYUDA_MOVER,
  pago_deuda: "Sale de efectivo o de una cuenta y baja lo que debes. No es gasto: solo el interés y los cargos lo son.",
  cambio: "Pasar dinero entre monedas (RD$, US$ o €), de una cuenta tuya a otra. Se guarda la tasa usada.",
  rescate: "Sacar dinero de una inversión hacia efectivo o una cuenta. Para gastar de una inversión, primero se rescata.",
};

export interface ValoresMovimiento {
  tipo?: TipoMovimiento;
  /** Modo de arranque (los botones «Ahorrar o invertir», etc.). */
  modo?: Modo;
  monto?: string;
  moneda?: Moneda;
  tasa?: string | null;
  cuenta?: string | null;
  destino?: string | null;
  registroOrigen?: string | null;
  registroDestino?: string | null;
  categoria?: string | null;
  nota?: string | null;
  interes?: string | null;
  cargos?: string | null;
  parte?: Moneda | null;
}

/**
 * Tarjeta en dos monedas: «¿A qué parte de la tarjeta va?». Vacío = según la moneda del monto. Si se paga la
 * parte en US$ desde una cuenta en RD$, se convierte con la tasa que escribas o el dólar del BCRD de ese día.
 */
export function SelectParte({ valor, alCambiar }: { valor?: Moneda | null; alCambiar?: (p: Moneda | "") => void }) {
  return (
    <label className="ancho">
      ¿A qué parte de la tarjeta va el pago?
      <select name="parte" defaultValue={valor ?? ""} onChange={alCambiar ? (e) => alCambiar(e.target.value as Moneda | "") : undefined}>
        <option value="">Según la moneda del pago</option>
        <option value="DOP">La parte en RD$ (pesos)</option>
        <option value="USD">La parte en US$ (dólares)</option>
      </select>
      <span className="caja-campo-ayuda">Esta tarjeta tiene límite en pesos y en dólares. Si pagas la parte en US$ desde una cuenta en RD$, se convierte con la tasa que escribas o el dólar del BCRD de ese día.</span>
    </label>
  );
}

const sufijoMoneda = (m?: Moneda) => (m === "USD" ? " (US$)" : "");

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
  const desconocida = valor && !lista.some((c) => c.id === valor);
  return (
    <label className={className}>
      {etiqueta}
      <select name={nombre} defaultValue={valor ?? ""} required onChange={alCambiar ? (e) => alCambiar(e.target.value) : undefined}>
        <option value="" disabled>
          Elige…
        </option>
        {desconocida ? <option value={valor}>«{cuentas.find((c) => c.id === valor)?.nombre ?? valor}» (no va en esta lista)</option> : null}
        {lista.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {sufijoMoneda(c.moneda)}
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
  const idOrigen = v.registroOrigen ? `r:${v.registroOrigen}` : (v.cuenta ?? "");
  const idDestino = v.destino ?? (v.registroDestino ? `r:${v.registroDestino}` : "");
  const buscar = (k: string) => cuentas.find((c) => c.id === k);
  const [modo, setModo] = useState<Modo>(v.modo ?? (v.tipo ? modoDe(v.tipo, buscar(idOrigen), buscar(idDestino)) : "gasto"));
  const [moneda, setMoneda] = useState<Moneda>(v.moneda ?? "DOP");
  const [destino, setDestino] = useState<string>(idDestino);
  const [origen, setOrigen] = useState<string>(idOrigen);
  const [parte, setParte] = useState<Moneda | "">(v.parte ?? "");
  const tipo = TIPO_DE_MODO[modo];
  const enDolares = (cid: string) => buscar(cid)?.moneda === "USD";
  const destinoDoble = tipo === "pago_tarjeta" && !!buscar(destino)?.dobleMoneda;
  const conDestino = tipo === "transferencia" || tipo === "pago_tarjeta";
  // La tasa se pide si el monto es en US$, si el dinero entra o sale de una cuenta en US$, o si se paga la parte en US$
  // de una tarjeta con pesos. En un cambio de moneda siempre (es la tasa usada).
  const pideTasa = modo === "cambio" || moneda === "USD" || enDolares(origen) || (conDestino && enDolares(destino)) || (destinoDoble && parte === "USD");
  const id = useId();
  const deuda = tipo === "pago_tarjeta" ? buscar(destino) : undefined;
  const esPrestamo = !!deuda && (deuda.tipo === "prestamo" || tipoFinDe(deuda) === "otra_deuda");
  const tasaDeuda = deuda && deuda.tipo === "prestamo" && deuda.tasaAnual ? new Big(deuda.tasaAnual) : null;
  const capitalPrevio = v.interes || v.cargos ? new Big(v.monto ?? "0").minus(v.interes ?? "0").minus(v.cargos ?? "0").toFixed() : "";
  const origenes = cuentasDe(cuentas, modo, "origen");
  const destinos = cuentasDe(cuentas, modo, "destino");
  const unidades = (modo === "ahorro" && buscar(destino)?.porUnidades) || (modo === "rescate" && buscar(origen)?.porUnidades);
  const otraMoneda = modo === "mover" && origen && destino && (buscar(origen)?.moneda ?? "DOP") !== (buscar(destino)?.moneda ?? "DOP");
  // Al elegir una cuenta en US$, el monto pasa a US$ (y al revés): se puede cambiar a mano.
  const alCambiarCuenta = (cid: string) => {
    setOrigen(cid);
    const c = buscar(cid);
    if (c && modo !== "cambio") setMoneda(c.moneda ?? "DOP");
  };
  const f = FORMULARIO_DE[modo];
  const pregunta = (rol: Rol) => (modo === "mover" ? (rol === "origen" ? "Sale de" : "Entra a") : (PREGUNTA[f][modo === "ingreso" || modo === "gasto" ? "cuenta" : rol] ?? ""));
  return (
    <div className="caja-campos">
      <input type="hidden" name="tipo" value={tipo} />
      <div className="caja-campo ancho caja-campo-monto">
        <label htmlFor={`${id}-monto`}>Monto</label>
        <div className="caja-monto">
          <span aria-hidden="true">{moneda === "USD" ? "US$" : "RD$"}</span>
          <input id={`${id}-monto`} name="monto" inputMode="decimal" autoComplete="off" required defaultValue={v.monto ?? ""} placeholder="Ej.: 1,250" />
        </div>
      </div>
      <label>
        ¿Qué pasó?
        <select value={modo} onChange={(e) => setModo(e.target.value as Modo)} aria-describedby={`${id}-ayuda-modo`}>
          {MODOS.map((m) => (
            <option key={m} value={m}>
              {NOMBRE_MODO[m]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Moneda
        <select name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)}>
          <option value="DOP">Pesos (RD$)</option>
          <option value="USD">Dólares (US$)</option>
        </select>
      </label>
      <p className="ancho caja-campo-ayuda" id={`${id}-ayuda-modo`} style={{ margin: 0 }}>
        {AYUDA_MODO[modo]}
      </p>
      {pideTasa ? (
        <label className="ancho">
          Tasa: cuántos RD$ por US$ {modo === "cambio" ? "(la que te dieron)" : "(opcional)"}
          <input name="tasa" inputMode="decimal" autoComplete="off" defaultValue={v.tasa ?? ""} placeholder="Vacío = el dólar oficial del BCRD de ese día" />
          <span className="caja-campo-ayuda">Si tu banco te cobró otra tasa, escríbela. Sin ninguna, el monto queda «no confirmado» en tus totales en RD$.</span>
        </label>
      ) : null}
      <SelectCuenta key={`o-${modo}`} nombre="cuenta" valor={origen || null} cuentas={origenes} className={conDestino ? undefined : "ancho"} etiqueta={pregunta("origen")} alCambiar={alCambiarCuenta} />
      {conDestino ? <SelectCuenta key={`d-${modo}`} nombre="destino" valor={destino || null} cuentas={destinos} etiqueta={pregunta("destino")} alCambiar={setDestino} /> : null}
      {otraMoneda ? (
        <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
          Son cuentas en monedas distintas: es un cambio de moneda (escribe la tasa que te dieron).
        </p>
      ) : null}
      {destinoDoble ? <SelectParte valor={v.parte} alCambiar={setParte} /> : null}
      {tipo === "gasto" && buscar(origen)?.dobleMoneda && moneda === "USD" ? (
        <p className="ancho caja-campo-ayuda" style={{ margin: 0 }}>
          Un gasto en US$ con esta tarjeta va a su parte en dólares.
        </p>
      ) : null}
      {unidades ? (
        <label className="ancho">
          {modo === "ahorro" ? "Unidades que compraste" : "Unidades que vendiste"} <span className="tenue">(opcional)</span>
          <input name="unidades" inputMode="decimal" autoComplete="off" placeholder="Ej.: 2" />
          <span className="caja-campo-ayuda">Si no las escribes, actualízalas luego en Mis cuentas (no las adivinamos).</span>
        </label>
      ) : null}
      {tipo === "pago_tarjeta" ? (
        <label className="ancho">
          ¿Cuánto de este pago fue capital? (opcional)
          <input name="capital" inputMode="decimal" autoComplete="off" defaultValue={capitalPrevio} placeholder={tasaDeuda ? "Vacío = lo calculamos con tu tasa" : "Vacío = todo fue capital"} />
          <span className="caja-campo-ayuda">
            {tasaDeuda
              ? `Lo que debes baja solo por el capital. Vacío: el interés del mes se calcula con la tasa de «${deuda!.nombre}» en tu Portafolio (${tasaDeuda.times(100).toFixed(2)} % al año: lo que debías × tasa ÷ 12) y va a gastos financieros.`
              : "Lo que debes baja solo por el capital. En una tarjeta, el interés es solo el que dice tu estado de cuenta: escribe aquí el capital y el resto va a gastos financieros. Vacío = todo fue capital."}
          </span>
        </label>
      ) : null}
      {esPrestamo ? (
        <label className="ancho">
          Cargos dentro de la cuota: seguro y otros (opcional)
          <input name="cargos" inputMode="decimal" autoComplete="off" defaultValue={v.cargos ?? ""} placeholder={deuda?.cargosCuota ? `Vacío = ${deuda.cargosCuota} (los de Mis cuentas)` : "Ej.: 1,200"} />
          <span className="caja-campo-ayuda">Son gasto aparte: no bajan lo que debes.</span>
        </label>
      ) : null}
      {modo === "gasto" || modo === "ingreso" || modo === "ahorro" || modo === "pago_deuda" ? (
        <div className="ancho">
          <SelectCategoria key={tipo} valor={v.categoria ?? (modo === "ahorro" ? (categorias.find((c) => c.tipo === "ahorro_inversion")?.id ?? null) : null)} categorias={categorias} tipo={tipo} />
        </div>
      ) : null}
      {conNota ? (
        <label className="ancho">
          ¿En qué fue? (opcional)
          <input name="nota" maxLength={500} defaultValue={v.nota ?? ""} autoComplete="off" placeholder="Ej.: Supermercado" />
        </label>
      ) : null}
    </div>
  );
}
