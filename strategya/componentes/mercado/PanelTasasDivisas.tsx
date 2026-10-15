import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { cifra } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { CabeceraPanel, Cambio, FilaCotizacion, porqueDe } from "./piezas";
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
      <CabeceraPanel id="t-tasas" titulo="Tasas y divisas" />
      <div className="panel-cuerpo">
        <h3 className="mv-destacado-titulo">Tesoro de EE. UU.</h3>
        <ul className="mv-lista">
          {tesoro.map((i) => (
            <FilaCotizacion key={i.id} item={i} ahora={v.ahora} cuando="El Tesoro publica la curva al cierre de cada día hábil." />
          ))}
        </ul>

        <h3 className="mv-destacado-titulo">Divisas</h3>
        <ul className="mv-lista">
          {divisas.map((i) => (
            <FilaCotizacion key={i.id} item={i} ahora={v.ahora} porque={porqueDe(v.datos.explicaciones, i.id, v.ahora)} />
          ))}
        </ul>
        {dxy?.estado === "no_disponible" ? (
          <p className="mv-nota">El DXY no viene en el plan actual de FMP: se muestra el ETF UUP como sustituto (US$ por participación).</p>
        ) : null}

        <h3 className="mv-destacado-titulo">Bancos centrales</h3>
        <ul className="mv-lista">
          <li className="mv-fila">
            <div className="mv-fila-linea">
              <span className="mv-nombre">Fed · rango objetivo</span>
              {fedSup?.valor && fedInf?.valor ? (
                <span className="mv-valor mono">
                  {fedInf.valor} – {fedSup.valor} <span className="tenue chico">%</span>
                </span>
              ) : null}
            </div>
            {fedSup?.valor && fedInf?.valor ? (
              <>
                <div className="mv-fila-linea">
                  <span className="chico tenue">Techo:</span> <Cambio item={fedSup} />
                </div>
                {fedSup.sello ? <SelloFuente d={fedSup.sello} ahora={v.ahora} /> : null}
              </>
            ) : (
              <span className="tenue chico">Sin datos todavía. Se lee cada día hábil a las 6:20 PM (hora RD).</span>
            )}
          </li>
          {bce ? <FilaCotizacion item={bce} ahora={v.ahora} cuando="Se lee del BCE cada día hábil a las 6:20 PM (hora RD)." /> : null}
          {boj?.valor ? (
            <FilaCotizacion item={boj} ahora={v.ahora} />
          ) : manualBoj ? (
            <li className="mv-fila">
              <div className="mv-fila-linea">
                <span className="mv-nombre">BoJ · tasa de política</span>
                <span className="mv-valor mono">
                  {cifra(manualBoj.valor, 2)} <span className="tenue chico">%</span>
                </span>
              </div>
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
            </li>
          ) : (
            <li className="mv-fila">
              <div className="mv-fila-linea">
                <span className="mv-nombre">BoJ · tasa de política</span>
              </div>
              <span className="tenue chico">Carga manual pendiente (el BoJ no tiene una descarga automática estable).</span>
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
