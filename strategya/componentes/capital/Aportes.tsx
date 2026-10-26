// «Lo que planeaste ahorrar este mes» (Núcleo v2, manual sección C): las líneas del plan del mes del Presupuesto,
// cada una con su instrumento EXACTO y su monto en su moneda. Se marca hecha cuando se registra la transferencia a
// ese destino (parcial permitido); al cierre, «más o menos de lo planeado». Ya no hay reparto por porcentajes ni
// «aportes pendientes» que decidiera el sistema: el plan lo escribe Mena en Presupuesto → Plan del mes.

import Link from "next/link";
import { registrarLinea } from "@/app/capital/acciones";
import { CERO, n } from "@/lib/capital/decimal";
import { mesLargo } from "@/lib/capital/fechas";
import { num, rd } from "@/lib/capital/formato";
import type { DatosCapital } from "@/lib/datos-capital";
import { aparece, type TipoFin } from "@/lib/finanzas/catalogo";
import { type LineaAhorro, masOMenos } from "@/lib/finanzas/plan";
import { Icono } from "./Iconos";
import { Panel, SinDatos } from "./Piezas";

type Props = { datos: DatosCapital; mes: string };

const simbolo = (m: string) => (m === "DOP" ? "RD$" : m === "USD" ? "US$" : "€");
const enSuMoneda = (x: Parameters<typeof num>[0], m: string) => (m === "DOP" ? rd(x) : `${simbolo(m)} ${num(x, 2)}`);

function Estado({ l, cerrado }: { l: LineaAhorro; cerrado: boolean }) {
  const falta = l.planeado.minus(l.hecho);
  if (cerrado) {
    const k = masOMenos(l.diferencia);
    return (
      <p className={`ap-estado ${k === "menos" ? "baja" : "sube"}`}>
        {k === "igual" ? "Justo lo planeado" : `${enSuMoneda(l.diferencia.abs(), l.moneda)} ${k === "mas" ? "más" : "menos"} de lo planeado`}
      </p>
    );
  }
  if (l.estado === "hecha") {
    return (
      <p className="ap-estado sube">
        <Icono nombre="ok" /> Hecha: {enSuMoneda(l.hecho, l.moneda)}
      </p>
    );
  }
  if (l.estado === "parcial") return <p className="ap-estado">A medias: llevas {enSuMoneda(l.hecho, l.moneda)}, faltan {enSuMoneda(falta, l.moneda)}</p>;
  return <p className="ap-estado tenue">Por hacer</p>;
}

function Linea({ l, datos, mes, volver, compacto }: { l: LineaAhorro; datos: DatosCapital; mes: string; volver: string; compacto: boolean }) {
  const reg = datos.registroCompleto.find((i) => i.id === l.registroId);
  const nombre = reg?.nombre ?? datos.caja.datos?.cuentas.find((c) => c.id === l.cajaId)?.nombre ?? "Instrumento que ya no está";
  const cerrado = mes < datos.ctx.hoy.slice(0, 7);
  const vencido = !!(reg?.venc && reg.venc < datos.ctx.hoy && reg.tipo !== "mutuo");
  // El ahorro sale de efectivo o de una cuenta (manual, sección B), en la moneda de la línea.
  const cuentas = (datos.caja.datos?.cuentas ?? []).filter(
    (c) => (c.moneda ?? "DOP") === l.moneda && c.id !== l.cajaId && aparece({ tipo: (c.tipoFin ?? (c.tipo === "banco" ? "corriente" : c.tipo === "ahorro" ? "ahorro" : c.tipo === "efectivo" ? "efectivo" : "tarjeta")) as TipoFin, debito: c.debito }, "ahorro", "origen"),
  );
  const falta = l.planeado.minus(l.hecho);
  const porUnidades = reg ? !n(reg.precio).eq(1) : false;
  return (
    <li className={`ap-item${l.estado === "hecha" ? " hecho" : ""}`}>
      <div className="ap-cabeza">
        <span className={`cap-muestra ${reg?.clase ?? "ahorros"}`} aria-hidden="true" />
        <span className="ap-nombre">
          <strong>{nombre}</strong>
          <span className="chico tenue">
            {l.recurrente.nombre}
            {l.veces > 1 ? ` · ${l.veces} veces este mes` : ""}
          </span>
        </span>
        <span className="mono ap-monto">{enSuMoneda(l.planeado, l.moneda)}</span>
      </div>
      <Estado l={l} cerrado={cerrado} />
      {vencido ? <p className="cap-nota baja">«{nombre}» venció: cambia el destino de esta línea en el Plan del mes (no pasamos tu dinero solo a otro lado).</p> : null}
      {compacto || cerrado || l.estado === "hecha" ? null : (
        <details className="ap-confirmar">
          <summary className="boton chico">Registrar la transferencia</summary>
          <form action={registrarLinea} className="cap-form">
            <input type="hidden" name="recurrenteId" value={l.recurrente.id} />
            <input type="hidden" name="destino" value={l.cajaId ?? `r:${l.registroId ?? ""}`} />
            <input type="hidden" name="categoria" value={l.recurrente.categoria ?? ""} />
            <input type="hidden" name="moneda" value={l.moneda} />
            <input type="hidden" name="mes" value={mes} />
            <input type="hidden" name="volver" value={volver} />
            <input type="hidden" name="nota" value={`Ahorro: ${l.recurrente.nombre}`.slice(0, 500)} />
            <div className="reg-campos">
              <label className="cap-campo">
                Monto ({simbolo(l.moneda)})
                <input name="monto" inputMode="decimal" required defaultValue={(falta.gt(0) ? falta : l.planeado).toFixed(2)} autoComplete="off" />
              </label>
              <label className="cap-campo">
                Fecha
                <input type="date" name="fecha" defaultValue={datos.ctx.hoy} required />
              </label>
              <label className="cap-campo">
                ¿De dónde sale el dinero?
                <select name="cuenta" required defaultValue={cuentas.some((c) => c.id === l.recurrente.cuenta) ? (l.recurrente.cuenta ?? "") : ""}>
                  <option value="" disabled>
                    Elige…
                  </option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
              {porUnidades ? (
                <label className="cap-campo">
                  Unidades que compraste <span className="ayuda">(opcional)</span>
                  <input name="unidades" inputMode="decimal" placeholder="Ej.: 2" autoComplete="off" />
                </label>
              ) : null}
            </div>
            <p className="tenue chico" style={{ margin: 0 }}>
              Queda en tu Presupuesto como «Mover entre mis cuentas» hacia «{nombre}»: es ahorro, no gasto. Si fue menos, queda a medias.
            </p>
            <div className="cap-botones">
              <button type="submit" className="boton">
                Anotar la transferencia
              </button>
            </div>
          </form>
        </details>
      )}
    </li>
  );
}

/** Las líneas de ahorro e inversión del mes con su estado. `compacto` = para el widget del Resumen. */
export function PanelPlanAhorro({ datos, mes, volver = "/capital/futuro", compacto = false }: Props & { volver?: string; compacto?: boolean }) {
  const plan = datos.plan;
  const titulo = "Lo que planeaste ahorrar este mes";
  if (!plan) {
    return (
      <Panel titulo={titulo} id="cap-t-aportes" ancho={!compacto}>
        <SinDatos accion={{ href: "/caja", texto: "Armar mi Presupuesto" }}>Tu plan de ahorro sale del Presupuesto: primero ármalo.</SinDatos>
      </Panel>
    );
  }
  const viejo = !!datos.ctx.p.planClases || datos.ctx.activos.some((a) => a.plan?.aportePct);
  const total = plan.lineas.reduce((s, l) => s.plus(l.planeadoDOP ?? CERO), CERO);
  const hecho = plan.lineas.reduce((s, l) => s.plus(l.hechoDOP ?? CERO), CERO);
  return (
    <Panel
      titulo={titulo}
      id="cap-t-aportes"
      ancho={!compacto}
      extra={<span className="tenue chico">{mesLargo(plan.mes)} · {plan.lineas.filter((l) => l.estado === "hecha").length} de {plan.lineas.length} hechas</span>}
    >
      {plan.lineas.length ? (
        <>
          <ul className="ap-lista">
            {plan.lineas.map((l) => (
              <Linea key={l.recurrente.id} l={l} datos={datos} mes={plan.mes} volver={volver} compacto={compacto} />
            ))}
          </ul>
          <p className="chico" style={{ margin: "8px 0 0" }}>
            Planeado <span className="mono">{rd(total)}</span> · hecho <span className="mono">{rd(hecho)}</span>
            {plan.ahorroSuelto.gt(0) ? <> · además {rd(plan.ahorroSuelto)} a otros destinos</> : null}
          </p>
        </>
      ) : (
        <SinDatos accion={{ href: "/caja/plan#t-plan-lineas", texto: "Escribir mi plan de ahorro" }}>
          Este mes no escribiste cuánto vas a ahorrar ni en qué. Escribe cada línea con su instrumento y su monto: así se ve qué hiciste y tus proyecciones usan esos montos.
        </SinDatos>
      )}
      {plan.sinInstrumento.gt(0) ? (
        <p className="cap-nota baja">
          Tienes {rd(plan.sinInstrumento)} de ahorro presupuestado sin decir a dónde va: no entra en el plan ni en las proyecciones. Conviértelo en una línea con su instrumento.
        </p>
      ) : null}
      {viejo && !compacto ? (
        <p className="cap-nota">
          Tu plan anterior repartía el ahorro por porcentajes que decidía el sistema. Ya no se usa (dijiste que no hiciste esos aportes): no se convirtió a montos porque no
          había montos que convertir. Nada se borró.
        </p>
      ) : null}
      <p className="sello" style={{ marginTop: 8 }}>
        Tus registros · líneas del Plan del mes del Presupuesto · <Link href="/caja/plan">Cambiar el plan</Link>
      </p>
    </Panel>
  );
}
