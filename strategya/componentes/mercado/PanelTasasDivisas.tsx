import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { delUltimoDia } from "@/componentes/terminal/datos";
import { cifra } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { historiasSeguras } from "./historias";
import { CabeceraPanel, Pastilla, porqueDe, TarjetaCotizacion } from "./piezas";
import { vistaMercado } from "./vista";

const TASA_ANTIGUEDAD_MIN = 525600;

/** Tesoro 2 y 10 años, DXY, EUR/USD, USD/JPY y las tasas de la Fed, el BCE y el BoJ. */
export async function PanelTasasDivisas() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  try {
    v = await vistaMercado();
  } catch (e) {
    return <PanelError titulo="Tasas y divisas" mensaje={(e as Error).message} />;
  }
  const h = await historiasSeguras();
  const it = (id: string) => v.item(id);
  const tesoro = ["UST_2A", "UST_10A"].map(it).filter((i): i is NonNullable<typeof i> => !!i);
  const dxy = it("DXY");
  const uup = it("ETF_UUP");
  const divisas = [dxy && dxy.estado === "no_disponible" ? uup : dxy, it("EURUSD"), it("USDJPY")].filter(
    (i): i is NonNullable<typeof i> => !!i,
  );
  const fedSup = it("TASA_FED_SUP");
  const fedInf = it("TASA_FED_INF");
  const bce = it("TASA_BCE_DEP");
  const boj = it("TASA_BOJ");
  const manualBoj = v.datos.cargaManual[0] ?? null;

  return (
    <section className="panel" aria-labelledby="t-tasas">
      <CabeceraPanel id="t-tasas" titulo="Tasas y divisas" para="Lo que cuesta pedir prestado en el mundo y cuánto vale una moneda frente a otra." />
      <div className="panel-cuerpo">
        <ul className="mv-rejilla mv-rejilla-tasas" aria-label="Tesoro de EE. UU., divisas y bancos centrales">
          {tesoro.map((i) => (
            <TarjetaCotizacion key={i.id} item={i} ahora={v.ahora} cuando="El Tesoro publica la curva al cierre de cada día hábil." />
          ))}
          {divisas.map((i) => (
            <TarjetaCotizacion
              key={i.id}
              item={i}
              ahora={v.ahora}
              lecturas={delUltimoDia(h, i.id)}
              rotulo={i.id === "ETF_UUP" ? "sustituto del DXY (US$ por participación)" : undefined}
              porque={porqueDe(v.datos.explicaciones, i.id, v.ahora)}
            />
          ))}
          <li className={`mv-tarjeta${fedSup?.valor && fedInf?.valor ? "" : " mv-tarjeta-vacia"}`}>
            <div className="mv-tarjeta-cab">
              <h3 className="mv-tarjeta-nombre">Fed · rango objetivo</h3>
            </div>
            {fedSup?.valor && fedInf?.valor ? (
              <>
                <p className="mv-tarjeta-cifra">
                  <span className="mono">
                    {fedInf.valor}–{fedSup.valor}%
                  </span>
                </p>
                <span className="mv-cambio">
                  <span className="mv-cambio-abs">Techo</span> <Pastilla item={fedSup} />
                </span>
                <div className="mv-tarjeta-pie">{fedSup.sello ? <SelloFuente d={fedSup.sello} ahora={v.ahora} /> : null}</div>
              </>
            ) : (
              <p className="mv-sin-dato" title="Se lee cada día hábil a las 6:20 PM (hora RD).">
                Sin datos todavía. Se lee cada día hábil a las 6:20 PM (hora RD).
              </p>
            )}
          </li>
          {bce ? <TarjetaCotizacion item={bce} ahora={v.ahora} cuando="Se lee del BCE cada día hábil a las 6:20 PM (hora RD)." /> : null}
          {boj?.valor ? (
            <TarjetaCotizacion item={boj} ahora={v.ahora} />
          ) : manualBoj ? (
            <li className="mv-tarjeta">
              <div className="mv-tarjeta-cab">
                <h3 className="mv-tarjeta-nombre">BoJ · tasa de política</h3>
              </div>
              <p className="mv-tarjeta-cifra">
                <span className="mono">{cifra(manualBoj.valor, 2)}%</span>
              </p>
              <div className="mv-tarjeta-pie">
                <SelloFuente
                  ahora={v.ahora}
                  d={{
                    fuente: "Carga manual de Mena",
                    url: manualBoj.url_fuente,
                    fechaDato: manualBoj.fecha,
                    verificadoEn: manualBoj.creado_en,
                    desactualizado: frescura({ fecha_dato: manualBoj.fecha }, TASA_ANTIGUEDAD_MIN, v.ahora).desactualizado,
                    ultimaCorridaFallo: false,
                  }}
                />
              </div>
            </li>
          ) : (
            <li className="mv-tarjeta mv-tarjeta-vacia">
              <div className="mv-tarjeta-cab">
                <h3 className="mv-tarjeta-nombre">BoJ · tasa de política</h3>
              </div>
              <p className="mv-sin-dato">
                Carga manual pendiente (el BoJ no tiene una descarga automática estable). <a href="/carga">Cargar</a>
              </p>
            </li>
          )}
        </ul>
        <details className="mv-detalles">
          <summary>¿Qué son estas tasas?</summary>
          <p>
            <strong>Tesoro de EE. UU.:</strong> lo que paga el Gobierno de EE. UU. por pedir prestado a 2 y 10 años; guía préstamos
            e hipotecas en todo el mundo. <strong>Fed, BCE y BoJ:</strong> los bancos centrales de EE. UU., Europa y Japón; su tasa
            sube o baja el costo del dinero. <strong>Divisas:</strong> cuánto vale una moneda frente a otra. Una tasa que sube se
            ve en verde; su cambio va en puntos básicos (pb): 100 pb = 1 %.
          </p>
        </details>
      </div>
    </section>
  );
}
