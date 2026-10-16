// Vista Resumen de Mena Capital: patrimonio, movimiento del día, indicadores clave, puente y hallazgos.

import Big from "big.js";
import Link from "next/link";
import { hallazgos, ordenar } from "@/lib/capital/alertas";
import { cambioDelMes, fotoHasta, indicadores } from "@/lib/capital/cierres";
import { mesCorto, mesLargo } from "@/lib/capital/fechas";
import { num, pct, pctSg, rd, tono } from "@/lib/capital/formato";
import { impactoDia } from "@/lib/capital/impacto";
import { posicion } from "@/lib/capital/posicion";
import { tirGlobal, twr } from "@/lib/capital/retorno";
import { puente } from "@/lib/capital/riesgo";
import { n } from "@/lib/capital/decimal";
import type { DatosCapital } from "@/lib/datos-capital";
import { Sparkline } from "./Graficos";
import { ConSigno, Dato, Kpi, ListaHallazgos, Panel, SinDatos } from "./Piezas";
import { SelloFx, SelloRegistros } from "./Sellos";

type Props = { datos: DatosCapital; mes: string };

export function PanelPatrimonio({ datos, mes }: Props) {
  const { ctx } = datos;
  const ind = indicadores(ctx, mes);
  const cambio = cambioDelMes(ctx, mes);
  const historial = Object.keys(ctx.cierres)
    .filter((k) => ctx.cierres[k].snap && k <= mes)
    .sort()
    .map((k) => ({ mes: k, v: new Big(ctx.cierres[k].snap!.patrimonio) }));
  const serie = [...historial.map((h) => h.v), ...(ind.foto.vivo ? [ind.foto.patrimonio] : [])];
  const usd = ctx.mercado.fx.USD.valor;
  const mesFoto = ind.foto.vivo ? null : (fotoHasta(ctx, mes)?.mes ?? null);
  return (
    <Panel titulo={`Patrimonio neto · ${mesLargo(mes)}`} id="cap-t-patrimonio" extra={<SelloRegistros foto={ind.foto} mesCierre={mesFoto ? mesLargo(mesFoto) : null} />}>
      <div className="cap-heroe" style={{ padding: 0 }}>
        <div className="valor">
          <small>RD$</small>
          {num(ind.foto.patrimonio)}
        </div>
        <div className="sub">
          {cambio ? (
            <span>
              <ConSigno v={cambio.cambio} prefijo="RD$ " /> ({pctSg(cambio.pct, 1)}) vs {mesCorto(cambio.previo)}
            </span>
          ) : (
            <span className="tenue">Sin mes previo cerrado para comparar</span>
          )}
          {usd ? <span className="mono tenue">≈ US$ {num(ind.foto.patrimonio.div(usd))}</span> : null}
        </div>
      </div>
      <Sparkline valores={serie} etiqueta={`Patrimonio por mes: ${historial.length} cierres${ind.foto.vivo ? " y el mes en curso" : ""}`} />
      {historial.length ? (
        <details className="cap-grupo" style={{ marginTop: 8 }}>
          <summary>Tabla del historial ({historial.length} cierres)</summary>
          <div className="cuerpo desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Mes</th>
                  <th scope="col" className="num">
                    Patrimonio (RD$)
                  </th>
                </tr>
              </thead>
              <tbody>
                {historial.map((h) => (
                  <tr key={h.mes}>
                    <th scope="row">{mesCorto(h.mes)}</th>
                    <td className="num">{num(h.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </Panel>
  );
}

export function PanelTipoCambio({ datos }: { datos: DatosCapital }) {
  const { ctx, ahora } = datos;
  const pos = posicion(ctx);
  return (
    <Panel titulo="Tipo de cambio usado" id="cap-t-fx">
      <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={ahora} hoy={ctx.hoy} />
      {ctx.activos.some((a) => a.moneda === "EUR") || ctx.mercado.fx.EUR.valor ? (
        <div style={{ marginTop: 4 }}>
          <SelloFx fx={ctx.mercado.fx.EUR} moneda="EUR" ahora={ahora} hoy={ctx.hoy} />
        </div>
      ) : null}
      <p className="cap-nota">
        Tienes <strong>{rd(pos.extranjero)}</strong> ({pct(pos.total.gt(0) ? pos.extranjero.div(pos.total) : null, 1)}) fuera del peso. Cada punto
        porcentual de depreciación del peso los sube {rd(pos.extranjero.times("0.01"))} en pesos sin que ninguna posición gane nada.
      </p>
    </Panel>
  );
}

export function PanelImpactoDia({ datos }: { datos: DatosCapital }) {
  const im = impactoDia(datos.ctx);
  if (!im || !im.comparable) {
    return (
      <Panel titulo="Movimiento del día" id="cap-t-dia">
        <SinDatos>
          Todavía no hay dos lecturas para comparar (precio anterior de Finnhub o dos días de dólar del BCRD). Los precios se leen de lunes a
          viernes a las 5:30 PM (hora RD).
        </SinDatos>
      </Panel>
    );
  }
  const fx = im.efFX.abs().gt(im.efPrecio.abs());
  return (
    <Panel titulo="Movimiento del día" id="cap-t-dia" extra={<span className="sello">datos del {im.fecha}</span>}>
      <div className="cap-dos">
        <Dato rotulo="Efecto precio" signo={im.efPrecio}>
          <ConSigno v={im.efPrecio} />
        </Dato>
        <Dato rotulo="Efecto cambiario" signo={im.efFX}>
          <ConSigno v={im.efFX} />
        </Dato>
      </div>
      <p className="cap-nota">
        Tu patrimonio se movió <strong>{rd(im.total)}</strong>.{" "}
        {fx ? "La mayor parte es el peso moviéndose, no tus posiciones: es traducción de moneda, no rendimiento." : "La mayor parte viene del precio de tus posiciones."}
      </p>
      {im.detalle.length ? (
        <div className="desplazable">
          <table className="tabla" style={{ marginTop: 8 }}>
            <thead>
              <tr>
                <th scope="col">Posición</th>
                <th scope="col" className="num">
                  Precio
                </th>
                <th scope="col" className="num">
                  Cambio
                </th>
                <th scope="col" className="num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {im.detalle.map((d) => (
                <tr key={d.a.id}>
                  <th scope="row">{d.a.simbolo || d.a.nombre}</th>
                  <td className="num">
                    <ConSigno v={d.dPrecio} />
                  </td>
                  <td className="num">
                    <ConSigno v={d.dFX} />
                  </td>
                  <td className="num">
                    <ConSigno v={d.dPrecio.plus(d.dFX)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Panel>
  );
}

export function PanelIndicadoresClave({ datos, mes }: Props) {
  const { ctx } = datos;
  const ind = indicadores(ctx, mes);
  const tw = twr(ctx);
  const ti = tirGlobal(ctx);
  const infl = n(ctx.p.inflacion);
  const metaFondo = n(ctx.p.metaFondo);
  const metaAhorro = n(ctx.p.metaAhorro);
  return (
    <Panel titulo="Indicadores clave" id="cap-t-kpi" cuerpo={false}>
      <div className="cap-kpis">
        <Kpi
          rotulo="Fondo de emergencia"
          valor={ind.fondoMeses ? `${num(ind.fondoMeses, 1)} m` : "—"}
          meta={ind.fondoMeses ? `meta ≥ ${num(metaFondo, 0)} meses` : "sin gasto registrado"}
          tono={ind.fondoMeses && metaFondo.gt(0) ? tono(ind.fondoMeses, metaFondo, 3) : "neutra"}
        />
        <Kpi
          rotulo="Tasa de ahorro"
          valor={pct(ind.tasaAhorro, 0)}
          meta={ind.tasaAhorro ? `meta ≥ ${pct(metaAhorro, 0)}` : "sin ingresos en el cierre"}
          tono={ind.tasaAhorro && metaAhorro.gt(0) ? tono(ind.tasaAhorro, metaAhorro, "0.10") : "neutra"}
        />
        <Kpi
          rotulo="Retorno (TWR)"
          valor={tw ? pct(tw.anualizado, 1) : "—"}
          meta={tw ? `anualizado · ${tw.meses} m cerrados` : "faltan 2 cierres con foto"}
          tono={tw ? tono(tw.anualizado, infl.plus("0.03"), infl) : "neutra"}
        />
        <Kpi rotulo="Tu TIR" valor={ti ? pct(ti.tir, 1) : "—"} meta={ti ? "experiencia real" : "faltan 2 cierres con foto"} tono={ti ? tono(ti.tir, infl.plus("0.03"), infl) : "neutra"} />
        <Kpi
          rotulo="Cobertura pasiva"
          valor={pct(ind.coberturaPasiva, 1)}
          meta={`${rd(ind.ingPasivoMes)}/mes`}
          tono={ind.coberturaPasiva ? tono(ind.coberturaPasiva, 1, "0.25") : "neutra"}
        />
        <Kpi
          rotulo="Flujo del mes"
          valor={ind.ing.gt(0) ? num(ind.flujo) : "—"}
          meta={ind.ing.gt(0) ? "ingresos − gasto operativo" : "sin cierre"}
          tono={ind.ing.gt(0) ? (ind.flujo.gt(0) ? "ok" : ind.flujo.eq(0) ? "alerta" : "error") : "neutra"}
        />
      </div>
      <p className="cap-nota" style={{ padding: "0 12px 10px" }}>
        TWR y TIR son tasas aproximadas por método (Dietz modificado y bisección) y se muestran redondeadas.
      </p>
    </Panel>
  );
}

export function PanelPuenteResumen({ datos, mes }: Props) {
  const pu = puente(datos.ctx, mes);
  if (!pu) {
    return (
      <Panel titulo="¿Dónde está el dinero?" id="cap-t-puente">
        <SinDatos>El puente necesita una foto congelada del mes anterior. Cierra el mes en la pestaña Cierre para empezar la serie.</SinDatos>
      </Panel>
    );
  }
  return (
    <Panel titulo="¿Dónde está el dinero?" id="cap-t-puente" extra={<span className="sello">{mesCorto(pu.desde)} → {mesCorto(pu.hasta)}</span>}>
      <div className="cap-dos">
        <Dato rotulo="Cambio real" signo={pu.dPat}>
          <ConSigno v={pu.dPat} />
        </Dato>
        <Dato rotulo="Sin explicar">
          <span className={pu.alerta ? "baja" : "tenue"}>
            <ConSigno v={pu.sinExplicar} />
          </span>
        </Dato>
      </div>
      <p className="cap-nota">
        Ahorro {rd(pu.flujo)} + rendimiento devengado {rd(pu.rend)}
        {pu.fxMedible ? ` + efecto cambiario ${rd(pu.efectoFX)}` : ""} = {rd(pu.flujo.plus(pu.rend).plus(pu.efectoFX))} explicados.{" "}
        {pu.alerta ? <strong>El resto no cuadra.</strong> : "El movimiento cuadra dentro del margen."}
        {pu.mesesSinCierre ? (
          <strong>
            {" "}
            {pu.mesesSinCierre} mes(es) sin cierre: el ahorro está subestimado.
          </strong>
        ) : null}
      </p>
    </Panel>
  );
}

export function PanelHallazgos({ datos, mes }: Props) {
  const A = ordenar(hallazgos(datos.ctx, mes));
  return (
    <Panel titulo={`Hallazgos · ${A.filter((a) => a.n !== "ok").length}`} id="cap-t-hallazgos" cuerpo={false} ancho>
      <ListaHallazgos lista={A} />
    </Panel>
  );
}

export function VistaResumen({ datos, mes }: Props) {
  return (
    <>
      {!datos.configurado ? (
        <p className="cap-aviso info cap-ancho">
          Todavía no hay datos de Mena Capital. Importa tu archivo en <Link href="/capital/importar">Importar</Link> o carga tus instrumentos en Cartera.
        </p>
      ) : null}
      <PanelPatrimonio datos={datos} mes={mes} />
      <PanelImpactoDia datos={datos} />
      <PanelIndicadoresClave datos={datos} mes={mes} />
      <PanelPuenteResumen datos={datos} mes={mes} />
      <PanelTipoCambio datos={datos} />
      <PanelHallazgos datos={datos} mes={mes} />
    </>
  );
}
