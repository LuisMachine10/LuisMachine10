import type { Metadata } from "next";
import { Encabezado } from "@/componentes/Encabezado";
import { PanelError } from "@/componentes/PanelError";
import {
  FormularioCombustibles,
  FormularioDato,
  FormularioEmision,
  FormularioFondo,
  type SerieCarga,
} from "@/componentes/rd/FormulariosCarga";
import { NavRD } from "@/componentes/rd/NavRD";
import { seriesParaCarga } from "@/lib/datos-rd";

export const metadata: Metadata = { title: "Carga manual · Strategya" };
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

function Panel({
  id,
  titulo,
  ayuda,
  icono,
  children,
}: {
  id: string;
  titulo: string;
  ayuda: string;
  icono: keyof typeof ICONOS;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rd-panel" aria-labelledby={id}>
      <div className="panel-cabecera rd-carga-cabecera">
        <span className="rd-kpi-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={ICONOS[icono]} />
          </svg>
        </span>
        <div>
          <h2 className="panel-titulo" id={id}>
            {titulo}
          </h2>
          <p className="rd-carga-ayuda">{ayuda}</p>
        </div>
      </div>
      <div className="panel-cuerpo">{children}</div>
    </section>
  );
}

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
          <PanelError titulo="Carga manual" mensaje={(e as Error).message} />
        </main>
      </>
    );
  }
  const hoy = hoyRD();
  return (
    <>
      <Encabezado actual="carga" ultimaActualizacion={null} />
      <NavRD actual="carga" />
      <main className="terminal">
        <header className="panel-ancho rd-carga-intro">
          <h1 className="rd-carga-titulo">Carga manual</h1>
          <p>
            Datos que ninguna fuente entrega de forma automática y permitida (BVRD, SAFI, resoluciones de la SIMV, tasas de otros
            bancos centrales). Cada dato lleva el enlace de donde salió y aparece en la terminal con su sello «Carga manual». Solo tu
            cuenta puede guardar.
          </p>
        </header>
        <div className="rd-formularios panel-ancho">
          <Panel id="t-carga-dato" titulo="Dato de una serie" ayuda="Cualquier serie del catálogo (p. ej. TASA_BOJ)" icono="dato">
            <FormularioDato series={series.map(({ id, nombre, unidad }) => ({ id, nombre, unidad }))} hoy={hoy} />
          </Panel>
          <Panel id="t-carga-fondo" titulo="Rendimiento de un fondo" ayuda="SAFI · fondo · base 30/360/365 días" icono="fondo">
            <FormularioFondo hoy={hoy} />
          </Panel>
          <Panel id="t-carga-emision" titulo="Resolución SIMV o hecho BVRD" ayuda="Aparece en Emisiones, en la sección RD" icono="emision">
            <FormularioEmision hoy={hoy} />
          </Panel>
          <Panel id="t-carga-comb" titulo="Precios de combustibles" ayuda="Solo si el aviso del MICM no se pudo leer" icono="combustible">
            <FormularioCombustibles hoy={hoy} />
          </Panel>
        </div>
      </main>
      <footer className="pie">
        <p>Strategya no es asesoría de inversión. Ninguna cifra sale de un modelo de lenguaje.</p>
      </footer>
    </>
  );
}
