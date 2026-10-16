"use client";

// Formulario que llama a una server action y muestra su respuesta. No usa el reinicio automático de
// React 19 (que borraría lo escrito cuando hay un error): se reinicia solo si salió bien y se pide.

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { EstadoAccion } from "@/app/caja/acciones";

export type Accion = (previo: EstadoAccion, form: FormData) => Promise<EstadoAccion>;

const INICIAL: EstadoAccion = { ok: false, mensaje: null, vez: 0 };

export function FormAccion({
  accion,
  boton,
  claseBoton = "caja-boton",
  reiniciar = false,
  etiqueta,
  children,
  className = "caja-form",
}: {
  accion: Accion;
  boton: string;
  claseBoton?: string;
  reiniciar?: boolean;
  etiqueta?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const [estado, enviar, pendiente] = useActionState(accion, INICIAL);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok && reiniciar) ref.current?.reset();
  }, [estado.vez, estado.ok, reiniciar]);
  return (
    <form
      ref={ref}
      className={className}
      aria-label={etiqueta}
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
    >
      {children}
      <div className="caja-acciones">
        <button type="submit" className={claseBoton} disabled={pendiente}>
          {pendiente ? "Guardando…" : boton}
        </button>
        {estado.mensaje ? (
          <p className={`caja-mensaje ${estado.ok ? "ok" : "error"}`} role={estado.ok ? "status" : "alert"}>
            {estado.mensaje}
          </p>
        ) : null}
      </div>
    </form>
  );
}

/** Eliminar en dos pasos: «Eliminar» → «¿Seguro? Sí, eliminar / No». */
export function BotonEliminar({ accion, id, que }: { accion: Accion; id: string; que: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [estado, enviar, pendiente] = useActionState(accion, INICIAL);
  if (!confirmando) {
    return (
      <button type="button" className="caja-boton secundario" onClick={() => setConfirmando(true)} aria-label={`Eliminar ${que}`}>
        Eliminar
      </button>
    );
  }
  return (
    <form
      className="caja-acciones"
      onSubmit={(e) => {
        e.preventDefault();
        const datos = new FormData(e.currentTarget);
        startTransition(() => enviar(datos));
      }}
    >
      <input type="hidden" name="id" value={id} />
      <span className="chico" role="alert">
        ¿Eliminar {que}? No se puede deshacer.
      </span>
      <button type="submit" className="caja-boton peligro" disabled={pendiente}>
        {pendiente ? "Eliminando…" : "Sí, eliminar"}
      </button>
      <button type="button" className="caja-boton secundario" onClick={() => setConfirmando(false)}>
        No
      </button>
      {estado.mensaje && !estado.ok ? <p className="caja-mensaje error">{estado.mensaje}</p> : null}
    </form>
  );
}
