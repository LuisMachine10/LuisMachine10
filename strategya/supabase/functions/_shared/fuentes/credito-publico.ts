// Dirección General de Crédito Público (Ministerio de Hacienda y Economía) · subastas de títulos.
//
// La página https://www.creditopublico.gob.do/emisiones/subastas?dlAnio=AAAA lista, por año, los
// resultados de cada subasta como PDF (título con la fecha de la subasta y fecha de publicación) y un
// «Consolidado» en Excel. Confirmado con la descarga real del 15 oct 2026
// (pruebas/muestras/credito-publico/subastas-2026.html): la página NO trae monto ni tasa de corte en
// HTML; esas cifras viven en los PDF y en el «Consolidado» .xlsx que la misma página enlaza (confirmado
// con la sonda del 16 oct 2026: pruebas/muestras/credito-publico/02Consolidado-2026-real-2026-10-16.xlsx).
// Cada subasta se guarda con su fecha y su PDF oficial; el monto adjudicado y la tasa de corte salen del
// Consolidado. Si el Consolidado no se puede leer, la subasta queda sin cifras (no se inventan).

import Big from "big.js";
import type { Tarea } from "../ingesta.ts";
import { leerXlsx, numeroExcel, serialAFecha, valorVisible, type HojaXlsx, type LibroXlsx } from "../xlsx.ts";
import { crearObtenerBytes, type ObtenerBytes } from "./descarga-binaria.ts";
import { decodificarEntidades, fechaDdMmAaaa, fechaIso, numeroMes, textoPlano } from "./rd-comun.ts";

export const BASE_CREDITO_PUBLICO = "https://www.creditopublico.gob.do";
export const urlSubastas = (anio: number) => `${BASE_CREDITO_PUBLICO}/emisiones/subastas?dlAnio=${anio}`;

export interface SubastaCp {
  fuente: "CREDITO_PUBLICO";
  numero: string;
  emisor: string;
  instrumento: string;
  fecha: string;
  url: string;
  descripcion: string;
  origen: "automatica";
}

export interface LecturaSubastas {
  subastas: SubastaCp[];
  consolidado: string | null;
  advertencias: string[];
}

/** "Subastas - Resultado de segunda ronda subasta extraordinaria no competitiva 9 de Septiembre" → partes. */
export function describirSubasta(titulo: string): { instrumento: string; dia: number | null; mes: number | null } {
  const limpio = titulo.replace(/\s+/g, " ").trim();
  const fecha = /(\d{1,2}) de ([A-Za-zÁÉÍÓÚáéíóú]+)\s*$/.exec(limpio);
  const sinFecha = fecha ? limpio.slice(0, fecha.index).trim() : limpio;
  const cuerpo = sinFecha.replace(/^Subastas?\s*-\s*/i, "").replace(/^Resultados? de\s+/i, "").trim();
  const instrumento = cuerpo ? cuerpo[0].toUpperCase() + cuerpo.slice(1) : limpio;
  return {
    instrumento,
    dia: fecha ? Number(fecha[1]) : null,
    mes: fecha ? numeroMes(fecha[2]) : null,
  };
}

/** Codifica la ruta del PDF (trae espacios y tildes) sin tocar las barras. */
function urlAbsoluta(ruta: string): string {
  return BASE_CREDITO_PUBLICO + ruta.split("/").map((p) => encodeURIComponent(p)).join("/");
}

export function parsearSubastas(html: string): LecturaSubastas {
  if (!/Cr[eé]dito P[uú]blico/i.test(html)) throw new Error("Formato inesperado: no parece la página de Crédito Público");
  const advertencias: string[] = [];
  const subastas: SubastaCp[] = [];
  const vistos = new Set<string>();

  const enlace = /<a href="(\/Content\/subastas\/resultados\/(\d{4})\/[^"]+?\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const m of html.matchAll(enlace)) {
    const ruta = decodificarEntidades(m[1]);
    const anio = Number(m[2]);
    const cuerpo = m[3];
    const titulo = textoPlano(/<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(cuerpo)?.[1] ?? "");
    const pie = textoPlano(/<p[^>]*>([\s\S]*?)<\/p>/i.exec(cuerpo)?.[1] ?? ""); // "10/09/2026 | 189 KB"
    const publicado = fechaDdMmAaaa(pie);
    const publicadoTexto = /\d{1,2}\/\d{1,2}\/\d{4}/.exec(pie)?.[0];
    if (!titulo) {
      advertencias.push(`Resultado sin título: ${ruta}`);
      continue;
    }
    const d = describirSubasta(titulo);
    const fechaSubasta = d.dia && d.mes ? fechaIso(anio, d.mes, d.dia) : null;
    const fecha = fechaSubasta ?? publicado;
    if (!fecha) {
      advertencias.push(`Sin fecha legible: «${titulo}»`);
      continue;
    }
    // Número estable: la ruta del PDF oficial (año + nombre del archivo), sin la extensión.
    const numero = ruta.replace(/^\/Content\/subastas\//, "").replace(/\.pdf$/i, "");
    if (vistos.has(numero)) continue;
    vistos.add(numero);
    subastas.push({
      fuente: "CREDITO_PUBLICO",
      numero,
      emisor: "Ministerio de Hacienda y Economía",
      instrumento: d.instrumento,
      fecha,
      url: urlAbsoluta(ruta),
      descripcion: `${titulo}.${publicadoTexto ? ` Publicado el ${publicadoTexto}.` : ""} Monto y tasa de corte: ver el PDF oficial.`,
      origen: "automatica",
    });
  }
  const consolidado = /<a href="(\/Content\/subastas\/consolidados\/[^"]+?\.xlsx)"/i.exec(html)?.[1];
  return {
    subastas,
    consolidado: consolidado ? urlAbsoluta(decodificarEntidades(consolidado)) : null,
    advertencias,
  };
}

export interface FilaConsolidado {
  /** Código del título, p. ej. «MH1-2041». */
  titulo: string;
  /** Texto completo de la celda del título («MH1-2041 · Monto de Emisión RD$100,000.0 MM · Cupón 12.0000%»). */
  detalleTitulo: string;
  fecha: string;
  vencimiento: string | null;
  subastado: string | null;
  demandado: string | null;
  adjudicado: string;
  /** Tasa de corte en % (0.1044 con formato 0.0000% → «10.44»). */
  tasaCorte: string;
  /** Aviso si el vencimiento no cuadra con el año del código del título. */
  aviso: string | null;
}

function fechaCelda(h: HojaXlsx, ref: string, fecha1904: boolean): string | null {
  const c = h.celda(ref);
  if (!c) return null;
  if (c.tipo === "numero") return serialAFecha(c.texto, fecha1904);
  return fechaDdMmAaaa(c.texto);
}

/**
 * «Consolidado de Subastas» de Crédito Público: una fila por ronda (competitiva y segunda ronda),
 * con el título en una celda combinada que abarca sus rondas. Las columnas se ubican por su encabezado.
 */
export function parsearConsolidado(libro: LibroXlsx): { filas: FilaConsolidado[]; advertencias: string[] } {
  const h = libro.hojas[0];
  if (!h) throw new Error("Consolidado sin hojas");
  const advertencias: string[] = [];
  let filaEnc: number | null = null;
  const col: Record<string, string> = {};
  const claves: [string, RegExp][] = [
    ["titulo", /^subasta$/i],
    ["fecha", /^fecha\s+subasta$/i],
    ["vencimiento", /^fecha\s+vencimiento$/i],
    ["subastado", /^subastado$/i],
    ["demandado", /^demandado$/i],
    ["adjudicado", /^adjudicado$/i],
    ["tasa", /^tasa\s+de\s+corte$/i],
  ];
  for (const n of h.numerosDeFila) {
    const celdas = [...h.fila(n).values()];
    for (const [clave, re] of claves) {
      const c = celdas.find((x) => x.tipo === "texto" && re.test(x.texto.trim()));
      if (c) col[clave] = c.columna;
    }
    if (claves.every(([k]) => col[k])) {
      filaEnc = n;
      break;
    }
  }
  if (filaEnc === null) throw new Error("Consolidado con formato inesperado: no se encontró el encabezado (Subasta … Tasa de Corte)");

  const filas: FilaConsolidado[] = [];
  let titulo = "";
  let detalleTitulo = "";
  for (const n of h.numerosDeFila.filter((x) => x > filaEnc!)) {
    const t = h.texto(`${col.titulo}${n}`);
    if (t) {
      const partes = t.split(/\n+/).map((x) => x.trim()).filter(Boolean);
      titulo = partes[0];
      detalleTitulo = partes.join(" · ");
    }
    const fecha = fechaCelda(h, `${col.fecha}${n}`, libro.fecha1904);
    if (!fecha) continue; // totales, notas o filas vacías
    const adjudicado = numeroExcel(h.celda(`${col.adjudicado}${n}`)?.texto);
    const tasaCelda = h.celda(`${col.tasa}${n}`);
    const tasa = valorVisible(tasaCelda);
    if (!titulo || adjudicado === null || tasa === null) {
      advertencias.push(`Consolidado fila ${n}: falta el título, el monto adjudicado o la tasa de corte; se omite`);
      continue;
    }
    const vencimiento = fechaCelda(h, `${col.vencimiento}${n}`, libro.fecha1904);
    const anioCodigo = /-(\d{4})$/.exec(titulo)?.[1];
    const aviso =
      anioCodigo && vencimiento && vencimiento.slice(0, 4) !== anioCodigo
        ? `El Consolidado indica vencimiento ${vencimiento}, que no coincide con el año del código ${titulo}; revisar el PDF oficial.`
        : null;
    filas.push({
      titulo,
      detalleTitulo,
      fecha,
      vencimiento,
      subastado: numeroExcel(h.celda(`${col.subastado}${n}`)?.texto),
      demandado: numeroExcel(h.celda(`${col.demandado}${n}`)?.texto),
      adjudicado,
      tasaCorte: new Big(tasa).round(6, Big.roundHalfUp).toFixed(),
      aviso,
    });
  }
  return { filas, advertencias };
}

const miles = (n: string) => new Big(n).div(1_000_000).round(1, Big.roundHalfUp).toFixed(1).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/**
 * Une las cifras del Consolidado a las subastas de la página por fecha (una ronda por día). Si una fecha
 * del Consolidado no tiene PDF en la página, se guarda igual con el enlace al Consolidado.
 */
export function unirConsolidado(subastas: SubastaCp[], c: FilaConsolidado[], urlConsolidado: string) {
  const porFecha = new Map<string, SubastaCp[]>();
  for (const s of subastas) porFecha.set(s.fecha, [...(porFecha.get(s.fecha) ?? []), s]);
  const salida: Record<string, unknown>[] = subastas.map((s) => ({ ...s }));
  const advertencias: string[] = [];
  for (const f of c) {
    const candidatas = porFecha.get(f.fecha) ?? [];
    const cobertura = f.subastado && f.demandado && new Big(f.subastado).gt(0) ? new Big(f.demandado).div(f.subastado).round(2, Big.roundHalfUp).toFixed(2) : null;
    const montos = [
      f.subastado ? `subastado RD$${miles(f.subastado)} MM` : null,
      f.demandado ? `demandado RD$${miles(f.demandado)} MM${cobertura ? ` (cobertura ${cobertura} veces)` : ""}` : null,
      `adjudicado RD$${miles(f.adjudicado)} MM a una tasa de corte de ${f.tasaCorte} %`,
    ].filter(Boolean).join(", ");
    const resumen = [
      `${f.detalleTitulo}.`,
      f.vencimiento ? `Vence el ${f.vencimiento}.` : null,
      `${montos[0].toUpperCase()}${montos.slice(1)}.`,
      f.aviso,
      "Cifras del Consolidado de Subastas de Crédito Público.",
    ].filter(Boolean).join(" ");
    const cifras = { monto: f.adjudicado, moneda: "DOP", tasa: f.tasaCorte };
    if (candidatas.length === 1) {
      const fila = salida.find((x) => x.numero === candidatas[0].numero)!;
      Object.assign(fila, cifras, { instrumento: `${f.titulo} · ${candidatas[0].instrumento}`, descripcion: resumen });
    } else {
      if (candidatas.length > 1) advertencias.push(`Consolidado ${f.fecha}: ${candidatas.length} PDF con la misma fecha; se guarda aparte`);
      salida.push({
        fuente: "CREDITO_PUBLICO",
        numero: `consolidado/${f.fecha}/${f.titulo}`,
        emisor: "Ministerio de Hacienda y Economía",
        instrumento: f.titulo,
        fecha: f.fecha,
        url: urlConsolidado,
        descripcion: resumen,
        origen: "automatica",
        ...cifras,
      });
    }
  }
  return { filas: salida, advertencias };
}

/** `obtenerBytes` se inyecta en pruebas; en producción usa el Lector (robots.txt incluido). */
export function crearTareaCreditoPublico(obtenerBytes?: () => ObtenerBytes): Tarea {
  return {
    nombre: "credito-publico",
    fuenteId: "credito_publico",
    async ejecutar(ctx) {
      const anio = Number(new Date(ctx.ahora.getTime() - 4 * 3_600_000).toISOString().slice(0, 4));
      const r = await ctx.obtener(urlSubastas(anio));
      const lectura = parsearSubastas(r.texto);
      const advertencias = [...lectura.advertencias];
      let filas: Record<string, unknown>[] = lectura.subastas as unknown as Record<string, unknown>[];
      let conCifras = 0;
      if (lectura.consolidado) {
        try {
          const libro = leerXlsx(await (obtenerBytes ? obtenerBytes() : crearObtenerBytes())(lectura.consolidado));
          const c = parsearConsolidado(libro);
          const u = unirConsolidado(lectura.subastas, c.filas, lectura.consolidado);
          filas = u.filas;
          conCifras = c.filas.length;
          advertencias.push(...c.advertencias, ...u.advertencias);
        } catch (e) {
          advertencias.push(`Consolidado: ${(e as Error).message}; las subastas quedan sin monto ni tasa`);
        }
      } else {
        advertencias.push("La página no enlaza el Consolidado de este año; las subastas quedan sin monto ni tasa");
      }
      // Upsert por (fuente, numero). Sin Consolidado, monto/moneda/tasa no se envían: así no se borra nada.
      await ctx.guardar("emisiones_rd", filas, { conflicto: "fuente,numero" });
      const ultima = lectura.subastas.map((s) => s.fecha).sort().at(-1) ?? null;
      return {
        parcial: advertencias.length > 0,
        advertencias,
        detalle: { anio, subastas: lectura.subastas.length, con_cifras: conCifras, ultima_subasta: ultima, consolidado: lectura.consolidado },
      };
    },
  };
}

export const tareaCreditoPublico: Tarea = crearTareaCreditoPublico();
