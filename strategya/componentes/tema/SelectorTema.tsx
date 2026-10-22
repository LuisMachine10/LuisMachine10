"use client";

// Interruptor de tema: Claro, Oscuro o «Según el sistema». Tres botones con aria-pressed dentro de un grupo:
// en el escritorio solo íconos (con nombre accesible y título), en el menú del celular con su texto.

import { fijarPreferencia, type PreferenciaTema } from "./tema";
import { usePreferenciaTema } from "./usarTema";

const OPCIONES: { valor: PreferenciaTema; nombre: string; icono: React.ReactNode }[] = [
  {
    valor: "claro",
    nombre: "Claro",
    icono: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4" />
      </>
    ),
  },
  {
    valor: "oscuro",
    nombre: "Oscuro",
    icono: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  },
  {
    valor: "sistema",
    nombre: "Según el sistema",
    icono: <path d="M3.5 5h17v11h-17zM9 20h6M12 16v4" />,
  },
];

export function SelectorTema({ conTexto = false, className }: { conTexto?: boolean; className?: string }) {
  const pref = usePreferenciaTema();
  return (
    <div role="group" aria-label="Tema de la pantalla" className={`selector-tema${conTexto ? " con-texto" : ""}${className ? ` ${className}` : ""}`}>
      {conTexto ? (
        <span className="selector-tema-rotulo" aria-hidden="true">
          Tema
        </span>
      ) : null}
      {OPCIONES.map((o) => (
        <button
          key={o.valor}
          type="button"
          aria-pressed={pref === o.valor}
          aria-label={conTexto ? undefined : `Tema ${o.nombre.toLowerCase()}`}
          title={conTexto ? undefined : `Tema: ${o.nombre.toLowerCase()}`}
          onClick={() => fijarPreferencia(o.valor)}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {o.icono}
          </svg>
          {conTexto ? <span>{o.valor === "sistema" ? "Sistema" : o.nombre}</span> : null}
        </button>
      ))}
    </div>
  );
}
