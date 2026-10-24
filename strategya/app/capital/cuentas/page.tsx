import type { Metadata } from "next";
import { VistaCuentas } from "@/componentes/capital/Cuentas";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { leerPreferenciaCapital, leerPrefRegistro } from "@/lib/capital/preferencias";

export const metadata: Metadata = { title: "Mis cuentas · Portafolio Financiero" };
export const dynamic = "force-dynamic";

export default async function CapitalCuentas({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  const pref = leerPrefRegistro((await leerPreferenciaCapital("registro")).valor);
  return <PaginaCapital actual="cuentas" sp={sp} vista={(datos, mes) => <VistaCuentas datos={datos} mes={mes} pref={pref} revisar={sp.revisar === "1"} />} />;
}
