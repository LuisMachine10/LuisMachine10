// Piezas comunes de los paneles de mercado (Server Components, sin estado).
import "@/estilos/mercado.css";
import { MiniGrafico, type PuntoMini } from "@/componentes/graficos/MiniGrafico";
import { SelloFuente } from "@/componentes/SelloFuente";
import { cifra, fechaCorta, fechaHoraRD, horaRD } from "@/lib/formato";
import { decimales, porqueReciente, type Explicacion, type ItemMercado } from "@/lib/mercado-vista";
import type { LecturaDiaria, LecturaIntradia } from "@/componentes/terminal/datos";

export const FLECHA = { sube: "↑", baja: "↓", igual: "→" } as const;
const PALABRA = { sube: "sube", baja: "baja", igual: "sin cambio" } as const;

/** Abierto / cerrado (con la fecha del cierre). Lo desactualizado lo marca el sello. */
export function EstadoItem({ item }: { item: ItemMercado }) {
  if (item.estado === "cerrado")
    return (
      <span className="mv-estado" title={item.etiquetaCierre ?? undefined}>
        <span className="mv-estado-punto" aria-hidden="true" />
        Cerrado<span className="sr-solo"> · {item.etiquetaCierre}</span>
      </span>
    );
  if (item.estado === "al_dia" && item.mercado)
    return (
      <span className="mv-estado mv-estado-abierto">
        <span className="mv-estado-punto" aria-hidden="true" />
        Abierto
      </span>
    );
  return null;
}

/** Hora del dato, aclarando cuando es la de la consulta (FMP quote-short no trae hora). */
export function HoraDato({ item }: { item: ItemMercado }) {
  if (!item.horaDato) return null;
  const hora = `${item.horaEsConsulta ? "Hora de la consulta" : "Hora del dato"}: ${fechaHoraRD(item.horaDato)} (RD)`;
  if (item.estado === "cerrado" && item.etiquetaCierre) {
    return (
      <span className="mv-hora" title={hora}>
        {item.etiquetaCierre.replace("cierre del ", "Cierre del ")}
      </span>
    );
  }
  return (
    <span className="mv-hora" title={hora}>
      {item.horaEsConsulta ? "Consulta" : "Dato"} {horaRD(item.horaDato)}
    </span>
  );
}

/** Cambio del día en pastilla de color suave, con flecha y signo (nunca solo color). */
export function Pastilla({ item, conAbsoluto = false }: { item: ItemMercado; conAbsoluto?: boolean }) {
  if (item.cambio === null)
    return (
      <span className="pastilla igual" title="La fuente no informó el cambio del día">
        —<span className="sr-solo"> cambio no informado</span>
      </span>
    );
  const principal = item.cambioPct ?? item.cambio;
  return (
    <span className="mv-cambio">
      <span className={`pastilla ${item.direccion}`} title={item.cambioPct ? `${item.cambio} ${item.unidad}` : undefined}>
        <span aria-hidden="true">{FLECHA[item.direccion]}</span>
        <span className="sr-solo">{PALABRA[item.direccion]} </span>
        {principal}
      </span>
      {conAbsoluto && item.cambioPct ? <span className="mv-cambio-abs mono">{item.cambio}</span> : null}
    </span>
  );
}

/** Compatibilidad: cambio en texto (sin pastilla). */
export function Cambio({ item }: { item: ItemMercado }) {
  if (item.cambio === null) return <span className="tenue">—</span>;
  return (
    <span className={`mono ${item.direccion}`}>
      <span aria-hidden="true">{FLECHA[item.direccion]} </span>
      <span className="sr-solo">{PALABRA[item.direccion]} </span>
      {item.cambio}
      {item.cambioPct ? ` (${item.cambioPct})` : ""}
    </span>
  );
}

export function SinDato({ item, cuando }: { item: ItemMercado; cuando?: string }) {
  if (item.estado === "no_disponible") {
    return <p className="mv-sin-dato">No disponible con el plan actual del proveedor.</p>;
  }
  return (
    <p className="mv-sin-dato" title={cuando}>
      Sin datos todavía.{cuando ? <span className="sr-solo"> {cuando}</span> : null}
    </p>
  );
}

export function Porque({ e }: { e: Explicacion }) {
  const enlaces = (Array.isArray(e.fuentes) ? e.fuentes : []).filter((f) => typeof f?.url === "string" && /^https?:\/\//.test(f.url!));
  return (
    <p className="mv-porque">
      <strong>Por qué:</strong> {e.texto}{" "}
      {enlaces.slice(0, 3).map((f, i) => (
        <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer">
          {i === 0 ? "" : " · "}
          {f.titulo || "fuente"} ↗
        </a>
      ))}
      <span className="mv-porque-nota" title="Redactado a partir de titulares guardados; ninguna cifra sale del modelo.">
        {" "}
        · resumen de titulares, {horaRD(e.fecha)}
      </span>
    </p>
  );
}

export function porqueDe(explicaciones: Explicacion[], id: string, ahora: Date) {
  return porqueReciente(explicaciones, id, ahora);
}

/** Puntos del minigráfico a partir de lecturas intradía guardadas. */
export function puntosIntradia(item: ItemMercado, lecturas: LecturaIntradia[]): PuntoMini[] {
  const dec = decimales({ id: item.id, categoria: "" });
  return lecturas.map((l) => ({
    t: Math.floor(new Date(l.hora_dato).getTime() / 1000),
    v: l.valor,
    rotulo: `${horaRD(l.hora_dato)} (RD)`,
    texto: cifra(l.valor, dec),
  }));
}

/** Puntos del minigráfico a partir de cierres diarios. */
export function puntosDiarios(lecturas: LecturaDiaria[], dec: number): PuntoMini[] {
  return lecturas.map((l) => ({
    t: Math.floor(new Date(`${l.fecha_dato}T12:00:00Z`).getTime() / 1000),
    v: l.valor,
    rotulo: fechaCorta(l.fecha_dato),
    texto: cifra(l.valor, dec),
  }));
}

export function MiniDe({ item, puntos, periodo, alto }: { item: ItemMercado; puntos: PuntoMini[]; periodo: string; alto?: number }) {
  if (puntos.length < 2) return null;
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  return (
    <MiniGrafico
      puntos={puntos}
      tono={item.direccion}
      alto={alto}
      tituloTabla={`${item.nombre}: lecturas ${periodo}`}
      descripcion={`${item.nombre}, ${periodo}: ${puntos.length} lecturas, de ${primero.texto} (${primero.rotulo}) a ${ultimo.texto} (${ultimo.rotulo}).`}
    />
  );
}

/** Tarjeta compacta de una cotización: nombre, cifra, pastilla, minigráfico, sello y porqué. */
export function TarjetaCotizacion({
  item,
  ahora,
  cuando,
  porque,
  lecturas = [],
  rotulo,
  titulo,
}: {
  item: ItemMercado;
  ahora: Date;
  cuando?: string;
  porque?: Explicacion | null;
  lecturas?: LecturaIntradia[];
  /** Aviso corto bajo el nombre (p. ej. «sustituto de WTI»). */
  rotulo?: string;
  titulo?: string;
}) {
  const sustituto = rotulo ?? (item.sustitutoDe ? `sustituto de ${item.sustitutoDe}` : null);
  return (
    <li className={`mv-tarjeta${item.valor ? "" : " mv-tarjeta-vacia"}`}>
      <div className="mv-tarjeta-cab">
        <h3 className="mv-tarjeta-nombre" title={item.nombre}>
          {titulo ?? item.nombre}
        </h3>
        <EstadoItem item={item} />
      </div>
      {sustituto ? <p className="mv-sustituto">{sustituto}</p> : null}
      {item.valor ? (
        <>
          <p className="mv-tarjeta-cifra">
            <span className="mono">
              {item.valor}
              {item.unidad === "%" ? "%" : null}
            </span>
            {item.unidad !== "%" ? <span className="mv-unidad">{item.unidad}</span> : null}
          </p>
          <Pastilla item={item} conAbsoluto />
          <MiniDe item={item} puntos={puntosIntradia(item, lecturas)} periodo="del día" alto={40} />
          <div className="mv-tarjeta-pie">
            {item.sello ? <SelloFuente d={item.sello} ahora={ahora} /> : null}
            <HoraDato item={item} />
          </div>
          {porque ? <Porque e={porque} /> : null}
        </>
      ) : (
        <SinDato item={item} cuando={cuando} />
      )}
    </li>
  );
}

export function CabeceraPanel({ id, titulo, nota }: { id: string; titulo: string; nota?: string }) {
  return (
    <div className="panel-cabecera">
      <h2 className="panel-titulo" id={id}>
        {titulo}
      </h2>
      {nota ? <span className="mv-nota-cab">{nota}</span> : null}
    </div>
  );
}

/** Subtítulo dentro de un panel (tipo oración, sin mayúsculas). */
export function Subtitulo({ children }: { children: React.ReactNode }) {
  return <h3 className="mv-subtitulo">{children}</h3>;
}
