import { PanelError } from "@/componentes/PanelError";
import { delUltimoDia } from "@/componentes/terminal/datos";
import { historiasSeguras } from "./historias";
import { CabeceraPanel, porqueDe, TarjetaCotizacion } from "./piezas";
import { vistaMercado } from "./vista";

const METALES: { id: string; titulo?: string; rotulo?: string }[] = [
  { id: "ORO" },
  { id: "PLATA" },
  { id: "COBRE_CPER", titulo: "Cobre", rotulo: "ETF CPER · sustituto" },
];

/** Oro, plata y cobre: precio, cambio, línea del día y su porqué. */
export async function PanelMetales() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Metales" mensaje={(e as Error).message} />;
  }
  const h = await historiasSeguras();
  return (
    <section className="panel" aria-labelledby="t-metales">
      <CabeceraPanel id="t-metales" titulo="Metales" nota="Futuros (FMP) · cobre por ETF (Finnhub)" />
      <div className="panel-cuerpo">
        <ul className="mv-rejilla">
          {METALES.map(({ id, titulo, rotulo }) => {
            const i = v.item(id);
            if (!i) return null;
            return (
              <TarjetaCotizacion
                key={id}
                item={i}
                titulo={titulo}
                rotulo={rotulo}
                ahora={v.ahora}
                lecturas={delUltimoDia(h, id)}
                porque={porqueDe(v.datos.explicaciones, id, v.ahora)}
                cuando={
                  id === "COBRE_CPER"
                    ? "Finnhub se consulta cada 5 min de 9:30 a 4:00 PM de Nueva York."
                    : "FMP lo consulta cada ciclo de 5 min según el presupuesto."
                }
              />
            );
          })}
        </ul>
        <details className="mv-detalles">
          <summary>¿Por qué el cobre es un ETF?</summary>
          <p>
            El cobre no tiene cotización directa en los planes actuales: se muestra el ETF CPER (en US$ por participación, no
            por libra).
          </p>
        </details>
      </div>
    </section>
  );
}
