import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { IntroPantalla } from "@/componentes/IntroPantalla";
import { Encabezado } from "@/componentes/Encabezado";
import {
  CintaPrecios,
  PanelAcciones,
  PanelEnergia,
  PanelIndices,
  PanelMetales,
  PanelTasasDivisas,
} from "@/componentes/mercado";
import { BloqueHoy, fechaLargaRD } from "@/componentes/terminal/BloqueHoy";
import { Seccion } from "@/componentes/terminal/Seccion";
import { datosMercado } from "@/lib/datos-mercado";

export const metadata: Metadata = { title: "Mercado en vivo · Strategya" };
export const dynamic = "force-dynamic";

export default async function Mercado() {
  let ultima: string | null = null;
  try {
    const d = await datosMercado();
    ultima = d.tareas.map((t) => t.ultima_ok).filter((x): x is string => !!x).sort().at(-1) ?? null;
  } catch {
    // Cada panel muestra su propio error con el motivo.
  }
  const ahora = new Date();
  return (
    <>
      <Encabezado actual="mercado" ultimaActualizacion={ultima} />
      <main className="terminal ter">
        <IntroPantalla clave="mercado" />
        <CintaPrecios />
        <Seccion id="hoy" titulo="Hoy" detalle={fechaLargaRD(ahora)}>
          <BloqueHoy />
        </Seccion>
        <Seccion id="mercados" titulo="Mercados">
          <PanelIndices />
          <PanelTasasDivisas />
          <PanelMetales />
          <PanelEnergia />
          <PanelAcciones />
        </Seccion>
      </main>
      <footer className="pie ter-pie">
        <div className="ter-pie-bloque">
          <h2>Fuentes</h2>
          <ul className="ter-pie-fuentes">
            <li>Financial Modeling Prep (índices, divisas, oro, plata, Brent, bitcoin, mayores alzas y bajas)</li>
            <li>Finnhub (ETF de EE. UU., cobre por el ETF CPER)</li>
            <li>Tesoro de EE. UU., Reserva Federal (FRED) y BCE (tasas)</li>
            <li>Banco Central de la RD (dólar)</li>
          </ul>
        </div>
        <p>
          Hora RD (UTC−4). Fuera del horario de cada mercado se muestra su cierre sin marcarlo desactualizado. Strategya no es
          asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje. Gráficos con{" "}
          <a href="https://www.tradingview.com/lightweight-charts/" target="_blank" rel="noopener noreferrer">
            TradingView Lightweight Charts
          </a>
          .
        </p>
      </footer>
      <Actualizador />
    </>
  );
}
