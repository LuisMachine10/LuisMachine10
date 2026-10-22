import { PanelError } from "@/componentes/PanelError";
import { delUltimoDia } from "@/componentes/terminal/datos";
import { historiasSeguras } from "./historias";
import { CabeceraPanel, porqueDe, TarjetaCotizacion } from "./piezas";
import { vistaMercado } from "./vista";

/** Serie principal y, si el plan no la entrega, el ETF que la sustituye. */
const ENERGIA: { id: string; sustituto?: string }[] = [
  { id: "BRENT" },
  { id: "WTI", sustituto: "ETF_USO" },
  { id: "GAS_NATURAL", sustituto: "ETF_UNG" },
];

/** Brent, WTI y gas natural. */
export async function PanelEnergia() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Energía" mensaje={(e as Error).message} />;
  }
  const h = await historiasSeguras();
  return (
    <section className="panel" aria-labelledby="t-energia">
      <CabeceraPanel id="t-energia" titulo="Energía" nota="FMP · ETF como sustituto" para="Petróleo y gas: mueven lo que pagas por combustible en RD." />
      <div className="panel-cuerpo">
        <ul className="mv-rejilla">
          {ENERGIA.map(({ id, sustituto }) => {
            const i = v.item(id);
            if (!i) return null;
            const s = sustituto ? v.item(sustituto) : null;
            if (i.estado === "no_disponible" && s) {
              return (
                <TarjetaCotizacion
                  key={id}
                  item={s}
                  titulo={i.nombre}
                  rotulo={`${s.nombreCorto} · sustituto`}
                  ahora={v.ahora}
                  lecturas={delUltimoDia(h, s.id)}
                  porque={porqueDe(v.datos.explicaciones, id, v.ahora) ?? porqueDe(v.datos.explicaciones, s.id, v.ahora)}
                  cuando={`${i.nombre}: el plan actual de FMP no lo entrega; su ETF llega por Finnhub en horario de EE. UU.`}
                />
              );
            }
            return (
              <TarjetaCotizacion
                key={id}
                item={i}
                ahora={v.ahora}
                lecturas={delUltimoDia(h, id)}
                porque={porqueDe(v.datos.explicaciones, id, v.ahora)}
              />
            );
          })}
        </ul>
        <details className="mv-detalles">
          <summary>Sobre los sustitutos</summary>
          <p>
            WTI y gas natural no vienen en el plan actual de FMP: se muestran los ETF USO y UNG, rotulados como sustitutos (en
            US$ por participación).
          </p>
        </details>
      </div>
    </section>
  );
}
