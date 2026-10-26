"use client";

// Botones «+ Ingreso» (principal), «+ Gasto», «+ Ahorro» y «Mover entre mis cuentas» (en la ventana, «¿Qué pasó?» tiene
// también pago de tarjeta o préstamo, cambio de moneda y rescate o venta de inversión). Avisan al calendario (o a la
// ventana suelta de Movimientos) con un evento del navegador para que abra la ventana en el día elegido.

import type { Modo } from "./CamposMovimiento";
import { Icono } from "./Iconos";

export const EVENTO_NUEVO = "caja:nuevo-movimiento";

function abrir(tipo: Modo) {
  window.dispatchEvent(new CustomEvent(EVENTO_NUEVO, { detail: tipo }));
}

export function BotonesNuevo() {
  return <BotonesAnotar alElegir={abrir} />;
}

/** Los tres botones de anotar, en el orden de Mena: primero lo que entra, luego lo que sale. */
export function BotonesAnotar({ alElegir, etiqueta = "Anotar" }: { alElegir: (t: Modo) => void; etiqueta?: string }) {
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
      <button type="button" className="boton secundario caja-boton-grande" onClick={() => alElegir("ahorro")} title="Lo que apartas hacia tu ahorro o una inversión. Es ahorro, no gasto.">
        <Icono n="mas" tam={18} />
        Ahorro
      </button>
      <button
        type="button"
        className="boton secundario caja-boton-grande"
        onClick={() => alElegir("mover")}
        title="Pasar dinero de una cuenta tuya a otra. No es ingreso ni gasto. También pagos de tarjeta, cambio de moneda y rescates (en «¿Qué pasó?»)."
      >
        <Icono n="transferir" tam={18} />
        Mover entre mis cuentas
      </button>
    </div>
  );
}
