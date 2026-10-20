"use client";

// Cinta que se desliza sola (CSS). Se pausa al pasar el mouse, al enfocar un enlace, al tocarla o con el botón.
// Con prefers-reduced-motion no se mueve: queda como una fila que se desplaza a mano.
// La segunda copia es solo visual (aria-hidden + inert) para que el bucle no tenga saltos.

import { useState } from "react";

export function CintaDeslizante({ children, segundos }: { children: React.ReactNode; segundos: number }) {
  const [pausada, setPausada] = useState(false);
  return (
    <div className="mv-cinta-marco" data-pausada={pausada ? "si" : "no"}>
      <div
        className="mv-cinta-ventana"
        onPointerDown={(e) => {
          if (e.pointerType === "touch" || e.pointerType === "pen") setPausada((p) => !p);
        }}
      >
        <div className="mv-cinta-pista" style={{ animationDuration: `${segundos}s` }}>
          <ul className="mv-cinta-lista" aria-label="Precios">
            {children}
          </ul>
          <ul className="mv-cinta-lista mv-cinta-copia" aria-hidden="true" inert>
            {children}
          </ul>
        </div>
      </div>
      <button
        type="button"
        className="mv-cinta-boton"
        aria-pressed={pausada}
        aria-label={pausada ? "Reanudar la cinta" : "Pausar la cinta"}
        title={pausada ? "Reanudar" : "Pausar"}
        onClick={() => setPausada((p) => !p)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {pausada ? <path d="M8 5l11 7-11 7z" /> : <path d="M9 5v14M15 5v14" />}
        </svg>
      </button>
    </div>
  );
}
