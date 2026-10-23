"use client";

// Ventana «+ Ingreso / + Gasto / Mover entre mis cuentas»: anota un movimiento en el día elegido (o el que se
// escriba). Usa <dialog> nativo: Escape la cierra, el foco queda dentro y vuelve al botón al cerrar.

import { useEffect, useRef } from "react";
import { registrarMovimiento } from "@/app/caja/acciones";
import type { Fecha } from "@/lib/caja/fechas";
import type { TipoMovimiento } from "@/lib/caja/tipos";
import { CamposMovimiento, type OpcionCategoria, type OpcionCuenta } from "./CamposMovimiento";
import { FormAccion } from "./FormAccion";
import { Icono } from "./Iconos";

const TEXTO: Record<TipoMovimiento, { titulo: string; sub: string; boton: string }> = {
  ingreso: { titulo: "Anotar un ingreso", sub: "Dinero que te entró ese día. Cae en su categoría del estado de resultados.", boton: "Guardar ingreso" },
  gasto: { titulo: "Anotar un gasto", sub: "Lo que pagaste ese día. Baja tu disponible y cae en su categoría del estado de resultados.", boton: "Guardar gasto" },
  transferencia: { titulo: "Mover entre mis cuentas", sub: "Pasar dinero de una cuenta tuya a otra (del banco a la cartera o al ahorro). No es ingreso ni gasto: solo cambia de lugar.", boton: "Guardar" },
  pago_tarjeta: { titulo: "Pagar una tarjeta", sub: "Sale de tu banco y baja lo que debes en la tarjeta.", boton: "Guardar pago" },
};

export function NuevoMovimiento({
  tipo,
  fecha,
  cuentas,
  categorias,
  cerrar,
}: {
  tipo: TipoMovimiento | null;
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
              <p className="chico tenue">{t.sub}</p>
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
              <CamposMovimiento key={tipo} v={{ tipo, cuenta: cuentas.find((c) => c.tipo === "banco")?.id ?? cuentas.find((c) => c.tipo !== "tarjeta")?.id ?? null }} cuentas={cuentas} categorias={categorias} />
            </FormAccion>
          ) : (
            <p className="vacio">Primero agrega una cuenta en Configuración.</p>
          )}
        </div>
      ) : null}
    </dialog>
  );
}
