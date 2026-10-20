"use client";

// La ventana de «+ Gasto / + Ingreso / Transferir» en pantallas sin calendario (Movimientos): anota
// en el día de hoy (se puede cambiar en la misma ventana).

import { useEffect, useState } from "react";
import type { Fecha } from "@/lib/caja/fechas";
import type { TipoMovimiento } from "@/lib/caja/tipos";
import { EVENTO_NUEVO } from "./BotonesNuevo";
import type { OpcionCategoria, OpcionCuenta } from "./CamposMovimiento";
import { Icono } from "./Iconos";
import { NuevoMovimiento } from "./NuevoMovimiento";

export function NuevoMovimientoSuelto({ cuentas, categorias, hoy, conBoton = false }: { cuentas: OpcionCuenta[]; categorias: OpcionCategoria[]; hoy: Fecha; conBoton?: boolean }) {
  const [tipo, setTipo] = useState<TipoMovimiento | null>(null);
  useEffect(() => {
    const oir = (e: Event) => {
      const t = (e as CustomEvent<TipoMovimiento>).detail;
      if (t) setTipo(t);
    };
    window.addEventListener(EVENTO_NUEVO, oir);
    return () => window.removeEventListener(EVENTO_NUEVO, oir);
  }, []);
  return (
    <>
      {conBoton ? (
        <button type="button" className="boton caja-boton-grande" onClick={() => setTipo("gasto")}>
          <Icono n="mas" tam={18} />
          Anotar mi primer gasto
        </button>
      ) : null}
      <NuevoMovimiento tipo={tipo} fecha={hoy} cuentas={cuentas} categorias={categorias} cerrar={() => setTipo(null)} />
    </>
  );
}
