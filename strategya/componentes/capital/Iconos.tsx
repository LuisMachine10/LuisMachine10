// Íconos de trazo de Mena Capital (24×24, stroke currentColor, 1.8). Decorativos: aria-hidden.

const TRAZOS = {
  mas: <path d="M12 5v14M5 12h14" />,
  subir: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  bajar: <path d="M12 4v12M7 11l5 5 5-5M4 20h16" />,
  ok: <path d="M20 6L9 17l-5-5" />,
  error: <path d="M12 8v5M12 16.5v.5M10.3 3.9L2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
  info: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8v.5" />,
  cartera: <path d="M3 7h18v13H3zM16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 12h18" />,
  calendario: <path d="M4 5h16v15H4zM4 10h16M9 3v4M15 3v4" />,
  escudo: <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M9 12l2 2 4-4" />,
  basura: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  documento: <path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5" />,
} as const;

export type NombreIcono = keyof typeof TRAZOS;

export function Icono({ nombre, clase = "cap-icono" }: { nombre: NombreIcono; clase?: string }) {
  return (
    <svg className={clase} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {TRAZOS[nombre]}
    </svg>
  );
}
