import "@/estilos/rd.css";
import Link from "next/link";

/** Pestañas del módulo RD: la sección y «Agregar un dato» (carga manual). */
export function NavRD({ actual }: { actual: "rd" | "carga" }) {
  return (
    <nav className="rd-subnav" aria-label="República Dominicana">
      <div className="rd-pestanas">
        <Link href="/rd" aria-current={actual === "rd" ? "page" : undefined}>
          República Dominicana
        </Link>
        <Link href="/carga" aria-current={actual === "carga" ? "page" : undefined}>
          Agregar un dato
        </Link>
      </div>
    </nav>
  );
}
