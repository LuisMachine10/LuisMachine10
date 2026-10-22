// Bloque «Hoy» (en News y como widgets del Dashboard): seis mosaicos grandes con la cifra, el cambio, la línea reciente y su sello.
// Si una serie no tiene dato, su mosaico queda gris con el motivo. Nada se rellena.
import "@/estilos/mercado.css";
import "@/estilos/dashboard.css";
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { historiasSeguras } from "@/componentes/mercado/historias";
import { EstadoItem, HoraDato, MiniDe, Pastilla, puntosDiarios, puntosIntradia } from "@/componentes/mercado/piezas";
import { vistaMercado } from "@/componentes/mercado/vista";
import { cifra, cifraConSigno, fechaCorta, ZONA_RD } from "@/lib/formato";
import type { ItemMercado } from "@/lib/mercado-vista";
import { cierresDiarios, delUltimoDia } from "./datos";

interface Mosaico {
  id: string;
  titulo: string;
  /** Historia del minigráfico: lecturas del día o cierres diarios recientes. */
  historia: "intradia" | "diaria";
  /** Decimales propios (el dólar BCRD se publica con 4). */
  decimales?: number;
  /** Cuándo llega el dato, para el mosaico vacío. */
  cuando: string;
  /** Qué es, en palabras simples (una línea bajo el nombre). */
  que: string;
}

export const MOSAICOS_HOY: Mosaico[] = [
  { id: "IDX_SPX", titulo: "Bolsa de EE. UU. (S&P 500)", que: "Cómo les va a las 500 empresas más grandes de EE. UU.", historia: "intradia",
    cuando: "Se lee cada 5 minutos con la bolsa de Nueva York abierta." },
  { id: "ORO", titulo: "Oro", que: "Refugio cuando hay miedo en los mercados.", historia: "intradia",
    cuando: "Llega de FMP. Si sigue vacío, mira «Estado de las fuentes» (puede faltar su clave)." },
  { id: "BRENT", titulo: "Petróleo Brent", que: "Influye en el precio de los combustibles en RD.", historia: "intradia",
    cuando: "Se lee de FMP o, si falta, del cierre diario de FRED." },
  { id: "USDDOP_VENTA", titulo: "Dólar en RD (venta)", que: "Lo que cuesta comprar un dólar según el Banco Central.", historia: "diaria", decimales: 4,
    cuando: "El Banco Central lo publica cada día hábil." },
  { id: "UST_10A", titulo: "Bono de EE. UU. a 10 años", que: "La tasa que guía préstamos e hipotecas en el mundo.", historia: "diaria",
    cuando: "El Tesoro de EE. UU. lo publica al cierre de cada día hábil." },
  { id: "BTC", titulo: "Bitcoin", que: "La criptomoneda más grande.", historia: "intradia",
    cuando: "Llega de FMP. Si sigue vacío, mira «Estado de las fuentes» (puede faltar su clave)." },
];

const UNIDAD_CORTA: Record<string, string> = { puntos: "pts", "RD$ por US$": "RD$" };

function hoyRD(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD }).format(ahora);
}

export function fechaLargaRD(ahora: Date): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone: ZONA_RD, weekday: "long", day: "numeric", month: "long" }).format(ahora);
}

type Contenedor = "li" | "article";

function MosaicoVacio({ titulo, que, motivo, como: Etiqueta }: { titulo: string; que?: string; motivo: string; como: Contenedor }) {
  return (
    <Etiqueta className="ter-mosaico ter-mosaico-vacio">
      <div className="ter-mosaico-cab">
        <h3 className="ter-mosaico-nombre">{titulo}</h3>
        <span className="etiqueta neutra ter-sin-dato">Sin dato</span>
      </div>
      {que ? <p className="ter-mosaico-que">{que}</p> : null}
      <p className="ter-mosaico-motivo">{motivo}</p>
    </Etiqueta>
  );
}

/**
 * Un mosaico de «Hoy» (cifra, cambio, minigráfico y sello). Lo usan News (en lista) y el Dashboard
 * (cada cifra es un widget). Las lecturas se comparten por petición (cache), así seis mosaicos
 * sueltos no hacen seis consultas.
 */
export async function MosaicoHoy({ id, como = "li", nivel = 3 }: { id: string; como?: Contenedor; nivel?: 2 | 3 }) {
  const m = MOSAICOS_HOY.find((x) => x.id === id);
  if (!m) return null;
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <MosaicoVacio titulo={m.titulo} que={m.que} motivo={`No se pudieron leer los datos: ${(e as Error).message}`} como={como} />;
  }
  const h = await historiasSeguras();
  const hoy = hoyRD(v.ahora);
  const Titulo = nivel === 2 ? "h2" : "h3";

  const base = v.item(m.id);
  if (!base) return <MosaicoVacio titulo={m.titulo} motivo="La serie no está en el catálogo." como={como} />;
  if (!base.valor) {
    return (
      <MosaicoVacio
        titulo={m.titulo}
        que={m.que}
        motivo={base.estado === "no_disponible" ? "La fuente no entrega este dato con el plan actual." : `Todavía no hay lectura. ${m.cuando}`}
        como={como}
      />
    );
  }
  // Mismo dato con los decimales propios de la serie (texto exacto, redondeo decimal).
  const cruda = v.datos.ultimas.find((o) => o.serie_id === m.id);
  const item: ItemMercado =
    m.decimales !== undefined && cruda
      ? {
          ...base,
          valor: cifra(cruda.valor, m.decimales),
          cambio: cruda.cambio === null ? null : cifraConSigno(cruda.cambio, m.decimales),
        }
      : base;

  let puntos;
  let periodo: string;
  if (m.historia === "intradia") {
    const lecturas = delUltimoDia(h, m.id);
    puntos = puntosIntradia(item, lecturas);
    const dia = lecturas.at(-1)?.fecha_dato;
    periodo = !dia || dia === hoy ? "de hoy" : `del ${fechaCorta(dia, false)}`;
  } else {
    const cierres = cierresDiarios(h, m.id, 30);
    puntos = puntosDiarios(cierres, m.decimales ?? 2);
    periodo = `de los últimos ${cierres.length} cierres`;
  }
  const unidad = UNIDAD_CORTA[item.unidad] ?? item.unidad;
  const Etiqueta = como;

  return (
    <Etiqueta className={`ter-mosaico ter-mosaico-${item.direccion}`}>
      <div className="ter-mosaico-cab">
        <Titulo className="ter-mosaico-nombre" title={item.nombre}>
          {m.titulo}
        </Titulo>
        <EstadoItem item={item} />
      </div>
      <p className="ter-mosaico-que">{m.que}</p>
      <p className="ter-mosaico-cifra">
        <span className="cifra-grande mono">
          {item.valor}
          {unidad === "%" ? "%" : null}
        </span>
        {unidad !== "%" ? <span className="mv-unidad">{unidad}</span> : null}
      </p>
      <Pastilla item={item} conAbsoluto />
      <div className="ter-mosaico-grafico">
        {puntos.length >= 2 ? (
          <MiniDe item={item} puntos={puntos} periodo={periodo} alto={52} />
        ) : (
          <p className="ter-mini-vacio" title="La línea aparece cuando hay dos lecturas guardadas o más.">
            La línea aparece con la próxima lectura
          </p>
        )}
      </div>
      <div className="ter-mosaico-pie">
        {item.sello ? <SelloFuente d={item.sello} ahora={v.ahora} /> : null}
        <HoraDato item={item} />
      </div>
    </Etiqueta>
  );
}

export async function BloqueHoy() {
  try {
    await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Hoy" mensaje={(e as Error).message} />;
  }
  return (
    <ul className="ter-mosaicos panel-ancho" aria-label="Cifras de hoy">
      {MOSAICOS_HOY.map((m) => (
        <MosaicoHoy key={m.id} id={m.id} />
      ))}
    </ul>
  );
}
