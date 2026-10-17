// Emisiones y avisos del mercado de valores de RD: Hacienda (Crédito Público) en tarjetas, SIMV, BCRD y BVRD.

import "@/estilos/rd.css";
import { PanelError } from "@/componentes/PanelError";
import { type AvisoInstitucion, type DatosRD, datosRD, type EmisionRD } from "@/lib/datos-rd";
import { cifra, fechaCorta, fechaHoraRD, hace, ZONA_RD } from "@/lib/formato";
import { Icono, ICONOS_RD, SinDatos, tareaDe } from "./comun";
import { leerResumenSubasta } from "./subasta";
import { TarjetaSubasta } from "./TarjetaSubasta";

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

/** Una emisión de SIMV, BCRD o BVRD en la lista. */
function Emision({ e }: { e: EmisionRD }) {
  const moneda = e.moneda === "USD" ? "US$" : e.moneda === "DOP" ? "RD$" : "";
  const aviso = leerResumenSubasta(e.descripcion).aviso;
  const meta = [
    e.emisor,
    e.fuente === "SIMV" || e.fuente === "BVRD" ? e.numero : null,
    e.monto ? `monto ${moneda} ${cifra(e.monto, 2)}`.replace("  ", " ") : null,
    e.tasa ? `${e.fuente === "CREDITO_PUBLICO" ? "tasa de corte" : "tasa"} ${cifra(e.tasa, 4)}%` : null,
  ].filter(Boolean);
  return (
    <li className="rd-item">
      <time className="rd-fecha-chip mono" dateTime={e.fecha}>
        {fechaCorta(e.fecha, false)}
      </time>
      <div className="rd-item-cuerpo">
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="rd-item-titulo">
          {e.instrumento ?? e.numero} ↗
        </a>
        {meta.length || e.origen === "manual" ? (
          <span className="rd-item-meta">
            {meta.join(" · ")}
            {e.origen === "manual" ? <span className="etiqueta alerta">carga manual</span> : null}
          </span>
        ) : null}
        {aviso ? (
          <span className="rd-aviso rd-aviso-chico">
            <Icono d={ICONOS_RD.aviso} tam={14} />
            {aviso}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Aviso({ a }: { a: AvisoInstitucion }) {
  const oficial = /publicaciones oficiales/i.test(a.titulo);
  const dia = DIA_RD.format(new Date(a.fecha));
  return (
    <li className="rd-item">
      <time className="rd-fecha-chip mono" dateTime={dia}>
        {fechaCorta(dia, false)}
      </time>
      <div className="rd-item-cuerpo">
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="rd-item-titulo">
          {a.titulo} ↗
        </a>
        {oficial ? (
          <span className="rd-item-meta">
            <span className="etiqueta alerta">Publicación oficial</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

function Verificado({ ultimaOk, estado, ahora }: { ultimaOk: string | null | undefined; estado?: string; ahora: Date }) {
  return (
    <p className="sello rd-verificado">
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
  const fuenteCp = d.fuentes.find((f) => f.id === "credito_publico");

  return (
    <section className="panel panel-ancho rd-panel" aria-labelledby="t-emisiones">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-emisiones">
          Emisiones
        </h2>
        <span className="sello" title="Cada aviso enlaza a su documento oficial">
          Hacienda · SIMV · BCRD · BVRD
        </span>
      </div>
      <div className="panel-cuerpo">
        <div className="rd-bloque">
          <h3 className="rd-h3">
            <span className="rd-h3-icono">
              <Icono d={ICONOS_RD.subasta} tam={15} />
            </span>
            Subastas de Hacienda
          </h3>
          {hacienda.length ? (
            <div className="rd-subastas">
              {hacienda.map((e) => (
                <TarjetaSubasta key={e.id} e={e} tarea={tCp} fuenteNombre={fuenteCp?.nombre ?? "Crédito Público"} ahora={ahora} />
              ))}
            </div>
          ) : (
            <SinDatos tarea={tCp}>Sin datos: la página de subastas se lee una vez al día (11:15 AM).</SinDatos>
          )}
          <Verificado ultimaOk={tCp?.ultima_ok} estado={tCp?.estado} ahora={ahora} />
        </div>

        <div className="rd-rejilla-3 rd-separado">
          <div className="rd-bloque">
            <h3 className="rd-h3">SIMV · resoluciones y publicaciones</h3>
            {simv.length ? (
              <ul className="rd-lista">
                {simv.map((e) => (
                  <Emision key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <SinDatos accion={{ href: "/carga", texto: "Cargar una resolución" }}>
                Resoluciones EV/FI: la página de la SIMV bloquea la lectura automática (Cloudflare) y no se esquiva.
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
            <h3 className="rd-h3">BCRD · subastas y emisiones</h3>
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
            <h3 className="rd-h3">BVRD · hechos relevantes</h3>
            {bvrd.length ? (
              <ul className="rd-lista">
                {bvrd.map((e) => (
                  <Emision key={e.id} e={e} />
                ))}
              </ul>
            ) : (
              <SinDatos accion={{ href: "/carga", texto: "Cargar un hecho relevante" }}>
                Sin datos: la BVRD prohíbe la lectura automática; los hechos se cargan a mano.
              </SinDatos>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
