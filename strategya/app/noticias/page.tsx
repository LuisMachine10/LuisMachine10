import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { IntroPantalla } from "@/componentes/IntroPantalla";
import { Encabezado } from "@/componentes/Encabezado";
import {
  Glosario,
  Mapa,
  PanelAgenda,
  PanelFusionesIPO,
  PanelInstituciones,
  PanelNoticias,
  PanelQueVigilar,
} from "@/componentes/noticias";

export const metadata: Metadata = { title: "Noticias · Strategya" };
export const dynamic = "force-dynamic";

export default function PaginaNoticias() {
  const ahora = new Date();
  return (
    <>
      <Encabezado actual="noticias" ultimaActualizacion={null} />
      <main className="terminal">
        <IntroPantalla clave="noticias" />
        <Mapa ahora={ahora} />
        <PanelQueVigilar ahora={ahora} />
        <PanelAgenda ahora={ahora} />
        <PanelNoticias ahora={ahora} limite={24} ancho />
        <PanelInstituciones ahora={ahora} />
        <div className="nt-columna">
          <PanelFusionesIPO ahora={ahora} />
          <Glosario ahora={ahora} />
        </div>
      </main>
      <footer className="pie">
        <h2>Fuentes</h2>
        <ul>
          <li>
            Titulares: <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer">GDELT Project</a> y
            feeds RSS públicos de cada medio (solo titular y enlace).
          </li>
          <li>Instituciones: feeds RSS y listas públicas de comunicados de cada institución.</li>
          <li>
            Fusiones e IPO:{" "}
            <a href="https://www.sec.gov/Archives/edgar/daily-index/" target="_blank" rel="noopener noreferrer">
              índice diario de SEC EDGAR
            </a>
            .
          </li>
          <li>Mapa: Natural Earth vía world-atlas (dominio público).</li>
        </ul>
        <p>Strategya no es asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje.</p>
      </footer>
      <Actualizador cadaSegundos={120} />
    </>
  );
}
