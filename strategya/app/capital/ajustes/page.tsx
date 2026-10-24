import type { Metadata } from "next";
import { VistaAjustes } from "@/componentes/capital/AjustesCapital";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";

export const metadata: Metadata = { title: "Ajustes · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalAjustes({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return <PaginaCapital actual="ajustes" sp={sp} vista={(datos, mes) => <VistaAjustes datos={datos} mes={mes} />} />;
}
