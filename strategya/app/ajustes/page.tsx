import type { Metadata } from "next";
import Link from "next/link";
import { Actualizador } from "@/componentes/Actualizador";
import { IntroPagina } from "@/componentes/alertas/Ayuda";
import { BannerAlertas } from "@/componentes/alertas/BannerAlertas";
import { HistorialAlertas } from "@/componentes/alertas/HistorialAlertas";
import { ReglasAlerta } from "@/componentes/alertas/ReglasAlerta";
import { Encabezado } from "@/componentes/Encabezado";
import { GastoIA } from "@/componentes/ia/GastoIA";
import { GuerrasEnElMundo } from "@/componentes/ia/GuerrasEnElMundo";
import { LasCincoDelDia } from "@/componentes/ia/LasCincoDelDia";

export const metadata: Metadata = { title: "Ajustes · Strategya" };
export const dynamic = "force-dynamic";

// Página del módulo Alertas + IA: umbrales editables, historial de alertas, gasto de IA del mes y los dos
// paneles redactados con IA (los mismos que van en las secciones 3 y 4 de la terminal).
export default async function Ajustes() {
  return (
    <>
      <Encabezado actual="ajustes" ultimaActualizacion={null} />
      <main className="terminal">
        <IntroPagina
          titulo="Ajustes"
          accion={
            <Link href="#t-umbrales" className="boton aj-boton-alto">
              Configurar mis alertas
            </Link>
          }
        >
          Aquí decides cuándo te avisa Strategya: eliges un número para cada activo y, si se cruza, te sale una alerta arriba en la terminal.
          También ves cuánto va gastando la IA este mes.
        </IntroPagina>
        <BannerAlertas />
        <ReglasAlerta />
        <HistorialAlertas />
        <GastoIA />
        <LasCincoDelDia />
        <GuerrasEnElMundo />
      </main>
      <footer className="pie">
        <p>
          Las alertas y los textos con IA informan; no son asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje: la IA solo
          redacta a partir de datos y titulares ya guardados, y cada texto que no pasa la validación queda como «no confirmado».
        </p>
      </footer>
      <Actualizador />
    </>
  );
}
