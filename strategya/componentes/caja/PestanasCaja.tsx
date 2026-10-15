import Link from "next/link";

export type PestanaCaja = "calendario" | "movimientos" | "presupuesto" | "ajustes" | "importar";

const PESTANAS: { id: PestanaCaja; ruta: string; texto: string }[] = [
  { id: "calendario", ruta: "/caja", texto: "Calendario" },
  { id: "movimientos", ruta: "/caja/movimientos", texto: "Movimientos" },
  { id: "presupuesto", ruta: "/caja/presupuesto", texto: "Presupuesto" },
  { id: "ajustes", ruta: "/caja/ajustes", texto: "Ajustes" },
  { id: "importar", ruta: "/caja/importar", texto: "Importar" },
];

export function PestanasCaja({ actual, mes }: { actual: PestanaCaja; mes?: string }) {
  return (
    <nav className="caja-pestanas" aria-label="Calendario de Caja">
      {PESTANAS.map((p) => (
        <Link
          key={p.id}
          href={mes && p.id !== "ajustes" && p.id !== "importar" ? `${p.ruta}?mes=${mes}` : p.ruta}
          aria-current={actual === p.id ? "page" : undefined}
        >
          {p.texto}
        </Link>
      ))}
    </nav>
  );
}
