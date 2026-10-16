import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { Encabezado } from "@/componentes/Encabezado";
import { BoletinTasas, PanelCombustibles, PanelEmisiones, PanelRD } from "@/componentes/rd";
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
      <Encabezado actual="terminal" ultimaActualizacion={ultima} />
      <NavRD actual="rd" />
      <main className="terminal">
        <PanelRD />
        <PanelCombustibles />
        <BoletinTasas />
        <PanelEmisiones />
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
            <a href="https://micm.gob.do/" target="_blank" rel="noopener noreferrer">
              MICM · avisos semanales de combustibles
            </a>
          </li>
          <li>Carga manual de Mena, con el enlace de cada dato.</li>
        </ul>
        <p>Strategya no es asesoría de inversión. Cifras de fuentes oficiales; ninguna sale de un modelo de lenguaje.</p>
      </footer>
      <Actualizador />
    </>
  );
}
