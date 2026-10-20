import "@/estilos/mercado.css";
import { PanelError } from "@/componentes/PanelError";
import { configRealtime } from "@/lib/datos-mercado";
import { fechaCorta, fechaHoraRD, horaRD } from "@/lib/formato";
import { CintaDeslizante } from "./CintaDeslizante";
import { EscuchaRealtime } from "./EscuchaRealtime";
import { FLECHA } from "./piezas";
import { vistaMercado } from "./vista";

/** Orden de la cinta. Las series sin dato o inactivas no aparecen (no se inventa nada). */
export const SERIES_CINTA = [
  "IDX_SPX", "IDX_DJI", "IDX_IXIC", "IDX_RUT", "IDX_STOXX50E", "IDX_FTSE", "IDX_N225", "IDX_HSI",
  "ORO", "PLATA", "COBRE_CPER", "BRENT", "EURUSD", "USDJPY", "BTC", "UST_10A",
];

const ABREVIATURA: Record<string, string> = { fmp: "FMP", finnhub: "Finnhub", tesoro_eeuu: "Tesoro" };
const PALABRA = { sube: "sube", baja: "baja", igual: "sin cambio" } as const;
/** Segundos que tarda cada ítem en cruzar: un ritmo de lectura cómodo. */
const SEGUNDOS_POR_ITEM = 4;

/** Cinta de precios con suscripción en vivo. Sección: parte superior de la terminal. */
export async function CintaPrecios() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Cinta de precios" mensaje={(e as Error).message} />;
  }
  const items = SERIES_CINTA.map((id) => v.item(id)).filter((i): i is NonNullable<typeof i> => !!i && i.valor !== null);
  const rt = configRealtime();
  return (
    <section className="panel panel-ancho mv-cinta" aria-labelledby="t-cinta">
      <h2 className="sr-solo" id="t-cinta">
        Cinta de precios
      </h2>
      {items.length === 0 ? (
        <p className="mv-vacio">
          Sin cotizaciones todavía. FMP se consulta cada 5 minutos según el presupuesto diario y Finnhub en horario de EE. UU.
        </p>
      ) : (
        <CintaDeslizante segundos={Math.max(30, items.length * SEGUNDOS_POR_ITEM)}>
          {items.map((i) => (
            <li key={i.id} className="mv-cinta-item">
              <span className="mv-cinta-nombre">{i.nombreCorto}</span>
              <span className="mv-cinta-valor mono">{i.valor}</span>
              <span className={`pastilla ${i.direccion}`}>
                {i.cambio === null ? (
                  "—"
                ) : (
                  <>
                    <span aria-hidden="true">{FLECHA[i.direccion]}</span>
                    <span className="sr-solo">{PALABRA[i.direccion]} </span>
                    {i.cambioPct ?? i.cambio}
                  </>
                )}
              </span>
              <span
                className="mv-cinta-sello"
                title={
                  i.horaDato
                    ? `${i.horaEsConsulta ? "Hora de la consulta" : "Hora del dato"}: ${fechaHoraRD(i.horaDato)} (RD)`
                    : i.sello
                      ? `Dato del ${fechaCorta(i.sello.fechaDato)}`
                      : undefined
                }
              >
                {i.sello?.url ? (
                  <a href={i.sello.url} target="_blank" rel="noopener noreferrer">
                    {ABREVIATURA[i.fuenteId] ?? i.sello.fuente}
                  </a>
                ) : (
                  (ABREVIATURA[i.fuenteId] ?? i.sello?.fuente ?? null)
                )}
                {i.estado === "cerrado"
                  ? ` · ${i.etiquetaCierre}`
                  : i.horaDato
                    ? ` · ${horaRD(i.horaDato)}`
                    : i.sello
                      ? ` · ${fechaCorta(i.sello.fechaDato, false)}`
                      : null}
                {i.estado === "desactualizado" ? <span className="sello-pildora sello-vencido">DESACTUALIZADO</span> : null}
              </span>
            </li>
          ))}
        </CintaDeslizante>
      )}
      <div className="mv-cinta-pie">
        {rt ? <EscuchaRealtime url={rt.url} clave={rt.clave} /> : null}
        <span className="mv-cinta-nota" title="FMP no da la hora de su precio: se muestra la hora de la consulta. El detalle de cada fuente está en los paneles.">
          Hora RD · FMP: hora de consulta
        </span>
      </div>
    </section>
  );
}
