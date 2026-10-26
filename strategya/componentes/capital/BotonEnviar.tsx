"use client";

// Botón de enviar con estado de envío (Fase F): al pulsar «Guardar», el botón cambia AL INSTANTE a
// «Guardando…» (se desactiva para no enviar dos veces) y aparece un aviso con lo que se está guardando,
// sin esperar la respuesta del servidor. Cuando la página vuelve, el aviso de siempre confirma.
// Sin JavaScript, el formulario funciona igual (el botón es un submit normal).

import { useFormStatus } from "react-dom";

export function BotonEnviar({
  children,
  className = "boton",
  enviando = "Guardando…",
  aviso,
  title,
  disabled,
}: {
  children: React.ReactNode;
  className?: string;
  enviando?: string;
  /**
   * Texto del aviso mientras se guarda. «{campo}» se reemplaza por lo que se envía en ese campo (por
   * ejemplo «Guardando «{nombre}»…»). Es texto (no una función) porque viene de un Server Component.
   */
  aviso?: string;
  title?: string;
  disabled?: boolean;
}) {
  const { pending, data } = useFormStatus();
  return (
    <>
      <button type="submit" className={className} disabled={disabled || pending} aria-disabled={disabled || pending} title={title}>
        {pending ? (
          <span className="cap-boton-enviando">
            <span className="cap-girando" aria-hidden="true" />
            {enviando}
          </span>
        ) : (
          children
        )}
      </button>
      <span className="cap-estado-envio tenue" role="status" aria-live="polite">
        {pending && aviso ? llenar(aviso, data) : ""}
      </span>
    </>
  );
}

/** «Guardando «{nombre}»…» con lo que trae el formulario; un campo vacío deja el texto sin comillas. */
function llenar(plantilla: string, datos: FormData | null): string {
  return plantilla.replace(/«\{(\w+)\}»|\{(\w+)\}/g, (_t, a: string | undefined, b: string | undefined) => {
    const v = String(datos?.get(a ?? b ?? "") ?? "").trim();
    return v ? (a ? `«${v}»` : v) : "";
  }).replace(/\s{2,}/g, " ");
}
