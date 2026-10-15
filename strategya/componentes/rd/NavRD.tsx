import "@/estilos/rd.css";
import Link from "next/link";

/** Navegación del módulo RD (el encabezado común aún no tiene estas secciones). */
export function NavRD({ actual }: { actual: "rd" | "carga" }) {
  return (
    <nav className="rd-subnav" aria-label="República Dominicana">
      <Link href="/rd" aria-current={actual === "rd" ? "page" : undefined}>
        República Dominicana
      </Link>
      <Link href="/carga" aria-current={actual === "carga" ? "page" : undefined}>
        Carga manual
      </Link>
    </nav>
  );
}
