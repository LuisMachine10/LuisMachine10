"use client";

// Botones «+ Ingreso» (principal), «+ Gasto» y «Mover entre mis cuentas». Avisan al calendario (o a la
// ventana suelta de Movimientos) con un evento del navegador para que abra la ventana en el día elegido.

import type { TipoMovimiento } from "@/lib/caja/tipos";
import { Icono } from "./Iconos";

export const EVENTO_NUEVO = "caja:nuevo-movimiento";

function abrir(tipo: TipoMovimiento) {
  window.dispatchEvent(new CustomEvent(EVENTO_NUEVO, { detail: tipo }));
}

export function BotonesNuevo() {
  return <BotonesAnotar alElegir={abrir} />;
}

/** Los tres botones de anotar, en el orden de Mena: primero lo que entra, luego lo que sale. */
export function BotonesAnotar({ alElegir, etiqueta = "Anotar" }: { alElegir: (t: TipoMovimiento) => void; etiqueta?: string }) {
  return (
    <div className="caja-botones-nuevo" role="group" aria-label={etiqueta}>
      <button type="button" className="boton caja-boton-grande" onClick={() => alElegir("ingreso")}>
        <Icono n="mas" tam={18} />
        Ingreso
      </button>
      <button type="button" className="boton secundario caja-boton-grande" onClick={() => alElegir("gasto")}>
        <Icono n="mas" tam={18} />
        Gasto
      </button>
      <button
        type="button"
        className="boton secundario caja-boton-grande"
        onClick={() => alElegir("transferencia")}
        title="Pasar dinero de una cuenta tuya a otra (del banco a la cartera o al ahorro). No es ingreso ni gasto."
      >
        <Icono n="transferir" tam={18} />
        Mover entre mis cuentas
      </button>
    </div>
  );
}
