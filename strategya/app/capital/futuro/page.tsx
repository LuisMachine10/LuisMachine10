import type { Metadata } from "next";
import { VistaFuturo } from "@/componentes/capital/Futuro";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";

export const metadata: Metadata = { title: "Proyecciones · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalFuturo({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  const reubicar = typeof sp.reubicar === "string" && typeof sp.a === "string" ? { vencido: sp.reubicar, destino: sp.a } : null;
  return (
    <PaginaCapital
      actual="futuro"
      sp={sp}
      vista={(datos, mes) => <VistaFuturo datos={datos} mes={mes} anios={typeof sp.anios === "string" ? sp.anios : null} reubicar={reubicar} />}
    />
  );
}
