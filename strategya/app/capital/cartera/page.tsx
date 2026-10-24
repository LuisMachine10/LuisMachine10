import type { Metadata } from "next";
import { VistaCartera } from "@/componentes/capital/Cartera";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";

export const metadata: Metadata = { title: "Cartera · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalCartera({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return <PaginaCapital actual="cartera" sp={sp} vista={(datos, mes) => <VistaCartera datos={datos} mes={mes} />} />;
}
