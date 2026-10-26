import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { PaginaCapital, type ParametrosBusqueda } from "@/componentes/capital/Pagina";
import { precargarCapital } from "@/lib/datos-capital";
import { VistaResumen } from "@/componentes/capital/Resumen";
import { leerPreferenciaCapital, leerPrefRegistro } from "@/lib/capital/preferencias";
import { normalizar } from "@/lib/dashboard/disposicion";
import { WIDGETS_PORTAFOLIO } from "@/lib/dashboard/widgets";
import { refrescarFotoTuDinero } from "@/lib/datos-boletin";

export const metadata: Metadata = { title: "Portafolio Financiero · Strategya" };
export const dynamic = "force-dynamic";

export default async function CapitalResumen({ searchParams }: { searchParams: Promise<ParametrosBusqueda> }) {
  // Empieza a leer el Portafolio ya, en paralelo con lo demás de la página (una sola lectura por petición).
  precargarCapital();
  const sp = await searchParams;
  // De paso, la foto de «Tu dinero» del Boletín (como mucho una vez cada 20 minutos; nunca falla la página).
  const [pref, reg] = await Promise.all([leerPreferenciaCapital("portafolio"), leerPreferenciaCapital("registro"), refrescarFotoTuDinero()]);
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
