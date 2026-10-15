import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { puntosDelDia } from "@/lib/mercado-vista";
import { Cambio, CabeceraPanel, EstadoItem, HoraDato, Porque, porqueDe, SinDato, Sparkline } from "./piezas";
import { vistaMercado } from "./vista";

const METALES: { id: string; rotulo?: string }[] = [
  { id: "ORO" },
  { id: "PLATA" },
  { id: "COBRE_CPER", rotulo: "ETF CPER · sustituto" },
];

/** Oro, plata y cobre destacados: precio, cambio, línea del día y su porqué. */
export async function PanelMetales() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Metales" mensaje={(e as Error).message} />;
  }
  return (
    <section className="panel" aria-labelledby="t-metales">
      <CabeceraPanel id="t-metales" titulo="Metales" nota="Oro y plata: futuros (FMP) · cobre: ETF CPER (Finnhub)" />
      <div className="panel-cuerpo mv-destacados">
        {METALES.map(({ id, rotulo }) => {
          const i = v.item(id);
          if (!i) return null;
          const porque = porqueDe(v.datos.explicaciones, id, v.ahora);
          return (
            <article key={id} className="mv-destacado" aria-labelledby={`t-metal-${id}`}>
              <h3 className="mv-destacado-titulo" id={`t-metal-${id}`}>
                {id === "COBRE_CPER" ? "Cobre" : i.nombre}
                {rotulo ? <span className="mv-sustituto"> · {rotulo}</span> : null}
              </h3>
              {i.valor ? (
                <>
                  <p className="mv-destacado-valor mono">
                    {i.valor} <span className="tenue chico">{i.unidad}</span>
                  </p>
                  <p className="mv-fila-linea">
                    <Cambio item={i} />
                    <EstadoItem item={i} />
                  </p>
                  <Sparkline item={i} puntos={puntosDelDia(v.datos.intradia, id)} />
                  <HoraDato item={i} />
                  {i.sello ? <SelloFuente d={i.sello} ahora={v.ahora} /> : null}
                  {porque ? <Porque e={porque} /> : null}
                </>
              ) : (
                <SinDato
                  item={i}
                  cuando={id === "COBRE_CPER" ? "Finnhub se consulta cada 5 min de 9:30 a 4:00 PM de Nueva York." : "FMP lo consulta cada ciclo de 5 min según el presupuesto."}
                />
              )}
            </article>
          );
        })}
        <p className="mv-nota">
          El cobre no tiene cotización directa en los planes actuales: se muestra el ETF CPER (en US$ por participación, no por
          libra).
        </p>
      </div>
    </section>
  );
}
