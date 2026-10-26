import type { Metadata } from "next";
import Link from "next/link";
import { Actualizador } from "@/componentes/Actualizador";
import { Encabezado } from "@/componentes/Encabezado";
import { PanelNoticias } from "@/componentes/noticias";
import {
  BoletinTasas,
  PanelCombustibles,
  PanelFondos,
  PanelManuales,
  PanelRD,
  PanelSIMV,
  PanelSubastas,
} from "@/componentes/rd";
import { Icono, ICONOS_RD } from "@/componentes/rd/comun";
import { NavRD } from "@/componentes/rd/NavRD";
import { datosRD } from "@/lib/datos-rd";

export const metadata: Metadata = { title: "República Dominicana · Strategya" };
export const dynamic = "force-dynamic";

export default async function PaginaRD() {
  // La última verificación de las tareas del módulo va en el encabezado. Si la base falla,
  // cada panel muestra su propio error.
  let ultima: string | null = null;
  try {
    const d = await datosRD();
    ultima = d.tareas.map((t) => t.ultima_ok).filter((x): x is string => !!x).sort().at(-1) ?? null;
  } catch {
    ultima = null;
  }
  return (
    <>
      <Encabezado actual="rd" ultimaActualizacion={ultima} />
      <NavRD actual="rd" />
      <main className="terminal rd-pagina">
        <header className="intro-pantalla panel-ancho rd-intro">
          <div>
            <h1>República Dominicana</h1>
            <p>
              Aquí ves el mercado de valores y el dinero en RD: avisos de la SIMV, tasas de los bancos, dólar y euro, subastas,
              fondos y combustibles. Cada cifra dice de dónde sale y de qué fecha es.
            </p>
          </div>
          <Link href="/carga" className="boton rd-accion-principal">
            <Icono d={ICONOS_RD.mas} tam={18} />
            Agregar un dato
          </Link>
        </header>
        {/* Fila 1: SIMV + boletín · Fila 2: dólar y euro + subastas · Fila 3: fondos · Fila 4: combustibles + datos a mano */}
        <PanelSIMV />
        <BoletinTasas />
        <PanelRD />
        <PanelSubastas />
        <PanelFondos />
        <PanelCombustibles />
        <div className="rd-columna">
          <PanelManuales />
          <PanelNoticias categoria="rd" limite={8} />
        </div>
      </main>
      <footer className="pie">
        <h2>Fuentes</h2>
        <ul>
          <li>
            <a href="https://www.bancentral.gov.do/" target="_blank" rel="noopener noreferrer">
              Banco Central de la República Dominicana
            </a>{" "}
            (portada y estadísticas en Excel)
          </li>
          <li>
            <a href="https://www.creditopublico.gob.do/emisiones/subastas" target="_blank" rel="noopener noreferrer">
              Dirección General de Crédito Público
            </a>
          </li>
          <li>
            <a href="https://simv.gob.do/feed/" target="_blank" rel="noopener noreferrer">
              SIMV (solo su feed público)
            </a>
          </li>
          <li>
            <a
              href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
              target="_blank"
              rel="noopener noreferrer"
            >
              Banco Central Europeo
            </a>{" "}
            (euro de referencia; el euro en pesos es un cruce calculado: dólar del BCRD × euro del BCE)
          </li>
          <li>
            <a href="https://fondosabiertos.excel.com.do/" target="_blank" rel="noopener noreferrer">
              Excel Fondos
            </a>{" "}
            y{" "}
            <a href="https://www.afireservas.com/" target="_blank" rel="noopener noreferrer">
              AFI Reservas
            </a>{" "}
            (páginas públicas de sus fondos)
          </li>
          <li>
            <a href="https://micm.gob.do/" target="_blank" rel="noopener noreferrer">
              MICM · avisos semanales de combustibles
            </a>
          </li>
          <li>Carga manual de Mena, con el enlace de cada dato.</li>
        </ul>
        <p>Strategya no es asesoría de inversión. Cifras de fuentes oficiales; ninguna sale de un modelo de lenguaje.</p>
        <p className="pie-legal">
          <a href="/terminos">Términos y privacidad</a>
        </p>
      </footer>
      <Actualizador />
    </>
  );
}
