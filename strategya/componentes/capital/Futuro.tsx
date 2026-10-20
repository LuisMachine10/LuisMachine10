// Vista Futuro: proyección por escenario, qué variable mueve más el resultado e independencia financiera.
// Son cálculos con los supuestos de Mena, rotulados como proyección: no son datos ni pronósticos.

import Big from "big.js";
import { guardarParametros } from "@/app/capital/acciones";
import { indicadores } from "@/lib/capital/cierres";
import { n } from "@/lib/capital/decimal";
import { aPct } from "@/lib/capital/formulario";
import { num, pct, rd, sg } from "@/lib/capital/formato";
import { escenarioBase, escenarios, mesesHastaMeta, sensibilidad } from "@/lib/capital/futuro";
import type { DatosCapital } from "@/lib/datos-capital";
import { sumarMeses } from "@/lib/capital/fechas";
import { Tornado } from "./Graficos";
import { GraficoSerie, type SerieGrafico } from "./GraficoSerie";
import { Dato, Kpi, Mas, Mosaicos, Panel, SinDatos } from "./Piezas";

type Props = { datos: DatosCapital; mes: string };

// Colores literales: lightweight-charts dibuja en canvas y no lee variables CSS.
const COLORES: Record<string, string> = { estres: "#f23645", base: "#2962ff", optim: "#22ab94" };
const PALETA = ["#4c8dff", "#b2b5be", "#a77bf3"];

function MosaicosFuturo({ datos, mes }: Props) {
  const { ctx } = datos;
  const base = escenarioBase(ctx);
  if (!base) return null;
  const b = escenarios(ctx).find((e) => e.id === base.id)!;
  const ind = indicadores(ctx, mes);
  const meta = ind.patLibertad;
  const meses = meta ? mesesHastaMeta(b.proy, meta) : null;
  const h = n(ctx.p.horizonte);
  return (
    <Mosaicos etiqueta={`Proyección del escenario ${b.nom}`} columnas={4}>
      <Kpi rotulo={`Patrimonio en ${num(h, 0)} años`} valor={num(b.proy.final)} unidad="RD$" meta={`escenario ${b.nom.toLowerCase()} · nominal`} tono="neutra" />
      <Kpi rotulo="En pesos de hoy" valor={num(b.proy.finalReal)} unidad="RD$" meta={`descontada la inflación de ${pct(b.inflacion, 1)}`} tono="neutra" />
      <Kpi
        rotulo="Independencia financiera"
        valor={meta ? (meses ? num(new Big(meses).div(12), 1) : meta.lte(b.proy.inicial) ? "lograda" : "—") : "—"}
        unidad={meta && meses ? "años" : undefined}
        meta={meta ? (meses || meta.lte(b.proy.inicial) ? `meta ${rd(meta)}` : "no se alcanza en el horizonte") : "faltan gasto y tasa de retiro"}
        tono="neutra"
      />
      <Kpi rotulo="Lo puso el rendimiento" valor={pct(b.proy.final.gt(0) ? b.proy.rendimiento.div(b.proy.final) : null, 0)} meta={`aportes: ${pct(b.proy.final.gt(0) ? b.proy.aportado.div(b.proy.final) : null, 0)}`} tono="neutra" />
    </Mosaicos>
  );
}

function PanelEscenarios({ datos, mes }: Props) {
  const { ctx } = datos;
  const escs = escenarios(ctx);
  if (!escs.length) {
    return (
      <Panel titulo="Escenarios" id="cap-t-escenarios" ancho>
        <SinDatos centro icono="calendario">Sin escenarios todavía. Escribe tus supuestos abajo, en «Supuestos por escenario», o importa tu archivo.</SinDatos>
      </Panel>
    );
  }
  const ind = indicadores(ctx, mes);
  const horizonte = n(ctx.p.horizonte);
  const pts = escs[0].proy.pts;
  const series: SerieGrafico[] = escs.map((e, i) => ({
    nombre: e.nom,
    color: COLORES[e.id] ?? PALETA[i % PALETA.length],
    puntos: e.proy.pts.map((p) => ({ t: sumarMeses(ctx.hoy, p.t), v: p.nom.toFixed() })),
    ancho: e.id === "base" ? 3 : 2,
  }));
  const anuales = pts.filter((p) => p.t % 12 === 0 || p.t === pts.length - 1);
  return (
    <Panel titulo={`Escenarios a ${num(horizonte, 0)} años`} id="cap-t-escenarios" ancho extra={<span className="tenue chico">proyección nominal con tus supuestos, no un pronóstico</span>}>
      <ul className="leyenda">
        {series.map((s) => (
          <li key={s.nombre}>
            <span className="clave-linea" style={{ background: s.color, height: 3, borderRadius: 2 }} />
            {s.nombre}
          </li>
        ))}
        {ind.patLibertad ? (
          <li>
            <span className="clave-linea" style={{ borderTop: "1px dashed var(--ambar)", height: 0 }} />
            Independencia
          </li>
        ) : null}
      </ul>
      <GraficoSerie
        series={series}
        meta={ind.patLibertad ? { v: ind.patLibertad.toFixed(), nombre: "Independencia" } : null}
        etiqueta={`Proyección del patrimonio por escenario a ${num(horizonte, 0)} años. La tabla año por año tiene las cifras.`}
        alto={280}
      />
      <div className="desplazable">
        <table className="tabla" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th scope="col">Escenario</th>
              <th scope="col" className="num">
                Final nominal
              </th>
              <th scope="col" className="num">
                Final real
              </th>
            </tr>
          </thead>
          <tbody>
            {escs.map((e) => (
              <tr key={e.id}>
                <th scope="row" style={{ whiteSpace: "normal" }}>
                  {e.nom}
                  <span className="tenue chico" style={{ display: "block", fontWeight: 400 }}>
                    {pct(e.retorno, 1)} retorno · {pct(e.inflacion, 1)} inflación · {pct(e.deprecFX, 1)} FX · {num(e.aporte)}/mes
                  </span>
                </th>
                <td className="num">{num(e.proy.final)}</td>
                <td className="num">{num(e.proy.finalReal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Mas titulo="Tabla año por año (nominal, RD$)">
        <div className="desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Plazo</th>
                {escs.map((e) => (
                  <th key={e.id} scope="col" className="num">
                    {e.nom}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {anuales.map((p) => (
                <tr key={p.t}>
                  <th scope="row">{p.t === 0 ? "Hoy" : p.t % 12 === 0 ? `${p.t / 12} ${p.t === 12 ? "año" : "años"}` : `${p.t} meses`}</th>
                  {escs.map((e) => (
                    <td key={e.id} className="num">
                      {num(e.proy.pts[p.t].nom)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Mas>
      <p className="cap-nota">
        El retorno efectivo de cada escenario suma la depreciación del peso sobre el {pct(escs[0].proy.pesoFX, 0)} del portafolio en moneda
        extranjera. «Real» descuenta la inflación del escenario: lo que ese patrimonio compraría en pesos de hoy.
      </p>
    </Panel>
  );
}

function PanelSensibilidad({ datos }: { datos: DatosCapital }) {
  const s = sensibilidad(datos.ctx);
  if (!s.length) return null;
  const h = Number(n(datos.ctx.p.horizonte).toFixed(0));
  return (
    <Panel titulo="Qué mueve el resultado" id="cap-t-sens" extra={<span className="tenue chico">±20% por variable · escenario base</span>}>
      <Tornado filas={s} etiqueta="Impacto sobre el patrimonio real final de mover cada variable ±20%" />
      <ul className="leyenda">
        <li>
          <span className="clave-linea" style={{ background: "var(--baja)" }} />
          Menos patrimonio
        </li>
        <li>
          <span className="clave-linea" style={{ background: "var(--sube)" }} />
          Más patrimonio
        </li>
      </ul>
      <div className="desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Variable</th>
              <th scope="col" className="num">
                −20%
              </th>
              <th scope="col" className="num">
                +20%
              </th>
            </tr>
          </thead>
          <tbody>
            {s.map((f) => (
              <tr key={f.id}>
                <th scope="row">{f.nom}</th>
                <td className="num">{sg(f.bajo)}</td>
                <td className="num">{sg(f.alto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap-nota">
        Impacto sobre el patrimonio <strong>real</strong> a {h} años, dejando las demás variables en el escenario base. <strong>{s[0].nom}</strong>{" "}
        es la variable que más mueve el resultado: {rd(s[0].rango)} de punta a punta, contra {rd(s[s.length - 1].rango)} de{" "}
        {s[s.length - 1].nom.toLowerCase()}.
      </p>
    </Panel>
  );
}

function PanelIndependencia({ datos, mes }: Props) {
  const { ctx } = datos;
  const base = escenarioBase(ctx);
  const ind = indicadores(ctx, mes);
  if (!base) return null;
  const b = escenarios(ctx).find((e) => e.id === base.id)!;
  const meta = ind.patLibertad;
  const meses = meta ? mesesHastaMeta(b.proy, meta) : null;
  const fin = b.proy.final;
  const parte = (x: Big) => (fin.gt(0) ? x.div(fin) : null);
  return (
    <Panel titulo="Independencia financiera" id="cap-t-libertad">
      {meta && ind.gastoRef ? (
        <p className="cap-nota" style={{ marginTop: 0 }}>
          Con un gasto de {rd(ind.gastoRef)} al mes y una tasa de retiro de {pct(ctx.p.tasaRetiro, 1)}, la meta es <strong>{rd(meta)}</strong>.{" "}
          {meses
            ? `En el escenario ${b.nom.toLowerCase()} se alcanza en ${num(new Big(meses).div(12), 1)} años.`
            : meta.lte(b.proy.inicial)
              ? "Ya está alcanzada."
              : "No se alcanza dentro del horizonte proyectado."}
        </p>
      ) : (
        <SinDatos>Hace falta gasto registrado en los cierres y una tasa de retiro en los parámetros.</SinDatos>
      )}
      <div className="cap-dos" style={{ marginTop: 8 }}>
        <Dato rotulo="Lo pusiste tú">{pct(parte(b.proy.aportado), 0)}</Dato>
        <Dato rotulo="Lo puso el rendimiento">{pct(parte(b.proy.rendimiento), 0)}</Dato>
      </div>
      <p className="cap-nota">
        El {pct(parte(b.proy.inicial), 0)} restante es la posición con la que arrancas hoy. En horizontes cortos el aporte suele pesar más que el
        rendimiento: el interés compuesto todavía no ha tenido tiempo de dominar.
      </p>
    </Panel>
  );
}

function FormularioSupuestos({ datos, mes }: Props) {
  const { p } = datos.ctx;
  const filas = [...p.escenarios, { id: "", nom: "", retorno: "", inflacion: "", deprecFX: "", aporte: "" }];
  return (
    <details className="cap-grupo cap-ancho" key={JSON.stringify(p.escenarios)}>
      <summary>Supuestos por escenario</summary>
      <div className="cuerpo">
        <form action={guardarParametros} className="cap-form">
          <input type="hidden" name="seccion" value="escenarios" />
          <input type="hidden" name="volver" value="/capital/futuro" />
          <input type="hidden" name="mes" value={mes} />
          {filas.map((e, i) => (
            <fieldset key={`esc-${i}`} style={{ border: "1px solid var(--borde)", borderRadius: "var(--radio-chico)", padding: 12, margin: 0, minWidth: 0 }}>
              <legend className="cap-rotulo">{e.id ? e.nom : "Nuevo escenario"}</legend>
              <input type="hidden" name={`escenarios.${i}.id`} value={e.id} />
              <div className="cap-campos">
                <label className="cap-campo">
                  Nombre
                  <input name={`escenarios.${i}.nom`} defaultValue={e.nom} maxLength={200} />
                </label>
                <label className="cap-campo">
                  Retorno anual %
                  <input name={`escenarios.${i}.retorno`} defaultValue={aPct(e.retorno)} inputMode="decimal" />
                </label>
                <label className="cap-campo">
                  Inflación %
                  <input name={`escenarios.${i}.inflacion`} defaultValue={aPct(e.inflacion)} inputMode="decimal" />
                </label>
                <label className="cap-campo">
                  Depreciación del peso %
                  <input name={`escenarios.${i}.deprecFX`} defaultValue={aPct(e.deprecFX)} inputMode="decimal" />
                </label>
                <label className="cap-campo">
                  Aporte mensual RD$
                  <input name={`escenarios.${i}.aporte`} defaultValue={e.aporte} inputMode="decimal" />
                </label>
              </div>
            </fieldset>
          ))}
          <p className="cap-nota">El escenario con id «base» (o el primero) es el que usan la sensibilidad y la independencia. Deja el nombre vacío para quitar uno.</p>
          <div className="cap-botones">
            <button className="boton chico" type="submit">
              Guardar escenarios
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

function FormularioGenerales({ datos, mes }: Props) {
  const { p } = datos.ctx;
  const campos: [string, string, string][] = [
    ["horizonte", "Horizonte (años)", p.horizonte],
    ["incrAporteAnual", "Incremento anual del aporte %", aPct(p.incrAporteAnual)],
    ["tasaRetiro", "Tasa de retiro %", aPct(p.tasaRetiro)],
    ["inflacion", "Inflación de referencia %", aPct(p.inflacion)],
    ["retornoObjetivo", "Retorno objetivo %", aPct(p.retornoObjetivo)],
    ["metaFondo", "Meta fondo de emergencia (meses)", p.metaFondo],
    ["metaAhorro", "Meta tasa de ahorro %", aPct(p.metaAhorro)],
    ["metaUsoTC", "Meta uso de tarjeta %", aPct(p.metaUsoTC)],
    ["aporteMensual", "Aporte mensual de referencia RD$", p.aporteMensual],
  ];
  return (
    <details className="cap-grupo cap-ancho" key={JSON.stringify(campos)}>
      <summary>Parámetros generales</summary>
      <div className="cuerpo">
        <form action={guardarParametros} className="cap-form">
          <input type="hidden" name="seccion" value="generales" />
          <input type="hidden" name="volver" value="/capital/futuro" />
          <input type="hidden" name="mes" value={mes} />
          <div className="cap-campos">
            {campos.map(([k, l, v]) => (
              <label className="cap-campo" key={k}>
                {l}
                <input name={k} defaultValue={v} inputMode="decimal" />
              </label>
            ))}
          </div>
          <div className="cap-botones">
            <button className="boton chico" type="submit">
              Guardar parámetros
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

export function VistaFuturo({ datos, mes }: Props) {
  return (
    <>
      <MosaicosFuturo datos={datos} mes={mes} />
      <PanelEscenarios datos={datos} mes={mes} />
      <PanelSensibilidad datos={datos} />
      <PanelIndependencia datos={datos} mes={mes} />
      <FormularioSupuestos datos={datos} mes={mes} />
      <FormularioGenerales datos={datos} mes={mes} />
    </>
  );
}
