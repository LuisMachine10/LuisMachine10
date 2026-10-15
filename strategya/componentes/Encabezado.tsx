import Link from "next/link";
import { cerrarSesion } from "@/app/acciones";
import { fechaHoraRD, horaRD } from "@/lib/formato";

export function Encabezado({ actual, ultimaActualizacion }: { actual: "terminal" | "estado"; ultimaActualizacion: string | null }) {
  return (
    <header className="encabezado">
      <span className="marca">STRATEGYA</span>
      <nav className="nav" aria-label="Secciones">
        <Link href="/" aria-current={actual === "terminal" ? "page" : undefined}>
          Terminal
        </Link>
        <Link href="/estado" aria-current={actual === "estado" ? "page" : undefined}>
          Estado
        </Link>
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
