"use client";

import { useActionState } from "react";
import { type EstadoPedido, pedirResumenIA } from "./acciones";

/** Pide «Las 5 del día» y «Guerras» a demanda (una vez cada 15 min como máximo; lo limita la base). */
export function BotonResumenIA() {
  const [estado, accion, enviando] = useActionState<EstadoPedido>(pedirResumenIA, { ok: null, mensaje: null });
  return (
    <form action={accion} className="boton-resumen">
      <button type="submit" className="boton" disabled={enviando}>
        {enviando ? "Pidiendo…" : "Actualizar resumen con IA"}
      </button>
      {estado.mensaje ? (
        <span role="status" className={`chico ${estado.ok ? "sube" : "baja"}`}>
          {estado.mensaje}
        </span>
      ) : null}
    </form>
  );
}
