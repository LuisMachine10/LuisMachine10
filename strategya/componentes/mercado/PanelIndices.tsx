import { PanelError } from "@/componentes/PanelError";
import { delUltimoDia } from "@/componentes/terminal/datos";
import { historiasSeguras } from "./historias";
import { CabeceraPanel, porqueDe, TarjetaCotizacion } from "./piezas";
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
  const h = await historiasSeguras();
  const items = SERIES_INDICES.map((id) => v.item(id)).filter((i): i is NonNullable<typeof i> => !!i);
  return (
    <section className="panel" aria-labelledby="t-indices">
      <CabeceraPanel id="t-indices" titulo="Índices con su porqué" nota="Nivel en puntos · FMP" />
      <div className="panel-cuerpo">
        <ul className="mv-rejilla">
          {items.map((i) => (
            <TarjetaCotizacion
              key={i.id}
              item={i}
              ahora={v.ahora}
              lecturas={delUltimoDia(h, i.id)}
              porque={porqueDe(v.datos.explicaciones, i.id, v.ahora)}
              cuando="FMP se consulta en el horario de su mercado, según el presupuesto diario."
            />
          ))}
        </ul>
        <details className="mv-detalles">
          <summary>Sobre el «por qué»</summary>
          <p>
            Aparece solo si hay una explicación de las últimas 24 horas con sus fuentes; si no, no se muestra nada. El cambio
            del día es el que informa FMP.
          </p>
        </details>
      </div>
    </section>
  );
}
