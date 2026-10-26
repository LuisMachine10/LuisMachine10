import type { Metadata } from "next";
import { VistaFuturo } from "@/componentes/capital/Futuro";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { precargarCapital } from "@/lib/datos-capital";

export const metadata: Metadata = { title: "Proyecciones · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalFuturo({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  // Empieza a leer el Portafolio ya, en paralelo con lo demás de la página (una sola lectura por petición).
  precargarCapital();
  const sp = await searchParams;
  return (
    <PaginaCapital
      actual="futuro"
      sp={sp}
      vista={(datos, mes) => <VistaFuturo datos={datos} mes={mes} anios={typeof sp.anios === "string" ? sp.anios : null} />}
    />
  );
}
