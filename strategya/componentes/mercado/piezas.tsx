// Piezas comunes de los paneles de mercado (Server Components, sin estado).
import "@/estilos/mercado.css";
import { SelloFuente } from "@/componentes/SelloFuente";
import { cifra, fechaHoraRD, horaRD } from "@/lib/formato";
import { decimales, porqueReciente, trazoSparkline, type Explicacion, type ItemMercado, type PuntoIntradia } from "@/lib/mercado-vista";

export const FLECHA = { sube: "↑", baja: "↓", igual: "→" } as const;

export function EstadoItem({ item }: { item: ItemMercado }) {
  if (item.estado === "cerrado") return <span className="etiqueta neutra">Cerrado · {item.etiquetaCierre}</span>;
  if (item.estado === "desactualizado") return <span className="etiqueta error">Desactualizado</span>;
  if (item.estado === "al_dia" && item.mercado) return <span className="etiqueta ok">Abierto</span>;
  return null;
}

/** Hora del dato, aclarando cuando es la de la consulta (FMP quote-short no trae hora). */
export function HoraDato({ item }: { item: ItemMercado }) {
  if (!item.horaDato) return null;
  return (
    <span className="tenue chico" title={fechaHoraRD(item.horaDato)}>
      {item.horaEsConsulta ? "hora de consulta" : "dato de las"} {horaRD(item.horaDato)} (RD)
    </span>
  );
}

export function Cambio({ item }: { item: ItemMercado }) {
  if (item.cambio === null) return <span className="tenue">—</span>;
  return (
    <span className={`mono ${item.direccion}`}>
      <span aria-hidden="true">{FLECHA[item.direccion]} </span>
      <span className="sr-solo">{item.direccion === "sube" ? "sube" : item.direccion === "baja" ? "baja" : "sin cambio"} </span>
      {item.cambio}
      {item.cambioPct ? ` (${item.cambioPct})` : ""}
    </span>
  );
}

export function SinDato({ item, cuando }: { item: ItemMercado; cuando?: string }) {
  if (item.estado === "no_disponible") {
    return <span className="tenue chico">No disponible con el plan actual del proveedor.</span>;
  }
  return <span className="tenue chico">Sin datos todavía{cuando ? `. ${cuando}` : "."}</span>;
}

/** Una cotización en forma de fila compacta: nombre, nivel, cambio, estado, hora y sello. */
export function FilaCotizacion({
  item,
  ahora,
  cuando,
  porque,
}: {
  item: ItemMercado;
  ahora: Date;
  cuando?: string;
  porque?: Explicacion | null;
}) {
  return (
    <li className="mv-fila">
      <div className="mv-fila-linea">
        <span className="mv-nombre">
          {item.nombre}
          {item.sustitutoDe ? <span className="mv-sustituto"> · sustituto de {item.sustitutoDe}</span> : null}
        </span>
        {item.valor ? (
          <span className="mv-valor mono">
            {item.valor} <span className="tenue chico">{item.unidad}</span>
          </span>
        ) : null}
      </div>
      {item.valor ? (
        <>
          <div className="mv-fila-linea">
            <Cambio item={item} />
            <EstadoItem item={item} />
          </div>
          <div className="mv-fila-linea">
            <HoraDato item={item} />
          </div>
          {item.sello ? <SelloFuente d={item.sello} ahora={ahora} /> : null}
          {porque ? <Porque e={porque} /> : null}
        </>
      ) : (
        <SinDato item={item} cuando={cuando} />
      )}
    </li>
  );
}

export function Porque({ e }: { e: Explicacion }) {
  const enlaces = (Array.isArray(e.fuentes) ? e.fuentes : []).filter((f) => typeof f?.url === "string" && /^https?:\/\//.test(f.url!));
  return (
    <div className="mv-porque">
      <span className="mv-porque-titulo">Por qué</span> {e.texto}{" "}
      {enlaces.slice(0, 3).map((f, i) => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="chico">
          {i === 0 ? "" : " · "}
          {f.titulo || "fuente"} ↗
        </a>
      ))}
      <span className="tenue chico"> · redactado a partir de titulares guardados, {horaRD(e.fecha)} (RD)</span>
    </div>
  );
}

export function porqueDe(explicaciones: Explicacion[], id: string, ahora: Date) {
  return porqueReciente(explicaciones, id, ahora);
}

const ANCHO_SPARK = 160;
const ALTO_SPARK = 36;

/** Línea del día desde las filas intradía guardadas, con su tabla equivalente. */
export function Sparkline({ item, puntos }: { item: ItemMercado; puntos: PuntoIntradia[] }) {
  const trazo = trazoSparkline(puntos.map((p) => p.valor), ANCHO_SPARK, ALTO_SPARK);
  if (!trazo) return <p className="tenue chico">La línea del día aparece con dos lecturas o más.</p>;
  const dec = decimales({ id: item.id, categoria: "" });
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  return (
    <figure className="mv-spark">
      <svg
        viewBox={`0 0 ${ANCHO_SPARK} ${ALTO_SPARK}`}
        width="100%"
        height={ALTO_SPARK}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${item.nombre}: ${puntos.length} lecturas del ${primero.fecha_dato}, de ${cifra(primero.valor, dec)} a ${cifra(ultimo.valor, dec)}. Los valores están en la tabla.`}
      >
        <path d={trazo} fill="none" stroke={`var(--${item.direccion === "baja" ? "baja" : item.direccion === "sube" ? "sube" : "ambar"})`} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <details className="chico">
        <summary>Lecturas del día ({puntos.length})</summary>
        <div className="desplazable mv-tabla-dia">
          <table className="tabla">
            <caption className="sr-solo">{item.nombre}: lecturas del día</caption>
            <thead>
              <tr>
                <th scope="col">Hora RD</th>
                <th scope="col" className="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {puntos.map((p) => (
                <tr key={p.hora_dato}>
                  <th scope="row">{horaRD(p.hora_dato)}</th>
                  <td className="num">{cifra(p.valor, dec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export function CabeceraPanel({ id, titulo, nota }: { id: string; titulo: string; nota?: string }) {
  return (
    <div className="panel-cabecera">
      <h2 className="panel-titulo" id={id}>
        {titulo}
      </h2>
      {nota ? <span className="sello">{nota}</span> : null}
    </div>
  );
}
