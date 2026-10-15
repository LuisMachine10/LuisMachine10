// Emisiones y avisos del mercado de valores de RD: SIMV, Hacienda (Crédito Público), BCRD y BVRD.

import "@/estilos/rd.css";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { type AvisoInstitucion, type DatosRD, datosRD, type EmisionRD } from "@/lib/datos-rd";
import { cifra, fechaCorta, fechaHoraRD, hace, ZONA_RD } from "@/lib/formato";
import { SinDatos, tareaDe } from "./comun";

const POR_GRUPO = 6;
/** Día en RD de un instante (AAAA-MM-DD). */
const DIA_RD = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD });

export async function PanelEmisiones() {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Emisiones RD" mensaje={(e as Error).message} />;
  }
  return <VistaPanelEmisiones d={d} ahora={ahora} />;
}

function Emision({ e }: { e: EmisionRD }) {
  const moneda = e.moneda === "USD" ? "US$" : e.moneda === "DOP" ? "RD$" : "";
  return (
    <li>
      <span className="rd-fecha">{fechaCorta(e.fecha)}</span>
      <a href={e.url} target="_blank" rel="noopener noreferrer">
        {e.instrumento ?? e.numero} ↗
      </a>
      <span className="rd-meta">
        {[
          e.emisor,
          e.fuente === "SIMV" || e.fuente === "BVRD" ? e.numero : null,
          e.monto ? `monto ${moneda} ${cifra(e.monto, 2)}`.replace("  ", " ") : null,
          e.tasa ? `tasa ${cifra(e.tasa, 4)}%` : null,
          e.origen === "manual" ? "carga manual" : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </li>
  );
}

function Aviso({ a }: { a: AvisoInstitucion }) {
  const oficial = /publicaciones oficiales/i.test(a.titulo);
  return (
    <li>
      <span className="rd-fecha">{fechaCorta(DIA_RD.format(new Date(a.fecha)))}</span>
      {oficial ? <span className="etiqueta alerta">Publicación oficial</span> : null}{" "}
      <a href={a.url} target="_blank" rel="noopener noreferrer">
        {a.titulo} ↗
      </a>
    </li>
  );
}

function Verificado({ ultimaOk, estado, ahora }: { ultimaOk: string | null | undefined; estado?: string; ahora: Date }) {
  return (
    <p className="sello">
      {ultimaOk ? <span title={fechaHoraRD(ultimaOk)}>Lectura automática verificada {hace(ultimaOk, ahora)}</span> : <span>Aún sin lectura automática</span>}
      {estado === "error" ? <span className="vencido">· la última lectura falló (ver Estado)</span> : null}
    </p>
  );
}

export function VistaPanelEmisiones({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const de = (f: EmisionRD["fuente"]) => d.emisiones.filter((e) => e.fuente === f).slice(0, POR_GRUPO);
  const hacienda = de("CREDITO_PUBLICO");
  const simv = de("SIMV");
  const bcrd = de("BCRD");
  const bvrd = de("BVRD");
  const avisosSimv = d.avisos.filter((a) => a.institucion === "SIMV").slice(0, POR_GRUPO);
  const tCp = tareaDe(d.tareas, "credito-publico");
  const tSimv = tareaDe(d.tareas, "simv");

  return (
    <section className="panel panel-ancho" aria-labelledby="t-emisiones">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-emisiones">
          Emisiones RD
        </h2>
        <span className="sello">SIMV · Hacienda · BCRD · BVRD — cada aviso enlaza a su documento oficial</span>
      </div>
      <div className="panel-cuerpo rd-rejilla-2">
        <div className="rd-bloque">
          <h3>Hacienda · subastas de Crédito Público</h3>
          {hacienda.length ? (
            <ul className="rd-lista">
              {hacienda.map((e) => (
                <Emision key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <SinDatos tarea={tCp}>Sin datos: la página de subastas se lee una vez al día (11:15 AM).</SinDatos>
          )}
          <Verificado ultimaOk={tCp?.ultima_ok} estado={tCp?.estado} ahora={ahora} />
        </div>

        <div className="rd-bloque">
          <h3>SIMV · resoluciones y publicaciones</h3>
          {simv.length ? (
            <ul className="rd-lista">
              {simv.map((e) => (
                <Emision key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <SinDatos>
              Resoluciones EV/FI: la página de la SIMV bloquea la lectura automática (Cloudflare) y no se esquiva. Se cargan en{" "}
              <Link href="/carga">Carga manual</Link>.
            </SinDatos>
          )}
          {avisosSimv.length ? (
            <ul className="rd-lista">
              {avisosSimv.map((a) => (
                <Aviso key={a.id} a={a} />
              ))}
            </ul>
          ) : (
            <SinDatos tarea={tSimv}>Sin avisos del feed de la SIMV todavía (se lee una vez al día).</SinDatos>
          )}
          <Verificado ultimaOk={tSimv?.ultima_ok} estado={tSimv?.estado} ahora={ahora} />
        </div>

        <div className="rd-bloque">
          <h3>BCRD · subastas y emisiones</h3>
          {bcrd.length ? (
            <ul className="rd-lista">
              {bcrd.map((e) => (
                <Emision key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <SinDatos>Sin datos: las emisiones del BCRD todavía no tienen una fuente de lectura confirmada.</SinDatos>
          )}
        </div>

        <div className="rd-bloque">
          <h3>BVRD · hechos relevantes</h3>
          {bvrd.length ? (
            <ul className="rd-lista">
              {bvrd.map((e) => (
                <Emision key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <SinDatos>
              Sin datos: la BVRD prohíbe la lectura automática. Los hechos se cargan en <Link href="/carga">Carga manual</Link>.
            </SinDatos>
          )}
        </div>
      </div>
    </section>
  );
}
