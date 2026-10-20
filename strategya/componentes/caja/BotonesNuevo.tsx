"use client";

// Botones grandes «+ Gasto», «+ Ingreso» y «Transferir». Avisan al calendario con un evento del
// navegador para que abra la ventana en el día elegido.

import type { TipoMovimiento } from "@/lib/caja/tipos";
import { Icono } from "./Iconos";

export const EVENTO_NUEVO = "caja:nuevo-movimiento";

function abrir(tipo: TipoMovimiento) {
  window.dispatchEvent(new CustomEvent(EVENTO_NUEVO, { detail: tipo }));
}

export function BotonesNuevo() {
  return (
    <div className="caja-botones-nuevo" role="group" aria-label="Anotar">
      <button type="button" className="boton caja-boton-grande" onClick={() => abrir("gasto")}>
        <Icono n="mas" tam={18} />
        Gasto
      </button>
      <button type="button" className="boton secundario caja-boton-grande" onClick={() => abrir("ingreso")}>
        <Icono n="mas" tam={18} />
        Ingreso
      </button>
      <button type="button" className="boton secundario caja-boton-grande" onClick={() => abrir("transferencia")}>
        <Icono n="transferir" tam={18} />
        Transferir
      </button>
    </div>
  );
}
