import Link from "next/link";
import { cerrarSesion } from "@/app/acciones";
import { fechaHoraRD, horaRD } from "@/lib/formato";

// Íconos de trazo (24×24), dibujados aquí para no cargar una librería entera.
const ICONOS: Record<string, React.ReactNode> = {
  terminal: <path d="M3 4h18v16H3zM3 9h18M8 9v11" />,
  mercado: <path d="M3 17l5-6 4 3 6-8 3 4M3 21h18" />,
  rd: <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  noticias: <path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" />,
  globo: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />,
  capital: <path d="M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z" />,
  caja: <path d="M3 7h18v13H3zM3 7l2-3h14l2 3M8 12h8M8 16h5" />,
  carga: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  ajustes: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />,
  estado: <path d="M3 12h4l3-7 4 14 3-7h4" />,
};

export const SECCIONES = [
  { clave: "terminal", nombre: "Terminal", href: "/" },
  { clave: "mercado", nombre: "Mercado", href: "/mercado" },
  { clave: "rd", nombre: "RD", href: "/rd" },
  { clave: "globo", nombre: "Globo", href: "/globo" },
  { clave: "capital", nombre: "Capital", href: "/capital" },
  { clave: "caja", nombre: "Caja", href: "/caja" },
  { clave: "noticias", nombre: "Noticias", href: "/noticias" },
  { clave: "carga", nombre: "Carga", href: "/carga" },
  { clave: "ajustes", nombre: "Ajustes", href: "/ajustes" },
  { clave: "estado", nombre: "Estado", href: "/estado" },
] as const;

export type Seccion = (typeof SECCIONES)[number]["clave"];

export function Encabezado({ actual, ultimaActualizacion }: { actual: Seccion; ultimaActualizacion: string | null }) {
  return (
    <header className="encabezado">
      <Link href="/" className="marca" aria-label="Strategya, ir a la terminal">
        <span className="marca-logo" aria-hidden="true">
          S
        </span>
        Strategya
      </Link>
      <nav className="nav" aria-label="Secciones">
        {SECCIONES.map((s) => (
          <Link key={s.clave} href={s.href} aria-current={actual === s.clave ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONOS[s.clave]}
            </svg>
            {s.nombre}
          </Link>
        ))}
      </nav>
      <span className="actualizado" title={ultimaActualizacion ? fechaHoraRD(ultimaActualizacion) : undefined}>
        {ultimaActualizacion ? <span className="punto-vivo" aria-hidden="true" /> : null}
        {ultimaActualizacion ? `Actualizado ${horaRD(ultimaActualizacion)}` : "Sin actualizaciones todavía"}
      </span>
      <form action={cerrarSesion}>
        <button type="submit" className="boton-texto">
          Salir
        </button>
      </form>
    </header>
  );
}
