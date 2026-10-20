"use client";

// Asistente de bienvenida: cuando la caja está vacía, guía en 4 pasos (cuentas, ingresos fijos,
// gastos fijos y colchón) y al final guarda todo de una vez. El borrador se recuerda en este
// navegador mientras se llena (si el navegador lo permite).

import Big from "big.js";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { crearCajaDesdeAsistente, type EstadoAccion } from "@/app/caja/acciones";
import { totalMensual } from "@/lib/caja/asistente";
import { rd } from "@/lib/caja/formato";
import { NOMBRE_TIPO_CUENTA, type TipoCuenta } from "@/lib/caja/tipos";
import { montoDeTexto } from "@/lib/caja/validar";
import { Ayuda, Icono, type NombreIcono } from "./Iconos";

interface FilaCuenta {
  k: string;
  tipo: TipoCuenta;
  nombre: string;
  saldo: string;
  limite: string;
  diaPago: string;
}
interface FilaIngreso {
  nombre: string;
  monto: string;
  dias: string;
  cuenta: string; // k de la cuenta
}
interface FilaGasto {
  nombre: string;
  monto: string;
  dia: string;
  cuenta: string;
}
interface Borrador {
  paso: number;
  sig: number;
  cuentas: FilaCuenta[];
  ingresos: FilaIngreso[];
  gastos: FilaGasto[];
  colchon: string;
}

const CLAVE = "strategya-caja-asistente-v1";
const INICIAL: EstadoAccion = { ok: false, mensaje: null, vez: 0 };
const NUEVO: Borrador = {
  paso: 0,
  sig: 2,
  cuentas: [{ k: "a1", tipo: "banco", nombre: "", saldo: "", limite: "", diaPago: "" }],
  ingresos: [],
  gastos: [],
  colchon: "",
};

const PASOS = ["Tus cuentas", "Lo que te entra", "Lo que pagas fijo", "Tu colchón"] as const;
const ICONO_TIPO: Record<TipoCuenta, NombreIcono> = { banco: "banco", efectivo: "efectivo", ahorro: "ahorro", tarjeta: "tarjeta" };
const EJEMPLO_NOMBRE: Record<TipoCuenta, string> = { banco: "Ej.: Banco Popular", efectivo: "Ej.: Cartera", ahorro: "Ej.: Ahorro APAP", tarjeta: "Ej.: Visa" };
const AGREGAR_CUENTA: { tipo: TipoCuenta; texto: string }[] = [
  { tipo: "banco", texto: "Banco" },
  { tipo: "efectivo", texto: "Efectivo" },
  { tipo: "ahorro", texto: "Ahorro" },
  { tipo: "tarjeta", texto: "Tarjeta de crédito" },
];
const EJEMPLOS_INGRESO: { texto: string; nombre: string; dias: string }[] = [
  { texto: "Quincena (15 y 30)", nombre: "Quincena", dias: "15, 30" },
  { texto: "Sueldo mensual", nombre: "Sueldo", dias: "30" },
  { texto: "Otro ingreso", nombre: "", dias: "" },
];
const EJEMPLOS_GASTO = ["Alquiler", "Préstamo", "Luz", "Agua", "Internet", "Teléfono", "Colegio", "Seguro"];

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
function sumar(montos: (string | null)[]): string {
  let s = new Big(0);
  for (const m of montos) {
    try {
      const v = m == null ? null : montoDeTexto(m);
      if (v) s = s.plus(v);
    } catch {
      // aún no es un número: no suma
    }
  }
  return s.toString();
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

export function AsistenteCaja() {
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
    if (previo) setB(previo);
    setListo(true);
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

  const noTarjetas = b.cuentas.filter((c) => c.tipo !== "tarjeta");
  const cuentaPorDefecto = noTarjetas[0]?.k ?? b.cuentas[0]?.k ?? "";
  const nombreCuenta = (c: FilaCuenta) => c.nombre || `${NOMBRE_TIPO_CUENTA[c.tipo]} sin nombre`;
  const totalIngresos = sumar(b.ingresos.map((g) => totalMensual(g.monto, g.dias)));
  const totalGastos = sumar(b.gastos.map((g) => g.monto));

  const siguiente = () => {
    if (b.paso === 1) {
      const falta = b.cuentas.findIndex((c) => !c.nombre.trim() || !c.saldo.trim());
      if (!b.cuentas.length) return setAviso("Agrega al menos una cuenta: toca «Banco» o «Efectivo» arriba.");
      if (falta >= 0) {
        const c = b.cuentas[falta];
        return setAviso(!c.nombre.trim() ? `A la cuenta ${falta + 1} le falta un nombre que reconozcas.` : `Escribe cuánto ${c.tipo === "tarjeta" ? "debes hoy en" : "tiene hoy"} «${c.nombre}» (si es nada, escribe 0).`);
      }
    }
    ir(b.paso + 1);
  };

  const terminar = () => {
    const indice = (k: string) => String(Math.max(0, b.cuentas.findIndex((c) => c.k === k)));
    const datos = {
      cuentas: b.cuentas.map(({ tipo, nombre, saldo, limite, diaPago }) => ({ tipo, nombre, saldo, limite, diaPago })),
      ingresos: b.ingresos.map((g) => ({ ...g, cuenta: indice(g.cuenta) })),
      gastos: b.gastos.map((g) => ({ ...g, cuenta: indice(g.cuenta) })),
      colchon: b.colchon,
    };
    const f = new FormData();
    f.set("datos", JSON.stringify(datos));
    startTransition(() => enviar(f));
  };

  if (b.paso === 0) {
    return (
      <section className="panel panel-ancho caja-asistente caja-bienvenida" aria-labelledby={`${uid}-t`}>
        <div className="caja-bienvenida-icono" aria-hidden="true">
          <Icono n="calendario" tam={28} />
        </div>
        <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1}>
          Bienvenido a tu calendario de caja
        </h2>
        <p className="caja-bienvenida-sub">Aquí ves, día por día, cuánto dinero vas a tener y cuánto puedes gastar sin quedarte corto.</p>
        <ol className="caja-como">
          <li>
            <span className="caja-como-num">1</span>
            <span>
              <strong>Anotas tus cuentas</strong> y lo que tienen hoy.
            </span>
          </li>
          <li>
            <span className="caja-como-num">2</span>
            <span>
              <strong>Anotas lo fijo:</strong> tu sueldo y lo que pagas cada mes.
            </span>
          </li>
          <li>
            <span className="caja-como-num">3</span>
            <span>
              <strong>El calendario hace la cuenta</strong> de cada día y te avisa en rojo si vas a bajar de tu mínimo.
            </span>
          </li>
        </ol>
        <button type="button" className="boton caja-boton-grande" onClick={() => ir(1)}>
          {b.cuentas.some((c) => c.nombre) ? "Seguir donde lo dejé" : "Empezar"}
          <Icono n="derecha" tam={18} />
        </button>
        <p className="caja-privado">
          <Icono n="escudo" tam={16} /> No te pedimos números de cuenta, de tarjeta ni cédula: basta un nombre que reconozcas.
        </p>
        <p className="chico tenue">Toma unos 3 minutos. Todo se puede cambiar después en Ajustes.</p>
      </section>
    );
  }

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
            ¿Dónde tienes tu dinero hoy?
          </h2>
          <p className="caja-asistente-sub">Anota cada cuenta con lo que tiene ahora mismo. Si usas tarjeta de crédito, anota lo que debes.</p>
          <ul className="caja-filas">
            {b.cuentas.map((c, i) => (
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
                    etiqueta={c.tipo === "tarjeta" ? "¿Cuánto debes hoy?" : "¿Cuánto tiene hoy?"}
                    ejemplo={c.tipo === "tarjeta" ? "Ej.: 12,400" : "Ej.: 25,000"}
                    requerido
                  />
                  {c.tipo === "tarjeta" ? (
                    <>
                      <Monto id={`as-c-${c.k}-l`} valor={c.limite} cambiar={(v) => cambiar("cuentas", i, { limite: v })} etiqueta="Límite" ejemplo="Ej.: 80,000" />
                      <div className="caja-campo">
                        <label htmlFor={`as-c-${c.k}-d`}>
                          Día en que la pagas <span className="tenue">(opcional)</span>
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
          <div className="caja-agregar" role="group" aria-label="Agregar otra cuenta">
            <span className="chico tenue">Agregar:</span>
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
        </>
      ) : null}

      {b.paso === 2 ? (
        <>
          <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1} className="caja-asistente-titulo">
            ¿Qué dinero te entra fijo cada mes?
          </h2>
          <p className="caja-asistente-sub">Tu sueldo, la quincena o cualquier pago que llega siempre los mismos días. Si no tienes, sigue al próximo paso.</p>
          <div className="caja-agregar" role="group" aria-label="Agregar un ingreso">
            {EJEMPLOS_INGRESO.map((e) => (
              <button key={e.texto} type="button" className="caja-chip" onClick={() => setB((x) => ({ ...x, ingresos: [...x.ingresos, { nombre: e.nombre, dias: e.dias, monto: "", cuenta: cuentaPorDefecto }] }))}>
                <Icono n="mas" tam={16} />
                {e.texto}
              </button>
            ))}
          </div>
          {b.ingresos.length ? (
            <ul className="caja-filas">
              {b.ingresos.map((g, i) => {
                const mes = totalMensual(g.monto, g.dias);
                return (
                  <li key={i} className="caja-fila">
                    <div className="caja-fila-cabeza">
                      <span className="caja-fila-icono ingreso" aria-hidden="true">
                        <Icono n="ingreso" />
                      </span>
                      <span className="caja-fila-titulo">{g.nombre || `Ingreso ${i + 1}`}</span>
                      <button type="button" className="caja-quitar" onClick={() => quitar("ingresos", i)} aria-label={`Quitar ${g.nombre || `ingreso ${i + 1}`}`}>
                        <Icono n="cerrar" tam={18} />
                      </button>
                    </div>
                    <div className="caja-fila-campos">
                      <div className="caja-campo">
                        <label htmlFor={`as-ingreso-${i}-n`}>Nombre</label>
                        <input id={`as-ingreso-${i}-n`} value={g.nombre} maxLength={120} placeholder="Ej.: Sueldo" autoComplete="off" onChange={(e) => cambiar("ingresos", i, { nombre: e.target.value })} />
                      </div>
                      <Monto id={`as-ingreso-${i}-m`} valor={g.monto} cambiar={(v) => cambiar("ingresos", i, { monto: v })} etiqueta="¿Cuánto recibes cada vez?" ejemplo="Ej.: 35,000" requerido />
                      <div className="caja-campo">
                        <label htmlFor={`as-ingreso-${i}-d`}>¿Qué días del mes?</label>
                        <input id={`as-ingreso-${i}-d`} value={g.dias} placeholder="Ej.: 15, 30" autoComplete="off" onChange={(e) => cambiar("ingresos", i, { dias: e.target.value })} aria-describedby={`as-ingreso-${i}-d-ayuda`} />
                        <p id={`as-ingreso-${i}-d-ayuda`} className="caja-campo-ayuda">
                          Separa con coma. El 30 o 31 cae el último día en febrero.
                        </p>
                      </div>
                      <div className="caja-campo">
                        <label htmlFor={`as-ingreso-${i}-c`}>¿En qué cuenta te cae?</label>
                        <select id={`as-ingreso-${i}-c`} value={g.cuenta} onChange={(e) => cambiar("ingresos", i, { cuenta: e.target.value })}>
                          {b.cuentas.map((c) => (
                            <option key={c.k} value={c.k}>
                              {nombreCuenta(c)}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {mes ? (
                      <p className="caja-fila-total">
                        Al mes: <strong className="mono sube">{rd(mes)}</strong>
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="caja-vacio-paso">Toca uno de los botones de arriba para anotar tu primer ingreso.</p>
          )}
        </>
      ) : null}

      {b.paso === 3 ? (
        <>
          <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1} className="caja-asistente-titulo">
            ¿Qué pagas fijo cada mes?
          </h2>
          <p className="caja-asistente-sub">Alquiler, préstamo, luz, internet… Lo que pagas siempre más o menos el mismo día. Toca para agregar.</p>
          <div className="caja-agregar" role="group" aria-label="Agregar un gasto fijo">
            {EJEMPLOS_GASTO.map((n) => (
              <button key={n} type="button" className="caja-chip" onClick={() => setB((x) => ({ ...x, gastos: [...x.gastos, { nombre: n, monto: "", dia: "", cuenta: cuentaPorDefecto }] }))}>
                {n}
              </button>
            ))}
            <button type="button" className="caja-chip" onClick={() => setB((x) => ({ ...x, gastos: [...x.gastos, { nombre: "", monto: "", dia: "", cuenta: cuentaPorDefecto }] }))}>
              <Icono n="mas" tam={16} />
              Otro
            </button>
          </div>
          {b.gastos.length ? (
            <ul className="caja-filas">
              {b.gastos.map((g, i) => (
                <li key={i} className="caja-fila">
                  <div className="caja-fila-cabeza">
                    <span className="caja-fila-icono gasto" aria-hidden="true">
                      <Icono n="gasto" />
                    </span>
                    <span className="caja-fila-titulo">{g.nombre || `Gasto ${i + 1}`}</span>
                    <button type="button" className="caja-quitar" onClick={() => quitar("gastos", i)} aria-label={`Quitar ${g.nombre || `gasto ${i + 1}`}`}>
                      <Icono n="cerrar" tam={18} />
                    </button>
                  </div>
                  <div className="caja-fila-campos">
                    <div className="caja-campo">
                      <label htmlFor={`as-gasto-${i}-n`}>Nombre</label>
                      <input id={`as-gasto-${i}-n`} value={g.nombre} maxLength={120} placeholder="Ej.: Alquiler" autoComplete="off" onChange={(e) => cambiar("gastos", i, { nombre: e.target.value })} />
                    </div>
                    <Monto id={`as-gasto-${i}-m`} valor={g.monto} cambiar={(v) => cambiar("gastos", i, { monto: v })} etiqueta="¿Cuánto pagas al mes?" ejemplo="Ej.: 15,000" requerido />
                    <div className="caja-campo">
                      <label htmlFor={`as-gasto-${i}-d`}>¿Qué día del mes?</label>
                      <input id={`as-gasto-${i}-d`} inputMode="numeric" maxLength={2} value={g.dia} placeholder="Ej.: 5" autoComplete="off" onChange={(e) => cambiar("gastos", i, { dia: e.target.value })} />
                    </div>
                    <div className="caja-campo">
                      <label htmlFor={`as-gasto-${i}-c`}>¿Con qué lo pagas?</label>
                      <select id={`as-gasto-${i}-c`} value={g.cuenta} onChange={(e) => cambiar("gastos", i, { cuenta: e.target.value })}>
                        {b.cuentas.map((c) => (
                          <option key={c.k} value={c.k}>
                            {nombreCuenta(c)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="caja-vacio-paso">Toca «Alquiler», «Luz» o lo que pagues para anotarlo.</p>
          )}
          {new Big(totalGastos).gt(0) ? (
            <p className="caja-fila-total">
              Total fijo al mes: <strong className="mono baja">{rd(totalGastos)}</strong>
            </p>
          ) : null}
        </>
      ) : null}

      {b.paso === 4 ? (
        <>
          <h2 id={`${uid}-t`} ref={titulo} tabIndex={-1} className="caja-asistente-titulo">
            ¿Cuál es el mínimo que nunca quieres bajar?
            <Ayuda que="el colchón">
              Es tu «colchón»: un dinero de reserva que no tocas. Si algún día tu banco más tu efectivo quedan por debajo, ese día se
              pinta de rojo para que lo veas venir.
            </Ayuda>
          </h2>
          <p className="caja-asistente-sub">Muchas personas usan un mes de gastos fijos. Si no quieres colchón, escribe 0.</p>
          <div className="caja-colchon">
            <Monto id="as-colchon" valor={b.colchon} cambiar={(v) => setB((x) => ({ ...x, colchon: v }))} etiqueta="Tu colchón mínimo" ejemplo="Ej.: 10,000" requerido />
            {new Big(totalGastos).gt(0) ? (
              <button type="button" className="caja-chip" onClick={() => setB((x) => ({ ...x, colchon: new Big(totalGastos).toFixed(2) }))}>
                Usar mis gastos fijos de un mes: {rd(totalGastos)}
              </button>
            ) : null}
          </div>
          <div className="caja-repaso" aria-label="Repaso antes de crear">
            <h3>Repaso</h3>
            <dl>
              <div>
                <dt>Cuentas</dt>
                <dd>{b.cuentas.length ? b.cuentas.map(nombreCuenta).join(", ") : "ninguna"}</dd>
              </div>
              <div>
                <dt>Te entra al mes</dt>
                <dd className="mono">{new Big(totalIngresos).gt(0) ? rd(totalIngresos) : "nada fijo"}</dd>
              </div>
              <div>
                <dt>Pagas fijo al mes</dt>
                <dd className="mono">{new Big(totalGastos).gt(0) ? rd(totalGastos) : "nada fijo"}</dd>
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
            {b.paso === 2 && !b.ingresos.length ? "Saltar este paso" : b.paso === 3 && !b.gastos.length ? "Saltar este paso" : "Siguiente"}
            <Icono n="derecha" tam={18} />
          </button>
        ) : (
          <button type="button" className="boton caja-boton-grande" onClick={terminar} disabled={pendiente}>
            {pendiente ? "Creando…" : "Crear mi calendario"}
            {pendiente ? null : <Icono n="check" tam={18} />}
          </button>
        )}
      </div>
    </section>
  );
}
