import type { Metadata } from "next";
import { VistaAnalisis } from "@/componentes/capital/Analisis";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";

export const metadata: Metadata = { title: "Riesgos · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalAnalisis({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return <PaginaCapital actual="analisis" sp={sp} vista={(datos, mes) => <VistaAnalisis datos={datos} mes={mes} />} />;
}
