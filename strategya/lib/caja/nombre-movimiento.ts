// El nombre que se muestra para un movimiento o fijo: el formulario del manual que le corresponde («Ahorro o inversión»,
// «Rescate o venta de inversión», «Cambio de moneda»…), no solo el tipo guardado en la base («transferencia»).
// Puro: lo usan las listas de Movimientos, Configuración, el calendario y los resúmenes.

import { formularioDeTransferencia, type TipoFin } from "../finanzas/catalogo";
import { NOMBRE_TIPO, type Categoria, type Cuenta, type TipoCuenta, type TipoMovimiento } from "./tipos";

const TIPO_DE_CAJA: Record<TipoCuenta, TipoFin> = { banco: "corriente", efectivo: "efectivo", ahorro: "ahorro", tarjeta: "tarjeta", prestamo: "prestamo" };

const NOMBRE_TRANSFERENCIA = {
  ahorro: "Ahorro o inversión",
  rescate: "Rescate o venta de inversión",
  cambio: "Cambio de moneda",
  mover: NOMBRE_TIPO.transferencia,
} as const;

export interface MovimientoNombrable {
  tipo: TipoMovimiento;
  cuenta?: string | null;
  destino?: string | null;
  categoria?: string | null;
  registroOrigen?: string | null;
  registroDestino?: string | null;
}

export function nombreDeMovimiento(m: MovimientoNombrable, cuentas: readonly Pick<Cuenta, "id" | "tipo" | "tipoFin" | "moneda">[], categorias: readonly Pick<Categoria, "id" | "tipo">[] = []): string {
  if (m.tipo !== "transferencia") return NOMBRE_TIPO[m.tipo];
  if (m.registroOrigen) return NOMBRE_TRANSFERENCIA.rescate;
  if (m.registroDestino) return NOMBRE_TRANSFERENCIA.ahorro;
  const fila = (id: string | null | undefined) => {
    const c = id ? cuentas.find((x) => x.id === id) : undefined;
    return c ? { tipo: c.tipoFin ?? TIPO_DE_CAJA[c.tipo], moneda: c.moneda ?? "DOP" } : null;
  };
  const o = fila(m.cuenta);
  const d = fila(m.destino);
  const f = formularioDeTransferencia(o, d, o?.moneda, d?.moneda);
  if (f === "mover" && m.categoria && categorias.some((k) => k.id === m.categoria && k.tipo === "ahorro_inversion")) return NOMBRE_TRANSFERENCIA.ahorro;
  return NOMBRE_TRANSFERENCIA[f];
}
