import Link from "next/link";
import { Icono, type NombreIcono } from "./Iconos";

/** «importar» vive ahora dentro de Ajustes (Avanzado); se conserva el valor para la ruta vieja. */
export type PestanaCaja = "calendario" | "movimientos" | "presupuesto" | "ajustes" | "importar";

const PESTANAS: { id: PestanaCaja; ruta: string; texto: string; icono: NombreIcono }[] = [
  { id: "calendario", ruta: "/caja", texto: "Calendario", icono: "calendario" },
  { id: "movimientos", ruta: "/caja/movimientos", texto: "Movimientos", icono: "lista" },
  { id: "presupuesto", ruta: "/caja/presupuesto", texto: "Presupuesto", icono: "balanza" },
  { id: "ajustes", ruta: "/caja/ajustes", texto: "Ajustes", icono: "nota" },
];

export function PestanasCaja({ actual, mes }: { actual: PestanaCaja; mes?: string }) {
  const marcada = actual === "importar" ? "ajustes" : actual;
  return (
    <nav className="caja-pestanas" aria-label="Mi presupuesto">
      {PESTANAS.map((p) => (
        <Link key={p.id} href={mes && p.id !== "ajustes" ? `${p.ruta}?mes=${mes}` : p.ruta} aria-current={marcada === p.id ? "page" : undefined}>
          <Icono n={p.icono} tam={16} />
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
