import type { Metadata } from "next";
import { VistaFuturo } from "@/componentes/capital/Futuro";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";

export const metadata: Metadata = { title: "Futuro · Mena Capital" };
export const dynamic = "force-dynamic";

export default async function CapitalFuturo({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return <PaginaCapital actual="futuro" sp={sp} vista={(datos, mes) => <VistaFuturo datos={datos} mes={mes} />} />;
}
