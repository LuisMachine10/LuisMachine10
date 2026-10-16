// Validación de los datos de Mena Capital: el archivo de importación, los jsonb que vuelven de la
// base y los formularios. Todo número sale como texto decimal normalizado (sin exponente), nunca float.
//
// Se usa en tres lugares:
//   · importar (archivo JSON del artefacto) → analizarArchivo()
//   · lectura de personal.parametros / cierres / ips → leerParametros(), leerCierre(), leerIps()
//   · server actions → los mismos validadores sobre lo que llega del formulario

import { aDecimal, jsonExacto } from "../../supabase/functions/_shared/json";
import { Big } from "./decimal";
import { esFecha, esMes } from "./fechas";
import {
  type Activo,
  type Cierre,
  type Cierres,
  type Dec,
  type Escenario,
  type Foto,
  type Ips,
  IDS_CLASE,
  type Clase,
  ipsVacia,
  LISTAS_PRESUPUESTO,
  MONEDAS,
  type Moneda,
  type Parametros,
  type Partida,
  parametrosVacios,
  SECCIONES_IPS,
  type Tarjeta,
  TIPOS_TX,
  type TipoTx,
  type Transaccion,
  type UsoTarjeta,
} from "./tipos";

export class Registro {
  readonly errores: string[] = [];
  readonly avisos: string[] = [];
  error(ruta: string, msg: string) {
    if (this.errores.length < 200) this.errores.push(`${ruta}: ${msg}`);
  }
  aviso(ruta: string, msg: string) {
    if (this.avisos.length < 200) this.avisos.push(`${ruta}: ${msg}`);
  }
  get ok() {
    return this.errores.length === 0;
  }
}

type Obj = Record<string, unknown>;

export function esObjeto(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export const RE_SIMBOLO = /^[A-Z0-9][A-Z0-9.\-]{0,14}$/;
const RE_ID = /^[\w.\-:]{1,80}$/;

/** Número (o texto numérico) → decimal normalizado. "" y null → null si se permite. */
export function decimal(
  v: unknown,
  ruta: string,
  r: Registro,
  op: { nulo?: boolean; min?: string; max?: string; defecto?: Dec } = {},
): Dec | null {
  if (v === undefined || v === null || (typeof v === "string" && v.trim() === "")) {
    if (op.defecto !== undefined) return op.defecto;
    if (op.nulo) return null;
    r.error(ruta, "falta el número");
    return null;
  }
  if (typeof v !== "string" && typeof v !== "number") {
    r.error(ruta, `no es un número (${typeof v})`);
    return null;
  }
  const d = aDecimal(typeof v === "number" ? String(v) : v.trim());
  if (d === null) {
    r.error(ruta, `«${String(v).slice(0, 40)}» no es un número`);
    return null;
  }
  if (op.min !== undefined && new Big(d).lt(op.min)) {
    r.error(ruta, `debe ser ≥ ${op.min}`);
    return null;
  }
  if (op.max !== undefined && new Big(d).gt(op.max)) {
    r.error(ruta, `debe ser ≤ ${op.max}`);
    return null;
  }
  return d;
}

export function texto(v: unknown, ruta: string, r: Registro, op: { max?: number; vacio?: boolean; defecto?: string } = {}): string {
  const max = op.max ?? 200;
  if (v === undefined || v === null) {
    if (op.defecto !== undefined) return op.defecto;
    if (op.vacio) return "";
    r.error(ruta, "falta el texto");
    return "";
  }
  if (typeof v !== "string" && typeof v !== "number") {
    r.error(ruta, "no es texto");
    return "";
  }
  const s = String(v).trim();
  if (!s && !op.vacio && op.defecto === undefined) {
    r.error(ruta, "está vacío");
    return "";
  }
  if (s.length > max) {
    r.error(ruta, `tiene más de ${max} caracteres`);
    return s.slice(0, max);
  }
  return s;
}

function identificador(v: unknown, ruta: string, r: Registro): string {
  const s = texto(v, ruta, r, { max: 80 });
  if (s && !RE_ID.test(s)) r.error(ruta, `identificador inválido «${s}» (letras, números, . _ - :)`);
  return s;
}

export function fecha(v: unknown, ruta: string, r: Registro): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (!esFecha(v)) {
    r.error(ruta, `fecha inválida «${String(v).slice(0, 20)}» (se espera AAAA-MM-DD)`);
    return null;
  }
  return v;
}

function booleano(v: unknown, ruta: string, r: Registro, defecto: boolean): boolean {
  if (v === undefined || v === null) return defecto;
  if (typeof v === "boolean") return v;
  r.error(ruta, "debe ser true o false");
  return defecto;
}

function idsUnicos<T extends { id: string }>(lista: T[], ruta: string, r: Registro) {
  const vistos = new Set<string>();
  for (const x of lista) {
    if (vistos.has(x.id)) r.error(ruta, `id repetido «${x.id}»`);
    vistos.add(x.id);
  }
}

function arreglo(v: unknown, ruta: string, r: Registro, max: number): unknown[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) {
    r.error(ruta, "debe ser una lista");
    return [];
  }
  if (v.length > max) {
    r.error(ruta, `tiene ${v.length} elementos (máximo ${max})`);
    return v.slice(0, max);
  }
  return v;
}

// ─────────────────────────────── Parámetros ───────────────────────────────

function partidas(v: unknown, ruta: string, r: Registro): Partida[] {
  const lista = arreglo(v, ruta, r, 100).map((x, i) => {
    const q = `${ruta}[${i}]`;
    if (!esObjeto(x)) {
      r.error(q, "debe ser un objeto {id, nombre, pres}");
      return null;
    }
    return { id: identificador(x.id, `${q}.id`, r), nombre: texto(x.nombre, `${q}.nombre`, r), pres: decimal(x.pres, `${q}.pres`, r, { defecto: "0" })! };
  });
  const ok = lista.filter((x): x is Partida => x !== null);
  idsUnicos(ok, ruta, r);
  return ok;
}

function tarjetas(v: unknown, ruta: string, r: Registro): Tarjeta[] {
  const ok = arreglo(v, ruta, r, 30)
    .map((x, i) => {
      const q = `${ruta}[${i}]`;
      if (!esObjeto(x)) {
        r.error(q, "debe ser un objeto {id, nombre, limite}");
        return null;
      }
      return { id: identificador(x.id, `${q}.id`, r), nombre: texto(x.nombre, `${q}.nombre`, r), limite: decimal(x.limite, `${q}.limite`, r, { defecto: "0", min: "0" })! };
    })
    .filter((x): x is Tarjeta => x !== null);
  idsUnicos(ok, ruta, r);
  return ok;
}

function escenariosDe(v: unknown, ruta: string, r: Registro): Escenario[] {
  const ok = arreglo(v, ruta, r, 10)
    .map((x, i) => {
      const q = `${ruta}[${i}]`;
      if (!esObjeto(x)) {
        r.error(q, "debe ser un objeto");
        return null;
      }
      return {
        id: identificador(x.id, `${q}.id`, r),
        nom: texto(x.nom, `${q}.nom`, r),
        retorno: decimal(x.retorno, `${q}.retorno`, r, { defecto: "0", min: "-0.95", max: "10" })!,
        inflacion: decimal(x.inflacion, `${q}.inflacion`, r, { defecto: "0", min: "-0.5", max: "10" })!,
        deprecFX: decimal(x.deprecFX, `${q}.deprecFX`, r, { defecto: "0", min: "-1", max: "10" })!,
        aporte: decimal(x.aporte, `${q}.aporte`, r, { defecto: "0" })!,
      };
    })
    .filter((x): x is Escenario => x !== null);
  idsUnicos(ok, ruta, r);
  return ok;
}

const CLAVES_PARAMETROS = [
  "fx", "fxUpdated", "inflacion", "tasaRetiro", "aporteMensual", "retornoObjetivo", "incrAporteAnual",
  "horizonte", "metaFondo", "metaAhorro", "metaUsoTC", "metaAsignacion", "bandaRebalanceo", "maxEmisor",
  "escenarios", "tarjetas", "ingresos", "fijos", "variables", "aportes",
] as const;

const TASAS_PARAMETROS = ["inflacion", "tasaRetiro", "retornoObjetivo", "incrAporteAnual", "metaAhorro", "metaUsoTC", "bandaRebalanceo", "maxEmisor"] as const;

/** Valida un objeto P. Las claves que falten quedan con el valor neutro (y se avisa si `avisarFaltantes`). */
export function validarParametros(v: unknown, r: Registro, ruta = "parametros", avisarFaltantes = true): Parametros {
  const p = parametrosVacios();
  if (!esObjeto(v)) {
    r.error(ruta, "debe ser un objeto");
    return p;
  }
  const faltan = CLAVES_PARAMETROS.filter((k) => !(k in v));
  if (avisarFaltantes && faltan.length) r.aviso(ruta, `no trae ${faltan.join(", ")}: quedan sin configurar`);
  const extra = Object.keys(v).filter((k) => !(CLAVES_PARAMETROS as readonly string[]).includes(k));
  if (extra.length) r.aviso(ruta, `claves ignoradas: ${extra.join(", ")}`);

  if (v.fx !== undefined) {
    if (!esObjeto(v.fx)) r.error(`${ruta}.fx`, "debe ser un objeto {USD, EUR}");
    else {
      for (const m of ["USD", "EUR"] as const) {
        const d = decimal(v.fx[m], `${ruta}.fx.${m}`, r, { nulo: true, min: "0" });
        p.fx[m] = d !== null && new Big(d).gt(0) ? d : null;
      }
      if (v.fx.DOP !== undefined && aDecimal(v.fx.DOP) !== "1") r.aviso(`${ruta}.fx.DOP`, "se ignora: el peso siempre vale 1");
    }
  }
  if (v.fxUpdated !== undefined) p.fxUpdated = fecha(v.fxUpdated, `${ruta}.fxUpdated`, r);
  for (const k of TASAS_PARAMETROS) if (v[k] !== undefined) p[k] = decimal(v[k], `${ruta}.${k}`, r, { defecto: "0", min: "-1", max: "10" })!;
  if (v.aporteMensual !== undefined) p.aporteMensual = decimal(v.aporteMensual, `${ruta}.aporteMensual`, r, { defecto: "0" })!;
  if (v.horizonte !== undefined) p.horizonte = decimal(v.horizonte, `${ruta}.horizonte`, r, { defecto: "0", min: "0", max: "60" })!;
  if (v.metaFondo !== undefined) p.metaFondo = decimal(v.metaFondo, `${ruta}.metaFondo`, r, { defecto: "0", min: "0", max: "120" })!;
  if (v.metaAsignacion !== undefined) {
    if (!esObjeto(v.metaAsignacion)) r.error(`${ruta}.metaAsignacion`, "debe ser un objeto por clase");
    else {
      for (const c of IDS_CLASE) {
        p.metaAsignacion[c] = decimal(v.metaAsignacion[c], `${ruta}.metaAsignacion.${c}`, r, { defecto: "0", min: "0", max: "1" })!;
      }
      const otras = Object.keys(v.metaAsignacion).filter((k) => !(IDS_CLASE as readonly string[]).includes(k));
      if (otras.length) r.aviso(`${ruta}.metaAsignacion`, `clases desconocidas ignoradas: ${otras.join(", ")}`);
    }
  }
  if (v.escenarios !== undefined) p.escenarios = escenariosDe(v.escenarios, `${ruta}.escenarios`, r);
  if (v.tarjetas !== undefined) p.tarjetas = tarjetas(v.tarjetas, `${ruta}.tarjetas`, r);
  for (const l of LISTAS_PRESUPUESTO) if (v[l] !== undefined) p[l] = partidas(v[l], `${ruta}.${l}`, r);
  return p;
}

// ─────────────────────────────── Activos y transacciones ───────────────────────────────

export function validarActivo(x: unknown, ruta: string, r: Registro): Activo | null {
  if (!esObjeto(x)) {
    r.error(ruta, "debe ser un objeto");
    return null;
  }
  const clase = String(x.clase ?? "");
  if (!(IDS_CLASE as readonly string[]).includes(clase)) r.error(`${ruta}.clase`, `clase desconocida «${clase}» (${IDS_CLASE.join(", ")})`);
  const moneda = String(x.moneda ?? "DOP").toUpperCase();
  if (!(MONEDAS as readonly string[]).includes(moneda)) r.error(`${ruta}.moneda`, `moneda desconocida «${moneda}» (DOP, USD, EUR)`);
  const simboloCrudo = x.simbolo === undefined || x.simbolo === null ? "" : String(x.simbolo).trim().toUpperCase();
  if (simboloCrudo && !RE_SIMBOLO.test(simboloCrudo)) r.error(`${ruta}.simbolo`, `símbolo inválido «${simboloCrudo}»`);
  const venc = fecha(x.venc, `${ruta}.venc`, r);
  let tipoRF: Activo["tipoRF"] = null;
  if (clase === "rentafija") tipoRF = x.tipoRF === "cupon" ? "cupon" : "acumula";
  if (x.tipoRF !== undefined && x.tipoRF !== null && x.tipoRF !== "" && x.tipoRF !== "acumula" && x.tipoRF !== "cupon") {
    r.error(`${ruta}.tipoRF`, "debe ser acumula o cupon");
  }
  return {
    id: identificador(x.id, `${ruta}.id`, r),
    clase: clase as Clase,
    nombre: texto(x.nombre, `${ruta}.nombre`, r),
    inst: texto(x.inst, `${ruta}.inst`, r, { vacio: true }),
    simbolo: simboloCrudo || null,
    moneda: moneda as Moneda,
    cantidad: decimal(x.cantidad, `${ruta}.cantidad`, r, { defecto: "0" }) ?? "0",
    precio: decimal(x.precio, `${ruta}.precio`, r, { defecto: "1", min: "0" }) ?? "1",
    tasa: decimal(x.tasa, `${ruta}.tasa`, r, { defecto: "0", min: "-1", max: "10" }) ?? "0",
    venc,
    tipoRF,
  };
}

export function validarActivos(v: unknown, r: Registro, ruta = "activos"): Activo[] {
  const ok = arreglo(v, ruta, r, 500)
    .map((x, i) => validarActivo(x, `${ruta}[${i}]`, r))
    .filter((x): x is Activo => x !== null);
  idsUnicos(ok, ruta, r);
  return ok;
}

export function validarTransaccion(x: unknown, ruta: string, r: Registro): Transaccion | null {
  if (!esObjeto(x)) {
    r.error(ruta, "debe ser un objeto");
    return null;
  }
  const tipo = String(x.tipo ?? "");
  if (!TIPOS_TX.some((t) => t.id === tipo)) r.error(`${ruta}.tipo`, `tipo desconocido «${tipo}» (compra, venta, dividendo, interes)`);
  const monedaCruda = x.moneda === undefined || x.moneda === null || x.moneda === "" ? null : String(x.moneda).toUpperCase();
  if (monedaCruda && !(MONEDAS as readonly string[]).includes(monedaCruda)) r.error(`${ruta}.moneda`, `moneda desconocida «${monedaCruda}»`);
  return {
    id: identificador(x.id, `${ruta}.id`, r),
    activoId: identificador(x.activoId, `${ruta}.activoId`, r),
    simbolo: texto(x.simbolo, `${ruta}.simbolo`, r, { vacio: true, max: 15 }).toUpperCase(),
    tipo: tipo as TipoTx,
    fecha: fecha(x.fecha, `${ruta}.fecha`, r),
    cantidad: decimal(x.cantidad, `${ruta}.cantidad`, r, { defecto: "0", min: "0" }) ?? "0",
    precio: decimal(x.precio, `${ruta}.precio`, r, { defecto: "0", min: "0" }) ?? "0",
    comision: decimal(x.comision, `${ruta}.comision`, r, { defecto: "0", min: "0" }) ?? "0",
    moneda: monedaCruda as Moneda | null,
  };
}

export function validarTransacciones(v: unknown, r: Registro, ruta = "transacciones"): Transaccion[] {
  const ok = arreglo(v, ruta, r, 5000)
    .map((x, i) => validarTransaccion(x, `${ruta}[${i}]`, r))
    .filter((x): x is Transaccion => x !== null);
  idsUnicos(ok, ruta, r);
  return ok;
}

// ─────────────────────────────── Cierres ───────────────────────────────

function montos(v: unknown, ruta: string, r: Registro): Record<string, Dec | null> {
  if (v === undefined || v === null) return {};
  if (!esObjeto(v)) {
    r.error(ruta, "debe ser un objeto {idPartida: monto}");
    return {};
  }
  const out: Record<string, Dec | null> = {};
  for (const [k, x] of Object.entries(v)) {
    if (!RE_ID.test(k)) {
      r.error(ruta, `id de partida inválido «${k.slice(0, 40)}»`);
      continue;
    }
    out[k] = decimal(x, `${ruta}.${k}`, r, { nulo: true });
  }
  return out;
}

function foto(v: unknown, ruta: string, r: Registro): Foto | null {
  if (v === undefined || v === null) return null;
  if (!esObjeto(v)) {
    r.error(ruta, "debe ser un objeto");
    return null;
  }
  let fx: Foto["fx"] = null;
  if (v.fx !== undefined && v.fx !== null) {
    if (!esObjeto(v.fx)) r.error(`${ruta}.fx`, "debe ser un objeto {USD, EUR}");
    else {
      const usd = decimal(v.fx.USD, `${ruta}.fx.USD`, r, { nulo: true, min: "0" });
      const eur = decimal(v.fx.EUR, `${ruta}.fx.EUR`, r, { nulo: true, min: "0" });
      fx = { USD: usd && new Big(usd).gt(0) ? usd : null, EUR: eur && new Big(eur).gt(0) ? eur : null };
    }
  }
  return {
    activos: decimal(v.activos, `${ruta}.activos`, r) ?? "0",
    pasivos: decimal(v.pasivos, `${ruta}.pasivos`, r, { defecto: "0" }) ?? "0",
    patrimonio: decimal(v.patrimonio, `${ruta}.patrimonio`, r) ?? "0",
    liquidos: decimal(v.liquidos, `${ruta}.liquidos`, r, { defecto: "0" }) ?? "0",
    ingresoPasivoAnual: decimal(v.ingresoPasivoAnual, `${ruta}.ingresoPasivoAnual`, r, { defecto: "0" }) ?? "0",
    fecha: fecha(v.fecha, `${ruta}.fecha`, r),
    fx,
  };
}

const CLAVES_CIERRE = [
  "agregado", "totIngresos", "totFijos", "totVariables", "totAportes", "ingresos", "fijos", "variables",
  "aportes", "tarjetas", "deudas", "snap", "cerrado", "nota",
];

export function validarCierre(v: unknown, ruta: string, r: Registro): Cierre | null {
  if (!esObjeto(v)) {
    r.error(ruta, "debe ser un objeto");
    return null;
  }
  const extra = Object.keys(v).filter((k) => !CLAVES_CIERRE.includes(k));
  if (extra.length) r.aviso(ruta, `claves ignoradas: ${extra.join(", ")}`);
  const tarjetasMes: Record<string, UsoTarjeta> = {};
  if (v.tarjetas !== undefined && v.tarjetas !== null) {
    if (!esObjeto(v.tarjetas)) r.error(`${ruta}.tarjetas`, "debe ser un objeto {idTarjeta: {uso, full}}");
    else {
      for (const [k, x] of Object.entries(v.tarjetas)) {
        if (!RE_ID.test(k)) {
          r.error(`${ruta}.tarjetas`, `id de tarjeta inválido «${k.slice(0, 40)}»`);
          continue;
        }
        if (!esObjeto(x)) {
          r.error(`${ruta}.tarjetas.${k}`, "debe ser un objeto {uso, full}");
          continue;
        }
        tarjetasMes[k] = { uso: decimal(x.uso, `${ruta}.tarjetas.${k}.uso`, r, { nulo: true, min: "0" }), full: booleano(x.full, `${ruta}.tarjetas.${k}.full`, r, true) };
      }
    }
  }
  let deudas: Cierre["deudas"] = { tc: null, prestamos: null, otras: null };
  if (v.deudas !== undefined && v.deudas !== null) {
    if (!esObjeto(v.deudas)) r.error(`${ruta}.deudas`, "debe ser un objeto {tc, prestamos, otras}");
    else
      deudas = {
        tc: decimal(v.deudas.tc, `${ruta}.deudas.tc`, r, { nulo: true, min: "0" }),
        prestamos: decimal(v.deudas.prestamos, `${ruta}.deudas.prestamos`, r, { nulo: true, min: "0" }),
        otras: decimal(v.deudas.otras, `${ruta}.deudas.otras`, r, { nulo: true, min: "0" }),
      };
  }
  const nota = v.nota === undefined || v.nota === null ? null : texto(v.nota, `${ruta}.nota`, r, { max: 2000, vacio: true }) || null;
  return {
    agregado: booleano(v.agregado, `${ruta}.agregado`, r, false),
    totIngresos: decimal(v.totIngresos, `${ruta}.totIngresos`, r, { nulo: true }),
    totFijos: decimal(v.totFijos, `${ruta}.totFijos`, r, { nulo: true }),
    totVariables: decimal(v.totVariables, `${ruta}.totVariables`, r, { nulo: true }),
    totAportes: decimal(v.totAportes, `${ruta}.totAportes`, r, { nulo: true }),
    ingresos: montos(v.ingresos, `${ruta}.ingresos`, r),
    fijos: montos(v.fijos, `${ruta}.fijos`, r),
    variables: montos(v.variables, `${ruta}.variables`, r),
    aportes: montos(v.aportes, `${ruta}.aportes`, r),
    tarjetas: tarjetasMes,
    deudas,
    snap: foto(v.snap, `${ruta}.snap`, r),
    cerrado: booleano(v.cerrado, `${ruta}.cerrado`, r, false),
    nota,
  };
}

export function validarCierres(v: unknown, r: Registro, ruta = "cierres"): Cierres {
  if (v === undefined || v === null) return {};
  if (!esObjeto(v)) {
    r.error(ruta, "debe ser un objeto {\"AAAA-MM\": cierre}");
    return {};
  }
  const out: Cierres = {};
  const claves = Object.keys(v);
  if (claves.length > 600) r.error(ruta, `tiene ${claves.length} meses (máximo 600)`);
  for (const m of claves.slice(0, 600)) {
    if (!esMes(m)) {
      r.error(ruta, `mes inválido «${m.slice(0, 20)}» (se espera AAAA-MM)`);
      continue;
    }
    const c = validarCierre(v[m], `${ruta}.${m}`, r);
    if (c) out[m] = c;
  }
  return out;
}

// ─────────────────────────────── IPS ───────────────────────────────

export function validarIps(v: unknown, r: Registro, ruta = "ips"): Ips {
  const ips = ipsVacia();
  if (!esObjeto(v)) {
    r.error(ruta, "debe ser un objeto");
    return ips;
  }
  for (const [k] of SECCIONES_IPS) ips[k] = texto(v[k], `${ruta}.${k}`, r, { max: 5000, vacio: true });
  ips.editadoPor = v.editadoPor === "mena" ? "mena" : "borrador";
  if (v.editadoPor !== undefined && v.editadoPor !== "mena" && v.editadoPor !== "borrador") {
    r.aviso(`${ruta}.editadoPor`, `valor «${String(v.editadoPor).slice(0, 20)}» desconocido: se toma como borrador`);
  }
  ips.revisadoEl = fecha(v.revisadoEl, `${ruta}.revisadoEl`, r);
  const conocidas = [...SECCIONES_IPS.map((s) => s[0] as string), "editadoPor", "revisadoEl"];
  const extra = Object.keys(v).filter((k) => !conocidas.includes(k));
  if (extra.length) r.aviso(ruta, `claves ignoradas: ${extra.join(", ")}`);
  return ips;
}

// ─────────────────────────────── Lectura desde la base ───────────────────────────────

/** Lee un jsonb guardado; si no valida, lanza con el detalle (la pantalla lo muestra). */
function exigir<T>(fn: (r: Registro) => T, que: string): T {
  const r = new Registro();
  const v = fn(r);
  if (!r.ok) throw new Error(`Datos guardados inválidos en ${que}: ${r.errores.slice(0, 3).join(" · ")}`);
  return v;
}

export function leerParametros(datos: unknown): Parametros {
  return exigir((r) => validarParametros(datos, r, "parametros", false), "personal.parametros");
}
export function leerCierre(mes: string, datos: unknown): Cierre {
  return exigir((r) => validarCierre(datos, mes, r)!, `personal.cierres (${mes})`);
}
export function leerIps(datos: unknown): Ips {
  return exigir((r) => validarIps(datos, r), "personal.ips");
}
