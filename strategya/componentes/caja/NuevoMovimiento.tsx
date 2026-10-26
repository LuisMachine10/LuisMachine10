"use client";

// Ventana «+ Ingreso / + Gasto / Mover entre mis cuentas»: anota un movimiento en el día elegido (o el que se
// escriba). Usa <dialog> nativo: Escape la cierra, el foco queda dentro y vuelve al botón al cerrar.

import { useEffect, useRef } from "react";
import { registrarMovimiento } from "@/app/caja/acciones";
import type { Fecha } from "@/lib/caja/fechas";
import { CamposMovimiento, cuentasDe, type Modo, type OpcionCategoria, type OpcionCuenta } from "./CamposMovimiento";
import { FormAccion } from "./FormAccion";
import { Icono } from "./Iconos";

const TEXTO: Record<Modo, { titulo: string; sub: string; boton: string }> = {
  ingreso: { titulo: "Anotar un ingreso", sub: "Dinero que te entró ese día. Cae en su categoría del estado de resultados.", boton: "Guardar ingreso" },
  gasto: { titulo: "Anotar un gasto", sub: "Lo que pagaste ese día. Baja tu disponible y cae en su categoría del estado de resultados.", boton: "Guardar gasto" },
  ahorro: { titulo: "Ahorrar o invertir", sub: "Lo que apartas hacia tu ahorro o una inversión. Si es una línea de tu plan del mes, cuenta para ella.", boton: "Guardar ahorro" },
  mover: { titulo: "Mover entre mis cuentas", sub: "Pasar dinero de una cuenta tuya a otra. No es ingreso ni gasto: solo cambia de lugar.", boton: "Guardar" },
  pago_deuda: { titulo: "Pagar una tarjeta o un préstamo", sub: "Sale de tu banco y baja lo que debes por la parte de capital; el interés va a gastos financieros.", boton: "Guardar pago" },
  cambio: { titulo: "Cambio de moneda", sub: "Pasar dinero entre monedas, de una cuenta tuya a otra, con la tasa que te dieron.", boton: "Guardar cambio" },
  rescate: { titulo: "Rescate o venta de inversión", sub: "Sacar dinero de una inversión hacia efectivo o una cuenta.", boton: "Guardar rescate" },
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
