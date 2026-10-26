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
  PanelMiLista,
  PanelPosiciones,
  PanelTasasDivisas,
} from "@/componentes/mercado";
import { Seccion } from "@/componentes/terminal/Seccion";
import { datosMercado } from "@/lib/datos-mercado";

export const metadata: Metadata = { title: "Mercados · Strategya" };
export const dynamic = "force-dynamic";

/** Atajos a cada parte de la pantalla (en el celular evitan bajar mucho). */
const SALTOS = [
  { href: "#mi-lista", texto: "Mi lista" },
  { href: "#mis-posiciones", texto: "Mis posiciones" },
  { href: "#t-indices", texto: "Índices" },
  { href: "#t-tasas", texto: "Tasas y divisas" },
  { href: "#t-metales", texto: "Metales" },
  { href: "#t-energia", texto: "Energía" },
  { href: "#t-acciones", texto: "Acciones y ETF" },
];

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
      <Encabezado actual="mercado" ultimaActualizacion={ultima} />
      <main className="terminal ter mv-pagina">
        <IntroPantalla clave="mercado">
          <nav className="mv-saltos" aria-label="Ir a una parte de Mercados">
            {SALTOS.map((s) => (
              <a key={s.href} href={s.href}>
                {s.texto}
              </a>
            ))}
          </nav>
        </IntroPantalla>
        <CintaPrecios />
        <Seccion id="tus-acciones" titulo="Tus acciones" para="Aquí anotas las acciones de EE. UU. que quieres seguir y ves cómo van hoy las que ya tienes.">
          <PanelMiLista />
          <PanelPosiciones />
        </Seccion>
        <Seccion id="mercados" titulo="El mercado hoy" para="Bolsas, tasas, monedas, metales y energía. Cuando algo se mueve fuerte, verás el porqué.">
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
            <li>Cboe (Mi lista y Mis posiciones, diferido 15 min; respaldo de índices y ETF)</li>
            <li>Financial Modeling Prep (índices, divisas, oro, plata, Brent, bitcoin, mayores alzas y bajas)</li>
            <li>Finnhub (ETF de EE. UU., cobre por el ETF CPER, cierres de la cartera)</li>
            <li>Tesoro de EE. UU., Reserva Federal (FRED) y BCE (tasas)</li>
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
        <p className="pie-legal">
          <a href="/terminos">Términos y privacidad</a>
        </p>
      </footer>
      <Actualizador />
    </>
  );
}
