import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { VistaResumen } from "@/componentes/capital/Resumen";

export const metadata: Metadata = { title: "Mena Capital · Strategya" };
export const dynamic = "force-dynamic";

export default async function CapitalResumen({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  return (
    <>
      <PaginaCapital actual="resumen" sp={sp} vista={(datos, mes) => <VistaResumen datos={datos} mes={mes} />} />
      <Actualizador cadaSegundos={300} />
    </>
  );
}
