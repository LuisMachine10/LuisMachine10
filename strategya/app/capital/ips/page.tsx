import type { Metadata } from "next";
import { VistaIps } from "@/componentes/capital/Ips";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";

export const metadata: Metadata = { title: "Política (IPS) · Mena Capital" };
export const dynamic = "force-dynamic";

export default async function CapitalIps({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return <PaginaCapital actual="ips" sp={sp} vista={(datos, mes) => <VistaIps datos={datos} mes={mes} />} />;
}
