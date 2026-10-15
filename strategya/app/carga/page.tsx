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

function Panel({ id, titulo, ayuda, children }: { id: string; titulo: string; ayuda: string; children: React.ReactNode }) {
  return (
    <section className="panel" aria-labelledby={id}>
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id={id}>
          {titulo}
        </h2>
        <span className="sello">{ayuda}</span>
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
        <Encabezado actual="terminal" ultimaActualizacion={null} />
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
      <Encabezado actual="terminal" ultimaActualizacion={null} />
      <NavRD actual="carga" />
      <main className="terminal">
        <section className="panel panel-ancho">
          <div className="panel-cuerpo chico">
            Datos que ninguna fuente entrega de forma automática y permitida (BVRD, SAFI, resoluciones de la SIMV, tasas de otros
            bancos centrales). Cada dato lleva el enlace de donde salió y aparece en la terminal con su sello «Carga manual». Solo tu
            cuenta puede guardar.
          </div>
        </section>
        <div className="rd-formularios panel-ancho">
          <Panel id="t-carga-dato" titulo="Dato de una serie" ayuda="Cualquier serie del catálogo (p. ej. TASA_BOJ)">
            <FormularioDato series={series.map(({ id, nombre, unidad }) => ({ id, nombre, unidad }))} hoy={hoy} />
          </Panel>
          <Panel id="t-carga-fondo" titulo="Rendimiento de un fondo" ayuda="SAFI · fondo · base 30/360/365 días">
            <FormularioFondo hoy={hoy} />
          </Panel>
          <Panel id="t-carga-emision" titulo="Resolución SIMV o hecho BVRD" ayuda="Va a Emisiones RD">
            <FormularioEmision hoy={hoy} />
          </Panel>
          <Panel id="t-carga-comb" titulo="Precios de combustibles" ayuda="Solo si el aviso del MICM no se pudo leer">
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
