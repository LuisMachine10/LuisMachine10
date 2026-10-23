import { redirect } from "next/navigation";

// «Presupuesto dentro de Presupuesto» ya no existe: ahora es la pestaña «Estado de resultados». La ruta
// vieja sigue funcionando y lleva allí (con el mes, si venía).
export default async function PaginaPresupuestoVieja({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes } = await searchParams;
  redirect(mes && /^\d{4}-\d{2}$/.test(mes) ? `/caja/resultados?mes=${mes}` : "/caja/resultados");
}
