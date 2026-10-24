// Arma lo que la pantalla del calendario necesita (solo texto, serializable para los componentes de
// cliente) a partir de los datos y la simulación. Puro.

import Big from "big.js";
import { abreviado, rd } from "./formato";
import {
  diaSemanaLunes,
  diasEntre,
  type Fecha,
  fechaLarga,
  type Mes,
  mesDe,
  primerDia,
  rangoFechas,
  sumarDias,
  ultimoDia,
} from "./fechas";
import { type AjusteSaldo, type DiaSimulado, type EstadoDia, NOMBRE_ESTADO, type Ocurrencia, type Simulacion } from "./motor";
import { type Categoria, type Cuenta, type DatosCaja, esDeuda, type Movimiento } from "./tipos";

export interface Celda {
  fecha: Fecha;
  dia: number;
  enMes: boolean;
  esHoy: boolean;
  antesDelInicio: boolean;
  estado: EstadoDia | null;
  disponible: string | null;
  abreviado: string | null;
  ingreso: boolean;
  /** Hubo un gasto o pago registrado ese día. */
  gasto: boolean;
  planificados: number;
  porConfirmar: number;
  registrados: number;
  nota: boolean;
  cuadre: boolean;
  etiqueta: string;
}

export interface CuentaDia {
  id: string;
  nombre: string;
  tipo: Cuenta["tipo"];
  /** Posición al cierre (tarjeta: deuda positiva). */
  saldo: string;
  /** Saldo real cuadrado ese día, si lo hay (como lo escribió Mena). */
  real: string | null;
}

export interface PanelDiaVista {
  fecha: Fecha;
  titulo: string;
  esPasado: boolean;
  esHoy: boolean;
  antesDelInicio: boolean;
  estado: EstadoDia | null;
  disponible: string | null;
  entradas: string;
  salidas: string;
  registrados: (Movimiento & { montoDOP: string | null })[];
  planificados: Ocurrencia[];
  porConfirmar: Ocurrencia[];
  omitidos: Ocurrencia[];
  ajustes: AjusteSaldo[];
  cuentas: CuentaDia[];
  nota: string;
}

export interface VistaMes {
  mes: Mes;
  semanas: Celda[][];
  paneles: Record<Fecha, PanelDiaVista>;
}

function etiquetaCelda(f: Fecha, d: DiaSimulado | undefined, esHoy: boolean, antes: boolean): string {
  const partes = [fechaLarga(f).replace(/ de \d{4}$/, "")];
  if (esHoy) partes.push("hoy");
  if (antes) partes.push("antes del inicio de la simulación");
  if (d) {
    partes.push(`disponible ${rd(d.disponible)}`, NOMBRE_ESTADO[d.estado].toLowerCase());
    if (d.tieneIngreso) partes.push("con ingreso");
    if (d.planificados.length) partes.push(`${d.planificados.length} planificado(s)`);
    if (d.porConfirmar.length) partes.push(`${d.porConfirmar.length} por confirmar`);
    if (d.registrados.length) partes.push(`${d.registrados.length} registrado(s)`);
    if (d.nota) partes.push("con nota");
  }
  return partes.join(", ");
}

export function armarVistaMes(datos: DatosCaja, sim: Simulacion, mes: Mes): VistaMes {
  const desde = sumarDias(primerDia(mes), -diaSemanaLunes(primerDia(mes)));
  const finMes = ultimoDia(mes);
  const hasta = sumarDias(finMes, 6 - diaSemanaLunes(finMes));
  const celdas: Celda[] = rangoFechas(desde, hasta).map((f) => {
    const d = sim.porFecha.get(f);
    const esHoy = f === sim.hoy;
    const antes = f < sim.inicio;
    return {
      fecha: f,
      dia: Number(f.slice(8)),
      enMes: mesDe(f) === mes,
      esHoy,
      antesDelInicio: antes,
      estado: d?.estado ?? null,
      disponible: d?.disponible ?? null,
      abreviado: d ? abreviado(d.disponible) : null,
      ingreso: !!d?.tieneIngreso,
      gasto: !!d?.registrados.some((m) => m.tipo === "gasto" || m.tipo === "pago_tarjeta"),
      planificados: d?.planificados.length ?? 0,
      porConfirmar: d?.porConfirmar.length ?? 0,
      registrados: d?.registrados.length ?? 0,
      nota: !!d?.nota,
      cuadre: !!d?.ajustes.length,
      etiqueta: etiquetaCelda(f, d, esHoy, antes),
    };
  });
  const semanas: Celda[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));

  const paneles: Record<Fecha, PanelDiaVista> = {};
  for (const f of rangoFechas(primerDia(mes), finMes)) paneles[f] = armarPanel(datos, sim, f);
  return { mes, semanas, paneles };
}

export function armarPanel(datos: DatosCaja, sim: Simulacion, f: Fecha): PanelDiaVista {
  const d = sim.porFecha.get(f);
  const reales = new Map(datos.saldos.filter((s) => s.fecha === f).map((s) => [s.cuentaId, s.saldo]));
  const cuentas: CuentaDia[] = [...datos.cuentas]
    .sort((a, b) => a.orden - b.orden)
    .map((c) => {
      const p = d?.posiciones[c.id];
      const saldo = p == null ? "0" : esDeuda(c.tipo) ? new Big(p).times(-1).toString() : p;
      return { id: c.id, nombre: c.nombre, tipo: c.tipo, saldo, real: reales.get(c.id) ?? null };
    });
  return {
    fecha: f,
    titulo: fechaLarga(f),
    esPasado: f < sim.hoy,
    esHoy: f === sim.hoy,
    antesDelInicio: f < sim.inicio,
    estado: d?.estado ?? null,
    disponible: d?.disponible ?? null,
    entradas: d?.entradas ?? "0",
    salidas: d?.salidas ?? "0",
    registrados: d?.registrados ?? datos.movimientos.filter((m) => m.fecha === f).map((m) => ({ ...m, montoDOP: null })),
    planificados: d?.planificados ?? [],
    porConfirmar: d?.porConfirmar ?? [],
    omitidos: d?.omitidos ?? [],
    ajustes: d?.ajustes ?? [],
    cuentas,
    nota: datos.notas.find((n) => n.fecha === f)?.nota ?? "",
  };
}

/** Catálogos mínimos para los formularios del cliente. */
export function catalogos(datos: DatosCaja): { cuentas: Pick<Cuenta, "id" | "nombre" | "tipo">[]; categorias: Pick<Categoria, "id" | "nombre" | "tipo">[] } {
  return {
    cuentas: [...datos.cuentas].sort((a, b) => a.orden - b.orden).map(({ id, nombre, tipo }) => ({ id, nombre, tipo })),
    categorias: datos.categorias.map(({ id, nombre, tipo }) => ({ id, nombre, tipo })),
  };
}

/** Último cuadre con el banco (para el sello): fecha y días desde hoy. */
export function ultimoCuadre(datos: DatosCaja, hoy: Fecha): { fecha: Fecha | null; dias: number | null } {
  const f = datos.saldos.map((s) => s.fecha).filter((x) => x <= hoy).sort().at(-1) ?? null;
  return { fecha: f, dias: f ? diasEntre(f, hoy) : null };
}

/** Planificados de los próximos n días (desde hoy), para el resumen de la terminal. */
export function proximos(sim: Simulacion, n: number): { fecha: Fecha; o: Ocurrencia }[] {
  const fin = sumarDias(sim.hoy, n - 1);
  return sim.dias.filter((d) => d.fecha >= sim.hoy && d.fecha <= fin).flatMap((d) => d.planificados.map((o) => ({ fecha: d.fecha, o })));
}
