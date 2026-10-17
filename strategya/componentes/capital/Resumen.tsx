// Vista Resumen de Mena Capital: patrimonio con su gráfico en el tiempo, mosaicos de indicadores,
// asignación por las 4 clases contra la meta, movimiento del día, puente y hallazgos.

import Big from "big.js";
import { hallazgos, ordenar } from "@/lib/capital/alertas";
import { cambioDelMes, fotoHasta, indicadores } from "@/lib/capital/cierres";
import { n } from "@/lib/capital/decimal";
import { finDeMes, mesCorto, mesLargo } from "@/lib/capital/fechas";
import { num, pct, rd, tono } from "@/lib/capital/formato";
import { impactoDia } from "@/lib/capital/impacto";
import { posicion } from "@/lib/capital/posicion";
import { tirGlobal, twr } from "@/lib/capital/retorno";
import { puente } from "@/lib/capital/riesgo";
import type { DatosCapital } from "@/lib/datos-capital";
import { fechaCorta } from "@/lib/formato";
import { PanelAsignacion } from "./Asignacion";
import { GraficoSerie, type PuntoSerie } from "./GraficoSerie";
import { ConSigno, Dato, Kpi, ListaHallazgos, Mas, Mosaicos, Panel, Pastilla, SinDatos } from "./Piezas";
import { SelloFx, SelloRegistros } from "./Sellos";

type Props = { datos: DatosCapital; mes: string };

/** Patrimonio por mes (fotos congeladas hasta `mes`) y, si el mes es el de hoy, el punto en vivo. */
export function seriePatrimonio(datos: DatosCapital, mes: string): { puntos: PuntoSerie[]; historial: { mes: string; v: Big }[] } {
  const { ctx } = datos;
  const ind = indicadores(ctx, mes);
  const historial = Object.keys(ctx.cierres)
    .filter((k) => ctx.cierres[k].snap && k <= mes)
    .sort()
    .map((k) => ({ mes: k, v: new Big(ctx.cierres[k].snap!.patrimonio) }));
  const puntos: PuntoSerie[] = historial.map((h) => ({ t: finDeMes(h.mes), v: h.v.toFixed() }));
  if (ind.foto.vivo) {
    const hoy = ctx.hoy;
    const ultimo = puntos.at(-1);
    if (ultimo && ultimo.t >= hoy) puntos[puntos.length - 1] = { t: ultimo.t, v: ind.foto.patrimonio.toFixed() };
    else puntos.push({ t: hoy, v: ind.foto.patrimonio.toFixed() });
  }
  return { puntos, historial };
}

export function PanelPatrimonio({ datos, mes }: Props) {
  const { ctx } = datos;
  const ind = indicadores(ctx, mes);
  const cambio = cambioDelMes(ctx, mes);
  const { puntos, historial } = seriePatrimonio(datos, mes);
  const usd = ctx.mercado.fx.USD.valor;
  const mesFoto = ind.foto.vivo ? null : (fotoHasta(ctx, mes)?.mes ?? null);
  return (
    <Panel titulo="Patrimonio neto" id="cap-t-patrimonio" ancho extra={<span className="tenue chico">{mesLargo(mes)}</span>}>
      <div className="cap-heroe">
        <div className="valor">
          <small>RD$</small>
          {num(ind.foto.patrimonio)}
        </div>
        <div className="sub">
          {cambio ? (
            <>
              <Pastilla v={cambio.pct} />
              <ConSigno v={cambio.cambio} prefijo="RD$ " />
              <span>vs {mesCorto(cambio.previo)}</span>
            </>
          ) : (
            <span>Sin mes previo cerrado para comparar</span>
          )}
          {usd ? <span className="mono">≈ US$ {num(ind.foto.patrimonio.div(usd))}</span> : null}
        </div>
        <SelloRegistros foto={ind.foto} mesCierre={mesFoto ? mesLargo(mesFoto) : null} />
      </div>
      {puntos.length >= 2 ? (
        <GraficoSerie
          series={[{ nombre: "Patrimonio", color: "#2962ff", puntos, area: true }]}
          etiqueta={`Patrimonio neto por mes: ${historial.length} cierres${ind.foto.vivo ? " y el valor de hoy" : ""}. La tabla del historial tiene las cifras.`}
          alto={260}
        />
      ) : (
        <div className="cap-serie-vacia">El gráfico aparece cuando tengas dos meses cerrados (o un cierre y el valor de hoy).</div>
      )}
      {historial.length ? (
        <Mas titulo={`Tabla del historial (${historial.length} cierres)`}>
          <div className="desplazable">
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
                    <th scope="row">{mesLargo(h.mes)}</th>
                    <td className="num">{num(h.v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Mas>
      ) : null}
    </Panel>
  );
}

export function MosaicosResumen({ datos, mes }: Props) {
  const { ctx } = datos;
  const ind = indicadores(ctx, mes);
  const tw = twr(ctx);
  const ti = tirGlobal(ctx);
  const infl = n(ctx.p.inflacion);
  const metaFondo = n(ctx.p.metaFondo);
  const metaAhorro = n(ctx.p.metaAhorro);
  return (
    <>
      <Mosaicos etiqueta="Indicadores clave del mes">
        <Kpi
          rotulo="Fondo de emergencia"
          valor={ind.fondoMeses ? num(ind.fondoMeses, 1) : "—"}
          unidad={ind.fondoMeses ? "meses" : undefined}
          meta={ind.fondoMeses ? (metaFondo.gt(0) ? `meta ≥ ${num(metaFondo, 0)} meses` : "sin meta escrita") : "sin gasto registrado"}
          tono={ind.fondoMeses && metaFondo.gt(0) ? tono(ind.fondoMeses, metaFondo, 3) : "neutra"}
          ayuda="Efectivo + cuentas de ahorro, en meses de tu gasto operativo."
        />
        <Kpi
          rotulo="Tasa de ahorro"
          valor={pct(ind.tasaAhorro, 0)}
          meta={ind.tasaAhorro ? (metaAhorro.gt(0) ? `meta ≥ ${pct(metaAhorro, 0)}` : "sin meta escrita") : "sin ingresos en el cierre"}
          tono={ind.tasaAhorro && metaAhorro.gt(0) ? tono(ind.tasaAhorro, metaAhorro, "0.10") : "neutra"}
        />
        <Kpi
          rotulo="Retorno (TWR)"
          valor={tw ? pct(tw.anualizado, 1) : "—"}
          meta={tw ? `anualizado · ${tw.meses} m` : "faltan 2 cierres"}
          tono={tw ? tono(tw.anualizado, infl.plus("0.03"), infl) : "neutra"}
          ayuda="Dietz modificado sobre meses cerrados; tasa aproximada por método, redondeada."
        />
        <Kpi
          rotulo="Tu TIR"
          valor={ti ? pct(ti.tir, 1) : "—"}
          meta={ti ? "tu experiencia real" : "faltan 2 cierres"}
          tono={ti ? tono(ti.tir, infl.plus("0.03"), infl) : "neutra"}
          ayuda="Tasa interna de retorno de tu patrimonio (bisección); aproximada, redondeada."
        />
        <Kpi
          rotulo="Cobertura pasiva"
          valor={pct(ind.coberturaPasiva, 1)}
          meta={`${rd(ind.ingPasivoMes)}/mes`}
          tono={ind.coberturaPasiva ? tono(ind.coberturaPasiva, 1, "0.25") : "neutra"}
          ayuda="Ingreso pasivo devengado sobre tu gasto operativo."
        />
        <Kpi
          rotulo="Flujo del mes"
          valor={ind.ing.gt(0) ? num(ind.flujo) : "—"}
          meta={ind.ing.gt(0) ? "ingresos − gasto operativo" : "sin cierre del mes"}
          tono={ind.ing.gt(0) ? (ind.flujo.gt(0) ? "ok" : ind.flujo.eq(0) ? "alerta" : "error") : "neutra"}
        />
      </Mosaicos>
      <div className="cap-ancho cap-pie-mosaicos">
        <SelloRegistros foto={ind.foto} mesCierre={null} />
      </div>
    </>
  );
}

export function PanelTipoCambio({ datos }: { datos: DatosCapital }) {
  const { ctx, ahora } = datos;
  const pos = posicion(ctx);
  return (
    <Panel titulo="Tipo de cambio usado" id="cap-t-fx">
      <div className="cap-dos">
        <Dato rotulo="US$ → RD$">{ctx.mercado.fx.USD.valor ? num(ctx.mercado.fx.USD.valor, 2) : "—"}</Dato>
        <Dato rotulo="Fuera del peso">
          {pct(pos.total.gt(0) ? pos.extranjero.div(pos.total) : null, 1)}
        </Dato>
      </div>
      <div style={{ marginTop: 10 }}>
        <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={ahora} hoy={ctx.hoy} />
        {ctx.activos.some((a) => a.moneda === "EUR") || ctx.mercado.fx.EUR.valor ? <SelloFx fx={ctx.mercado.fx.EUR} moneda="EUR" ahora={ahora} hoy={ctx.hoy} /> : null}
      </div>
      <p className="cap-nota">
        Tienes <strong>{rd(pos.extranjero)}</strong> fuera del peso: cada punto de depreciación del peso los sube {rd(pos.extranjero.times("0.01"))} sin que
        ninguna posición gane nada.
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
          Aparece cuando haya dos lecturas para comparar (precio anterior de Finnhub o dos días de dólar del BCRD). Los precios se leen de lunes a viernes a
          las 5:30 PM, hora RD.
        </SinDatos>
      </Panel>
    );
  }
  const fx = im.efFX.abs().gt(im.efPrecio.abs());
  return (
    <Panel titulo="Movimiento del día" id="cap-t-dia" extra={<span className="tenue chico">datos del {fechaCorta(im.fecha)}</span>}>
      <div className="cap-heroe">
        <div className="valor" style={{ fontSize: 26 }}>
          <ConSigno v={im.total} prefijo="RD$ " />
        </div>
        <div className="sub">{fx ? "Sobre todo por el peso: traducción de moneda, no rendimiento." : "Sobre todo por el precio de tus posiciones."}</div>
      </div>
      <div className="cap-dos" style={{ marginTop: 12 }}>
        <Dato rotulo="Efecto precio" signo={im.efPrecio}>
          <ConSigno v={im.efPrecio} />
        </Dato>
        <Dato rotulo="Efecto cambiario" signo={im.efFX}>
          <ConSigno v={im.efFX} />
        </Dato>
      </div>
      {im.detalle.length ? (
        <Mas titulo={`Por posición (${im.detalle.length})`}>
          <div className="desplazable">
            <table className="tabla">
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
        </Mas>
      ) : null}
    </Panel>
  );
}

export function PanelPuenteResumen({ datos, mes }: Props) {
  const pu = puente(datos.ctx, mes);
  if (!pu) {
    return (
      <Panel titulo="¿Dónde está el dinero?" id="cap-t-puente">
        <SinDatos accion={{ href: `/capital/cierre?mes=${mes}`, texto: "Cerrar el mes" }}>
          El puente compara dos fotos congeladas del patrimonio. Cierra el mes para empezar la serie.
        </SinDatos>
      </Panel>
    );
  }
  return (
    <Panel titulo="¿Dónde está el dinero?" id="cap-t-puente" extra={<span className="tenue chico">{mesCorto(pu.desde)} → {mesCorto(pu.hasta)}</span>}>
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
        Ahorro {rd(pu.flujo)} + rendimiento {rd(pu.rend)}
        {pu.fxMedible ? ` + efecto cambiario ${rd(pu.efectoFX)}` : ""} = {rd(pu.flujo.plus(pu.rend).plus(pu.efectoFX))} explicados.{" "}
        {pu.alerta ? <strong>El resto no cuadra.</strong> : "Cuadra dentro del margen."}
        {pu.mesesSinCierre ? <strong> {pu.mesesSinCierre} mes(es) sin cierre: el ahorro está subestimado.</strong> : null}
      </p>
    </Panel>
  );
}

export function PanelHallazgos({ datos, mes }: Props) {
  const A = ordenar(hallazgos(datos.ctx, mes));
  const fuera = A.filter((a) => a.n !== "ok").length;
  return (
    <Panel
      titulo="Hallazgos del mes"
      id="cap-t-hallazgos"
      cuerpo={false}
      ancho
      extra={<span className="tenue chico">{fuera ? `${fuera} para revisar · comparados con tus metas` : "todo dentro de tus metas"}</span>}
    >
      <ListaHallazgos lista={A} columnas />
    </Panel>
  );
}

export function VistaResumen({ datos, mes }: Props) {
  if (!datos.configurado && !datos.ctx.activos.length) {
    return (
      <section className="panel cap-ancho" aria-labelledby="cap-t-bienvenida">
        <div className="panel-cuerpo">
          <h2 className="sr-solo" id="cap-t-bienvenida">
            Empieza con Mena Capital
          </h2>
          <SinDatos centro icono="cartera" accion={{ href: "/capital/cartera", texto: "Agregar mi primer instrumento" }}>
            Todavía no hay datos. Agrega tus instrumentos en Cartera (o importa tu archivo del artefacto con «Importar», arriba) y aquí verás tu
            patrimonio, tu asignación y tus metas.
          </SinDatos>
        </div>
      </section>
    );
  }
  return (
    <>
      <PanelPatrimonio datos={datos} mes={mes} />
      <MosaicosResumen datos={datos} mes={mes} />
      <PanelAsignacion datos={datos} />
      <PanelImpactoDia datos={datos} />
      <PanelPuenteResumen datos={datos} mes={mes} />
      <PanelTipoCambio datos={datos} />
      <PanelHallazgos datos={datos} mes={mes} />
    </>
  );
}
