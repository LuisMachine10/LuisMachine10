// Bloque «Hoy»: seis mosaicos grandes con la cifra, el cambio, la línea reciente y su sello.
// Si una serie no tiene dato, su mosaico queda gris con el motivo. Nada se rellena.
import "@/estilos/mercado.css";
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
}

export const MOSAICOS_HOY: Mosaico[] = [
  { id: "IDX_SPX", titulo: "S&P 500", historia: "intradia", cuando: "FMP lo consulta en horario de Nueva York." },
  { id: "ORO", titulo: "Oro", historia: "intradia", cuando: "FMP lo consulta cada ciclo de 5 min según el presupuesto." },
  { id: "BRENT", titulo: "Brent", historia: "intradia", cuando: "FMP lo consulta cada ciclo de 5 min según el presupuesto." },
  { id: "USDDOP_VENTA", titulo: "Dólar · venta BCRD", historia: "diaria", decimales: 4, cuando: "El BCRD publica la tasa cada día hábil." },
  { id: "UST_10A", titulo: "Tesoro 10 años", historia: "diaria", cuando: "El Tesoro publica la curva al cierre de cada día hábil." },
  { id: "BTC", titulo: "Bitcoin", historia: "intradia", cuando: "FMP lo consulta cada ciclo de 5 min según el presupuesto." },
];

const UNIDAD_CORTA: Record<string, string> = { puntos: "pts", "RD$ por US$": "RD$" };

function hoyRD(ahora: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_RD }).format(ahora);
}

export function fechaLargaRD(ahora: Date): string {
  return new Intl.DateTimeFormat("es-DO", { timeZone: ZONA_RD, weekday: "long", day: "numeric", month: "long" }).format(ahora);
}

function MosaicoVacio({ titulo, motivo }: { titulo: string; motivo: string }) {
  return (
    <li className="ter-mosaico ter-mosaico-vacio">
      <div className="ter-mosaico-cab">
        <h3 className="ter-mosaico-nombre">{titulo}</h3>
      </div>
      <p className="ter-mosaico-sin">Sin dato</p>
      <p className="ter-mosaico-motivo">{motivo}</p>
    </li>
  );
}

export async function BloqueHoy() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Hoy" mensaje={(e as Error).message} />;
  }
  const h = await historiasSeguras();
  const hoy = hoyRD(v.ahora);
  const crudas = new Map(v.datos.ultimas.map((o) => [o.serie_id, o]));

  return (
    <ul className="ter-mosaicos panel-ancho" aria-label="Cifras de hoy">
      {MOSAICOS_HOY.map((m) => {
        const base = v.item(m.id);
        if (!base) return <MosaicoVacio key={m.id} titulo={m.titulo} motivo="La serie no está en el catálogo." />;
        if (!base.valor) {
          return (
            <MosaicoVacio
              key={m.id}
              titulo={m.titulo}
              motivo={base.estado === "no_disponible" ? "No disponible con el plan actual del proveedor." : `Sin lecturas todavía. ${m.cuando}`}
            />
          );
        }
        // Mismo dato con los decimales propios de la serie (texto exacto, redondeo decimal).
        const cruda = crudas.get(m.id);
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

        return (
          <li key={m.id} className={`ter-mosaico ter-mosaico-${item.direccion}`}>
            <div className="ter-mosaico-cab">
              <h3 className="ter-mosaico-nombre" title={item.nombre}>
                {m.titulo}
              </h3>
              <EstadoItem item={item} />
            </div>
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
          </li>
        );
      })}
    </ul>
  );
}
