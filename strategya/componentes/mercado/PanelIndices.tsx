import { PanelError } from "@/componentes/PanelError";
import { CabeceraPanel, FilaCotizacion, porqueDe } from "./piezas";
import { vistaMercado } from "./vista";

export const SERIES_INDICES = [
  "IDX_SPX", "IDX_DJI", "IDX_IXIC", "IDX_RUT", "IDX_STOXX50E", "IDX_FTSE", "IDX_GDAXI", "IDX_N225", "IDX_HSI",
];

/** «Índices con su porqué»: nivel, cambio, % y la explicación más reciente (24 h) si existe. */
export async function PanelIndices() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Índices con su porqué" mensaje={(e as Error).message} />;
  }
  const items = SERIES_INDICES.map((id) => v.item(id)).filter((i): i is NonNullable<typeof i> => !!i);
  return (
    <section className="panel" aria-labelledby="t-indices">
      <CabeceraPanel id="t-indices" titulo="Índices con su porqué" nota="Nivel en puntos · cambio del día según FMP" />
      <div className="panel-cuerpo">
        <ul className="mv-lista">
          {items.map((i) => (
            <FilaCotizacion
              key={i.id}
              item={i}
              ahora={v.ahora}
              porque={porqueDe(v.datos.explicaciones, i.id, v.ahora)}
              cuando="FMP se consulta en el horario de su mercado, según el presupuesto diario."
            />
          ))}
        </ul>
        <p className="mv-nota">
          «Por qué» aparece solo si hay una explicación de las últimas 24 horas con sus fuentes; si no, no se muestra nada.
        </p>
      </div>
    </section>
  );
}
