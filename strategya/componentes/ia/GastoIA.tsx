// Gasto de IA del mes (mes de RD) contra el tope IA_TOPE_MENSUAL_USD, sumando mercado.explicaciones.costo_usd.

import "@/estilos/alertas-ia.css";
import Big from "big.js";
import { Ayuda } from "@/componentes/alertas/Ayuda";
import { PanelError } from "@/componentes/PanelError";
import { porcentajeUsado } from "@/lib/alertas-ia";
import { gastoIA } from "@/lib/datos-alertas-ia";
import { cifra, fechaCorta } from "@/lib/formato";
import { AvisoIA } from "./AvisoIA";

const NOMBRE: Readonly<Record<string, string>> = {
  porque: "«¿Por qué se movió?» (Claude Haiku 5.5)",
  cinco_del_dia: "Las 5 del día (Claude Sonnet 5.5)",
  guerras: "Guerras (Claude Sonnet 5.5)",
};

function nivel(pct: number): { clase: string; texto: string } {
  if (pct >= 100) return { clase: "baja", texto: "Tope alcanzado" };
  if (pct >= 75) return { clase: "ambar", texto: "Cerca del tope" };
  return { clase: "sube", texto: "Vas bien" };
}

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
  const quedan = tope ? new Big(tope).minus(g.gasto) : null;
  const n = pct !== null ? nivel(pct) : null;
  return (
    <section className="panel" aria-labelledby="t-gasto-ia">
      <div className="panel-cabecera aj-cabecera">
        <h2 className="panel-titulo" id="t-gasto-ia">
          Gasto de IA del mes
        </h2>
        <Ayuda titulo="¿Qué es este gasto?">
          Cada vez que la IA redacta un texto (un resumen o un «¿por qué?») cuesta unos centavos de dólar. El tope mensual evita que el gasto
          pase del límite: al llegar, la IA se pausa hasta el mes siguiente y los datos siguen llegando igual.
        </Ayuda>
        <p className="aj-subtitulo">Aquí ves cuánto ha costado la IA este mes y cuánto te queda.</p>
      </div>
      <div className="panel-cuerpo">
        <div className="gasto-cifra">
          <span className="cifra-grande" title={`US$${g.gasto}`}>
            US${cifra(g.gasto, new Big(g.gasto).gt(0) && new Big(g.gasto).lt(1) ? 4 : 2)}
          </span>
          {tope ? (
            <span className="tenue mono"> de US${cifra(tope, 2)}</span>
          ) : (
            <span className="tenue chico"> · tope por defecto US$10</span>
          )}
          {n ? <span className={`etiqueta ${n.clase === "sube" ? "ok" : n.clase === "ambar" ? "alerta" : "error"}`}>{n.texto}</span> : null}
        </div>
        {pct !== null ? (
          <>
            <div
              className={`barra-gasto ${n?.clase ?? ""}`}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`Usado ${pct} % del tope mensual de IA`}
            >
              <span style={{ width: `${Math.max(pct, 1)}%` }} />
            </div>
            <p className="chico tenue gasto-pie">
              <span className="mono">{pct} %</span> usado
              {quedan && quedan.gt(0) ? (
                <>
                  {" · "}te quedan <span className="mono">US${cifra(quedan.toFixed(), 2)}</span>
                </>
              ) : null}
              {" · "}desde el {fechaCorta(g.desde.slice(0, 10))}
            </p>
          </>
        ) : (
          <p className="chico tenue gasto-pie">Desde el {fechaCorta(g.desde.slice(0, 10))}</p>
        )}
        <AvisoIA estado={g.estado} gasto={g.gasto} />
        {g.porTipo.length ? (
          <details className="aj-detalle" open>
            <summary className="chico">En qué se gastó</summary>
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Uso</th>
                  <th scope="col" className="num">
                    Veces
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
          </details>
        ) : (
          <p className="chico tenue">La IA no se ha usado este mes.</p>
        )}
        <p className="sello">Suma de lo que cobra la API de Anthropic por cada texto · mes en hora RD</p>
      </div>
    </section>
  );
}
