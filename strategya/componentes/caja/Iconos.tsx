// Íconos de trazo del Calendario de Caja (24×24, currentColor) y la ayuda «?» con 1–2 frases.

const TRAZOS = {
  banco: "M3 10h18M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M12 3l9 5H3z",
  efectivo: "M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4M18 10v4",
  ahorro: "M5 11a7 6 0 0 1 13-2h2v4l-2 1v3h-3v-2H9v2H6v-3a6 6 0 0 1-1-3zM15 9h.01",
  tarjeta: "M3 6h18v12H3zM3 10h18M7 15h4",
  mas: "M12 5v14M5 12h14",
  menos: "M5 12h14",
  cerrar: "M6 6l12 12M18 6L6 18",
  transferir: "M4 8h14l-3-3M20 16H6l3 3",
  ingreso: "M12 19V5M6 11l6-6 6 6",
  gasto: "M12 5v14M6 13l6 6 6-6",
  calendario: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4",
  check: "M5 12l5 5L20 7",
  izquierda: "M15 6l-6 6 6 6",
  derecha: "M9 6l6 6-6 6",
  escudo: "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z",
  lista: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  nota: "M5 4h10l4 4v12H5zM15 4v4h4M8 13h8M8 17h5",
  balanza: "M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z",
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ n, tam = 20, className }: { n: NombreIcono; tam?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tam}
      height={tam}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={TRAZOS[n]} />
    </svg>
  );
}

/** Botón «?» que despliega una explicación corta. Funciona sin JavaScript (details). */
export function Ayuda({ que, children }: { que: string; children: React.ReactNode }) {
  return (
    <details className="caja-ayuda">
      <summary aria-label={`¿Qué es ${que}?`} title={`¿Qué es ${que}?`}>
        ?
      </summary>
      <div className="caja-ayuda-texto" role="note">
        {children}
      </div>
    </details>
  );
}
