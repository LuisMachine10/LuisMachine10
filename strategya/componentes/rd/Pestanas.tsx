"use client";

// Pestañas accesibles (role="tablist", flechas del teclado) para alternar dos o más vistas de un panel.
// El contenido llega ya armado desde el servidor; aquí solo se elige cuál se ve.

import { useId, useRef, useState } from "react";

export interface Pestana {
  id: string;
  titulo: string;
  contenido: React.ReactNode;
}

export function Pestanas({ pestanas, etiqueta }: { pestanas: Pestana[]; etiqueta: string }) {
  const [activa, setActiva] = useState(0);
  const base = useId();
  const botones = useRef<(HTMLButtonElement | null)[]>([]);

  function teclado(e: React.KeyboardEvent, i: number) {
    const n = pestanas.length;
    const sig = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : null;
    if (sig === null) return;
    e.preventDefault();
    setActiva(sig);
    botones.current[sig]?.focus();
  }

  return (
    <div className="rd-pestanas-panel">
      <div className="rd-segmentado" role="tablist" aria-label={etiqueta}>
        {pestanas.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              botones.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-t-${p.id}`}
            aria-selected={i === activa}
            aria-controls={`${base}-p-${p.id}`}
            tabIndex={i === activa ? 0 : -1}
            onClick={() => setActiva(i)}
            onKeyDown={(e) => teclado(e, i)}
          >
            {p.titulo}
          </button>
        ))}
      </div>
      {pestanas.map((p, i) => (
        <div key={p.id} role="tabpanel" id={`${base}-p-${p.id}`} aria-labelledby={`${base}-t-${p.id}`} hidden={i !== activa}>
          {p.contenido}
        </div>
      ))}
    </div>
  );
}
