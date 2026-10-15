// Mismo contrato que almacenSupabase, pero por SQL directo con el rol service_role.
import type pg from "pg";
import type { Almacen } from "../../supabase/functions/_shared/ingesta.ts";

const IDENT = /^[a-z_][a-z0-9_]*$/;

export function almacenPg(pool: pg.Pool): Almacen {
  const servicio = async <T>(sql: string, params: unknown[]): Promise<T[]> => {
    const c = await pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role service_role");
      const r = await c.query(sql, params);
      await c.query("commit");
      return r.rows as T[];
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  };
  return {
    async iniciarCorrida(tarea, fuenteId) {
      const [f] = await servicio<{ id: string }>("insert into mercado.corridas (tarea, fuente_id) values ($1, $2) returning id", [tarea, fuenteId]);
      return Number(f.id);
    },
    async terminarCorrida(id, c) {
      await servicio("update mercado.corridas set fin = now(), estado = $2, error = $3, filas = $4, detalle = $5 where id = $1", [
        id, c.estado, c.error ?? null, c.filas, JSON.stringify(c.detalle),
      ]);
    },
    async registrarObservaciones(corridaId, filas) {
      const [r] = await servicio<{ recibidas: number; insertadas: number; actualizadas: number }>(
        "select * from mercado.registrar_observaciones($1, $2::jsonb)",
        [corridaId, JSON.stringify(filas)],
      );
      return r;
    },
    async guardar(tabla, filas, opciones = {}) {
      if (!IDENT.test(tabla)) throw new Error(`tabla inválida: ${tabla}`);
      if (filas.length === 0) return 0;
      const columnas = Object.keys(filas[0]);
      columnas.forEach((c) => { if (!IDENT.test(c)) throw new Error(`columna inválida: ${c}`); });
      const conflicto = opciones.conflicto?.split(",").map((c) => c.trim()) ?? [];
      conflicto.forEach((c) => { if (!IDENT.test(c)) throw new Error(`columna inválida: ${c}`); });
      // jsonb_populate_recordset respeta los tipos de la tabla (numeric, timestamptz…).
      let sql = `insert into mercado.${tabla} (${columnas.join(", ")})
        select ${columnas.join(", ")} from jsonb_populate_recordset(null::mercado.${tabla}, $1::jsonb)`;
      if (conflicto.length) {
        const resto = columnas.filter((c) => !conflicto.includes(c));
        sql += opciones.ignorarDuplicados || resto.length === 0
          ? ` on conflict (${conflicto.join(", ")}) do nothing`
          : ` on conflict (${conflicto.join(", ")}) do update set ${resto.map((c) => `${c} = excluded.${c}`).join(", ")}`;
      }
      sql += " returning 1";
      const r = await servicio(sql, [JSON.stringify(filas)]);
      return r.length;
    },
    async rpc<T>(funcion: string, args: Record<string, unknown> = {}) {
      if (!IDENT.test(funcion)) throw new Error(`función inválida: ${funcion}`);
      const nombres = Object.keys(args);
      nombres.forEach((n) => { if (!IDENT.test(n)) throw new Error(`argumento inválido: ${n}`); });
      const sql = `select mercado.${funcion}(${nombres.map((n, i) => `${n} => $${i + 1}`).join(", ")}) as r`;
      const valores = nombres.map((n) => {
        const v = args[n];
        return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
      });
      const [fila] = await servicio<{ r: T }>(sql, valores);
      return fila?.r as T;
    },
  };
}
