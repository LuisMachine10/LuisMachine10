// Widgets del Resumen del Portafolio Financiero (catálogo: WIDGETS_PORTAFOLIO en lib/dashboard/widgets.ts).
// Se arman con la misma rejilla editable del Dashboard (componentes/dashboard/Rejilla.tsx) y su propia
// preferencia («portafolio»). Cada uno muestra su sello de fuente; sin datos, dice qué falta.

import Big from "big.js";
import { Embebido, Marco, WidgetVacio } from "@/componentes/dashboard/Marco";
import { cambioDelMes, fotoHasta, indicadores } from "@/lib/capital/cierres";
import { CERO, n } from "@/lib/capital/decimal";
import { mesCorto, mesLargo } from "@/lib/capital/fechas";
import { num, pct, rd } from "@/lib/capital/formato";
import { posicion, valorDOP } from "@/lib/capital/posicion";
import { ahorroPresupuestado, horizonteMeses, proyectarPortafolio } from "@/lib/capital/proyeccion";
import { balance } from "@/lib/capital/registro";
import { CLASES, nombreClase } from "@/lib/capital/tipos";
import type { FichaWidget } from "@/lib/dashboard/widgets";
import type { DatosCapital } from "@/lib/datos-capital";
import { PanelIndicadores, PanelPuente } from "./Analisis";
import { PanelAsignacion } from "./Asignacion";
import { GraficoSerie } from "./GraficoSerie";
import { MatrizRiesgo } from "./Matriz";
import { ConSigno, Pastilla } from "./Piezas";
import { PanelAportesMes } from "./Proyecciones";
import { PanelImpactoDia, PanelTipoCambio, seriePatrimonio } from "./Resumen";
import { SelloRegistros } from "./Sellos";

export interface PropsWidgetPf {
  ficha: FichaWidget;
  datos: DatosCapital;
  mes: string;
}

function Patrimonio({ ficha, datos, mes }: PropsWidgetPf) {
  const { ctx } = datos;
  const ind = indicadores(ctx, mes);
  const cambio = cambioDelMes(ctx, mes);
  const { puntos, historial } = seriePatrimonio(datos, mes);
  const usd = ctx.mercado.fx.USD.valor;
  const mesFoto = ind.foto.vivo ? null : (fotoHasta(ctx, mes)?.mes ?? null);
  return (
    <Marco ficha={ficha} enlace={{ href: `/capital/cuentas?mes=${mes}`, texto: "Mis cuentas" }} pie={<SelloRegistros foto={ind.foto} mesCierre={mesFoto ? mesLargo(mesFoto) : null} />}>
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
      </div>
      {puntos.length >= 2 ? (
        <GraficoSerie series={[{ nombre: "Patrimonio", color: "var(--serie-1)", puntos, area: true }]} etiqueta={`Patrimonio por mes: ${historial.length} cierres y hoy.`} alto={190} />
      ) : (
        <p className="cap-serie-vacia">El gráfico aparece cuando tengas un mes cerrado y el valor de hoy.</p>
      )}
    </Marco>
  );
}

function Balance({ ficha, datos, mes }: PropsWidgetPf) {
  const b = balance(datos.ctx, datos.ctx.registro ?? []);
  if (!(datos.ctx.registro ?? []).length) {
    return <WidgetVacio ficha={ficha} motivo="Anota tus cuentas, inversiones y deudas una sola vez: de ahí sale todo." accion={{ href: "/capital/cuentas", texto: "Agregar mis cuentas" }} />;
  }
  return (
    <Marco ficha={ficha} enlace={{ href: `/capital/cuentas?mes=${mes}`, texto: "Ver todo" }} pie={<span className="sello">Tus registros · saldos de hoy con lo anotado en el Presupuesto</span>}>
      <dl className="pf-balance">
        <div>
          <dt>Lo que tienes</dt>
          <dd className="mono">{rd(b.activos)}</dd>
        </div>
        <div>
          <dt>Lo que debes</dt>
          <dd className="mono">{rd(b.deudas)}</dd>
        </div>
        <div className="total">
          <dt>Patrimonio</dt>
          <dd className="mono">{rd(b.patrimonio)}</dd>
        </div>
      </dl>
      {b.deudasSinDato.length ? <span className="cap-sin-dato">{b.deudasSinDato.length} deuda(s) sin saldo</span> : null}
    </Marco>
  );
}

function Participacion({ ficha, datos }: PropsWidgetPf) {
  return (
    <Embebido ficha={ficha} enlace={{ href: "/capital/cartera", texto: "Cartera" }}>
      <PanelAsignacion datos={datos} id="pf-w-asignacion" />
    </Embebido>
  );
}

/** Retorno esperado por categoría: tasa ponderada de sus instrumentos (lo que prometen pagar, no lo ganado). */
function Retorno({ ficha, datos }: PropsWidgetPf) {
  const { ctx } = datos;
  const pos = posicion(ctx);
  if (pos.total.lte(0)) return <WidgetVacio ficha={ficha} motivo="Sin inversiones valoradas todavía." accion={{ href: "/capital/cuentas", texto: "Agregar inversiones" }} />;
  const filas = CLASES.map((c) => {
    let v = CERO;
    let renta = CERO;
    for (const a of ctx.activos.filter((x) => x.clase === c.id)) {
      const x = valorDOP(ctx, a);
      if (!x) continue;
      v = v.plus(x);
      renta = renta.plus(x.times(n(a.tasa)));
    }
    return { c, v, tasa: v.gt(0) ? renta.div(v) : null, renta };
  }).filter((f) => f.v.gt(0));
  return (
    <Marco ficha={ficha} pie={<span className="sello">Tus registros · tasa de cada instrumento, ponderada por su saldo</span>}>
      <div className="pf-retorno-total">
        <span className="mono cifra-grande">{pct(pos.rentaTotal.div(pos.total), 2)}</span>
        <span className="tenue chico">al año · {rd(pos.rentaTotal.div(12))} al mes</span>
      </div>
      <ul className="pf-filas">
        {filas.map((f) => (
          <li key={f.c.id}>
            <span>
              <span className={`cap-muestra ${f.c.id}`} aria-hidden="true" /> {f.c.nom}
            </span>
            <span className="mono">{pct(f.tasa, 2)}</span>
          </li>
        ))}
      </ul>
    </Marco>
  );
}

function Futuro({ ficha, datos, mes }: PropsWidgetPf) {
  const { ctx } = datos;
  if (!ctx.activos.length) return <WidgetVacio ficha={ficha} motivo="Anota tus inversiones para ver cómo crecerían." accion={{ href: "/capital/cuentas", texto: "Agregar inversiones" }} />;
  const meses = horizonteMeses(ctx, null);
  const ahorro = ahorroPresupuestado(ctx);
  const pr = proyectarPortafolio(ctx, meses, ahorro);
  const max = pr.porClase.reduce((m, c) => (c.final.gt(m) ? c.final : m), CERO);
  return (
    <Marco
      ficha={ficha}
      enlace={{ href: `/capital/futuro?mes=${mes}`, texto: "Proyecciones" }}
      pie={<span className="sello">Proyección a {meses / 12} años con tus tasas{ahorro ? ` y ${rd(ahorro)} al mes de tu Presupuesto` : ""}. No es un pronóstico.</span>}
    >
      <ul className="pf-futuro">
        {pr.porClase
          .filter((c) => c.hoy.gt(0) || c.final.gt(0))
          .map((c) => (
            <li key={c.clase}>
              <div className="pf-futuro-fila">
                <span>
                  <span className={`cap-muestra ${c.clase}`} aria-hidden="true" /> {nombreClase(c.clase)}
                </span>
                <span className="mono">
                  {num(c.hoy)} → <strong>{num(c.final)}</strong>
                </span>
              </div>
              <div className="pf-futuro-barra" aria-hidden="true">
                <span className="aportado" style={{ width: `${max.gt(0) ? new Big(c.aportado).div(max).times(100).toFixed(1) : 0}%` }} />
                <span className="interes" style={{ width: `${max.gt(0) ? (c.interes.gt(0) ? c.interes : CERO).div(max).times(100).toFixed(1) : 0}%` }} />
              </div>
            </li>
          ))}
      </ul>
      <ul className="leyenda chico">
        <li>
          <span className="clave-linea" style={{ background: "var(--serie-2)" }} /> Lo que aportas
        </li>
        <li>
          <span className="clave-linea" style={{ background: "var(--serie-1)" }} /> Lo que ganan tus intereses
        </li>
      </ul>
    </Marco>
  );
}

function Aportes({ ficha, datos, mes }: PropsWidgetPf) {
  return (
    <Embebido ficha={ficha} enlace={{ href: `/capital/futuro?mes=${mes}#cap-t-aportes`, texto: "Confirmar" }}>
      <PanelAportesMes datos={datos} mes={mes} compacto volver="/capital" />
    </Embebido>
  );
}

function Puente({ ficha, datos, mes }: PropsWidgetPf) {
  return (
    <Marco ficha={ficha} enlace={{ href: `/capital/analisis?mes=${mes}`, texto: "Riesgos" }} clase="dash-w-embebido">
      <div className="pf-puente">
        <PanelPuente datos={datos} mes={mes} />
        <PanelIndicadores datos={datos} mes={mes} />
      </div>
    </Marco>
  );
}

function Riesgos({ ficha, datos, mes }: PropsWidgetPf) {
  return (
    <Marco ficha={ficha} enlace={{ href: `/capital/analisis?mes=${mes}`, texto: "Ver cada riesgo" }}>
      <MatrizRiesgo ctx={datos.ctx} detalle={false} mes={mes} />
    </Marco>
  );
}

function Dolar({ ficha, datos }: PropsWidgetPf) {
  return (
    <Embebido ficha={ficha}>
      <PanelTipoCambio datos={datos} />
    </Embebido>
  );
}

function Dia({ ficha, datos }: PropsWidgetPf) {
  return (
    <Embebido ficha={ficha}>
      <PanelImpactoDia datos={datos} />
    </Embebido>
  );
}

export const RENDER_PORTAFOLIO: Record<string, (p: PropsWidgetPf) => React.ReactNode> = {
  "pf-patrimonio": Patrimonio,
  "pf-balance": Balance,
  "pf-participacion": Participacion,
  "pf-retorno": Retorno,
  "pf-futuro": Futuro,
  "pf-aportes": Aportes,
  "pf-puente": Puente,
  "pf-riesgos": Riesgos,
  "pf-dolar": Dolar,
  "pf-dia": Dia,
};
