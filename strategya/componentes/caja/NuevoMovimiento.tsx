"use client";

// Ventana «+ Ingreso / + Gasto / Mover entre mis cuentas»: anota un movimiento en el día elegido (o el que se
// escriba). Usa <dialog> nativo: Escape la cierra, el foco queda dentro y vuelve al botón al cerrar.

import { useEffect, useRef } from "react";
import { registrarMovimiento } from "@/app/caja/acciones";
import type { Fecha } from "@/lib/caja/fechas";
import { CamposMovimiento, cuentasDe, type Modo, type OpcionCategoria, type OpcionCuenta } from "./CamposMovimiento";
import { FormAccion } from "./FormAccion";
import { Icono } from "./Iconos";

const TEXTO: Record<Modo, { titulo: string; boton: string }> = {
  ingreso: { titulo: "Anotar un ingreso", boton: "Guardar ingreso" },
  gasto: { titulo: "Anotar un gasto", boton: "Guardar gasto" },
  ahorro: { titulo: "Ahorrar o invertir", boton: "Guardar ahorro" },
  mover: { titulo: "Mover entre mis cuentas", boton: "Guardar" },
  pago_deuda: { titulo: "Pagar una tarjeta o un préstamo", boton: "Guardar pago" },
  cambio: { titulo: "Cambio de moneda", boton: "Guardar cambio" },
  rescate: { titulo: "Rescate o venta de inversión", boton: "Guardar rescate" },
};

export function NuevoMovimiento({
  tipo,
  fecha,
  cuentas,
  categorias,
  cerrar,
}: {
  tipo: Modo | null;
  fecha: Fecha;
  cuentas: OpcionCuenta[];
  categorias: OpcionCategoria[];
  cerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (tipo && !d.open) d.showModal();
    if (!tipo && d.open) d.close();
  }, [tipo]);
  const t = TEXTO[tipo ?? "gasto"];
  return (
    <dialog ref={ref} className="caja-dialogo" aria-labelledby="t-nuevo-mov" onClose={cerrar} onClick={(e) => e.target === ref.current && cerrar()}>
      {tipo ? (
        <div className="caja-dialogo-caja">
          <div className="caja-dialogo-cabeza">
            <div>
              <h2 id="t-nuevo-mov" className="panel-titulo">
                {t.titulo}
              </h2>
            </div>
            <button type="button" className="caja-quitar" onClick={cerrar} aria-label="Cerrar sin guardar">
              <Icono n="cerrar" />
            </button>
          </div>
          {cuentas.length ? (
            <FormAccion accion={registrarMovimiento} boton={t.boton} claseBoton="boton caja-boton-grande" reiniciar etiqueta={t.titulo} alTerminar={cerrar}>
              <div className="caja-campos">
                <label className="ancho">
                  Día
                  <input type="date" name="fecha" defaultValue={fecha} required />
                </label>
              </div>
              <CamposMovimiento
                key={tipo}
                v={{ modo: tipo, cuenta: (cuentasDe(cuentas, tipo, "origen").find((c) => c.tipo === "banco") ?? cuentasDe(cuentas, tipo, "origen")[0])?.id ?? null }}
                cuentas={cuentas}
                categorias={categorias}
              />
            </FormAccion>
          ) : (
            <p className="vacio">Primero agrega una cuenta en Configuración.</p>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
