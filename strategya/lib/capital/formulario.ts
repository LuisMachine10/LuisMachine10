// Lectura de formularios de Mena Capital (puro, sin Next): convierte lo que escribe Mena en los
// objetos que validan lib/capital/validar.ts. Los porcentajes se escriben en % y se guardan como fracción.

import { Big } from "./decimal";
import { esMes } from "./fechas";
import {
  type Cierre,
  cierreVacio,
  type Dec,
  IDS_CLASE,
  LISTAS_PRESUPUESTO,
  type ListaPresupuesto,
  type Parametros,
} from "./tipos";

export type Campos = Record<string, string>;

export function camposDe(form: { entries(): IterableIterator<[string, FormDataEntryValue]> }): Campos {
  const c: Campos = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") c[k] = v;
  return c;
}

/** "1,234.50" → "1234.50"; "" → "". No valida: eso lo hace validar.decimal(). */
export function numeroForm(s: string | undefined): string {
  return (s ?? "").replace(/[\s,]/g, "").replace(/^RD\$|^US\$/i, "");
}

/** "4.5" (%) → "0.045". Vacío → "". Si no es número, se devuelve tal cual para que el validador lo rechace. */
export function pctForm(s: string | undefined): string {
  const t = numeroForm(s);
  if (!t) return "";
  try {
    return new Big(t).div(100).toFixed();
  } catch {
    return t;
  }
}

/** Fracción → texto en % para mostrar en un input: "0.045" → "4.5". */
export function aPct(d: Dec | null | undefined): string {
  if (d === null || d === undefined || d === "") return "";
  return new Big(d).times(100).toFixed();
}

export function nuevoId(prefijo: string): string {
  const azar = globalThis.crypto?.randomUUID?.().replace(/-/g, "").slice(0, 10) ?? Math.random().toString(36).slice(2, 12);
  return `${prefijo}-${azar}`;
}

/** Filas numeradas de un formulario: lista.0.campo, lista.1.campo… */
export function filas(c: Campos, lista: string): Record<string, string>[] {
  const out: Record<number, Record<string, string>> = {};
  const re = new RegExp(`^${lista}\\.(\\d+)\\.(\\w+)$`);
  for (const [k, v] of Object.entries(c)) {
    const m = re.exec(k);
    if (m) (out[Number(m[1])] ??= {})[m[2]] = v;
  }
  return Object.keys(out)
    .map(Number)
    .sort((a, b) => a - b)
    .map((i) => out[i]);
}

export const SECCIONES_PARAMETROS = ["fx", "asignacion", "tarjetas", "presupuesto", "escenarios", "generales", "umbrales", "planClases"] as const;
export type SeccionParametros = (typeof SECCIONES_PARAMETROS)[number];

/**
 * Mezcla una sección del formulario con los parámetros guardados. Devuelve el objeto CRUDO (sin
 * validar): la acción lo pasa por validarParametros(), que rechaza lo que no sea número.
 */
export function mezclarParametros(actual: Parametros, seccion: SeccionParametros, c: Campos): Record<string, unknown> {
  const p = structuredClone(actual) as unknown as Record<string, unknown>;
  if (seccion === "fx") {
    p.fx = { USD: numeroForm(c["fx.USD"]) || null, EUR: numeroForm(c["fx.EUR"]) || null };
    p.fxUpdated = c.fxUpdated || null;
  } else if (seccion === "asignacion") {
    p.metaAsignacion = Object.fromEntries(IDS_CLASE.map((k) => [k, pctForm(c[`meta.${k}`]) || "0"]));
    p.bandaRebalanceo = pctForm(c.bandaRebalanceo) || "0";
    p.maxEmisor = pctForm(c.maxEmisor) || "0";
    // La pestaña Política también escribe los meses de gasto que deben estar en efectivo.
    if (c.metaFondo !== undefined) p.metaFondo = numeroForm(c.metaFondo) || "0";
  } else if (seccion === "tarjetas") {
    p.tarjetas = filas(c, "tarjetas")
      .filter((f) => (f.nombre ?? "").trim())
      .map((f) => ({ id: f.id || nuevoId("tc"), nombre: f.nombre, limite: numeroForm(f.limite) || "0" }));
  } else if (seccion === "presupuesto") {
    for (const l of LISTAS_PRESUPUESTO) {
      p[l] = filas(c, l)
        .filter((f) => (f.nombre ?? "").trim())
        .map((f) => ({ id: f.id || nuevoId(l.slice(0, 2)), nombre: f.nombre, pres: numeroForm(f.pres) || "0" }));
    }
  } else if (seccion === "escenarios") {
    p.escenarios = filas(c, "escenarios")
      .filter((f) => (f.nom ?? "").trim())
      .map((f) => ({
        id: f.id || nuevoId("esc"),
        nom: f.nom,
        retorno: pctForm(f.retorno) || "0",
        inflacion: pctForm(f.inflacion) || "0",
        deprecFX: pctForm(f.deprecFX) || "0",
        aporte: numeroForm(f.aporte) || "0",
      }));
  } else if (seccion === "umbrales") {
    // Meses en número; los demás se escriben en %.
    p.umbrales = {
      colchonMeses: numeroForm(c["u.colchonMeses"]) || "6",
      maxInstrumento: pctForm(c["u.maxInstrumento"]) || "0.25",
      maxEmisor: pctForm(c["u.maxEmisor"]) || "0.4",
      dolarMin: pctForm(c["u.dolarMin"]) || "0",
      dolarMax: pctForm(c["u.dolarMax"]) || "1",
      sobreGasto: pctForm(c["u.sobreGasto"]) || "0.1",
      deudaTarjetas: pctForm(c["u.deudaTarjetas"]) || "0.3",
    };
  } else if (seccion === "planClases") {
    p.planClases = c.planClases === "meta" ? null : Object.fromEntries(IDS_CLASE.map((k) => [k, pctForm(c[`plan.${k}`]) || "0"]));
  } else if (seccion === "generales") {
    p.horizonte = numeroForm(c.horizonte) || "0";
    p.incrAporteAnual = pctForm(c.incrAporteAnual) || "0";
    p.tasaRetiro = pctForm(c.tasaRetiro) || "0";
    p.inflacion = pctForm(c.inflacion) || "0";
    p.retornoObjetivo = pctForm(c.retornoObjetivo) || "0";
    p.metaFondo = numeroForm(c.metaFondo) || "0";
    p.metaAhorro = pctForm(c.metaAhorro) || "0";
    p.metaUsoTC = pctForm(c.metaUsoTC) || "0";
    p.aporteMensual = numeroForm(c.aporteMensual) || "0";
  }
  return p;
}

/** Activo crudo desde el formulario (tasa en %). */
export function activoDeFormulario(c: Campos): Record<string, unknown> {
  return {
    id: c.id || nuevoId("a"),
    clase: c.clase,
    nombre: c.nombre,
    inst: c.inst ?? "",
    simbolo: c.simbolo ?? "",
    moneda: c.moneda,
    cantidad: numeroForm(c.cantidad),
    precio: numeroForm(c.precio),
    tasa: pctForm(c.tasa),
    venc: c.venc ?? "",
    tipoRF: c.tipoRF || null,
  };
}

/**
 * Instrumento nuevo desde el formulario simple de Cartera. Dos formas de escribir el valor:
 *   · modo «monto»: un saldo (cantidad = monto, precio = 1)
 *   · modo «unidades»: cantidad × precio unitario
 * La fecha (opcional) registra la compra en el libro de transacciones con esa cantidad y precio.
 */
export function instrumentoDeFormulario(c: Campos): { activo: Record<string, unknown>; compra: { fecha: string; cantidad: string; precio: string } | null } {
  const unidades = c.modo === "unidades";
  const cantidad = unidades ? numeroForm(c.cantidad) : numeroForm(c.monto);
  const precio = unidades ? numeroForm(c.precio) || "1" : "1";
  // Lo que no aplica a la clase elegida no se guarda (el formulario lo oculta, pero el navegador lo envía).
  const activo = activoDeFormulario({
    ...c,
    id: "",
    cantidad,
    precio,
    simbolo: c.clase === "rentavariable" ? (c.simbolo ?? "") : "",
    venc: c.clase === "rentafija" ? (c.venc ?? "") : "",
    tipoRF: c.clase === "rentafija" ? (c.tipoRF ?? "") : "",
  });
  const fecha = (c.fecha ?? "").trim();
  return { activo, compra: fecha ? { fecha, cantidad, precio } : null };
}

export type ModoCierre = "guardar" | "cerrar" | `presupuesto:${ListaPresupuesto}` | `limpiar:${ListaPresupuesto}`;

export function modoCierre(s: string | undefined): ModoCierre {
  if (s === "cerrar") return "cerrar";
  const m = /^(presupuesto|limpiar):(ingresos|fijos|variables|aportes)$/.exec(s ?? "");
  return m ? (`${m[1]}:${m[2]}` as ModoCierre) : "guardar";
}

/**
 * Cierre crudo desde el formulario, encima del guardado (se conservan la foto y el estado).
 * Solo cuentan las partidas y tarjetas vigentes en los parámetros.
 */
export function cierreDeFormulario(p: Parametros, guardado: Cierre | null, c: Campos, modo: ModoCierre): Record<string, unknown> {
  const base = guardado ?? cierreVacio();
  const salida: Record<string, unknown> = { ...structuredClone(base), agregado: false };
  for (const l of LISTAS_PRESUPUESTO) {
    const montos: Record<string, string | null> = {};
    for (const i of p[l]) {
      const v = numeroForm(c[`${l}.${i.id}`]);
      montos[i.id] = v === "" ? null : v;
    }
    if (modo === `presupuesto:${l}`) for (const i of p[l]) montos[i.id] = i.pres;
    if (modo === `limpiar:${l}`) for (const i of p[l]) montos[i.id] = null;
    salida[l] = montos;
  }
  const tarjetas: Record<string, { uso: string | null; full: boolean }> = {};
  for (const t of p.tarjetas) {
    const uso = numeroForm(c[`tarjetas.${t.id}.uso`]);
    tarjetas[t.id] = { uso: uso === "" ? null : uso, full: c[`tarjetas.${t.id}.full`] === "on" };
  }
  salida.tarjetas = tarjetas;
  const deuda = (k: string) => {
    const v = numeroForm(c[`deudas.${k}`]);
    return v === "" ? null : v;
  };
  salida.deudas = { tc: deuda("tc"), prestamos: deuda("prestamos"), otras: deuda("otras") };
  salida.nota = (c.nota ?? "").trim() || null;
  return salida;
}

/** Convierte un mes agregado en desglose prorrateado por presupuesto (como el artefacto). */
export function desagregar(p: Parametros, c: Cierre): Cierre {
  const conv = (l: ListaPresupuesto, tot: Dec | null): Record<string, Dec | null> => {
    const lista = p[l];
    const base = lista.reduce((s, i) => s.plus(i.pres || "0"), new Big(0));
    return Object.fromEntries(
      lista.map((i) => [i.id, base.gt(0) ? new Big(i.pres || "0").div(base).times(tot || "0").round(2, Big.roundHalfUp).toFixed() : "0"]),
    );
  };
  return {
    ...cierreVacio(),
    ingresos: conv("ingresos", c.totIngresos),
    fijos: conv("fijos", c.totFijos),
    variables: conv("variables", c.totVariables),
    aportes: conv("aportes", c.totAportes),
    tarjetas: c.tarjetas,
    deudas: c.deudas,
    snap: c.snap,
    cerrado: c.cerrado,
    nota: `${c.nota ? `${c.nota} ` : ""}Desglose prorrateado desde el agregado histórico.`,
  };
}

/** Mes de la URL (?mes=AAAA-MM) o el actual. */
export function mesDeParametro(v: string | string[] | undefined, hoy: string): string {
  const s = Array.isArray(v) ? v[0] : v;
  return esMes(s) ? s! : hoy.slice(0, 7);
}

/** Ruta de vuelta segura (solo dentro de /capital). */
export function rutaSegura(v: string | undefined): string {
  return v && /^\/capital(\/(cierre|cartera|analisis|futuro|ips|importar|cuentas|ajustes))?$/.test(v) ? v : "/capital";
}
