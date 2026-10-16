"use client";

import { useActionState } from "react";
import { type EstadoRegla, guardarRegla } from "./acciones";

export interface DatosRegla {
  id: number;
  tipo: "cambio_pct_dia" | "nivel_sobre" | "nivel_bajo" | "cualquier_cambio";
  umbral: string | null;
  activa: boolean;
  nota: string | null;
  serie: string;
  tipoTexto: string;
  unidad: string;
}

export function FormularioRegla({ r }: { r: DatosRegla }) {
  const [estado, accion, enviando] = useActionState<EstadoRegla, FormData>(guardarRegla, { ok: null, mensaje: null });
  const base = `regla-${r.id}`;
  const unidad = r.tipo === "cambio_pct_dia" ? "%" : r.unidad;
  return (
    <form action={accion} className="regla" aria-labelledby={`${base}-t`}>
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="tipo" value={r.tipo} />
      <div className="regla-titulo" id={`${base}-t`}>
        <strong>{r.serie}</strong> <span className="tenue">· {r.tipoTexto}</span>
      </div>
      <div className="regla-campos">
        {r.tipo === "cualquier_cambio" ? (
          <span className="chico tenue">Sin umbral: avisa con cualquier cambio confirmado.</span>
        ) : (
          <label className="campo-umbral">
            <span className="sr-solo">Umbral de {r.serie} ({r.tipoTexto})</span>
            <input
              name="umbral"
              defaultValue={r.umbral ?? ""}
              inputMode="decimal"
              autoComplete="off"
              required
              pattern="[0-9][0-9,]*(\.[0-9]+)?"
              aria-describedby={estado.mensaje ? `${base}-m` : undefined}
            />
            <span className="unidad chico">{unidad}</span>
          </label>
        )}
        <label className="campo-activa chico">
          <input type="checkbox" name="activa" defaultChecked={r.activa} /> Activa
        </label>
      </div>
      <label className="campo-nota chico">
        Nota
        <textarea name="nota" defaultValue={r.nota ?? ""} rows={2} maxLength={300} />
      </label>
      <div className="regla-pie">
        <button type="submit" className="boton" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
        {estado.mensaje ? (
          <span id={`${base}-m`} role="status" className={`chico ${estado.ok ? "sube" : "baja"}`}>
            {estado.mensaje}
          </span>
        ) : null}
      </div>
    </form>
  );
}
