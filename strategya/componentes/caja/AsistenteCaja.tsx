"use client";

// Asistente de bienvenida del Presupuesto: cuando no hay nada, guía en 4 pasos en el orden de un estado
// de resultados (1 lo que te entra, 2 costos y gastos, 3 cuentas y saldos de hoy, 4 ahorro e inversión y
// colchón) y al final guarda todo de una vez. Cada ingreso o gasto queda como categoría (y, si tiene día,
// también como pago fijo enlazado): no hay que anotar dos veces. El borrador se recuerda en este
// navegador mientras se llena (si el navegador lo permite).

import Big from "big.js";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { crearCajaDesdeAsistente, type EstadoAccion } from "@/app/caja/acciones";
import { alMes, type CuentaDelRegistro } from "@/lib/caja/asistente";
import { rd } from "@/lib/caja/formato";
import { AYUDA_TIPO_CATEGORIA, NOMBRE_TIPO_CATEGORIA_UNO, NOMBRE_TIPO_CUENTA, type TipoCategoria, type TipoCuenta } from "@/lib/caja/tipos";
import { montoDeTexto } from "@/lib/caja/validar";
import "@/estilos/capital.css";
import { Ayuda, Icono, type NombreIcono } from "./Iconos";

interface FilaCuenta {
  k: string;
  tipo: TipoCuenta;
  nombre: string;
  saldo: string;
  limite: string;
  diaPago: string;
  /** Cuenta que ya está en el Portafolio (registro único): solo se elige, no se vuelve a escribir. */
  reg?: string;
}
interface FilaConcepto {
  k: string;
  tipo: TipoCategoria;
  nombre: string;
  monto: string;
  dias: string;
}
interface Borrador {
  paso: number;
  sig: number;
  ingresos: FilaConcepto[];
  gastos: FilaConcepto[];
  cuentas: FilaCuenta[];
  cuentaIngresos: string;
  cuentaGastos: string;
  ahorro: string;
  colchon: string;
}

const CLAVE = "strategya-presupuesto-asistente-v2";
const INICIAL: EstadoAccion = { ok: false, mensaje: null, vez: 0 };
const NUEVO: Borrador = {
  paso: 0,
  sig: 2,
  ingresos: [],
  gastos: [],
  cuentas: [{ k: "a1", tipo: "banco", nombre: "", saldo: "", limite: "", diaPago: "" }],
  cuentaIngresos: "",
  cuentaGastos: "",
  ahorro: "",
  colchon: "",
};

const PASOS = ["Lo que te entra", "Costos y gastos", "Tus cuentas hoy", "Ahorro y colchón"] as const;
const ICONO_TIPO: Record<TipoCuenta, NombreIcono> = { banco: "banco", efectivo: "efectivo", ahorro: "ahorro", tarjeta: "tarjeta", prestamo: "tarjeta" };
const EJEMPLO_NOMBRE: Record<TipoCuenta, string> = { banco: "Ej.: Banco Popular", efectivo: "Ej.: Cartera", ahorro: "Ej.: Ahorro APAP", tarjeta: "Ej.: Visa", prestamo: "Ej.: Préstamo del carro" };
const AGREGAR_CUENTA: { tipo: TipoCuenta; texto: string }[] = [
  { tipo: "banco", texto: "Banco" },
  { tipo: "efectivo", texto: "Efectivo" },
  { tipo: "ahorro", texto: "Ahorro" },
  { tipo: "tarjeta", texto: "Tarjeta de crédito" },
  { tipo: "prestamo", texto: "Préstamo" },
];
const EJEMPLOS_INGRESO: { texto: string; nombre: string; dias: string; tipo: TipoCategoria }[] = [
  { texto: "Quincena (15 y 30)", nombre: "Quincena", dias: "15, 30", tipo: "ingreso" },
  { texto: "Sueldo mensual", nombre: "Sueldo", dias: "30", tipo: "ingreso" },
  { texto: "Ventas o trabajos", nombre: "Ventas", dias: "", tipo: "ingreso" },
  { texto: "Otro ingreso", nombre: "", dias: "", tipo: "otro_ingreso" },
];
const EJEMPLOS_GASTO: { nombre: string; tipo: TipoCategoria; dias: string }[] = [
  { nombre: "Alquiler", tipo: "gasto", dias: "1" },
  { nombre: "Comida", tipo: "gasto", dias: "" },
  { nombre: "Luz", tipo: "gasto", dias: "" },
  { nombre: "Internet", tipo: "gasto", dias: "" },
  { nombre: "Colegio", tipo: "gasto", dias: "" },
  { nombre: "Gasolina", tipo: "gasto", dias: "" },
  { nombre: "Mercancía", tipo: "costo", dias: "" },
  { nombre: "Intereses de la tarjeta", tipo: "gasto_financiero", dias: "" },
  { nombre: "Intereses del préstamo", tipo: "gasto_financiero", dias: "" },
];
const TIPOS_DE_INGRESO: TipoCategoria[] = ["ingreso", "otro_ingreso"];
const TIPOS_DE_GASTO: TipoCategoria[] = ["gasto", "costo", "gasto_financiero", "otro_gasto"];

function leerBorrador(): Borrador | null {
  try {
    const t = window.localStorage.getItem(CLAVE);
    if (!t) return null;
    const b = JSON.parse(t) as Borrador;
    return Array.isArray(b?.cuentas) && Array.isArray(b.ingresos) && Array.isArray(b.gastos) ? { ...NUEVO, ...b } : null;
  } catch {
    return null;
  }
}
function guardarBorrador(b: Borrador | null) {
  try {
    if (b) window.localStorage.setItem(CLAVE, JSON.stringify(b));
    else window.localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento (ventana privada): el asistente sigue funcionando, solo no recuerda el borrador.
  }
}

/** Suma exacta de montos escritos (ignora los que todavía no son número). */
function sumar(montos: (string | null)[]): Big {
  let s = new Big(0);
  for (const m of montos) {
    try {
      const v = m == null ? null : montoDeTexto(m);
      if (v) s = s.plus(v);
    } catch {
      // aún no es un número: no suma
    }
  }
  return s;
}

function Monto({ id, valor, cambiar, etiqueta, ejemplo, requerido, ayuda }: { id: string; valor: string; cambiar: (v: string) => void; etiqueta: string; ejemplo: string; requerido?: boolean; ayuda?: React.ReactNode }) {
  return (
    <div className="caja-campo">
      <label htmlFor={id}>
        {etiqueta}
        {requerido ? null : <span className="tenue"> (opcional)</span>}
      </label>
      <div className="caja-monto">
        <span aria-hidden="true">RD$</span>
        <input id={id} inputMode="decimal" autoComplete="off" value={valor} placeholder={ejemplo} onChange={(e) => cambiar(e.target.value)} aria-describedby={ayuda ? `${id}-ayuda` : undefined} />
      </div>
      {ayuda ? (
        <p id={`${id}-ayuda`} className="caja-campo-ayuda">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

const deRegistro = (r: CuentaDelRegistro): FilaCuenta => ({ k: `r-${r.id}`, reg: r.id, tipo: r.tipo, nombre: r.nombre, saldo: r.saldo, limite: r.limite ?? "", diaPago: r.diaPago ? String(r.diaPago) : "" });
const esDeudaTipo = (t: TipoCuenta) => t === "tarjeta" || t === "prestamo";

export function AsistenteCaja({ registro = [] }: { registro?: CuentaDelRegistro[] }) {
  const [b, setB] = useState<Borrador>(NUEVO);
  const [listo, setListo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // Al escribir de nuevo, el error del servidor ya no aplica: se oculta.
  const [vezOculta, setVezOculta] = useState(0);
  const [estado, enviar, pendiente] = useActionState(crearCajaDesdeAsistente, INICIAL);
  const titulo = useRef<HTMLHeadingElement>(null);
  const uid = useId();

  useEffect(() => {
    const previo = leerBorrador();
    const vigentes = new Set(registro.map((r) => r.id));
    // Las cuentas del Portafolio vienen ya elegidas; un borrador viejo pierde las que ya no existen.
    if (previo) setB({ ...previo, cuentas: previo.cuentas.filter((c) => !c.reg || vigentes.has(c.reg)) });
    else if (registro.length) setB((x) => ({ ...x, cuentas: registro.filter((r) => !r.inversion).map(deRegistro) }));
    setListo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (listo) guardarBorrador(b);
  }, [b, listo]);
  useEffect(() => {
    if (!estado.mensaje) return;
    if (estado.ok) {
      guardarBorrador(null);
      return;
    }
    const m = /^Paso (\d)/.exec(estado.mensaje);
    if (m) setB((x) => ({ ...x, paso: Number(m[1]) }));
  }, [estado.vez, estado.ok, estado.mensaje]);

  const ir = (paso: number) => {
    setAviso(null);
    setB((x) => ({ ...x, paso }));
    requestAnimationFrame(() => titulo.current?.focus());
  };
  const cambiar = <K extends "cuentas" | "ingresos" | "gastos">(lista: K, i: number, cambio: Partial<Borrador[K][number]>) =>
    setB((x) => ({ ...x, [lista]: (x[lista] as Borrador[K][number][]).map((f, j) => (j === i ? { ...f, ...cambio } : f)) }));
  const quitar = (lista: "cuentas" | "ingresos" | "gastos", i: number) => setB((x) => ({ ...x, [lista]: (x[lista] as unknown[]).filter((_, j) => j !== i) }));
  const agregar = (lista: "ingresos" | "gastos", f: Omit<FilaConcepto, "k">) => setB((x) => ({ ...x, sig: x.sig + 1, [lista]: [...x[lista], { ...f, k: `c${x.sig}` }] }));

  const nombreCuenta = (c: FilaCuenta) => c.nombre || `${NOMBRE_TIPO_CUENTA[c.tipo]} sin nombre`;
  const totalIngresos = sumar(b.ingresos.map((g) => alMes(g.monto, g.dias)));
  const totalGastos = sumar(b.gastos.map((g) => alMes(g.monto, g.dias)));
  const fijosGasto = sumar(b.gastos.filter((g) => g.dias.trim()).map((g) => alMes(g.monto, g.dias)));
  const utilidad = totalIngresos.minus(totalGastos);
  const ahorro = sumar([b.ahorro]);
  const hayFijos = b.ingresos.some((g) => g.dias.trim()) || b.gastos.some((g) => g.dias.trim());
  const noTarjeta = b.cuentas.find((c) => !esDeudaTipo(c.tipo))?.k ?? "";

  const siguiente = () => {
    if (b.paso === 3) {
      const falta = b.cuentas.findIndex((c) => !c.reg && (!c.nombre.trim() || !c.saldo.trim()));
      if (!b.cuentas.length) return setAviso(registro.length ? "Elige al menos una cuenta de tu Portafolio o agrega una nueva." : "Agrega al menos una cuenta: toca «Banco» o «Efectivo» abajo.");
      if (falta >= 0) {
        const c = b.cuentas[falta];
        return setAviso(!c.nombre.trim() ? `A la cuenta ${falta + 1} le falta un nombre que reconozcas.` : `Escribe cuánto ${esDeudaTipo(c.tipo) ? "debes hoy en" : "tiene hoy"} «${c.nombre}» (si es nada, escribe 0).`);
      }
    }
    ir(b.paso + 1);
  };

  const terminar = () => {
    const indice = (k: string) => String(b.cuentas.findIndex((c) => c.k === k));
    const concepto = ({ tipo, nombre, monto, dias }: FilaConcepto) => ({ tipo, nombre, monto, dias });
    const datos = {
      ingresos: b.ingresos.map(concepto),
      gastos: b.gastos.map(concepto),
      cuentas: b.cuentas.map(({ tipo, nombre, saldo, limite, diaPago, reg }) => (reg ? { tipo, nombre: "", saldo: "", limite: "", diaPago, registroId: reg } : { tipo, nombre, saldo, limite, diaPago })),
      cuentaIngresos: indice(b.cuentaIngresos || noTarjeta),
      cuentaGastos: indice(b.cuentaGastos || noTarjeta),
      ahorro: b.ahorro,
      colchon: b.colchon,
    };
    const f = new FormData();
    f.set("datos", JSON.stringify(datos));
    startTransition(() => enviar(f));
  };

  if (b.paso === 0) {
    const empezado = b.ingresos.length > 0 || b.gastos.length > 0 || b.cuentas.some((c) => c.nombre);
    return (
      <section className="panel panel-ancho caja-asistente caja-bienvenida" aria-labelledby={`${uid}-t`}>
        <div className="caja-bienvenida-icono" aria-hidden="true">
          <Icono n="balanza" tam={28} />
        </div>
        <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1}>
          Bienvenido a tu presupuesto
        </h2>
        <p className="caja-bienvenida-sub">Anotas una sola vez lo que te entra y lo que gastas; Strategya arma tu mes como un estado de resultados y tu calendario de cada día.</p>
        <ol className="caja-como">
          <li>
            <span className="caja-como-num">1</span>
            <span>
              <strong>Lo que te entra:</strong> tu sueldo, la quincena, tus ventas.
            </span>
          </li>
          <li>
            <span className="caja-como-num">2</span>
            <span>
              <strong>Lo que gastas:</strong> alquiler, comida, luz, intereses… cada uno con su tipo.
            </span>
          </li>
          <li>
            <span className="caja-como-num">3</span>
            <span>
              <strong>Tus cuentas hoy</strong> y, al final, cuánto quieres ahorrar al mes y tu colchón.
            </span>
          </li>
        </ol>
        <button type="button" className="boton caja-boton-grande" onClick={() => ir(1)}>
          {empezado ? "Seguir donde lo dejé" : "Empezar"}
          <Icono n="derecha" tam={18} />
        </button>
        <p className="caja-privado">
          <Icono n="escudo" tam={16} /> No te pedimos números de cuenta, de tarjeta ni cédula: basta un nombre que reconozcas.
        </p>
        <p className="chico tenue">Toma unos 3 minutos. Todo se puede cambiar después en Configuración.</p>
      </section>
    );
  }

  const filaConcepto = (lista: "ingresos" | "gastos", g: FilaConcepto, i: number) => {
    const ingreso = lista === "ingresos";
    const mes = alMes(g.monto, g.dias);
    const tipos = ingreso ? TIPOS_DE_INGRESO : TIPOS_DE_GASTO;
    const id = `as-${lista}-${g.k}`;
    return (
      <li key={g.k} className="caja-fila">
        <div className="caja-fila-cabeza">
          <span className={`caja-fila-icono ${ingreso ? "ingreso" : "gasto"}`} aria-hidden="true">
            <Icono n={ingreso ? "ingreso" : "gasto"} />
          </span>
          <span className="caja-fila-titulo">{g.nombre || `${ingreso ? "Ingreso" : "Gasto"} ${i + 1}`}</span>
          <button type="button" className="caja-quitar" onClick={() => quitar(lista, i)} aria-label={`Quitar ${g.nombre || `${ingreso ? "ingreso" : "gasto"} ${i + 1}`}`}>
            <Icono n="cerrar" tam={18} />
          </button>
        </div>
        <div className="caja-fila-campos">
          <div className="caja-campo">
            <label htmlFor={`${id}-n`}>Nombre</label>
            <input id={`${id}-n`} value={g.nombre} maxLength={120} placeholder={ingreso ? "Ej.: Sueldo" : "Ej.: Alquiler"} autoComplete="off" onChange={(e) => cambiar(lista, i, { nombre: e.target.value })} />
          </div>
          <div className="caja-campo">
            <label htmlFor={`${id}-t`}>Tipo</label>
            <select id={`${id}-t`} value={g.tipo} onChange={(e) => cambiar(lista, i, { tipo: e.target.value as TipoCategoria })} title={AYUDA_TIPO_CATEGORIA[g.tipo]}>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {NOMBRE_TIPO_CATEGORIA_UNO[t]}
                </option>
              ))}
            </select>
          </div>
          <Monto
            id={`${id}-m`}
            valor={g.monto}
            cambiar={(v) => cambiar(lista, i, { monto: v })}
            etiqueta={g.dias.trim() ? "¿Cuánto cada vez?" : "¿Cuánto al mes?"}
            ejemplo={ingreso ? "Ej.: 35,000" : "Ej.: 15,000"}
            requerido
          />
          <div className="caja-campo">
            <label htmlFor={`${id}-d`}>
              {ingreso ? "¿Qué días?" : "¿Qué día?"} <span className="tenue">(opcional)</span>
            </label>
            <input id={`${id}-d`} value={g.dias} placeholder={ingreso ? "Ej.: 15, 30" : "Ej.: 5"} autoComplete="off" onChange={(e) => cambiar(lista, i, { dias: e.target.value })} title="Con día, el calendario lo pone solo cada mes. Vacío = sin fecha fija." />
          </div>
        </div>
        {mes ? (
          <p className="caja-fila-total">
            Al mes: <strong className={`mono ${ingreso ? "sube" : ""}`}>{rd(mes)}</strong>
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <section className="panel panel-ancho caja-asistente" aria-labelledby={`${uid}-t`} onInput={() => setVezOculta(estado.vez)}>
      <div className="caja-pasos" aria-label={`Paso ${b.paso} de 4`}>
        <ol>
          {PASOS.map((p, i) => (
            <li key={p} className={i + 1 < b.paso ? "hecho" : i + 1 === b.paso ? "actual" : ""} aria-current={i + 1 === b.paso ? "step" : undefined}>
              <span className="caja-pasos-barra" aria-hidden="true" />
              <span className="caja-pasos-texto">{p}</span>
            </li>
          ))}
        </ol>
        <p className="tenue chico">
          Paso {b.paso} de 4 · {PASOS[b.paso - 1]}
        </p>
      </div>

      {b.paso === 1 ? (
        <>
          <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1} className="caja-asistente-titulo">
            ¿Qué dinero te entra cada mes?
          </h2>
          <p className="caja-asistente-sub">Tu sueldo, la quincena, tus ventas. Si llega siempre los mismos días, ponlos y el calendario lo anota solo; si no, deja el día vacío.</p>
          <div className="caja-agregar" role="group" aria-label="Agregar un ingreso">
            {EJEMPLOS_INGRESO.map((e) => (
              <button key={e.texto} type="button" className="caja-chip" onClick={() => agregar("ingresos", { nombre: e.nombre, dias: e.dias, monto: "", tipo: e.tipo })}>
                <Icono n="mas" tam={16} />
                {e.texto}
              </button>
            ))}
          </div>
          {b.ingresos.length ? <ul className="caja-filas">{b.ingresos.map((g, i) => filaConcepto("ingresos", g, i))}</ul> : <p className="caja-vacio-paso">Toca uno de los botones de arriba para anotar tu primer ingreso.</p>}
          {totalIngresos.gt(0) ? (
            <p className="caja-fila-total">
              Te entra al mes: <strong className="mono sube">{rd(totalIngresos.toString())}</strong>
            </p>
          ) : null}
        </>
      ) : null}

      {b.paso === 2 ? (
        <>
          <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1} className="caja-asistente-titulo">
            ¿En qué se te va el dinero cada mes?
          </h2>
          <p className="caja-asistente-sub">Toca para agregar y elige su tipo. Si no sabes el monto exacto, pon lo que calculas al mes. Con día fijo, el calendario lo pone solo.</p>
          <ul className="caja-tipos-explica" aria-label="Los tipos, en palabras simples">
            <li>
              <strong>Costo:</strong> lo que gastas para generar tu ingreso (mercancía, materiales).
            </li>
            <li>
              <strong>Gasto:</strong> el día a día (alquiler, comida, luz, colegio).
            </li>
            <li>
              <strong>Gasto financiero:</strong> intereses y comisiones de préstamos y tarjetas.
            </li>
          </ul>
          <div className="caja-agregar" role="group" aria-label="Agregar un costo o gasto">
            {EJEMPLOS_GASTO.map((g) => (
              <button key={g.nombre} type="button" className="caja-chip" onClick={() => agregar("gastos", { nombre: g.nombre, tipo: g.tipo, dias: g.dias, monto: "" })}>
                {g.nombre}
              </button>
            ))}
            <button type="button" className="caja-chip" onClick={() => agregar("gastos", { nombre: "", tipo: "gasto", dias: "", monto: "" })}>
              <Icono n="mas" tam={16} />
              Otro
            </button>
          </div>
          {b.gastos.length ? <ul className="caja-filas">{b.gastos.map((g, i) => filaConcepto("gastos", g, i))}</ul> : <p className="caja-vacio-paso">Toca «Alquiler», «Comida» o lo que pagues para anotarlo.</p>}
          {totalGastos.gt(0) ? (
            <p className="caja-fila-total">
              Gastas al mes: <strong className="mono">{rd(totalGastos.toString())}</strong>
            </p>
          ) : null}
        </>
      ) : null}

      {b.paso === 3 ? (
        <>
          <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1} className="caja-asistente-titulo">
            ¿Dónde tienes tu dinero hoy?
          </h2>
          <p className="caja-asistente-sub">
            {registro.length
              ? "Tus cuentas salen de tu Portafolio Financiero: elige las que mueven tu dinero del mes. Si falta alguna, agrégala abajo y queda guardada en el Portafolio."
              : "Anota cada cuenta con lo que tiene hoy (en una tarjeta, lo que debes). Quedan guardadas en tu Portafolio Financiero, en «Mis cuentas, activos y deudas»: no tendrás que escribirlas otra vez."}
          </p>
          {registro.length ? (
            <section className="caja-registro" aria-labelledby={`${uid}-reg`}>
              <h3 id={`${uid}-reg`} className="caja-registro-titulo">
                De tu Portafolio Financiero
              </h3>
              <ul className="caja-registro-lista">
                {registro.map((r) => {
                  const i = b.cuentas.findIndex((c) => c.reg === r.id);
                  const elegida = i >= 0;
                  const c = elegida ? b.cuentas[i] : null;
                  return (
                    <li key={r.id} className={`caja-registro-item${elegida ? " elegida" : ""}`}>
                      <label className="caja-registro-elegir">
                        <input
                          type="checkbox"
                          checked={elegida}
                          onChange={(e) =>
                            setB((x) => ({ ...x, cuentas: e.target.checked ? [...x.cuentas, deRegistro(r)] : x.cuentas.filter((y) => y.reg !== r.id) }))
                          }
                        />
                        <span className={`caja-fila-icono ${r.tipo}`} aria-hidden="true">
                          <Icono n={ICONO_TIPO[r.tipo]} />
                        </span>
                        <span className="caja-registro-nombre">
                          <strong>{r.nombre}</strong>
                          <span className="chico tenue">
                            {NOMBRE_TIPO_CUENTA[r.tipo]} · {esDeudaTipo(r.tipo) ? "debes" : "tiene"} <span className="mono">{rd(r.saldo)}</span>
                          </span>
                        </span>
                      </label>
                      {c && r.tipo === "tarjeta" ? (
                        <div className="caja-campo caja-registro-dia">
                          <label htmlFor={`as-r-${r.id}-d`}>
                            Día en que quieres pagarla <span className="tenue">(opcional)</span>
                          </label>
                          <input id={`as-r-${r.id}-d`} inputMode="numeric" maxLength={2} value={c.diaPago} placeholder="Ej.: 28" autoComplete="off" onChange={(e) => cambiar("cuentas", i, { diaPago: e.target.value })} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="chico tenue caja-registro-nota">El saldo de cada una se cambia en el Portafolio; lo que anotes aquí lo mueve solo.</p>
            </section>
          ) : null}
          {b.cuentas.some((c) => !c.reg) ? (
            <h3 className="caja-registro-titulo">{registro.length ? "Nuevas (se guardan en el Portafolio)" : "Tus cuentas"}</h3>
          ) : null}
          <ul className="caja-filas">
            {b.cuentas.map((c, i) => c.reg ? null : (
              <li key={c.k} className="caja-fila">
                <div className="caja-fila-cabeza">
                  <span className={`caja-fila-icono ${c.tipo}`} aria-hidden="true">
                    <Icono n={ICONO_TIPO[c.tipo]} />
                  </span>
                  <label className="sr-solo" htmlFor={`as-c-${c.k}-t`}>
                    Tipo de cuenta
                  </label>
                  <select id={`as-c-${c.k}-t`} value={c.tipo} onChange={(e) => cambiar("cuentas", i, { tipo: e.target.value as TipoCuenta })} className="caja-fila-tipo">
                    {AGREGAR_CUENTA.map((t) => (
                      <option key={t.tipo} value={t.tipo}>
                        {NOMBRE_TIPO_CUENTA[t.tipo]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="caja-quitar" onClick={() => quitar("cuentas", i)} aria-label={`Quitar ${nombreCuenta(c)}`}>
                    <Icono n="cerrar" tam={18} />
                  </button>
                </div>
                <div className="caja-fila-campos">
                  <div className="caja-campo">
                    <label htmlFor={`as-c-${c.k}-n`}>Nombre</label>
                    <input id={`as-c-${c.k}-n`} value={c.nombre} maxLength={120} placeholder={EJEMPLO_NOMBRE[c.tipo]} autoComplete="off" onChange={(e) => cambiar("cuentas", i, { nombre: e.target.value })} />
                  </div>
                  <Monto
                    id={`as-c-${c.k}-s`}
                    valor={c.saldo}
                    cambiar={(v) => cambiar("cuentas", i, { saldo: v })}
                    etiqueta={esDeudaTipo(c.tipo) ? "¿Cuánto debes hoy?" : "¿Cuánto tiene hoy?"}
                    ejemplo={esDeudaTipo(c.tipo) ? "Ej.: 12,400" : "Ej.: 25,000"}
                    requerido
                  />
                  {c.tipo === "tarjeta" ? (
                    <>
                      <Monto id={`as-c-${c.k}-l`} valor={c.limite} cambiar={(v) => cambiar("cuentas", i, { limite: v })} etiqueta="Límite" ejemplo="Ej.: 80,000" />
                      <div className="caja-campo">
                        <label htmlFor={`as-c-${c.k}-d`}>
                          Día en que quieres pagarla <span className="tenue">(opcional)</span>
                        </label>
                        <input id={`as-c-${c.k}-d`} inputMode="numeric" maxLength={2} value={c.diaPago} placeholder="Ej.: 28" autoComplete="off" onChange={(e) => cambiar("cuentas", i, { diaPago: e.target.value })} aria-describedby={`as-c-${c.k}-d-ayuda`} />
                        <p id={`as-c-${c.k}-d-ayuda`} className="caja-campo-ayuda">
                          Ese día el calendario paga todo lo que debas, desde tu banco.
                        </p>
                      </div>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="caja-agregar" role="group" aria-label="Agregar en el Portafolio">
            <span className="chico tenue">{registro.length ? "Agregar en el Portafolio:" : "Agregar:"}</span>
            {AGREGAR_CUENTA.map((t) => (
              <button
                key={t.tipo}
                type="button"
                className="caja-chip"
                onClick={() => setB((x) => ({ ...x, sig: x.sig + 1, cuentas: [...x.cuentas, { k: `a${x.sig}`, tipo: t.tipo, nombre: "", saldo: "", limite: "", diaPago: "" }] }))}
              >
                <Icono n="mas" tam={16} />
                {t.texto}
              </button>
            ))}
          </div>
          {hayFijos && b.cuentas.length ? (
            <div className="caja-fila-campos caja-cuentas-fijos">
              <div className="caja-campo">
                <label htmlFor="as-cuenta-ingresos">Tus ingresos con día fijo caen en</label>
                <select id="as-cuenta-ingresos" value={b.cuentaIngresos || noTarjeta} onChange={(e) => setB((x) => ({ ...x, cuentaIngresos: e.target.value }))}>
                  {b.cuentas.map((c) => (
                    <option key={c.k} value={c.k}>
                      {nombreCuenta(c)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="caja-campo">
                <label htmlFor="as-cuenta-gastos">Tus gastos con día fijo los pagas con</label>
                <select id="as-cuenta-gastos" value={b.cuentaGastos || noTarjeta} onChange={(e) => setB((x) => ({ ...x, cuentaGastos: e.target.value }))}>
                  {b.cuentas.map((c) => (
                    <option key={c.k} value={c.k}>
                      {nombreCuenta(c)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {b.paso === 4 ? (
        <>
          <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1} className="caja-asistente-titulo">
            ¿Cuánto quieres apartar y cuál es tu mínimo?
          </h2>
          <p className="caja-asistente-sub">Lo que apartas al mes va a tu Portafolio Financiero. El colchón es el dinero que nunca quieres bajar.</p>
          <div className="caja-colchon">
            <Monto
              id="as-ahorro"
              valor={b.ahorro}
              cambiar={(v) => setB((x) => ({ ...x, ahorro: v }))}
              etiqueta="Ahorro e inversión al mes"
              ejemplo="Ej.: 5,000"
              ayuda="Sale de lo que te sobra (tu utilidad) y es lo que el Portafolio espera recibir cada mes."
            />
            {utilidad.gt(0) && !ahorro.gt(0) ? (
              <button type="button" className="caja-chip" onClick={() => setB((x) => ({ ...x, ahorro: utilidad.div(10).round(0, Big.roundDown).toString() }))}>
                Apartar el 10 % de lo que te sobra: {rd(utilidad.div(10).round(0, Big.roundDown).toString())}
              </button>
            ) : null}
            <Monto
              id="as-colchon"
              valor={b.colchon}
              cambiar={(v) => setB((x) => ({ ...x, colchon: v }))}
              etiqueta="Tu colchón mínimo"
              ejemplo="Ej.: 10,000"
              requerido
              ayuda={
                <>
                  Si algún día tu banco más tu efectivo quedan por debajo, ese día se pinta de rojo.{" "}
                  <Ayuda que="el colchón">Es un dinero de reserva que no tocas. Muchas personas usan un mes de gastos fijos. Si no quieres colchón, escribe 0.</Ayuda>
                </>
              }
            />
            {fijosGasto.gt(0) ? (
              <button type="button" className="caja-chip" onClick={() => setB((x) => ({ ...x, colchon: fijosGasto.toFixed(2) }))}>
                Usar mis gastos fijos de un mes: {rd(fijosGasto.toString())}
              </button>
            ) : null}
          </div>
          <div className="caja-repaso" aria-label="Así queda tu mes">
            <h3>Así queda tu mes</h3>
            <dl>
              <div>
                <dt>Te entra</dt>
                <dd className="mono sube">{totalIngresos.gt(0) ? rd(totalIngresos.toString()) : "nada anotado"}</dd>
              </div>
              <div>
                <dt>− Costos y gastos</dt>
                <dd className="mono">{totalGastos.gt(0) ? rd(totalGastos.toString()) : "nada anotado"}</dd>
              </div>
              <div className="total">
                <dt>= Utilidad neta</dt>
                <dd className={`mono ${utilidad.lt(0) ? "baja" : ""}`}>{rd(utilidad.toString())}</dd>
              </div>
              <div>
                <dt>− Ahorro e inversión</dt>
                <dd className="mono">{rd(ahorro.toString())}</dd>
              </div>
              <div className="total">
                <dt>= Te queda disponible</dt>
                <dd className={`mono ${utilidad.minus(ahorro).lt(0) ? "baja" : ""}`}>{rd(utilidad.minus(ahorro).toString())}</dd>
              </div>
              <div>
                <dt>Cuentas</dt>
                <dd>{b.cuentas.length ? b.cuentas.map(nombreCuenta).join(", ") : "ninguna"}</dd>
              </div>
            </dl>
          </div>
        </>
      ) : null}

      <div aria-live="polite">
        {aviso ? (
          <p className="caja-error" role="alert">
            {aviso}
          </p>
        ) : null}
        {estado.mensaje && estado.vez !== vezOculta ? (
          <p className={estado.ok ? "caja-exito" : "caja-error"} role={estado.ok ? "status" : "alert"}>
            {estado.mensaje}
          </p>
        ) : null}
      </div>

      <div className="caja-asistente-pie">
        <button type="button" className="boton secundario caja-boton-grande" onClick={() => ir(b.paso - 1)} disabled={pendiente}>
          <Icono n="izquierda" tam={18} />
          Atrás
        </button>
        {b.paso < 4 ? (
          <button type="button" className="boton caja-boton-grande" onClick={siguiente}>
            {(b.paso === 1 && !b.ingresos.length) || (b.paso === 2 && !b.gastos.length) ? "Saltar este paso" : "Siguiente"}
            <Icono n="derecha" tam={18} />
          </button>
        ) : (
          <button type="button" className="boton caja-boton-grande" onClick={terminar} disabled={pendiente}>
            {pendiente ? "Creando…" : "Crear mi presupuesto"}
            {pendiente ? null : <Icono n="check" tam={18} />}
          </button>
        )}
      </div>
    </section>
  );
}
