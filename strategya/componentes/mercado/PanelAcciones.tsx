import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import type { Movimiento } from "@/lib/datos-mercado";
import { cifra, cifraConSigno, direccion } from "@/lib/formato";
import { estadoMercado } from "@/lib/mercados";
import { CabeceraPanel, FLECHA, porqueDe, Subtitulo, TarjetaCotizacion } from "./piezas";
import { vistaMercado } from "./vista";

export const SERIES_ETF = ["ETF_SPY", "ETF_QQQ", "ETF_DIA", "ETF_IWM", "ETF_GLD", "ETF_SLV", "ETF_USO", "ETF_BNO", "ETF_UNG", "ETF_UUP", "ETF_IBIT"];
const POR_LISTA = 8;
/** Pasado este tiempo con el mercado abierto sin lectura nueva, la lista se marca desactualizada. */
const MAX_MIN_MOVIMIENTOS = 90;

function ListaMovimientos({ titulo, filas }: { titulo: string; filas: Movimiento[] }) {
  return (
    <div className="mv-movs">
      <Subtitulo>{titulo}</Subtitulo>
      {filas.length === 0 ? (
        <p className="mv-sin-dato">Sin datos.</p>
      ) : (
        <div className="desplazable">
          <table className="tabla mv-tabla-movs">
            <caption className="sr-solo">{titulo}</caption>
            <thead>
              <tr>
                <th scope="col">Acción</th>
                <th scope="col" className="num">US$</th>
                <th scope="col" className="num">Día</th>
              </tr>
            </thead>
            <tbody>
              {filas.slice(0, POR_LISTA).map((m) => {
                const dir = direccion(m.cambio_pct ?? m.cambio);
                return (
                  <tr key={`${m.tipo}-${m.posicion}`}>
                    <th scope="row">
                      <span className="mono">{m.simbolo}</span> <span className="tenue chico mv-recorte">{m.nombre ?? ""}</span>
                    </th>
                    <td className="num">{cifra(m.precio, 2)}</td>
                    <td className="num">
                      {m.cambio_pct === null ? (
                        <span className="tenue">—</span>
                      ) : (
                        <span className={`pastilla ${dir}`}>
                          <span aria-hidden="true">{FLECHA[dir]}</span>
                          <span className="sr-solo">{dir === "sube" ? "sube" : dir === "baja" ? "baja" : "sin cambio"} </span>
                          {cifraConSigno(m.cambio_pct, 2)}%
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** «Lo que movió acciones»: mayores alzas y bajas del día (FMP) y los ETF del día (Finnhub). */
export async function PanelAcciones() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Lo que movió acciones" mensaje={(e as Error).message} />;
  }
  const movs = v.datos.movimientos;
  const sube = movs.filter((m) => m.tipo === "sube").sort((a, b) => a.posicion - b.posicion);
  const baja = movs.filter((m) => m.tipo === "baja").sort((a, b) => a.posicion - b.posicion);
  const recogido = movs.map((m) => m.recogido_en).sort().at(-1) ?? null;
  const fmp = v.ctx.fuentes.get("fmp");
  const eUs = estadoMercado("us_acciones", v.ahora);
  const desactualizado =
    !!recogido && eUs.abierto && (v.ahora.getTime() - new Date(recogido).getTime()) / 60_000 > MAX_MIN_MOVIMIENTOS;
  const tarea = v.datos.tareas.find((t) => t.tarea === "movimientos-acciones");
  const etfs = SERIES_ETF.map((id) => v.item(id)).filter((i): i is NonNullable<typeof i> => !!i);

  return (
    <section className="panel panel-ancho" aria-labelledby="t-acciones">
      <CabeceraPanel id="t-acciones" titulo="Lo que movió acciones" nota="EE. UU. · horario regular" para="Las acciones de EE. UU. que más subieron y bajaron hoy, y los ETF más seguidos." />
      <div className="panel-cuerpo">
        {movs.length && recogido ? (
          <>
            <SelloFuente
              ahora={v.ahora}
              d={{
                fuente: `${fmp?.nombre ?? "FMP"} · mayores alzas y bajas`,
                url: fmp?.url ?? null,
                fechaDato: movs[0].fecha,
                verificadoEn: recogido,
                desactualizado,
                ultimaCorridaFallo: tarea?.estado === "error",
              }}
            />
            <div className="mv-dos">
              <ListaMovimientos titulo="Más suben" filas={sube} />
              <ListaMovimientos titulo="Más bajan" filas={baja} />
            </div>
            <details className="mv-detalles">
              <summary>Qué incluyen estas listas</summary>
              <p>
                Las listas de FMP incluyen acciones de muy baja capitalización, derechos y ETF apalancados. Es un dato del
                mercado, no una recomendación.
              </p>
            </details>
          </>
        ) : (
          <div className="mv-vacio">
            <p>Sin mayores alzas y bajas todavía.</p>
            <p className="chico tenue">
              Se leen de FMP cada hora con el mercado de EE. UU. abierto y una vez al cierre (2 llamadas del presupuesto diario
              por lectura).
            </p>
            {tarea?.estado === "error" && tarea.error ? <p className="baja chico">Última lectura con error: {tarea.error}</p> : null}
            <a className="boton secundario" href="/estado">
              Ver el estado de las lecturas
            </a>
          </div>
        )}
        <Subtitulo>ETF del día</Subtitulo>
        <ul className="mv-rejilla mv-carrusel mv-rejilla-etf" aria-label="ETF del día">
          {etfs.map((i) => (
            <TarjetaCotizacion
              key={i.id}
              item={i}
              ahora={v.ahora}
              porque={porqueDe(v.datos.explicaciones, i.id, v.ahora)}
              cuando="Finnhub se consulta cada 5 min de 9:30 a 4:00 PM de Nueva York."
            />
          ))}
        </ul>
        {etfs.length > 2 ? (
          <p className="mv-pista-texto" aria-hidden="true">
            Desliza de lado para ver los {etfs.length} ETF →
          </p>
        ) : null}
      </div>
    </section>
  );
}
