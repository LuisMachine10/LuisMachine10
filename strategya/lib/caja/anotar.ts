import "server-only";

// Anotar un movimiento del Presupuesto (lo usan «+ Ingreso / + Gasto / …», el «¿Ya se hizo?» del calendario, las líneas
// de «Lo que planeaste ahorrar este mes» y la renovación de un mutuo). Valida con lib/caja/validar.ts y con las listas
// del manual (lib/finanzas/catalogo.ts · errorDeCuentas: la misma regla que el trigger de la base), separa capital,
// interés y cargos de un pago de deuda y, si el dinero va a (o sale de) una inversión que no vive en el Presupuesto,
// actualiza su fila del registro. Escribe con la sesión de Mena: RLS en la base es la barrera real.

import Big from "big.js";
import { revalidatePath } from "next/cache";
import { leerCaja } from "@/lib/caja/datos";
import { separarPago } from "@/lib/caja/deudas";
import { COLUMNAS, filasADatos } from "@/lib/caja/filas";
import { enMoneda, rd } from "@/lib/caja/formato";
import { adicionalDesdeV1 } from "@/lib/caja/resultados";
import { type DatosCaja, esDeuda, type Movimiento } from "@/lib/caja/tipos";
import { type Campos, montoDeTexto, validarMovimiento } from "@/lib/caja/validar";
import { errorDeCuentas, esTipoFin, type FilaNombrada } from "@/lib/finanzas/catalogo";
import { personal } from "@/lib/supabase/servidor";

export interface EstadoAccion {
  ok: boolean;
  mensaje: string | null;
  /** Cambia en cada respuesta para que el formulario sepa que hubo una nueva. */
  vez: number;
}

export const bien = (mensaje: string): EstadoAccion => ({ ok: true, mensaje, vez: Date.now() });
export const mal = (mensaje: string): EstadoAccion => ({ ok: false, mensaje, vez: Date.now() });

export function campos(form: FormData): Campos {
  const c: Campos = {};
  for (const [k, v] of form.entries()) if (typeof v === "string") c[k] = v;
  return c;
}

export function refrescar() {
  revalidatePath("/caja", "layout");
  revalidatePath("/capital", "layout");
  revalidatePath("/");
}

function errorBase(e: { message: string } | null, que: string): EstadoAccion | null {
  return e ? mal(`No se pudo ${que}: ${e.message}`) : null;
}

/**
 * Pago de tarjeta o préstamo: decide cuánto fue interés (lo escrito, o con la tasa del préstamo, o nada)
 * y lo explica en palabras. Devuelve el error si el destino no es una deuda y se escribió el capital.
 */
export async function interesDelPago(m: Omit<Movimiento, "id">, datos: DatosCaja): Promise<{ interes: string | null; cargos: string | null; frase: string } | { error: string }> {
  if (m.tipo !== "pago_tarjeta") return { interes: null, cargos: null, frase: "" };
  const destino = datos.cuentas.find((c) => c.id === m.destino);
  if (!destino || !esDeuda(destino.tipo)) {
    if (m.interes || m.cargos) return { error: "Solo los pagos a una tarjeta o a un préstamo llevan capital e interés. Elige la deuda que pagas." };
    return { interes: null, cargos: null, frase: "" };
  }
  const sep = separarPago(datos, m, m.interes, m.cargos);
  const mon = (x: string) => enMoneda(x, m.moneda);
  const conCargos = sep.cargos ? ` y ${mon(sep.cargos)} fueron cargos de la cuota (seguro u otros: gasto, no baja la deuda)` : "";
  const frase =
    sep.como === "tasa"
      ? ` De tu pago, ${mon(sep.capital)} bajó lo que debes, ${mon(sep.interes ?? "0")} fue interés (debías ${mon(sep.deuda ?? "0")} × ${new Big(sep.tasa ?? "0").times(100).toFixed(2)} % al año ÷ 12)${conCargos}.`
      : sep.como === "escrito"
        ? ` ${mon(sep.capital)} bajó lo que debes y ${mon(sep.interes ?? "0")} fue interés${conCargos}.`
        : sep.cargos
          ? ` ${mon(sep.capital)} bajó lo que debes en «${destino.nombre}»${conCargos}.`
          : ` Todo el pago bajó lo que debes en «${destino.nombre}».`;
  return { interes: sep.interes, cargos: sep.cargos, frase };
}

/**
 * Antes de guardar: el movimiento respeta las listas del manual (lib/finanzas/catalogo.ts · errorDeCuentas, la misma
 * regla que valida la base). Devuelve el error en palabras simples o null. Las inversiones fuera del Presupuesto
 * (registroOrigen / registroDestino) se leen del registro.
 */
export async function revisarListas(m: Omit<Movimiento, "id">, datos: DatosCaja): Promise<string | null> {
  const deCaja = (id: string | null): FilaNombrada => {
    const c = id ? datos.cuentas.find((x) => x.id === id) : undefined;
    if (!c) return null;
    const tipo = c.tipoFin ?? ({ banco: "corriente", efectivo: "efectivo", ahorro: "ahorro", tarjeta: "tarjeta", prestamo: "prestamo" } as const)[c.tipo];
    return { tipo, debito: c.debito ?? false, nombre: c.nombre };
  };
  let reg: { id: string; tipo: string; nombre: string; tiene_debito: boolean | null }[] = [];
  const ids = [m.registroOrigen, m.registroDestino].filter((x): x is string => !!x);
  if (ids.length) {
    const r = await (await personal()).from("activos").select("id, tipo, nombre, tiene_debito").in("id", ids);
    if (r.error) return `No se pudo leer esa inversión: ${r.error.message}`;
    reg = (r.data ?? []) as typeof reg;
    if (reg.length !== ids.length) return "Esa inversión ya no está en Mis cuentas. Recarga la página.";
  }
  const deReg = (id: string | null | undefined): FilaNombrada => {
    const a = id ? reg.find((x) => x.id === id) : undefined;
    return a && esTipoFin(a.tipo) ? { tipo: a.tipo, debito: a.tiene_debito === true, nombre: a.nombre } : null;
  };
  const origen = m.registroOrigen ? deReg(m.registroOrigen) : deCaja(m.cuenta);
  const destino = m.destino ? deCaja(m.destino) : deReg(m.registroDestino);
  return errorDeCuentas(m.tipo, origen, destino);
}

/** Lee el Presupuesto para validar un movimiento (o el error para Mena). */
export async function cajaParaValidar(): Promise<DatosCaja | string> {
  try {
    return (await leerCaja()).datos;
  } catch (e) {
    return `No se pudo leer tu Presupuesto para revisar el movimiento: ${(e as Error).message}. Inténtalo de nuevo.`;
  }
}

export async function anotarMovimiento(form: FormData): Promise<EstadoAccion> {
  const r = validarMovimiento(campos(form));
  if (!r.ok) return mal(r.error);
  const m = r.valor;
  const datos = await cajaParaValidar();
  if (typeof datos === "string") return mal(datos);
  const lista = await revisarListas(m, datos);
  if (lista) return mal(lista);
  const pago = await interesDelPago(m, datos);
  if ("error" in pago) return mal(pago.error);
  const db = await personal();
  const { data: creado, error } = await db
    .from("caja_movimientos")
    .insert({
      fecha: m.fecha, tipo: m.tipo, monto: m.monto, moneda: m.moneda, tasa: m.tasa, cuenta: m.cuenta,
      destino: m.destino, categoria: m.categoria, nota: m.nota, recurrente_id: m.recurrenteId, interes: pago.interes, parte: m.parte ?? null,
      cargos: pago.cargos, categoria_cargos: m.categoriaCargos ?? null, registro_origen: m.registroOrigen ?? null, registro_destino: m.registroDestino ?? null,
    })
    .select("id")
    .single();
  const e = errorBase(error, "registrar el movimiento");
  if (e) return e;
  const inversion = await moverInversionFuera(m, (creado as { id: string }).id, campos(form));
  if (inversion.error) return mal(inversion.error);
  let nota = "";
  if (m.recurrenteId) {
    // Si estaba omitido ese día, confirmar lo saca de omitidos.
    await db.from("caja_omitidos").delete().eq("fecha", m.fecha).eq("recurrente_id", m.recurrenteId);
    // Un fijo de antes sin categoría queda enlazado a la que se eligió al decir «Sí, ya se hizo».
    if (m.categoria) {
      const enlazado = await db.from("caja_recurrentes").update({ categoria: m.categoria, actualizado_en: new Date().toISOString() }).eq("id", m.recurrenteId).is("categoria", null).select("id");
      if (!enlazado.error && enlazado.data?.length) {
        const cat = await db.from("caja_categorias").select("id, nombre, adicional::text").eq("id", m.categoria).maybeSingle();
        nota = " El fijo quedó en esa categoría desde ahora.";
        if (cat.data) nota += await descontarDelAdicional(m.recurrenteId, cat.data as unknown as { id: string; nombre: string; adicional: string | null });
      }
    }
  }
  refrescar();
  return bien(m.recurrenteId ? `Listo: ya se hizo.${pago.frase}${nota}${inversion.frase ?? ""}` : `Anotado.${pago.frase}${inversion.frase ?? ""}`);
}

/**
 * Ahorro hacia (o rescate desde) una inversión que NO vive en el Presupuesto (acciones, fondos por cuotas): su fila del
 * registro se actualiza aquí y el libro del Portafolio guarda la compra o la venta (con el movimiento enlazado). Si
 * Mena escribió las unidades, se suman o restan; si no, se avisa que las actualice en Mis cuentas (no se inventan).
 */
async function moverInversionFuera(m: Omit<Movimiento, "id">, movimientoId: string, c: Campos): Promise<{ error?: string; frase?: string }> {
  const id = m.registroDestino ?? m.registroOrigen;
  if (!id) return { frase: "" };
  const entra = !!m.registroDestino;
  const db = await personal();
  const a = await db.from("activos").select("id, nombre, simbolo, moneda, cantidad::text, precio::text").eq("id", id).maybeSingle();
  if (a.error || !a.data) return { error: "Se anotó el movimiento, pero no se encontró la inversión en Mis cuentas. Revísala allí." };
  const f = a.data as unknown as { id: string; nombre: string; simbolo: string | null; moneda: string; cantidad: string; precio: string };
  let unidades: string | null = null;
  try {
    unidades = montoDeTexto(c.unidades);
  } catch {
    return { error: "Se anotó el movimiento, pero «unidades» no es un número: corrígelas en Mis cuentas." };
  }
  const deSaldo = new Big(f.precio).eq(1);
  const cantidad = deSaldo ? m.monto : unidades;
  if (cantidad && new Big(cantidad).gt(0)) {
    const nueva = new Big(f.cantidad)[entra ? "plus" : "minus"](cantidad);
    if (nueva.lt(0)) return { error: `Se anotó el movimiento, pero «${f.nombre}» quedaría en negativo: corrige las unidades en Mis cuentas.` };
    const u = await db.from("activos").update({ cantidad: nueva.toFixed(), actualizado_en: new Date().toISOString() }).eq("id", f.id);
    if (u.error) return { error: `Se anotó el movimiento, pero no se actualizó «${f.nombre}»: ${u.error.message}` };
    const precio = deSaldo ? "1" : new Big(m.monto).div(cantidad).round(6, Big.roundHalfUp).toFixed();
    await db.from("transacciones").insert({
      id: `mv-${movimientoId}`.slice(0, 80).replace(/[^A-Za-z0-9_.:-]/g, ""), activo_id: f.id, simbolo: f.simbolo ?? "", tipo: entra ? "compra" : "venta", fecha: m.fecha,
      cantidad, precio, comision: "0", moneda: f.moneda, movimiento_id: movimientoId,
    });
    return { frase: entra ? ` «${f.nombre}» ya lo tiene sumado.` : ` «${f.nombre}» ya lo tiene restado.` };
  }
  return { frase: ` Actualiza cuántas unidades te quedan en «${f.nombre}» (Portafolio → Mis cuentas): sin ese dato no las cambiamos.` };
}

/**
 * Para no contarlo dos veces: si la categoría ya tenía escrito un monto que incluía este fijo (como en la
 * versión anterior, donde no estaban enlazados), su adicional baja en lo que el fijo pone al mes.
 * Devuelve la frase para avisarle a Mena (vacía si no cambió nada).
 */
export async function descontarDelAdicional(recurrenteId: string, cat: { id: string; nombre: string; adicional: string | null }): Promise<string> {
  if (!cat.adicional) return "";
  const db = await personal();
  const r = await db.from("caja_recurrentes").select(COLUMNAS.caja_recurrentes).eq("id", recurrenteId).maybeSingle();
  if (r.error || !r.data) return "";
  const vacio = { config: null, cuentas: [], categorias: [], movimientos: [], omitidos: [], saldos: [], notas: [] };
  const [rec] = filasADatos({ ...vacio, recurrentes: [r.data as unknown as Record<string, unknown>] }).recurrentes;
  const nuevo = adicionalDesdeV1(cat.adicional, [rec]);
  if (nuevo === cat.adicional) return "";
  const u = await db.from("caja_categorias").update({ adicional: nuevo, actualizado_en: new Date().toISOString() }).eq("id", cat.id);
  return u.error ? "" : ` El monto adicional de «${cat.nombre}» pasó a ${rd(nuevo ?? "0")} para no contar este fijo dos veces.`;
}

