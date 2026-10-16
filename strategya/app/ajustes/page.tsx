import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
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
      {/* Encabezado aún no conoce «ajustes» (lo agrega el integrador): ningún enlace queda marcado como actual. */}
      <Encabezado actual="ajustes" ultimaActualizacion={null} />
      <main className="terminal">
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
