// Vista Política de inversión (IPS): qué es y para qué la usa Capital, las metas por las 4 clases
// (con banda de rebalanceo, límite por emisor y meses de gasto en efectivo) y las 8 secciones que
// escribe Mena. Los ejemplos van como placeholder (texto gris que desaparece al escribir): no son datos
// ni se guardan.

import { guardarIps, guardarParametros } from "@/app/capital/acciones";
import { Big, n } from "@/lib/capital/decimal";
import { aPct } from "@/lib/capital/formulario";
import { pct } from "@/lib/capital/formato";
import { CLASES, ipsVacia, SECCIONES_IPS, type SeccionIps } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { fechaCorta } from "@/lib/formato";
import { Icono } from "./Iconos";
import { Estado, Panel } from "./Piezas";

const EJEMPLOS: Record<SeccionIps, string> = {
  horizonte: "Ej.: 10 años; esta plata no la necesito antes de 2036.",
  objetivo: "Ej.: crecer el patrimonio por encima de la inflación y tener ingreso pasivo que cubra el 25 % de mis gastos.",
  tolerancia: "Ej.: acepto una caída de hasta 15 % en un año sin vender.",
  liquidez: "Ej.: 6 meses de gastos en efectivo y cuentas de ahorro, siempre.",
  restricciones: "Ej.: nada de cripto ni apalancamiento; solo emisores regulados por la SIMV.",
  rebalanceo: "Ej.: reviso cada trimestre; rebalanceo si una clase se sale ±5 puntos de su meta.",
  emisores: "Ej.: máximo 25 % del patrimonio en un mismo emisor.",
  revision: "Ej.: reviso esta política cada enero o si cambia mi ingreso.",
};

const EJEMPLO_META: Record<string, string> = { efectivo: "5", ahorros: "15", rentafija: "50", rentavariable: "30" };

function Explicacion() {
  return (
    <section className="panel cap-ancho" aria-labelledby="cap-t-que-es-ips">
      <div className="panel-cuerpo cap-explica">
        <Icono nombre="escudo" clase="cap-icono-grande" />
        <div>
          <h2 id="cap-t-que-es-ips">¿Para qué sirve la política de inversión (IPS)?</h2>
          <p>
            Son <strong>tus reglas de inversión escritas en frío</strong>, antes de que el mercado se mueva: tu objetivo, tu horizonte, cuánta caída
            toleras, qué % quieres en cada clase, la banda para rebalancear y cuántos meses de gastos guardas en efectivo. Capital las usa para
            comparar tu cartera con tu meta y marcar lo que está <strong>fuera de banda</strong> (en Resumen, Análisis y los hallazgos). No es una
            recomendación: las reglas son tuyas.
          </p>
          <ul aria-label="Lo que incluye">
            <li>Objetivo</li>
            <li>Horizonte</li>
            <li>Tolerancia al riesgo</li>
            <li>% meta por clase</li>
            <li>Banda de rebalanceo</li>
            <li>Meses de gastos en efectivo</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function Metas({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const { p } = datos.ctx;
  const suma = CLASES.reduce((s, c) => s.plus(n(p.metaAsignacion[c.id])), new Big(0));
  const escritas = suma.gt(0);
  const cuadra = suma.eq(1);
  return (
    <Panel
      titulo="Tus metas por clase"
      id="cap-t-metas"
      ancho
      extra={escritas ? <Estado tono={cuadra ? "ok" : "alerta"}>{cuadra ? "suman 100 %" : `suman ${pct(suma, 1)}`}</Estado> : <Estado tono="neutra">sin escribir</Estado>}
    >
      <form action={guardarParametros} className="cap-form" key={JSON.stringify([p.metaAsignacion, p.bandaRebalanceo, p.maxEmisor, p.metaFondo])}>
        <input type="hidden" name="seccion" value="asignacion" />
        <input type="hidden" name="volver" value="/capital/ips" />
        <input type="hidden" name="mes" value={mes} />
        <div className="cap-campos dos">
          {CLASES.map((c) => (
            <label className="cap-campo" key={c.id}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span className={`cap-muestra ${c.id}`} aria-hidden="true" />
                {c.nom} %
              </span>
              <input name={`meta.${c.id}`} defaultValue={n(p.metaAsignacion[c.id]).gt(0) ? aPct(p.metaAsignacion[c.id]) : ""} inputMode="decimal" placeholder={`Ej.: ${EJEMPLO_META[c.id]}`} />
            </label>
          ))}
        </div>
        <div className="cap-campos">
          <label className="cap-campo">
            Banda de rebalanceo (± puntos)
            <input name="bandaRebalanceo" defaultValue={n(p.bandaRebalanceo).gt(0) ? aPct(p.bandaRebalanceo) : ""} inputMode="decimal" placeholder="Ej.: 5" />
          </label>
          <label className="cap-campo">
            Máximo por emisor %
            <input name="maxEmisor" defaultValue={n(p.maxEmisor).gt(0) ? aPct(p.maxEmisor) : ""} inputMode="decimal" placeholder="Ej.: 25" />
          </label>
          <label className="cap-campo">
            Meses de gastos en efectivo
            <input name="metaFondo" defaultValue={n(p.metaFondo).gt(0) ? p.metaFondo : ""} inputMode="decimal" placeholder="Ej.: 6" />
          </label>
        </div>
        <p className="tenue chico" style={{ margin: 0 }}>
          Los valores en gris son solo ejemplos: no se guardan. «Meses de gastos en efectivo» es la meta del fondo de emergencia (efectivo + cuentas de ahorro).
        </p>
        <div className="cap-botones">
          <button className="boton chico" type="submit">
            Guardar metas
          </button>
        </div>
      </form>
    </Panel>
  );
}

export function VistaIps({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const ips = datos.ips ?? ipsVacia();
  const escritas = SECCIONES_IPS.filter(([k]) => ips[k]).length;
  return (
    <>
      <Explicacion />
      <Metas datos={datos} mes={mes} />
      <Panel
        titulo="Tu política por escrito"
        id="cap-t-ips"
        ancho
        extra={
          <Estado tono={ips.editadoPor === "mena" ? "ok" : "alerta"}>
            {ips.editadoPor === "mena" ? `✓ revisada${ips.revisadoEl ? ` el ${fechaCorta(ips.revisadoEl)}` : ""}` : "borrador"}
          </Estado>
        }
      >
        <p className="tenue chico" style={{ margin: "0 0 12px" }}>
          {escritas} de {SECCIONES_IPS.length} secciones escritas.{escritas ? "" : " Empieza por el objetivo y el horizonte: los ejemplos en gris te guían."}
        </p>
        <form action={guardarIps} className="cap-form" key={JSON.stringify(ips)}>
          <input type="hidden" name="mes" value={mes} />
          <input type="hidden" name="editadoPor" value={ips.editadoPor} />
          <input type="hidden" name="revisadoEl" value={ips.revisadoEl ?? ""} />
          <div className="cap-campos-ips">
            {SECCIONES_IPS.map(([k, l]) => (
              <label className="cap-campo" key={k}>
                {l}
                <textarea name={k} defaultValue={ips[k]} rows={2} maxLength={5000} placeholder={EJEMPLOS[k]} />
              </label>
            ))}
          </div>
          <div className="cap-botones">
            <button className="boton" type="submit" name="modo" value="revisada">
              Guardar y marcar como revisada
            </button>
            <button className="boton secundario" type="submit" name="modo" value="guardar">
              Guardar borrador
            </button>
          </div>
        </form>
      </Panel>
    </>
  );
}
