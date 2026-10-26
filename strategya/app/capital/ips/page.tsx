import type { Metadata } from "next";
import { VistaIps } from "@/componentes/capital/Ips";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { precargarCapital } from "@/lib/datos-capital";

export const metadata: Metadata = { title: "Política (IPS) · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalIps({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  // Empieza a leer el Portafolio ya, en paralelo con lo demás de la página (una sola lectura por petición).
  precargarCapital();
  const sp = await searchParams;
  return <PaginaCapital actual="ips" sp={sp} vista={(datos, mes) => <VistaIps datos={datos} mes={mes} />} />;
}
