import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { Encabezado } from "@/componentes/Encabezado";
import {
  CintaPrecios,
  PanelAcciones,
  PanelEnergia,
  PanelIndices,
  PanelMetales,
  PanelTasasDivisas,
} from "@/componentes/mercado";
import { datosMercado } from "@/lib/datos-mercado";

export const metadata: Metadata = { title: "Mercado en vivo · Strategya" };
export const dynamic = "force-dynamic";

// El encabezado todavía no tiene una pestaña «Mercado» (la agrega el integrador): ninguna queda marcada.
const SIN_PESTANA = "mercado" as unknown as "terminal";

export default async function Mercado() {
  let ultima: string | null = null;
  try {
    const d = await datosMercado();
    ultima = d.tareas.map((t) => t.ultima_ok).filter((x): x is string => !!x).sort().at(-1) ?? null;
  } catch {
    // Cada panel muestra su propio error con el motivo.
  }
  return (
    <>
      <Encabezado actual={SIN_PESTANA} ultimaActualizacion={ultima} />
      <main className="terminal">
        <CintaPrecios />
        <PanelIndices />
        <PanelMetales />
        <PanelEnergia />
        <PanelTasasDivisas />
        <PanelAcciones />
      </main>
      <footer className="pie">
        <h2>Fuentes</h2>
        <ul>
          <li>Financial Modeling Prep (índices, divisas, oro, plata, Brent, bitcoin, mayores alzas y bajas)</li>
          <li>Finnhub (ETF de EE. UU., cobre por el ETF CPER)</li>
          <li>Tesoro de EE. UU., Reserva Federal (FRED) y BCE (tasas)</li>
        </ul>
        <p>
          Hora RD (UTC−4). Fuera del horario de cada mercado se muestra su cierre sin marcarlo desactualizado. Strategya no es
          asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje.
        </p>
      </footer>
      <Actualizador />
    </>
  );
}
