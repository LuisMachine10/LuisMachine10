import type { Metadata } from "next";
import { VistaCierre } from "@/componentes/capital/Cierre";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";

export const metadata: Metadata = { title: "Cierre · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalCierre({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return <PaginaCapital actual="cierre" sp={sp} vista={(datos, mes) => <VistaCierre datos={datos} mes={mes} />} />;
}
