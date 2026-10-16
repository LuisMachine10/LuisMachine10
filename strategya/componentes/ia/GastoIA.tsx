// Gasto de IA del mes (mes de RD) contra el tope IA_TOPE_MENSUAL_USD, sumando mercado.explicaciones.costo_usd.

import "@/estilos/alertas-ia.css";
import { PanelError } from "@/componentes/PanelError";
import { porcentajeUsado } from "@/lib/alertas-ia";
import { gastoIA } from "@/lib/datos-alertas-ia";
import { cifra, fechaCorta } from "@/lib/formato";
import { AvisoIA } from "./AvisoIA";

const NOMBRE: Readonly<Record<string, string>> = {
  porque: "Porqués (Claude Haiku 5.5)",
  cinco_del_dia: "Las 5 del día (Claude Sonnet 5.5)",
  guerras: "Guerras (Claude Sonnet 5.5)",
};

export async function GastoIA() {
  const ahora = new Date();
  let g: Awaited<ReturnType<typeof gastoIA>>;
  try {
    g = await gastoIA(ahora);
  } catch (e) {
    return <PanelError titulo="Gasto de IA del mes" mensaje={(e as Error).message} />;
  }
  const tope = g.estado.activa ? g.estado.tope : null;
  const pct = porcentajeUsado(g.gasto, tope);
  return (
    <section className="panel" aria-labelledby="t-gasto-ia">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-gasto-ia">
          Gasto de IA del mes
        </h2>
        <span className="sello">Desde el {fechaCorta(g.desde.slice(0, 10))} · suma de costo_usd por llamada · tarifas de la API de Anthropic</span>
      </div>
      <div className="panel-cuerpo">
        <p className="gasto-cifra">
          <span className="mono" title={`US$${g.gasto}`}>
            US${cifra(g.gasto, 4)}
          </span>
          {tope ? <span className="tenue"> de US${cifra(tope, 2)}</span> : <span className="tenue chico"> (tope por defecto US$10)</span>}
        </p>
        {pct !== null ? (
          <div className="barra-gasto" role="img" aria-label={`Usado ${pct} % del tope mensual`}>
            <span style={{ width: `${pct}%` }} className={pct >= 100 ? "llena" : ""} />
          </div>
        ) : null}
        <AvisoIA estado={g.estado} gasto={g.gasto} />
        {g.porTipo.length ? (
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Uso</th>
                <th scope="col" className="num">
                  Llamadas
                </th>
                <th scope="col" className="num">
                  US$
                </th>
              </tr>
            </thead>
            <tbody>
              {g.porTipo.map((t) => (
                <tr key={t.tipo}>
                  <th scope="row">{NOMBRE[t.tipo] ?? t.tipo}</th>
                  <td className="num">{t.llamadas}</td>
                  <td className="num">{cifra(t.costo, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="chico tenue">Sin llamadas a la IA este mes.</p>
        )}
      </div>
    </section>
  );
}
