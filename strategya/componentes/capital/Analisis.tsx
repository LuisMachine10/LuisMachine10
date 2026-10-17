// Vista Análisis: mosaicos de riesgo, asignación por las 4 clases contra la meta, riesgo de tasa,
// concentración, escalera de vencimientos, exposición cambiaria, puente de patrimonio, indicadores y
// tus tasas contra las referencias oficiales. Todo es descriptivo: compara con las metas que escribió
// Mena; no recomienda operaciones.

import { SelloFuente } from "@/componentes/SelloFuente";
import { indicadores } from "@/lib/capital/cierres";
import { CERO, n } from "@/lib/capital/decimal";
import { mesCorto, mesLargo } from "@/lib/capital/fechas";
import { num, pb, pct, rd, sg, tono, tonoInverso } from "@/lib/capital/formato";
import { posicion } from "@/lib/capital/posicion";
import { diferenciales, puente, riesgo, ventanasReinversion } from "@/lib/capital/riesgo";
import type { DatosCapital } from "@/lib/datos-capital";
import { frescura } from "@/lib/frescura";
import { PanelAsignacion } from "./Asignacion";
import { Barra } from "./Graficos";
import { ConSigno, Dato, EtiquetaTono, Kpi, Mas, Mosaicos, Panel, SinDatos } from "./Piezas";
import { SelloFx, SelloRegistros } from "./Sellos";

type Props = { datos: DatosCapital; mes: string };

function MosaicosAnalisis({ datos, mes }: Props) {
  const { ctx, ahora } = datos;
  const rk = riesgo(ctx);
  const pos = posicion(ctx);
  const ind = indicadores(ctx, mes);
  const max = n(ctx.p.maxEmisor);
  return (
    <>
      <Mosaicos etiqueta="Riesgo de un vistazo" columnas={4}>
        <Kpi
          rotulo="Duración de la renta fija"
          valor={rk.duracion ? num(rk.duracion, 2) : "—"}
          unidad={rk.duracion ? "años" : undefined}
          meta={rk.sensRF100 ? `+100 pb: ${sg(rk.sensRF100)}` : "sin vencimientos cargados"}
          tono="neutra"
          ayuda="Duración modificada ponderada; aproximada (potencias en float), a 2 decimales."
        />
        <Kpi
          rotulo="Mayor emisor"
          valor={rk.maxEmisor?.pct ? pct(rk.maxEmisor.pct, 0) : "—"}
          meta={rk.maxEmisor ? `${rk.maxEmisor.nombre}${max.gt(0) ? ` · límite ${pct(max, 0)}` : ""}` : "sin instrumentos"}
          tono={max.gt(0) && rk.maxEmisor?.pct ? (rk.maxEmisor.pct.gt(max) ? "alerta" : "ok") : "neutra"}
        />
        <Kpi
          rotulo="Fuera del peso"
          valor={pct(pos.total.gt(0) ? pos.extranjero.div(pos.total) : null, 1)}
          meta={`peso −10%: ${sg(pos.extranjero.times("0.10"))}`}
          tono="neutra"
        />
        <Kpi
          rotulo="Yield devengado"
          valor={pct(ind.yieldPort, 2)}
          meta="lo que prometen pagar, no lo ganado"
          tono={ind.yieldPort ? tono(ind.yieldPort, "0.08", "0.05") : "neutra"}
        />
      </Mosaicos>
      <div className="cap-ancho cap-pie-mosaicos">
        <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={ahora} hoy={ctx.hoy} />
      </div>
    </>
  );
}

function PanelTasa({ datos }: { datos: DatosCapital }) {
  const rk = riesgo(datos.ctx);
  return (
    <Panel titulo="Riesgo de tasa" id="cap-t-tasa" extra={<span className="tenue chico">renta fija</span>}>
      {rk.duracion ? (
        <>
          <div className="cap-dos">
            <Dato rotulo="Duración modificada">{num(rk.duracion, 2)}</Dato>
            <Dato rotulo="Si las tasas suben 100 pb" signo={rk.sensRF100}>
              {rk.sensRF100 ? sg(rk.sensRF100) : "—"}
            </Dato>
          </div>
          <div className="desplazable" style={{ marginTop: 12 }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Instrumento</th>
                  <th scope="col" className="num">
                    Duración
                  </th>
                  <th scope="col" className="num">
                    A +100 pb
                  </th>
                </tr>
              </thead>
              <tbody>
                {rk.detalle
                  .filter((x) => x.d !== null)
                  .map((x) => (
                    <tr key={x.a.id}>
                      <th scope="row" style={{ whiteSpace: "normal" }}>
                        {x.a.nombre} <span className="tenue chico">· {pct(x.a.tasa, 2)} · {x.a.tipoRF === "cupon" ? "cupón" : "acumula"}</span>
                      </th>
                      <td className="num">{num(x.d!.toFixed(6), 2)}</td>
                      <td className="num">{x.sens100 ? sg(x.sens100) : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Mas>
            <p className="cap-nota">
              La renta fija se lleva a valor nominal: ese cambio de valor de mercado no aparece en el patrimonio, pero existe si hubiera que vender antes
              del vencimiento. {rk.sinDuracion.gt(0) ? `${rd(rk.sinDuracion)} no tiene vencimiento cargado y queda fuera del cálculo.` : ""} Duración
              aproximada (cálculo con potencias en float), mostrada a 2 decimales.
            </p>
          </Mas>
        </>
      ) : (
        <SinDatos accion={{ href: "/capital/cartera", texto: "Cargar vencimientos en Cartera" }}>
          Con las fechas de vencimiento de tu renta fija se calcula la duración.
        </SinDatos>
      )}
    </Panel>
  );
}

function PanelEmisores({ datos }: { datos: DatosCapital }) {
  const rk = riesgo(datos.ctx);
  const max = n(datos.ctx.p.maxEmisor);
  const lista = rk.emisores.filter((e) => e.valor.gt(0));
  return (
    <Panel titulo="Concentración por emisor" id="cap-t-emisores" extra={max.gt(0) ? <span className="tenue chico">límite {pct(max, 0)}</span> : null}>
      {lista.length ? (
        <div className="desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Emisor</th>
                <th scope="col" className="num">
                  RD$
                </th>
                <th scope="col" className="num">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.nombre}>
                  <th scope="row" style={{ whiteSpace: "normal" }}>
                    {e.nombre}
                    <Barra pct={e.pct} meta={max.gt(0) ? max : null} tono={max.gt(0) && e.pct?.gt(max) ? "error" : null} />
                  </th>
                  <td className="num">{num(e.valor)}</td>
                  <td className="num">{pct(e.pct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <SinDatos>Sin instrumentos valorados.</SinDatos>
      )}
      <Mas titulo="Por qué por emisor">
        <p className="cap-nota">El riesgo de crédito se mide por emisor: dos instrumentos distintos del mismo banco dependen del mismo emisor.</p>
      </Mas>
    </Panel>
  );
}

function PanelEscalera({ datos }: { datos: DatosCapital }) {
  const rk = riesgo(datos.ctx);
  const pos = posicion(datos.ctx);
  const anios = Object.keys(rk.escalera).sort();
  const max = anios.reduce((m, k) => (rk.escalera[k].gt(m) ? rk.escalera[k] : m), CERO);
  return (
    <Panel titulo="Escalera de vencimientos" id="cap-t-escalera">
      {anios.length ? (
        <div className="desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Año</th>
                <th scope="col" className="num">
                  RD$
                </th>
                <th scope="col" className="num">
                  % del total
                </th>
              </tr>
            </thead>
            <tbody>
              {anios.map((k) => (
                <tr key={k}>
                  <th scope="row">
                    {k}
                    <Barra pct={max.gt(0) ? rk.escalera[k].div(max) : null} clase="rentafija" />
                  </th>
                  <td className="num">{num(rk.escalera[k])}</td>
                  <td className="num">{pct(pos.total.gt(0) ? rk.escalera[k].div(pos.total) : null, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <SinDatos>Ningún instrumento tiene fecha de vencimiento cargada.</SinDatos>
      )}
      {rk.sinVenc.gt(0) ? (
        <p className="cap-nota">
          <strong>{rd(rk.sinVenc)}</strong> de renta fija sin vencimiento cargado: no aparece en la escalera ni en la duración.
        </p>
      ) : null}
    </Panel>
  );
}

function PanelCambiaria({ datos }: { datos: DatosCapital }) {
  const pos = posicion(datos.ctx);
  const rk = riesgo(datos.ctx);
  const monedas = (Object.keys(pos.porMoneda) as (keyof typeof pos.porMoneda)[]).sort((a, b) => pos.porMoneda[b]!.cmp(pos.porMoneda[a]!));
  return (
    <Panel titulo="Exposición cambiaria" id="cap-t-cambiaria">
      <div className="desplazable">
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Moneda</th>
              <th scope="col" className="num">
                RD$
              </th>
              <th scope="col" className="num">
                %
              </th>
            </tr>
          </thead>
          <tbody>
            {monedas.map((m) => {
              const v = pos.porMoneda[m]!;
              const p = pos.total.gt(0) ? v.div(pos.total) : null;
              return (
                <tr key={m}>
                  <th scope="row">
                    {m}
                    <Barra pct={p} />
                  </th>
                  <td className="num">{num(v)}</td>
                  <td className="num">{pct(p, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="cap-dos" style={{ marginTop: 12 }}>
        {rk.fxSens.map((s) => (
          <Dato key={s.d.toFixed()} rotulo={`Si el peso cae ${num(s.d.times(100))}%`} signo={s.impacto}>
            <ConSigno v={s.impacto} />
          </Dato>
        ))}
      </div>
      <Mas titulo="No es rendimiento">
        <p className="cap-nota">
          Es traducción de moneda: cuando el peso se deprecia, el patrimonio en RD$ sube sin que ninguna posición haya ganado nada. El puente lo separa.
        </p>
      </Mas>
    </Panel>
  );
}

function PanelPuente({ datos, mes }: Props) {
  const pu = puente(datos.ctx, mes);
  if (!pu) {
    return (
      <Panel titulo="Puente de patrimonio" id="cap-t-puente-a">
        <SinDatos accion={{ href: `/capital/cierre?mes=${mes}`, texto: "Ir al cierre" }}>Hace falta una foto congelada anterior a {mesLargo(mes)} para armar el puente.</SinDatos>
      </Panel>
    );
  }
  const filas: [string, typeof pu.dPat, boolean, string?][] = [
    [`Patrimonio ${mesCorto(pu.desde)}`, pu.patAnterior, true],
    ["+ Ahorro del período", pu.flujo, false],
    ["+ Rendimiento devengado", pu.rend, false],
    ["± Efecto cambiario", pu.efectoFX, false],
    ["= Patrimonio esperado", pu.patAnterior.plus(pu.flujo).plus(pu.rend).plus(pu.efectoFX), true],
    ["± Sin explicar", pu.sinExplicar, false, pu.alerta ? "baja" : ""],
    [`= Patrimonio ${mesCorto(pu.hasta)}`, pu.patActual, true],
  ];
  return (
    <Panel titulo="Puente de patrimonio" id="cap-t-puente-a" extra={<span className="tenue chico">{pu.meses} mes(es) · sigue el dinero</span>}>
      <div className="desplazable">
        <table className="tabla">
          <tbody>
            {filas.map(([l, v, total, clase]) => (
              <tr key={l}>
                <th scope="row" style={total ? { fontWeight: 650 } : { color: "var(--texto-2)" }}>
                  {l}
                </th>
                <td className={`num ${clase ?? ""}`} style={total ? { fontWeight: 650 } : undefined}>
                  {total ? num(v) : <ConSigno v={v} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap-nota">
        {!pu.fxMedible ? "El efecto cambiario no se pudo medir: la foto anterior no guardó el tipo de cambio. " : ""}
        {pu.mesesSinCierre ? <strong>{pu.mesesSinCierre} mes(es) sin cierre registrado. </strong> : null}
        {pu.alerta
          ? `La diferencia supera el margen de ${rd(pu.umbral)}: un aporte o retiro no registrado, un precio desactualizado o un cambio de valor que no quedó anotado.`
          : "Cuadra dentro del margen."}
      </p>
      <div style={{ marginTop: 8 }}>
        <SelloRegistros foto={indicadores(datos.ctx, mes).foto} mesCierre={mesLargo(pu.hasta)} />
      </div>
    </Panel>
  );
}

function PanelIndicadores({ datos, mes }: Props) {
  const ind = indicadores(datos.ctx, mes);
  const p = datos.ctx.p;
  const filas: [string, string, ReturnType<typeof tono>][] = [
    ["Patrimonio neto", rd(ind.foto.patrimonio), "neutra"],
    ["Activos líquidos", rd(ind.foto.liquidos), "neutra"],
    ["Pasivos", rd(ind.foto.pasivos), "neutra"],
    ["Gasto operativo mensual", ind.gastoRef ? rd(ind.gastoRef) : "—", "neutra"],
    ["Fondo de emergencia", ind.fondoMeses ? `${num(ind.fondoMeses, 1)} meses` : "—", ind.fondoMeses && n(p.metaFondo).gt(0) ? tono(ind.fondoMeses, n(p.metaFondo), 3) : "neutra"],
    ["Tasa de ahorro", pct(ind.tasaAhorro, 1), ind.tasaAhorro && n(p.metaAhorro).gt(0) ? tono(ind.tasaAhorro, n(p.metaAhorro), "0.10") : "neutra"],
    ["Ratio de gasto operativo", pct(ind.ratioGasto, 1), ind.ratioGasto ? tonoInverso(ind.ratioGasto, "0.70", "0.85") : "neutra"],
    ["Ingreso pasivo mensual", rd(ind.ingPasivoMes), "neutra"],
    ["Cobertura pasiva del gasto", pct(ind.coberturaPasiva, 1), ind.coberturaPasiva ? tono(ind.coberturaPasiva, 1, "0.25") : "neutra"],
    ["Yield devengado del portafolio", pct(ind.yieldPort, 2), ind.yieldPort ? tono(ind.yieldPort, "0.08", "0.05") : "neutra"],
    ["Deuda / ingreso anual", pct(ind.deudaIngreso, 1), ind.deudaIngreso ? tonoInverso(ind.deudaIngreso, "0.30", "0.45") : "neutra"],
    ["Patrimonio para independencia", ind.patLibertad ? rd(ind.patLibertad) : "—", "neutra"],
  ];
  return (
    <Panel titulo="Indicadores" id="cap-t-indicadores" extra={<span className="tenue chico">{mesLargo(mes)}</span>}>
      <div className="desplazable">
        <table className="tabla">
          <tbody>
            {filas.map(([l, v, t]) => (
              <tr key={l}>
                <th scope="row" style={{ whiteSpace: "normal" }}>
                  {l}
                </th>
                <td className="num">{v}</td>
                <td style={{ width: 1, whiteSpace: "nowrap" }}>
                  <EtiquetaTono tono={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Mas>
        <p className="cap-nota">
          El <strong>yield devengado</strong> es lo que tus instrumentos prometen pagar, no lo que ganaste; el retorno realizado está en Cartera. El
          patrimonio para independencia usa tu tasa de retiro ({pct(p.tasaRetiro, 1)}).
        </p>
      </Mas>
      <div style={{ marginTop: 8 }}>
        <SelloRegistros foto={ind.foto} mesCierre={null} />
      </div>
    </Panel>
  );
}

function PanelDiferenciales({ datos }: { datos: DatosCapital }) {
  const df = diferenciales(datos.ctx);
  const rein = ventanasReinversion(datos.ctx);
  if (!df.hayRef) {
    return (
      <Panel titulo="Tus tasas frente a las referencias" id="cap-t-dif">
        <SinDatos>
          Todavía no hay referencias oficiales guardadas (la TPM y la inflación del BCRD llegan con el módulo RD). Tu renta fija rinde {pct(df.yieldRF, 2)}{" "}
          ponderado.
        </SinDatos>
      </Panel>
    );
  }
  const base = df.refs[0];
  return (
    <Panel titulo="Tus tasas frente a las referencias" id="cap-t-dif" ancho>
      <div className="cap-dos" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        {df.refs.map((r) => (
          <div className="cap-dato" key={r.id}>
            <div className="rotulo">{r.nom}</div>
            <div className="n">{pct(r.v, 2)}</div>
            <SelloFuente
              ahora={datos.ahora}
              d={{ fuente: "BCRD", url: r.url, fechaDato: r.fecha, verificadoEn: null, desactualizado: frescura({ fecha_dato: r.fecha }, 64800, datos.ahora).desactualizado, ultimaCorridaFallo: false }}
            />
          </div>
        ))}
        <div className="cap-dato">
          <div className="rotulo">Tu renta fija (ponderada)</div>
          <div className="n">{pct(df.yieldRF, 2)}</div>
          <span className="sello">{df.yieldRF ? `${pb(df.yieldRF.minus(base.v))} vs. ${base.nom}` : "sin renta fija valorada"}</span>
        </div>
      </div>
      <div className="desplazable" style={{ marginTop: 12 }}>
        <table className="tabla">
          <thead>
            <tr>
              <th scope="col">Instrumento</th>
              <th scope="col" className="num">
                Tasa
              </th>
              <th scope="col" className="num">
                vs. {base.nom}
              </th>
            </tr>
          </thead>
          <tbody>
            {df.instr.map((x) => (
              <tr key={x.a.id}>
                <th scope="row" style={{ whiteSpace: "normal" }}>
                  {x.a.nombre} <span className="tenue chico">· {x.a.inst}</span>
                </th>
                <td className="num">{pct(x.tasa, 2)}</td>
                <td className={`num ${x.spread ? (x.spread.gte(0) ? "sube" : "baja") : ""}`}>{x.spread ? pb(x.spread) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Mas titulo="Qué es el diferencial">
        <p className="cap-nota">El diferencial contra la referencia es lo que cobras por el riesgo de crédito y de plazo de cada instrumento.</p>
      </Mas>
      {rein.length ? (
        <>
          <h3 className="cap-rotulo" style={{ marginTop: 14 }}>
            Vencen pronto pagando menos que la referencia
          </h3>
          <ul className="cap-hallazgos">
            {rein.map((x) => (
              <li key={x.a.id} className="alerta">
                <span className="marca-nivel" role="img" aria-label="vigilar">
                  !
                </span>
                <div>
                  <strong>
                    {x.a.nombre} vence en {x.d} días
                  </strong>
                  <p>
                    Paga {pct(x.a.tasa, 2)} y la {x.refNom} está en {pct(x.ref, 2)} ({pb(x.spread)} de diferencia).
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Panel>
  );
}

export function VistaAnalisis({ datos, mes }: Props) {
  return (
    <>
      <MosaicosAnalisis datos={datos} mes={mes} />
      <PanelAsignacion datos={datos} detalle />
      <PanelPuente datos={datos} mes={mes} />
      <PanelTasa datos={datos} />
      <PanelEscalera datos={datos} />
      <PanelEmisores datos={datos} />
      <PanelCambiaria datos={datos} />
      <PanelIndicadores datos={datos} mes={mes} />
      <PanelDiferenciales datos={datos} />
    </>
  );
}
