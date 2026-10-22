// Mercado de valores y deuda pública de RD, en dos paneles:
//   · PanelSIMV: avisos y resoluciones de la SIMV (feed público) y hechos relevantes de la BVRD (carga manual).
//   · PanelSubastas: subastas de Hacienda (Crédito Público) y del BCRD.
// PanelEmisiones (para otras pantallas) muestra los dos juntos.

import "@/estilos/rd.css";
import Big from "big.js";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { type AvisoInstitucion, type DatosRD, datosRD, type EmisionRD } from "@/lib/datos-rd";
import { cifra, fechaCorta, fechaHoraRD, hace, ZONA_RD } from "@/lib/formato";
import { Cabecera, Icono, ICONOS_RD, QueEs, SinDatos, tareaDe } from "./comun";
import { leerResumenSubasta } from "./subasta";
import { TarjetaSubasta } from "./TarjetaSubasta";

const POR_GRUPO = 6;
/** Día en RD de un instante (AAAA-MM-DD). */
const DIA_RD = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD });

async function leer(titulo: string): Promise<{ d: DatosRD } | { error: React.ReactNode }> {
  try {
    return { d: await datosRD() };
  } catch (e) {
    return { error: <PanelError titulo={titulo} mensaje={(e as Error).message} /> };
  }
}

export async function PanelSIMV() {
  const r = await leer("Avisos de la SIMV");
  return "error" in r ? r.error : <VistaPanelSIMV d={r.d} ahora={new Date()} />;
}

export async function PanelSubastas() {
  const r = await leer("Subastas de Hacienda");
  return "error" in r ? r.error : <VistaPanelSubastas d={r.d} ahora={new Date()} />;
}

/** Los dos paneles juntos (para pantallas que muestran RD de un vistazo). */
export async function PanelEmisiones() {
  const r = await leer("Emisiones RD");
  if ("error" in r) return r.error;
  const ahora = new Date();
  return (
    <>
      <VistaPanelSIMV d={r.d} ahora={ahora} />
      <VistaPanelSubastas d={r.d} ahora={ahora} />
    </>
  );
}

/** Una resolución o un hecho relevante en la lista. */
function Emision({ e }: { e: EmisionRD }) {
  const moneda = e.moneda === "USD" ? "US$" : e.moneda === "DOP" ? "RD$" : "";
  const aviso = leerResumenSubasta(e.descripcion).aviso;
  const meta = [
    e.emisor,
    e.fuente === "SIMV" || e.fuente === "BVRD" ? e.numero : null,
    e.monto ? `monto ${moneda} ${cifra(e.monto, 2)}`.replace("  ", " ") : null,
    e.tasa ? `${e.fuente === "CREDITO_PUBLICO" || e.fuente === "BCRD" ? "tasa de corte" : "tasa"} ${cifra(e.tasa, 4)}%` : null,
  ].filter(Boolean);
  return (
    <li className="rd-item">
      <time className="rd-fecha-chip mono" dateTime={e.fecha}>
        {fechaCorta(e.fecha, false)}
      </time>
      <div className="rd-item-cuerpo">
        <a href={e.url} target="_blank" rel="noopener noreferrer" className="rd-item-titulo">
          {e.instrumento ?? e.numero} <span aria-hidden="true">↗</span>
        </a>
        {meta.length || e.origen === "manual" ? (
          <span className="rd-item-meta">
            {meta.join(" · ")}
            {e.origen === "manual" ? <span className="etiqueta neutra">agregado a mano</span> : null}
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
          {a.titulo} <span aria-hidden="true">↗</span>
        </a>
        {oficial ? (
          <span className="rd-item-meta">
            <span className="etiqueta neutra">Publicación oficial</span>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** Línea discreta de cuándo se leyó la fuente por última vez. */
function Verificado({ fuente, url, ultimaOk, estado, ahora }: { fuente: string; url: string; ultimaOk: string | null | undefined; estado?: string; ahora: Date }) {
  return (
    <p className="sello rd-verificado">
      <a href={url} target="_blank" rel="noopener noreferrer">
        {fuente} <span aria-hidden="true">↗</span>
      </a>
      {ultimaOk ? <span title={fechaHoraRD(ultimaOk)}>leído {hace(ultimaOk, ahora)}</span> : <span>aún sin lectura automática</span>}
      {estado === "error" ? <span className="vencido">la última lectura falló</span> : null}
    </p>
  );
}

type ItemSimv = { tipo: "aviso"; fecha: string; a: AvisoInstitucion } | { tipo: "resolucion"; fecha: string; e: EmisionRD };

export function VistaPanelSIMV({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const resoluciones = d.emisiones.filter((e) => e.fuente === "SIMV");
  const avisos = d.avisos.filter((a) => a.institucion === "SIMV");
  const bvrd = d.emisiones.filter((e) => e.fuente === "BVRD").slice(0, 4);
  const items: ItemSimv[] = [
    ...avisos.map((a) => ({ tipo: "aviso" as const, fecha: DIA_RD.format(new Date(a.fecha)), a })),
    ...resoluciones.map((e) => ({ tipo: "resolucion" as const, fecha: e.fecha, e })),
  ]
    .sort((x, y) => y.fecha.localeCompare(x.fecha))
    .slice(0, 8);
  const tSimv = tareaDe(d.tareas, "simv");

  return (
    <section className="panel rd-panel" aria-labelledby="t-simv">
      <Cabecera
        id="t-simv"
        titulo="Avisos de la SIMV"
        icono={ICONOS_RD.valores}
        para="Lo último que publicó el regulador del mercado de valores: nuevas emisiones, fondos y avisos."
        ayuda={
          <QueEs titulo="La SIMV">
            La Superintendencia del Mercado de Valores autoriza y vigila los bonos, las acciones y los fondos que se venden en la
            bolsa de RD. Cada aviso abre el documento oficial.
          </QueEs>
        }
      />
      <div className="panel-cuerpo">
        {items.length ? (
          <ul className="rd-lista">
            {items.map((i) => (i.tipo === "aviso" ? <Aviso key={`a${i.a.id}`} a={i.a} /> : <Emision key={`e${i.e.id}`} e={i.e} />))}
          </ul>
        ) : (
          <SinDatos tarea={tSimv}>Sin avisos todavía. El feed público de la SIMV se lee una vez al día.</SinDatos>
        )}
        {resoluciones.length === 0 ? (
          <p className="rd-nota">
            Las resoluciones (EV/FI) no se leen solas: la página de la SIMV bloquea la lectura automática.{" "}
            <Link href="/carga#t-carga-emision">Agregar una resolución</Link>
          </p>
        ) : null}
        <Verificado fuente="SIMV · feed público" url="https://simv.gob.do/feed/" ultimaOk={tSimv?.ultima_ok} estado={tSimv?.estado} ahora={ahora} />

        <div className="rd-subbloque">
          <h3 className="rd-h3">Bolsa de Valores (BVRD) · hechos relevantes</h3>
          {bvrd.length ? (
            <ul className="rd-lista">
              {bvrd.map((e) => (
                <Emision key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <p className="rd-nota">
              La BVRD no permite la lectura automática; los hechos relevantes se agregan a mano.{" "}
              <Link href="/carga#t-carga-emision">Agregar un hecho</Link>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Subasta anterior, en una fila compacta. */
function FilaSubasta({ e }: { e: EmisionRD }) {
  const moneda = e.moneda === "USD" ? "US$" : "RD$";
  const [codigo, ...resto] = (e.instrumento ?? e.numero).split(" · ");
  const titulo = resto.length ? resto.join(" · ") : codigo;
  return (
    <li className="rd-subasta-fila">
      <time className="rd-fecha-chip mono" dateTime={e.fecha}>
        {fechaCorta(e.fecha, false)}
      </time>
      <a href={e.url} target="_blank" rel="noopener noreferrer" className="rd-subasta-fila-titulo" title={`Resultado oficial: ${titulo}`}>
        {titulo} <span aria-hidden="true">↗</span>
      </a>
      <span className="rd-subasta-fila-cifras">
        {e.tasa ? (
          <span>
            <span className="sr-solo">tasa de corte </span>
            <span className="mono rd-fuerte">{cifra(e.tasa, 4)}%</span>
          </span>
        ) : (
          <span className="rd-sin-cifra" title="La tasa de corte solo está en el PDF oficial">
            sin dato
          </span>
        )}
        {e.monto ? (
          <span className="tenue" title={`Adjudicado ${moneda} ${cifra(e.monto, 2)}`}>
            <span className="mono">{cifra(new Big(e.monto).div(1_000_000).toString(), 1)}</span> MM {moneda}
          </span>
        ) : null}
      </span>
    </li>
  );
}

export function VistaPanelSubastas({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const hacienda = d.emisiones.filter((e) => e.fuente === "CREDITO_PUBLICO").slice(0, POR_GRUPO);
  const bcrd = d.emisiones.filter((e) => e.fuente === "BCRD").slice(0, 4);
  const tCp = tareaDe(d.tareas, "credito-publico");
  const fuenteCp = d.fuentes.find((f) => f.id === "credito_publico");
  const [ultima, ...anteriores] = hacienda;

  return (
    <section className="panel rd-panel" aria-labelledby="t-subastas">
      <Cabecera
        id="t-subastas"
        titulo="Subastas de Hacienda"
        icono={ICONOS_RD.subasta}
        para="Bonos y letras que vende el Gobierno: cuánto colocó y a qué tasa."
        ayuda={
          <QueEs titulo="Tasa de corte y cobertura">
            La tasa de corte es el rendimiento más alto que Hacienda aceptó pagar. La cobertura dice cuántas veces la demanda superó
            lo que se ofreció (2× = el doble).
          </QueEs>
        }
      />
      <div className="panel-cuerpo">
        {ultima ? (
          <>
            <TarjetaSubasta e={ultima} tarea={tCp} fuenteNombre={fuenteCp?.nombre ?? "Crédito Público"} ahora={ahora} destacada />
            {anteriores.length ? (
              <>
                <h3 className="rd-h3 rd-h3-chico">Anteriores</h3>
                <ul className="rd-subastas-lista" aria-label="Subastas anteriores: fecha, título, tasa de corte y monto adjudicado en millones">
                  {anteriores.map((e) => (
                    <FilaSubasta key={e.id} e={e} />
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <SinDatos tarea={tCp}>Sin datos: la página de subastas de Crédito Público se lee una vez al día (11:15 AM).</SinDatos>
        )}
        <Verificado
          fuente={fuenteCp?.nombre ?? "Crédito Público"}
          url="https://www.creditopublico.gob.do/emisiones/subastas"
          ultimaOk={tCp?.ultima_ok}
          estado={tCp?.estado}
          ahora={ahora}
        />

        <div className="rd-subbloque">
          <h3 className="rd-h3">Banco Central (BCRD) · subastas</h3>
          {bcrd.length ? (
            <ul className="rd-lista">
              {bcrd.map((e) => (
                <Emision key={e.id} e={e} />
              ))}
            </ul>
          ) : (
            <p className="rd-nota">Todavía sin fuente de lectura confirmada para las subastas del BCRD.</p>
          )}
        </div>
      </div>
    </section>
  );
}
