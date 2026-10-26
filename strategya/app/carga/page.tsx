import type { Metadata } from "next";
import { Encabezado } from "@/componentes/Encabezado";
import { IntroPantalla } from "@/componentes/IntroPantalla";
import { PanelError } from "@/componentes/PanelError";
import {
  FormularioCombustibles,
  FormularioDato,
  FormularioEmision,
  FormularioFondo,
  type SerieCarga,
} from "@/componentes/rd/FormulariosCarga";
import { NavRD } from "@/componentes/rd/NavRD";
import { SelectorCarga } from "@/componentes/rd/SelectorCarga";
import { seriesParaCarga } from "@/lib/datos-rd";

export const metadata: Metadata = { title: "Agregar un dato · Strategya" };
export const dynamic = "force-dynamic";

/** Fecha de hoy en RD (UTC−4, sin horario de verano), para los valores por defecto. */
function hoyRD(): string {
  return new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
}

/** Íconos de trazo 24×24 de cada formulario. */
const ICONOS = {
  dato: "M4 19h16M7 15l3-4 3 2 4-6",
  fondo: "M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z",
  emision: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  combustible: "M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M5 10h10M15 8l3 2v8a1.5 1.5 0 0 0 3 0V9l-3-3",
} as const;

export default async function PaginaCarga() {
  let series: SerieCarga[];
  try {
    // Las series de cotización intradía no se cargan a mano.
    series = (await seriesParaCarga()).filter((s) => !["fmp", "finnhub"].includes(s.fuente_id));
  } catch (e) {
    return (
      <>
        <Encabezado actual="carga" ultimaActualizacion={null} />
        <NavRD actual="carga" />
        <main className="terminal">
          <PanelError titulo="Agregar un dato" mensaje={(e as Error).message} />
        </main>
      </>
    );
  }
  const hoy = hoyRD();
  return (
    <>
      <Encabezado actual="carga" ultimaActualizacion={null} />
      <NavRD actual="carga" />
      <main className="terminal rd-pagina-carga">
        <IntroPantalla clave="carga">
          <p className="rd-intro-nota">
            Elige qué vas a agregar, llena las casillas y pega el enlace de donde lo sacaste: así aparece con su fuente, marcado
            «Carga manual». Solo tu cuenta puede guardar.
          </p>
        </IntroPantalla>
        <div className="panel-ancho">
          <SelectorCarga
            opciones={[
              {
                id: "fondo",
                titulo: "Rendimiento de un fondo",
                ayuda: "Un fondo de una SAFI que no se lee sola (BHD, Popular, Universal, Pioneer…)",
                icono: ICONOS.fondo,
                contenido: <FormularioFondo hoy={hoy} />,
              },
              {
                id: "emision",
                titulo: "Resolución de la SIMV o hecho de la BVRD",
                ayuda: "Aparece en Avisos de la SIMV, en la sección RD",
                icono: ICONOS.emision,
                contenido: <FormularioEmision hoy={hoy} />,
              },
              {
                id: "comb",
                titulo: "Precios de combustibles",
                ayuda: "Solo si el aviso del MICM no se pudo leer solo",
                icono: ICONOS.combustible,
                contenido: <FormularioCombustibles hoy={hoy} />,
              },
              {
                id: "dato",
                titulo: "Otra cifra oficial",
                ayuda: "Cualquier serie de Strategya, por ejemplo la tasa del Banco de Japón",
                icono: ICONOS.dato,
                contenido: <FormularioDato series={series.map(({ id, nombre, unidad }) => ({ id, nombre, unidad }))} hoy={hoy} />,
              },
            ]}
          />
        </div>
      </main>
      <footer className="pie">
        <p>Strategya no es asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje.</p>
        <p className="pie-legal">
          <a href="/terminos">Términos y privacidad</a>
        </p>
      </footer>
    </>
  );
}
