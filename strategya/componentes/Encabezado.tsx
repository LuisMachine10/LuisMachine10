import Link from "next/link";
import { cerrarSesion } from "@/app/acciones";
import { fechaHoraRD, horaRD } from "@/lib/formato";

export const SECCIONES = [
  { clave: "terminal", nombre: "Terminal", href: "/" },
  { clave: "mercado", nombre: "Mercado", href: "/mercado" },
  { clave: "rd", nombre: "RD", href: "/rd" },
  { clave: "noticias", nombre: "Noticias", href: "/noticias" },
  { clave: "globo", nombre: "Globo", href: "/globo" },
  { clave: "capital", nombre: "Capital", href: "/capital" },
  { clave: "caja", nombre: "Caja", href: "/caja" },
  { clave: "carga", nombre: "Carga", href: "/carga" },
  { clave: "ajustes", nombre: "Ajustes", href: "/ajustes" },
  { clave: "estado", nombre: "Estado", href: "/estado" },
] as const;

export type Seccion = (typeof SECCIONES)[number]["clave"];

export function Encabezado({ actual, ultimaActualizacion }: { actual: Seccion; ultimaActualizacion: string | null }) {
  return (
    <header className="encabezado">
      <span className="marca">STRATEGYA</span>
      <nav className="nav" aria-label="Secciones">
        {SECCIONES.map((s) => (
          <Link key={s.clave} href={s.href} aria-current={actual === s.clave ? "page" : undefined}>
            {s.nombre}
          </Link>
        ))}
      </nav>
      <span className="actualizado mono" title={ultimaActualizacion ? fechaHoraRD(ultimaActualizacion) : undefined}>
        {ultimaActualizacion ? `Última actualización ${horaRD(ultimaActualizacion)} (hora RD)` : "Sin actualizaciones todavía"}
      </span>
      <form action={cerrarSesion}>
        <button type="submit" className="boton-texto">
          Salir
        </button>
      </form>
    </header>
  );
}
