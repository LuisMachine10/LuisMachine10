import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { VistaResumen } from "@/componentes/capital/Resumen";
import { leerPreferenciaCapital, leerPrefRegistro } from "@/lib/capital/preferencias";
import { normalizar } from "@/lib/dashboard/disposicion";
import { WIDGETS_PORTAFOLIO } from "@/lib/dashboard/widgets";

export const metadata: Metadata = { title: "Portafolio Financiero · Strategya" };
export const dynamic = "force-dynamic";

export default async function CapitalResumen({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  const sp = await searchParams;
  const [pref, reg] = await Promise.all([leerPreferenciaCapital("portafolio"), leerPreferenciaCapital("registro")]);
  const disposicion = normalizar(pref.valor, WIDGETS_PORTAFOLIO);
  const prefRegistro = leerPrefRegistro(reg.valor);
  return (
    <>
      <PaginaCapital
        actual="resumen"
        sp={sp}
        vista={(datos, mes) => <VistaResumen datos={datos} mes={mes} disposicion={disposicion} avisoDisposicion={pref.error} prefRegistro={prefRegistro} />}
      />
      <Actualizador cadaSegundos={300} />
    </>
  );
}
