"use client";

// La ventana de «+ Ingreso / + Gasto / Mover entre mis cuentas» en pantallas sin calendario (Movimientos): anota
// en el día de hoy (se puede cambiar en la misma ventana).

import { useEffect, useState } from "react";
import type { Fecha } from "@/lib/caja/fechas";
import { BotonesAnotar, EVENTO_NUEVO } from "./BotonesNuevo";
import type { Modo, OpcionCategoria, OpcionCuenta } from "./CamposMovimiento";
import { NuevoMovimiento } from "./NuevoMovimiento";

export function NuevoMovimientoSuelto({ cuentas, categorias, hoy, conBoton = false }: { cuentas: OpcionCuenta[]; categorias: OpcionCategoria[]; hoy: Fecha; conBoton?: boolean }) {
  const [tipo, setTipo] = useState<Modo | null>(null);
  useEffect(() => {
    const oir = (e: Event) => {
      const t = (e as CustomEvent<Modo>).detail;
      if (t) setTipo(t);
    };
    window.addEventListener(EVENTO_NUEVO, oir);
    return () => window.removeEventListener(EVENTO_NUEVO, oir);
  }, []);
  return (
    <>
      {conBoton ? (
        <BotonesAnotar alElegir={setTipo} etiqueta="Anotar mi primer movimiento" />
      ) : null}
      <NuevoMovimiento tipo={tipo} fecha={hoy} cuentas={cuentas} categorias={categorias} cerrar={() => setTipo(null)} />
    </>
  );
}
