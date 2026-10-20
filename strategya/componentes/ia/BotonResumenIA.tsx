"use client";

import { useActionState } from "react";
import { type EstadoPedido, pedirResumenIA } from "./acciones";

/** Pide «Las 5 del día» y «Guerras» a demanda (una vez cada 15 min como máximo; lo limita la base). */
export function BotonResumenIA() {
  const [estado, accion, enviando] = useActionState<EstadoPedido>(pedirResumenIA, { ok: null, mensaje: null });
  return (
    <form action={accion} className="boton-resumen">
      <button type="submit" className="boton secundario aj-boton-alto" disabled={enviando}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
        </svg>
        {enviando ? "Pidiendo…" : "Pedir un resumen nuevo"}
      </button>
      {estado.mensaje ? (
        <span role="status" className={`chico ${estado.ok ? "sube" : "baja"}`}>
          {estado.mensaje}
        </span>
      ) : (
        <span className="chico tenue">Se puede pedir una vez cada 15 minutos.</span>
      )}
    </form>
  );
}
