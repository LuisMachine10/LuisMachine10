import "@/estilos/mercado.css";
import { PanelError } from "@/componentes/PanelError";
import { configRealtime } from "@/lib/datos-mercado";
import { fechaCorta, fechaHoraRD, horaRD } from "@/lib/formato";
import { EscuchaRealtime } from "./EscuchaRealtime";
import { FLECHA } from "./piezas";
import { vistaMercado } from "./vista";

/** Orden de la cinta. Las series sin dato o inactivas no aparecen (no se inventa nada). */
export const SERIES_CINTA = [
  "IDX_SPX", "IDX_DJI", "IDX_IXIC", "IDX_RUT", "IDX_STOXX50E", "IDX_FTSE", "IDX_N225", "IDX_HSI",
  "ORO", "PLATA", "COBRE_CPER", "BRENT", "EURUSD", "USDJPY", "BTC", "UST_10A",
];

const ABREVIATURA: Record<string, string> = { fmp: "FMP", finnhub: "Finnhub", tesoro_eeuu: "Tesoro" };

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
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-cinta">
          Cinta de precios
        </h2>
        {rt ? <EscuchaRealtime url={rt.url} clave={rt.clave} /> : null}
      </div>
      {items.length === 0 ? (
        <p className="vacio">
          Sin cotizaciones todavía. FMP se consulta cada 5 minutos según el presupuesto diario y Finnhub en horario de EE. UU.
        </p>
      ) : (
        <ul className="mv-cinta-lista" aria-label="Precios">
          {items.map((i) => (
            <li key={i.id} className="mv-cinta-item">
              <span className="mv-cinta-nombre">{i.nombreCorto}</span>
              <span className="mono">{i.valor}</span>
              <span className={`mono chico ${i.direccion}`}>
                {i.cambio === null ? "—" : `${FLECHA[i.direccion]} ${i.cambioPct ?? i.cambio}`}
              </span>
              <span className="mv-cinta-sello" title={i.horaDato ? fechaHoraRD(i.horaDato) : undefined}>
                {i.sello?.url ? (
                  <a href={i.sello.url} target="_blank" rel="noopener noreferrer">
                    {ABREVIATURA[i.fuenteId] ?? i.sello.fuente}
                  </a>
                ) : null}
                {i.estado === "cerrado"
                  ? ` · ${i.etiquetaCierre}`
                  : i.horaDato
                    ? ` · ${horaRD(i.horaDato)}`
                    : i.sello
                      ? ` · ${fechaCorta(i.sello.fechaDato, false)}`
                      : null}
                {i.estado === "desactualizado" ? <span className="vencido"> · DESACTUALIZADO</span> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mv-nota">
        Hora RD. FMP no da la hora de su precio: se muestra la hora de la consulta. Detalle de cada fuente en los paneles.
      </p>
    </section>
  );
}
