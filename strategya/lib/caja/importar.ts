// Importación del JSON del artefacto «Calendario de Caja» (formato en docs/caja.md).
// Función pura: recibe el texto, devuelve los datos normalizados, el resumen, los errores (que
// impiden importar) y las advertencias (que se muestran pero no impiden). Los números se leen con
// jsonExacto: nunca pasan por float. Los ids del artefacto se conservan tal cual.

import Big from "big.js";
import { jsonExacto } from "../../supabase/functions/_shared/json";
import { esFecha, type Fecha } from "./fechas";
import { adicionalDesdeV1 } from "./resultados";
import { montoDeTexto } from "./validar";
import {
  type Categoria,
  type ConfigCaja,
  type Cuenta,
  type DatosCaja,
  esUno,
  FRECUENCIAS,
  GRUPOS_V1,
  MONEDAS,
  type Movimiento,
  type NotaDia,
  type Omitido,
  type Recurrente,
  type SaldoReal,
  TIPO_DESDE_GRUPO,
  TIPOS_CATEGORIA,
  TIPOS_CUENTA,
  TIPOS_MOVIMIENTO,
} from "./tipos";

/** Margen por defecto del artefacto cuando no se fijó uno. */
export const MARGEN_POR_DEFECTO = "3000";
/** Tope de tamaño del archivo (texto). */
export const TAMANO_MAXIMO = 5_000_000;

export interface ResumenImportacion {
  cuentas: number;
  categorias: number;
  recurrentes: number;
  movimientos: number;
  omitidos: number;
  saldos: number;
  notas: number;
  primerDia: Fecha | null;
  ultimoDia: Fecha | null;
  inicio: Fecha | null;
}

export interface ResultadoImportacion {
  datos: (DatosCaja & { config: ConfigCaja }) | null;
  resumen: ResumenImportacion;
  errores: string[];
  advertencias: string[];
}

type Obj = Record<string, unknown>;
const esObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function txt(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

export function parsearImportacion(texto: string): ResultadoImportacion {
  const errores: string[] = [];
  const advertencias: string[] = [];
  const resumen: ResumenImportacion = {
    cuentas: 0, categorias: 0, recurrentes: 0, movimientos: 0, omitidos: 0, saldos: 0, notas: 0,
    primerDia: null, ultimoDia: null, inicio: null,
  };
  const fallo = (e: string): ResultadoImportacion => ({ datos: null, resumen, errores: [e], advertencias });

  if (texto.length > TAMANO_MAXIMO) return fallo("El archivo pasa de 5 MB: no parece una exportación del Calendario de Caja.");
  let raiz: unknown;
  try {
    raiz = jsonExacto(texto.replace(/^﻿/, ""));
  } catch (e) {
    return fallo(`El archivo no es JSON válido: ${(e as Error).message}`);
  }
  if (!esObj(raiz)) return fallo("El JSON debe ser un objeto con config, cuentas, categorias, recurrentes y dias.");

  const monto = (v: unknown, donde: string, vacio: string | null): string | null => {
    if (typeof v === "boolean" || esObj(v) || Array.isArray(v)) {
      errores.push(`${donde}: «${JSON.stringify(v)}» no es un número.`);
      return null;
    }
    try {
      const m = montoDeTexto(v as string | null | undefined);
      return m ?? vacio;
    } catch {
      errores.push(`${donde}: «${String(v)}» no es un número.`);
      return null;
    }
  };

  // ── config ──
  let config: ConfigCaja | null = null;
  const c = raiz.config;
  if (!esObj(c)) errores.push("Falta «config» (inicio, colchon, margen, tasaUSD).");
  else {
    const inicio = txt(c.inicio);
    if (!inicio || !esFecha(inicio)) errores.push(`config.inicio: «${inicio ?? ""}» no es una fecha AAAA-MM-DD.`);
    const colchon = monto(c.colchon, "config.colchon", "0");
    if (c.colchon === undefined || txt(c.colchon) === null) advertencias.push("config.colchon vacío: se toma 0.");
    const margen = monto(c.margen, "config.margen", MARGEN_POR_DEFECTO);
    if (c.margen === undefined || txt(c.margen) === null) advertencias.push(`config.margen vacío: se toma ${MARGEN_POR_DEFECTO} (valor por defecto del artefacto).`);
    let tasa = monto(c.tasaUSD, "config.tasaUSD", null);
    if (tasa !== null && new Big(tasa).lte(0)) tasa = null;
    if (inicio && esFecha(inicio) && colchon !== null && margen !== null) {
      config = { inicio, colchon, margen, tasaUSD: tasa };
      resumen.inicio = inicio;
    }
  }

  const coleccion = (nombre: string): [string, Obj][] => {
    const v = raiz[nombre];
    if (v === undefined || v === null) return [];
    if (!esObj(v)) {
      errores.push(`«${nombre}» debe ser un objeto { "<id>": {...} }.`);
      return [];
    }
    const r: [string, Obj][] = [];
    for (const [id, x] of Object.entries(v)) {
      if (!esObj(x)) errores.push(`${nombre}.${id}: no es un objeto.`);
      else r.push([id, x]);
    }
    return r;
  };

  // ── cuentas ──
  const cuentas: Cuenta[] = [];
  for (const [id, x] of coleccion("cuentas")) {
    const tipo = txt(x.tipo);
    if (!esUno(TIPOS_CUENTA, tipo)) {
      errores.push(`cuentas.${id}.tipo: «${tipo ?? ""}» no es banco, efectivo, ahorro ni tarjeta.`);
      continue;
    }
    const saldo = monto(x.saldoInicial, `cuentas.${id}.saldoInicial`, "0");
    const limite = monto(x.limite, `cuentas.${id}.limite`, null);
    const ordenTxt = txt(x.orden);
    const orden = ordenTxt && /^-?\d+(\.\d+)?$/.test(ordenTxt) ? Math.round(Number(ordenTxt)) : cuentas.length;
    if (saldo === null) continue;
    cuentas.push({ id, nombre: txt(x.nombre) ?? id, tipo, saldoInicial: saldo, limite, orden });
  }
  const idsCuenta = new Set(cuentas.map((x) => x.id));

  // ── categorías ──
  // Formato nuevo: { tipo, adicional }. Formato del artefacto (v1): { grupo, presupuesto }: el grupo se
  // convierte igual que en la migración y el presupuesto pasa a «adicional» descontando sus fijos.
  const categorias: Categoria[] = [];
  const presupuestoV1 = new Map<string, string | null>();
  for (const [id, x] of coleccion("categorias")) {
    const tipo = txt(x.tipo);
    const grupo = txt(x.grupo);
    if (esUno(TIPOS_CATEGORIA, tipo)) {
      const a = monto(x.adicional, `categorias.${id}.adicional`, null);
      categorias.push({ id, nombre: txt(x.nombre) ?? id, tipo, adicional: a && new Big(a).gt(0) ? a : null });
    } else if (esUno(GRUPOS_V1, grupo)) {
      presupuestoV1.set(id, monto(x.presupuesto, `categorias.${id}.presupuesto`, null));
      categorias.push({ id, nombre: txt(x.nombre) ?? id, tipo: TIPO_DESDE_GRUPO[grupo], adicional: null });
    } else {
      errores.push(`categorias.${id}.grupo: «${grupo ?? tipo ?? ""}» no es ingreso, fijo, variable, ahorro ni deuda.`);
    }
  }
  const idsCategoria = new Set(categorias.map((x) => x.id));

  const referencias = (donde: string, cuenta: string | null, destino: string | null, cat: string | null) => {
    if (cuenta && !idsCuenta.has(cuenta)) advertencias.push(`${donde}: la cuenta «${cuenta}» no existe (el movimiento no mueve ningún saldo).`);
    if (destino && !idsCuenta.has(destino)) advertencias.push(`${donde}: la cuenta destino «${destino}» no existe.`);
    if (cat && !idsCategoria.has(cat)) advertencias.push(`${donde}: la categoría «${cat}» no existe.`);
  };
  const fechaOpcional = (v: unknown, donde: string): string | null => {
    const f = txt(v);
    if (!f) return null;
    if (!esFecha(f)) {
      errores.push(`${donde}: «${f}» no es una fecha AAAA-MM-DD.`);
      return null;
    }
    return f;
  };

  // ── recurrentes ──
  const recurrentes: Recurrente[] = [];
  for (const [id, x] of coleccion("recurrentes")) {
    const donde = `recurrentes.${id}`;
    const tipo = txt(x.tipo);
    const frecuencia = txt(x.frecuencia) ?? "mensual";
    const moneda = txt(x.moneda) ?? "DOP";
    if (!esUno(TIPOS_MOVIMIENTO, tipo)) {
      errores.push(`${donde}.tipo: «${tipo ?? ""}» no es ingreso, gasto, transferencia ni pago_tarjeta.`);
      continue;
    }
    if (!esUno(FRECUENCIAS, frecuencia)) {
      errores.push(`${donde}.frecuencia: «${frecuencia}» no es mensual, cada_n ni unica.`);
      continue;
    }
    if (!esUno(MONEDAS, moneda)) {
      errores.push(`${donde}.moneda: «${moneda}» no es DOP ni USD.`);
      continue;
    }
    const m = monto(x.monto, `${donde}.monto`, "0");
    if (m === null) continue;
    const cadaTxt = txt(x.cadaN);
    const cadaN = cadaTxt && /^\d+(\.\d+)?$/.test(cadaTxt) ? Math.max(1, Math.round(Number(cadaTxt))) : null;
    const dias = Array.isArray(x.dias) ? x.dias.map((d) => txt(d) ?? "").join(", ") : (txt(x.dias) ?? "");
    const cuenta = txt(x.cuenta);
    const destino = tipo === "transferencia" || tipo === "pago_tarjeta" ? txt(x.destino) : null;
    const categoria = txt(x.cat ?? x.categoria);
    referencias(donde, cuenta, destino, categoria);
    const fecha = fechaOpcional(x.fecha, `${donde}.fecha`);
    if (frecuencia === "unica" && !fecha) advertencias.push(`${donde}: es «única» y no tiene fecha (no ocurre nunca).`);
    recurrentes.push({
      id,
      nombre: txt(x.nombre) ?? id,
      tipo,
      monto: m,
      moneda,
      pagoTotal: tipo === "pago_tarjeta" && x.pagoTotal === true,
      cuenta,
      destino,
      categoria,
      frecuencia,
      dias,
      cadaN,
      fecha,
      desde: fechaOpcional(x.desde, `${donde}.desde`),
      hasta: fechaOpcional(x.hasta, `${donde}.hasta`),
      activo: x.activo !== false,
    });
  }
  const idsRecurrente = new Set(recurrentes.map((x) => x.id));
  for (const cat of categorias) {
    if (!presupuestoV1.has(cat.id)) continue;
    cat.adicional = adicionalDesdeV1(presupuestoV1.get(cat.id) ?? null, recurrentes.filter((r) => r.categoria === cat.id));
  }

  // ── días ──
  const movimientos: Movimiento[] = [];
  const omitidos: Omitido[] = [];
  const saldos: SaldoReal[] = [];
  const notas: NotaDia[] = [];
  const idsMov = new Set<string>();
  let sinTasa = 0;
  const fechas: string[] = [];
  for (const [clave, dia] of coleccion("dias")) {
    if (!esFecha(clave)) {
      errores.push(`dias.${clave}: la clave debe ser una fecha AAAA-MM-DD.`);
      continue;
    }
    const fecha = clave;
    fechas.push(fecha);
    const items = dia.items ?? [];
    if (!Array.isArray(items)) errores.push(`dias.${fecha}.items: debe ser una lista.`);
    else
      items.forEach((it, i) => {
        const donde = `dias.${fecha}.items[${i}]`;
        if (!esObj(it)) {
          errores.push(`${donde}: no es un objeto.`);
          return;
        }
        const tipo = txt(it.tipo);
        const moneda = txt(it.moneda) ?? "DOP";
        if (!esUno(TIPOS_MOVIMIENTO, tipo)) {
          errores.push(`${donde}.tipo: «${tipo ?? ""}» no es ingreso, gasto, transferencia ni pago_tarjeta.`);
          return;
        }
        if (!esUno(MONEDAS, moneda)) {
          errores.push(`${donde}.moneda: «${moneda}» no es DOP ni USD.`);
          return;
        }
        const vacio = it.monto === undefined || txt(it.monto) === null;
        const m = monto(it.monto, `${donde}.monto`, "0");
        if (m === null) return;
        if (vacio) advertencias.push(`${donde}: sin monto, se importa en 0 (como lo trataba el artefacto).`);
        const tasa = moneda === "USD" ? monto(it.tasa, `${donde}.tasa`, null) : null;
        if (moneda === "USD" && !tasa && !config?.tasaUSD) sinTasa++;
        let id = txt(it.id) ?? `${fecha}-${i + 1}`;
        if (idsMov.has(id)) {
          let n = 2;
          while (idsMov.has(`${id}-${n}`)) n++;
          advertencias.push(`${donde}: el id «${id}» estaba repetido; se guardó como «${id}-${n}».`);
          id = `${id}-${n}`;
        }
        idsMov.add(id);
        const cuenta = txt(it.cuenta);
        const destino = tipo === "transferencia" || tipo === "pago_tarjeta" ? txt(it.destino) : null;
        const categoria = txt(it.cat ?? it.categoria);
        referencias(donde, cuenta, destino, categoria);
        const rid = txt(it.rid);
        if (rid && !idsRecurrente.has(rid)) advertencias.push(`${donde}: confirma el recurrente «${rid}», que ya no existe.`);
        movimientos.push({ id, fecha, tipo, monto: m, moneda, tasa, cuenta, destino, categoria, nota: txt(it.nota), recurrenteId: rid });
      });

    const om = dia.omitidos ?? [];
    if (!Array.isArray(om)) errores.push(`dias.${fecha}.omitidos: debe ser una lista de ids.`);
    else
      for (const rid of new Set(om.map(txt).filter((x): x is string => !!x))) {
        if (!idsRecurrente.has(rid)) advertencias.push(`dias.${fecha}.omitidos: el recurrente «${rid}» no existe.`);
        omitidos.push({ fecha, recurrenteId: rid });
      }

    const sal = dia.saldos ?? {};
    if (!esObj(sal)) errores.push(`dias.${fecha}.saldos: debe ser un objeto { "<cuenta>": saldo }.`);
    else
      for (const [cuentaId, v] of Object.entries(sal)) {
        const s = monto(v, `dias.${fecha}.saldos.${cuentaId}`, null);
        if (s === null) continue;
        if (!idsCuenta.has(cuentaId)) advertencias.push(`dias.${fecha}.saldos: la cuenta «${cuentaId}» no existe (se guarda, pero no corrige nada).`);
        saldos.push({ fecha, cuentaId, saldo: s });
      }

    const nota = txt(dia.nota);
    if (nota) notas.push({ fecha, nota });
  }
  if (sinTasa) advertencias.push(`${sinTasa} movimiento(s) en US$ sin tasa propia: se pasarán a RD$ con el dólar del BCRD de su fecha; si no hay dato, quedan «no confirmado».`);

  fechas.sort();
  Object.assign(resumen, {
    cuentas: cuentas.length,
    categorias: categorias.length,
    recurrentes: recurrentes.length,
    movimientos: movimientos.length,
    omitidos: omitidos.length,
    saldos: saldos.length,
    notas: notas.length,
    primerDia: fechas[0] ?? null,
    ultimoDia: fechas.at(-1) ?? null,
  });

  if (errores.length || !config) return { datos: null, resumen, errores, advertencias };
  return { datos: { config, cuentas, categorias, recurrentes, movimientos, omitidos, saldos, notas }, resumen, errores, advertencias };
}

/** Forma que recibe personal.caja_importar(jsonb): nombres de columna y montos como texto. */
export function aJsonSQL(d: DatosCaja & { config: ConfigCaja }) {
  return {
    config: { inicio: d.config.inicio, colchon: d.config.colchon, margen: d.config.margen, tasa_usd: d.config.tasaUSD },
    cuentas: d.cuentas.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, saldo_inicial: c.saldoInicial, limite: c.limite, orden: c.orden, ...(c.registroId ? { registro_id: c.registroId } : {}), ...(c.moneda && c.moneda !== "DOP" ? { moneda: c.moneda } : {}) })),
    categorias: d.categorias.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo, adicional: c.adicional })),
    recurrentes: d.recurrentes.map((r) => ({
      id: r.id, nombre: r.nombre, tipo: r.tipo, monto: r.monto, moneda: r.moneda, pago_total: r.pagoTotal,
      cuenta: r.cuenta, destino: r.destino, categoria: r.categoria, frecuencia: r.frecuencia, dias: r.dias,
      cada_n: r.cadaN, fecha: r.fecha, desde: r.desde, hasta: r.hasta, activo: r.activo, ...(r.parte ? { parte: r.parte } : {}),
    })),
    movimientos: d.movimientos.map((m) => ({
      id: m.id, fecha: m.fecha, tipo: m.tipo, monto: m.monto, moneda: m.moneda, tasa: m.tasa, cuenta: m.cuenta,
      destino: m.destino, categoria: m.categoria, nota: m.nota, recurrente_id: m.recurrenteId, ...(m.interes ? { interes: m.interes } : {}),
      ...(m.parte ? { parte: m.parte } : {}),
    })),
    omitidos: d.omitidos.map((o) => ({ fecha: o.fecha, recurrente_id: o.recurrenteId })),
    // El saldo en US$ escrito en Mis cuentas entra al leer (lib/caja/datos.ts, `sintetico`): no se guarda como cuadre.
    saldos: d.saldos.filter((s) => !s.sintetico).map((s) => ({ fecha: s.fecha, cuenta_id: s.cuentaId, saldo: s.saldo })),
    notas: d.notas.map((n) => ({ fecha: n.fecha, nota: n.nota })),
  };
}
