import "server-only";
import Big from "big.js";
import { hoyRD } from "@/lib/capital/fechas";
import { leerCaja } from "@/lib/caja/datos";
import type { DatosCaja } from "@/lib/caja/tipos";
import { type FilaTransaccion, filaATransaccion } from "@/lib/capital/importar";
import { armarFx, type Contexto, type ObservacionFx, type PrecioMercado, type Referencia, type ResultadoPresupuesto } from "@/lib/capital/posicion";
import { aActivo, COLUMNAS_REGISTRO, conSaldosVigentes, esInversion, filaARegistro, type ItemRegistro } from "@/lib/capital/registro";
import { type Cierres, type Ips, type Parametros, parametrosVacios } from "@/lib/capital/tipos";
import { leerCierre, leerIps, leerParametros } from "@/lib/capital/validar";
import { mercado, personal } from "@/lib/supabase/servidor";

// Lecturas de Mena Capital. Cifras siempre como texto (::text) para no pasar por float en PostgREST.

function exigir<T>(r: { data: T | null; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`No se pudo leer ${que}: ${r.error.message}`);
  return r.data as T;
}

export interface EstadoPrecios {
  estado: string;
  inicio: string;
  ultima_ok: string | null;
  error: string | null;
}

export interface DatosCapital {
  ctx: Contexto;
  /** false = no hay fila en personal.parametros (Mena todavía no importó ni configuró). */
  configurado: boolean;
  ips: Ips | null;
  tareaPrecios: EstadoPrecios | null;
  ahora: Date;
  /** Fecha de la última actualización de cualquier tabla personal (para el encabezado). */
  actualizado: string | null;
  /** Registro único completo, también las filas unidas (archivadas). ctx.registro trae solo las vigentes. */
  registroCompleto: ItemRegistro[];
  /** Aportes del plan ya confirmados («Sí, lo hice»): transacciones con su mes del plan. */
  aportesConfirmados: { id: string; activoId: string; mes: string; fecha: string | null; monto: string; movimientoId: string | null }[];
  /** El Presupuesto: sus datos (para elegir de qué cuenta sale un aporte) o el motivo si no se pudo leer. */
  caja: { datos: DatosCaja | null; error: string | null };
}

const SERIES_REFERENCIA: Record<string, string> = {
  TPM_BCRD: "tasa de política monetaria (BCRD)",
  INFLACION_RD: "inflación interanual RD",
};

export async function datosCapital(): Promise<DatosCapital> {
  const ahora = new Date();
  const [db, mdb] = await Promise.all([personal(), mercado()]);
  const [pRes, aRes, tRes, cRes, iRes, fxRes, cotRes, refRes, tareaRes] = await Promise.all([
    db.from("parametros").select("datos, actualizado_en").eq("id", 1).maybeSingle(),
    db.from("activos").select(COLUMNAS_REGISTRO).order("orden").order("id"),
    db
      .from("transacciones")
      .select("id, activo_id, simbolo, tipo, fecha, cantidad::text, precio::text, comision::text, moneda, aporte_mes, movimiento_id")
      .order("fecha", { ascending: true, nullsFirst: true })
      .order("id"),
    db.from("cierres").select("mes, datos, actualizado_en").order("mes"),
    db.from("ips").select("datos").eq("id", 1).maybeSingle(),
    mdb
      .from("observaciones")
      .select("valor::text, fecha_dato, recogido_en, url_dato")
      .eq("serie_id", "USDDOP_VENTA")
      .is("hora_dato", null)
      .order("fecha_dato", { ascending: false })
      .limit(2),
    mdb
      .from("cotizaciones_cartera")
      .select("simbolo, fecha, precio::text, cierre_anterior::text, hora_dato, recogido_en, url_dato, fuente")
      .order("fecha", { ascending: false })
      .limit(400),
    mdb
      .from("observaciones")
      .select("serie_id, valor::text, fecha_dato, url_dato")
      .in("serie_id", Object.keys(SERIES_REFERENCIA))
      .order("fecha_dato", { ascending: false })
      .limit(20),
    mdb.from("estado_tareas").select("estado, inicio, ultima_ok, error").eq("tarea", "precios-cartera").maybeSingle(),
  ]);
  const hoy = hoyRD(ahora);
  // El Presupuesto es otro módulo: si no responde, el Portafolio sigue con lo escrito y lo dice.
  const [enlRes, cajaLeida, resRes] = await Promise.all([
    db.from("caja_cuentas").select("id, registro_id"),
    leerCaja().then(
      (l) => ({ datos: l.datos, error: null as string | null }),
      (e: Error) => ({ datos: null, error: e.message }),
    ),
    db.rpc("resultado_mes", { p_mes: hoy }),
  ]);

  const filaP = exigir(pRes, "los parámetros") as { datos: unknown; actualizado_en: string } | null;
  const p: Parametros = filaP ? leerParametros(filaP.datos) : parametrosVacios();
  const enlaces = new Map<string, string>();
  if (!enlRes.error) for (const e of (enlRes.data ?? []) as { id: string; registro_id: string | null }[]) if (e.registro_id) enlaces.set(e.registro_id, e.id);
  const filasRegistro = exigir(aRes, "tus cuentas, activos y deudas") as unknown as Record<string, unknown>[];
  const registroCompleto = conSaldosVigentes(
    filasRegistro.map((f) => filaARegistro(f, enlaces.get(String(f.id)) ?? null)),
    cajaLeida.datos,
    hoy,
  );
  const registro = registroCompleto.filter((i) => !i.unidoA);
  const activos = registro.filter(esInversion).map(aActivo);
  // Las tarjetas del registro reemplazan a las de los parámetros (mismos ids: el uso de cada cierre sigue valiendo).
  const tarjetasReg = registro.filter((i) => i.clase === "tarjeta");
  if (tarjetasReg.length) p.tarjetas = tarjetasReg.map((t) => ({ id: t.id, nombre: t.nombre, limite: t.limite ?? "0" }));
  const resultado = !resRes.error && resRes.data && typeof resRes.data === "object" ? (resRes.data as { mes: string; presupuestado: Record<string, string> | null; real: Record<string, string> | null }) : null;
  const presupuesto: ResultadoPresupuesto | null =
    resultado && cajaLeida.datos?.config && resultado.presupuestado && resultado.real
      ? { mes: resultado.mes, presupuestado: resultado.presupuestado, real: resultado.real, ahorroMensual: resultado.presupuestado.ahorro ?? null }
      : null;
  const filasTx = exigir(tRes, "las transacciones") as unknown as (FilaTransaccion & { aporte_mes: string | null; movimiento_id: string | null })[];
  const tx = filasTx.map(filaATransaccion);
  const aportesConfirmados = filasTx
    .filter((f) => f.aporte_mes)
    .map((f) => ({ id: f.id, activoId: f.activo_id, mes: f.aporte_mes!, fecha: f.fecha, monto: new Big(f.cantidad).times(f.precio).toFixed(), movimientoId: f.movimiento_id }));
  const filasC = exigir(cRes, "los cierres") as { mes: string; datos: unknown; actualizado_en: string }[];
  const cierres: Cierres = {};
  for (const f of filasC) cierres[f.mes] = leerCierre(f.mes, f.datos);
  const filaI = exigir(iRes, "la política de inversión") as { datos: unknown } | null;

  const { fx, anteriorUSD } = armarFx(exigir(fxRes, "el tipo de cambio") as unknown as ObservacionFx[], p);

  // Precio vigente por símbolo: la cotización más reciente; «anterior» = pc de la fuente o la del día previo.
  const precios: Record<string, PrecioMercado> = {};
  const filasCot = exigir(cotRes, "los precios de la cartera") as unknown as {
    simbolo: string;
    fecha: string;
    precio: string;
    cierre_anterior: string | null;
    hora_dato: string | null;
    recogido_en: string;
    url_dato: string | null;
    fuente: string;
  }[];
  for (const f of filasCot) {
    const ya = precios[f.simbolo];
    if (!ya) {
      precios[f.simbolo] = {
        simbolo: f.simbolo,
        precio: f.precio,
        fecha: f.fecha,
        anterior: f.cierre_anterior,
        horaDato: f.hora_dato,
        recogidoEn: f.recogido_en,
        url: f.url_dato,
        fuente: f.fuente,
      };
    } else if (ya.anterior === null && f.fecha < ya.fecha) {
      ya.anterior = f.precio;
    }
  }

  const referencias: Referencia[] = [];
  for (const f of exigir(refRes, "las referencias") as unknown as { serie_id: string; valor: string; fecha_dato: string; url_dato: string | null }[]) {
    if (referencias.some((r) => r.serie === f.serie_id)) continue;
    referencias.push({ serie: f.serie_id, nombre: SERIES_REFERENCIA[f.serie_id] ?? f.serie_id, valor: new Big(f.valor).div(100), fecha: f.fecha_dato, url: f.url_dato });
  }
  referencias.sort((a, b) => (a.serie === "TPM_BCRD" ? -1 : b.serie === "TPM_BCRD" ? 1 : 0));

  const fechas = [filaP?.actualizado_en, ...filasC.map((c) => c.actualizado_en)].filter((x): x is string => !!x).sort();
  return {
    ctx: { p, activos, tx, cierres, mercado: { fx, fxAnteriorUSD: anteriorUSD, precios, referencias }, hoy, registro, presupuesto },
    configurado: filaP !== null,
    ips: filaI ? leerIps(filaI.datos) : null,
    tareaPrecios: exigir(tareaRes, "el estado de la tarea de precios") as EstadoPrecios | null,
    ahora,
    actualizado: fechas.at(-1) ?? null,
    registroCompleto,
    aportesConfirmados,
    caja: cajaLeida,
  };
}

/** Parámetros guardados (o los neutros si no hay fila), para las server actions. */
export async function parametrosGuardados(): Promise<Parametros> {
  const db = await personal();
  const r = exigir(await db.from("parametros").select("datos").eq("id", 1).maybeSingle(), "los parámetros") as { datos: unknown } | null;
  return r ? leerParametros(r.datos) : parametrosVacios();
}
