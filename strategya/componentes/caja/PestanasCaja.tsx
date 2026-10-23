import Link from "next/link";
import { Icono, type NombreIcono } from "./Iconos";

/** «importar» vive dentro de Configuración (Avanzado); se conserva el valor para la ruta vieja. */
export type PestanaCaja = "calendario" | "movimientos" | "resultados" | "configuracion" | "importar";

const PESTANAS: { id: PestanaCaja; ruta: string; texto: string; icono: NombreIcono; conMes: boolean }[] = [
  { id: "calendario", ruta: "/caja", texto: "Calendario", icono: "calendario", conMes: true },
  { id: "movimientos", ruta: "/caja/movimientos", texto: "Movimientos", icono: "lista", conMes: true },
  { id: "resultados", ruta: "/caja/resultados", texto: "Estado de resultados", icono: "balanza", conMes: true },
  { id: "configuracion", ruta: "/caja/ajustes", texto: "Configuración", icono: "ajustes", conMes: false },
];

export function PestanasCaja({ actual, mes }: { actual: PestanaCaja; mes?: string }) {
  const marcada = actual === "importar" ? "configuracion" : actual;
  return (
    <nav className="caja-pestanas" aria-label="Partes del presupuesto">
      {PESTANAS.map((p) => (
        <Link key={p.id} href={mes && p.conMes ? `${p.ruta}?mes=${mes}` : p.ruta} aria-current={marcada === p.id ? "page" : undefined}>
          <Icono n={p.icono} tam={16} />
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
