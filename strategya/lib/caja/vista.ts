// Arma lo que la pantalla del calendario necesita (solo texto, serializable para los componentes de
// cliente) a partir de los datos y la simulación. Puro.

import Big from "big.js";
import { esInversionFin, type TipoFin } from "../finanzas/catalogo";
import { abreviado, rd } from "./formato";
import {
  diaSemanaLunes,
  diasEntre,
  type Fecha,
  fechaBreve,
  fechaLarga,
  type Mes,
  mesDe,
  primerDia,
  rangoFechas,
  sumarDias,
  ultimoDia,
} from "./fechas";
import { type AjusteSaldo, type DiaSimulado, type EstadoDia, type MovimientoAplicado, NOMBRE_ESTADO, type Ocurrencia, type Simulacion } from "./motor";
import { avisoLimite, cuandoFalta, type MarcaCiclo, marcasEntre } from "./ciclo";
import { type Categoria, claveUSD, type Cuenta, type DatosCaja, esDeuda, type Movimiento } from "./tipos";

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
  /** Marcas del ciclo de las tarjetas ese día (corte, pago elegido, fecha límite). */
  tarjeta: MarcaCiclo[];
  etiqueta: string;
}

/** Una marca del ciclo de una tarjeta en un día del calendario. */
export interface MarcaTarjetaDia {
  cuentaId: string;
  nombre: string;
  marca: MarcaCiclo;
  /** Frase para el panel del día. */
  texto: string;
}

export interface CuentaDia {
  id: string;
  nombre: string;
  tipo: Cuenta["tipo"];
  /** Moneda de la cuenta: el saldo va en esta moneda. */
  moneda: "DOP" | "USD";
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
  registrados: MovimientoAplicado[];
  planificados: Ocurrencia[];
  porConfirmar: Ocurrencia[];
  omitidos: Ocurrencia[];
  ajustes: AjusteSaldo[];
  cuentas: CuentaDia[];
  /** Corte, pago planificado y fecha límite de cada tarjeta que caen este día. */
  tarjetas: MarcaTarjetaDia[];
  nota: string;
}

export interface VistaMes {
  mes: Mes;
  semanas: Celda[][];
  paneles: Record<Fecha, PanelDiaVista>;
}

const NOMBRE_MARCA: Record<MarcaCiclo, string> = { corte: "corte de tarjeta", pago: "pago de tarjeta planificado", limite: "fecha límite de tarjeta" };

/** Marcas del ciclo de cada tarjeta (con ciclo) entre dos fechas, con la frase para el panel del día. */
export function marcasTarjetas(datos: DatosCaja, desde: Fecha, hasta: Fecha): Map<Fecha, MarcaTarjetaDia[]> {
  const out = new Map<Fecha, MarcaTarjetaDia[]>();
  for (const c of datos.cuentas) {
    if (c.tipo !== "tarjeta" || !c.ciclo) continue;
    const pagos = datos.movimientos.filter((m) => m.tipo === "pago_tarjeta" && m.destino === c.id).map((m) => m.fecha);
    for (const x of marcasEntre(desde, hasta, c.ciclo)) {
      const ci = x.ciclo;
      const pagado = pagos.some((p) => p > ci.corte && p <= ci.limite);
      const texto =
        x.marca === "corte"
          ? `Corta hoy. Fecha límite: ${fechaBreve(ci.limite)}${ci.pago ? ` · quieres pagar el ${fechaBreve(ci.pago)}` : ""}.`
          : x.marca === "pago"
            ? `Pagas hoy (el día que elegiste). Fecha límite: ${fechaBreve(ci.limite)}.${pagado ? " Ya anotaste un pago de este ciclo." : ""}`
            : `Fecha límite de pago (cortó el ${fechaBreve(ci.corte)}).${pagado ? " Ya anotaste un pago de este ciclo." : " Sin pago anotado de este ciclo."}`;
      const l = out.get(x.fecha) ?? [];
      l.push({ cuentaId: c.id, nombre: c.nombre, marca: x.marca, texto });
      out.set(x.fecha, l);
    }
  }
  return out;
}

/**
 * Avisos de fecha límite: faltan 3 días o menos y no hay pago anotado del ciclo (solo tarjetas con ciclo en Mis
 * cuentas). Si el día elegido cae después de la límite, también lo dice.
 */
export function avisosTarjetas(datos: DatosCaja, hoy: Fecha): string[] {
  const out: string[] = [];
  for (const c of datos.cuentas) {
    if (c.tipo !== "tarjeta" || !c.ciclo) continue;
    const pagos = datos.movimientos.filter((m) => m.tipo === "pago_tarjeta" && m.destino === c.id).map((m) => m.fecha);
    const a = avisoLimite(hoy, c.ciclo, pagos);
    if (a) out.push(`«${c.nombre}»: la fecha límite de pago es ${cuandoFalta(a.faltan)} (${fechaBreve(a.ciclo.limite)}) y no hay pago anotado desde el corte del ${fechaBreve(a.ciclo.corte)}.`);
  }
  return out;
}

function etiquetaCelda(f: Fecha, d: DiaSimulado | undefined, esHoy: boolean, antes: boolean, marcas: MarcaTarjetaDia[] = []): string {
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
  for (const m of marcas) partes.push(`${NOMBRE_MARCA[m.marca]} ${m.nombre}`);
  return partes.join(", ");
}

export function armarVistaMes(datos: DatosCaja, sim: Simulacion, mes: Mes): VistaMes {
  const desde = sumarDias(primerDia(mes), -diaSemanaLunes(primerDia(mes)));
  const finMes = ultimoDia(mes);
  const hasta = sumarDias(finMes, 6 - diaSemanaLunes(finMes));
  const marcas = marcasTarjetas(datos, desde, hasta);
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
      tarjeta: [...new Set((marcas.get(f) ?? []).map((m) => m.marca))],
      etiqueta: etiquetaCelda(f, d, esHoy, antes, marcas.get(f)),
    };
  });
  const semanas: Celda[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));

  const paneles: Record<Fecha, PanelDiaVista> = {};
  for (const f of rangoFechas(primerDia(mes), finMes)) paneles[f] = armarPanel(datos, sim, f, marcas.get(f) ?? []);
  return { mes, semanas, paneles };
}

export function armarPanel(datos: DatosCaja, sim: Simulacion, f: Fecha, tarjetas: MarcaTarjetaDia[] = []): PanelDiaVista {
  const d = sim.porFecha.get(f);
  // Los cuadres sintéticos (saldo en US$ escrito en Mis cuentas) no se muestran como «lo que dijo el banco».
  const reales = new Map(datos.saldos.filter((s) => s.fecha === f && !s.sintetico).map((s) => [s.cuentaId, s.saldo]));
  const cuentas: CuentaDia[] = [...datos.cuentas]
    .sort((a, b) => a.orden - b.orden)
    .flatMap((c) => {
      const p = d?.posiciones[c.id];
      const saldo = p == null ? "0" : esDeuda(c.tipo) ? new Big(p).times(-1).toString() : p;
      const fila: CuentaDia = { id: c.id, nombre: c.nombre, tipo: c.tipo, moneda: c.moneda ?? "DOP", saldo, real: reales.get(c.id) ?? null };
      if (!c.usd) return [fila];
      // Tarjeta en dos monedas: su parte en US$ se cuadra aparte.
      const k = claveUSD(c.id);
      const pu = d?.posiciones[k];
      const usd: CuentaDia = { id: k, nombre: `${c.nombre} (parte en US$)`, tipo: c.tipo, moneda: "USD", saldo: pu == null ? "0" : new Big(pu).times(-1).toString(), real: reales.get(k) ?? null };
      return [fila, usd];
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
    tarjetas,
    nota: datos.notas.find((n) => n.fecha === f)?.nota ?? "",
  };
}

/** Catálogos mínimos para los formularios del cliente. */
/** Lo que el formulario necesita de una inversión del registro que no vive en el Presupuesto (acciones, fondos por cuotas). */
export interface InversionFuera {
  id: string;
  nombre: string;
  tipo: TipoFin;
  moneda: string;
  precio: string;
  cajaId: string | null;
  unidoA: string | null;
}

export function catalogos(
  datos: DatosCaja,
  registro: readonly InversionFuera[] = [],
): {
  cuentas: (Pick<Cuenta, "id" | "nombre" | "tipo" | "moneda" | "tasaAnual" | "tipoFin" | "debito" | "cargosCuota"> & { dobleMoneda?: boolean; porUnidades?: boolean })[];
  categorias: Pick<Categoria, "id" | "nombre" | "tipo">[];
} {
  // Las inversiones que no están en el Presupuesto (no tienen saldo en él) solo sirven de destino de ahorro u origen de
  // un rescate: van con «r:<id>». Solo en RD$ o US$ (el Presupuesto no lleva otras monedas).
  const fuera = registro
    .filter((i) => !i.cajaId && !i.unidoA && esInversionFin(i.tipo) && (i.moneda === "DOP" || i.moneda === "USD"))
    .map((i) => ({
      id: `r:${i.id}`,
      nombre: i.nombre,
      tipo: "ahorro" as const,
      tipoFin: i.tipo,
      ...(i.moneda === "USD" ? { moneda: "USD" as const } : {}),
      ...(new Big(i.precio || "1").eq(1) ? {} : { porUnidades: true }),
    }));
  return {
    cuentas: [
      ...[...datos.cuentas]
        .sort((a, b) => a.orden - b.orden)
        .map(({ id, nombre, tipo, moneda, tasaAnual, usd, tipoFin, debito, cargosCuota }) => ({
          id,
          nombre,
          tipo,
          ...(moneda && moneda !== "DOP" ? { moneda } : {}),
          ...(tasaAnual ? { tasaAnual } : {}),
          ...(usd ? { dobleMoneda: true } : {}),
          ...(tipoFin ? { tipoFin } : {}),
          ...(debito ? { debito } : {}),
          ...(cargosCuota ? { cargosCuota } : {}),
        })),
      ...fuera,
    ],
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
