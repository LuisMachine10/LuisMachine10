import { PanelError } from "@/componentes/PanelError";
import { CabeceraPanel, FilaCotizacion, porqueDe } from "./piezas";
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
  return (
    <section className="panel" aria-labelledby="t-energia">
      <CabeceraPanel id="t-energia" titulo="Energía" nota="Futuros (FMP) · ETF (Finnhub) donde el plan no da el futuro" />
      <div className="panel-cuerpo">
        <ul className="mv-lista">
          {ENERGIA.map(({ id, sustituto }) => {
            const i = v.item(id);
            if (!i) return null;
            const s = sustituto ? v.item(sustituto) : null;
            if (i.estado === "no_disponible" && s) {
              return (
                <FilaCotizacion
                  key={id}
                  item={s}
                  ahora={v.ahora}
                  porque={porqueDe(v.datos.explicaciones, id, v.ahora) ?? porqueDe(v.datos.explicaciones, s.id, v.ahora)}
                  cuando={`${i.nombre}: el plan actual de FMP no lo entrega; su ETF llega por Finnhub en horario de EE. UU.`}
                />
              );
            }
            return <FilaCotizacion key={id} item={i} ahora={v.ahora} porque={porqueDe(v.datos.explicaciones, id, v.ahora)} />;
          })}
        </ul>
        <p className="mv-nota">
          WTI y gas natural no vienen en el plan actual de FMP: se muestran los ETF USO y UNG, rotulados como sustitutos (en US$
          por participación).
        </p>
      </div>
    </section>
  );
}
