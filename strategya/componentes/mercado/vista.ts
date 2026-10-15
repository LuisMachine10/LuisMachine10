import "server-only";
import { cache } from "react";
import { datosMercado, type DatosMercado } from "@/lib/datos-mercado";
import { armarItem, type ContextoItem, type ItemMercado } from "@/lib/mercado-vista";

export interface VistaMercado {
  datos: DatosMercado;
  ahora: Date;
  ctx: ContextoItem;
  item(id: string): ItemMercado | null;
}

/** Datos del módulo ya armados para pantalla. Una sola lectura por petición, compartida por todos los paneles. */
export const vistaMercado = cache(async (): Promise<VistaMercado> => {
  const datos = await datosMercado();
  const ahora = new Date();
  const fuentesConFallo = new Set(datos.tareas.filter((t) => t.estado === "error" && t.fuente_id).map((t) => t.fuente_id!));
  const ctx: ContextoItem = { ahora, fuentes: new Map(datos.fuentes.map((f) => [f.id, f])), fuentesConFallo };
  const series = new Map(datos.series.map((s) => [s.id, s]));
  const ultimas = new Map(datos.ultimas.map((o) => [o.serie_id, o]));
  const memo = new Map<string, ItemMercado | null>();
  return {
    datos,
    ahora,
    ctx,
    item(id) {
      if (!memo.has(id)) {
        const s = series.get(id);
        memo.set(id, s ? armarItem(s, ultimas.get(id), ctx) : null);
      }
      return memo.get(id)!;
    },
  };
});
