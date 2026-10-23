// Estado de resultados del mes: presupuestado, real, diferencia y % de cumplimiento, con barras.
// Server Component sin estado: recibe el cálculo ya hecho (lib/caja/resultados.ts) y solo lo dibuja.
// En el celular cada fila se apila (nombre y real arriba, barra, y lo demás en pequeño).

import Big from "big.js";
import Link from "next/link";
import { rd } from "@/lib/caja/formato";
import { anchoBarra, type Cifras, type EstadoResultados as Estado, type LineaResultado, type SeccionResultado } from "@/lib/caja/resultados";
import { AYUDA_TIPO_CATEGORIA, type TipoCategoria } from "@/lib/caja/tipos";
import { Ayuda } from "./Iconos";

/** Diferencia con color Y texto: «a favor» / «en contra» / «igual». */
export function Diferencia({ d, corto = false }: { d: string; corto?: boolean }) {
  const v = new Big(d);
  if (v.eq(0)) return <span className="pastilla igual">= {corto ? "igual" : "igual a lo planificado"}</span>;
  const favor = v.gt(0);
  return (
    <span className={`pastilla ${favor ? "sube" : "baja"}`}>
      <span aria-hidden="true">{favor ? "↑" : "↓"}</span>
      {rd(v.abs().toString())}
      <span className="caja-er-dif-texto"> {favor ? "a favor" : "en contra"}</span>
    </span>
  );
}

function Cumplimiento({ c }: { c: Cifras }) {
  return c.cumplimiento == null ? (
    <span className="tenue" title="Sin nada presupuestado: no hay con qué comparar">
      —
    </span>
  ) : (
    <span>{c.cumplimiento} %</span>
  );
}

/** Barra de lo real contra lo presupuestado (más lo programado que falta, en claro). Punteada si no hay presupuesto. */
export function Barra({ l, entrada }: { l: Pick<LineaResultado, "presupuestado" | "real" | "pendiente">; entrada: boolean }) {
  const p = new Big(l.presupuestado);
  const r = new Big(l.real);
  if (p.lte(0)) {
    return <span className="caja-er-barra sin-dato" role="img" aria-label={r.gt(0) ? "Sin presupuesto para comparar" : "Sin dato"} />;
  }
  const real = anchoBarra(l.real, l.presupuestado);
  const pend = Math.max(0, Math.min(100 - real, anchoBarra(l.pendiente, l.presupuestado)));
  // En gastos, pasarse es «en contra»; en ingresos y ahorro, pasarse es «a favor».
  const pasado = r.gt(p);
  const clase = pasado ? (entrada ? "favor" : "contra") : "";
  return (
    <span
      className={`caja-er-barra ${clase}`}
      role="img"
      aria-label={`Real ${rd(l.real)} de ${rd(l.presupuestado)} presupuestado${new Big(l.pendiente).gt(0) ? `; faltan ${rd(l.pendiente)} programados` : ""}`}
    >
      <span className="real" style={{ width: `${real}%` }} />
      {pend ? <span className="viene" style={{ left: `${real}%`, width: `${pend}%` }} /> : null}
    </span>
  );
}

const SIGNO: Record<TipoCategoria, string> = {
  ingreso: "",
  costo: "−",
  gasto: "−",
  gasto_financiero: "−",
  otro_ingreso: "+",
  otro_gasto: "−",
  ahorro_inversion: "−",
};

function Celdas({ c }: { c: Cifras }) {
  return (
    <>
      <td className="num mono caja-er-p" data-k="Presupuestado">
        {rd(c.presupuestado)}
      </td>
      <td className="num mono caja-er-r" data-k="Real">
        {rd(c.real)}
      </td>
      <td className="num caja-er-d" data-k="Diferencia">
        <Diferencia d={c.diferencia} corto />
      </td>
      <td className="num mono caja-er-c" data-k="Cumplimiento">
        <Cumplimiento c={c} />
      </td>
    </>
  );
}

function FilasSeccion({ s, conEnlaces }: { s: SeccionResultado; conEnlaces: boolean }) {
  const entrada = s.tipo === "ingreso" || s.tipo === "otro_ingreso" || s.tipo === "ahorro_inversion";
  return (
    <tbody className="caja-er-grupo">
      <tr className="caja-er-seccion">
        <th scope="row">
          <span className="caja-er-nombre">
            {SIGNO[s.tipo] ? <span className="caja-er-op" aria-hidden="true">{SIGNO[s.tipo]}</span> : null}
            {s.nombre}
            <Ayuda que={s.nombre.toLowerCase()}>{AYUDA_TIPO_CATEGORIA[s.tipo]}</Ayuda>
          </span>
        </th>
        <Celdas c={s} />
      </tr>
      {s.lineas.map((l) => (
        <tr key={l.clave} className={`caja-er-linea ${l.especial ? "especial" : ""}`}>
          <th scope="row">
            <span className="caja-er-nombre" title={l.especial ? undefined : `Fijos del mes ${rd(l.fijos)} + adicional ${rd(l.adicional)}`}>
              {l.nombre}
              {l.especial && l.clave.startsWith("__sin") ? <span className="etiqueta alerta">asígnale una categoría</span> : null}
            </span>
            <Barra l={l} entrada={entrada} />
            {new Big(l.pendiente).gt(0) ? <span className="caja-er-pendiente">faltan {rd(l.pendiente)} programados</span> : null}
          </th>
          <Celdas c={l} />
        </tr>
      ))}
      {!s.lineas.length ? (
        <tr className="caja-er-linea vacia">
          <th scope="row" colSpan={5}>
            <span className="tenue chico">
              Nada aquí.{" "}
              {conEnlaces ? <Link href={`/caja/ajustes#tipo-${s.tipo}`}>Agregar en {s.nombre.toLowerCase()}</Link> : null}
            </span>
          </th>
        </tr>
      ) : null}
    </tbody>
  );
}

function Subtotal({ nombre, c, clase = "", ayuda }: { nombre: string; c: Cifras; clase?: string; ayuda?: string }) {
  return (
    <tbody>
      <tr className={`caja-er-subtotal ${clase}`}>
        <th scope="row">
          <span className="caja-er-nombre">
            <span className="caja-er-op" aria-hidden="true">
              =
            </span>
            {nombre}
            {ayuda ? <Ayuda que={nombre.toLowerCase()}>{ayuda}</Ayuda> : null}
          </span>
        </th>
        <Celdas c={c} />
      </tr>
    </tbody>
  );
}

/** Mismo ancho de columnas en las dos tablas. */
function Columnas() {
  return (
    <colgroup>
      <col className="n" />
      <col />
      <col />
      <col className="d" />
      <col />
    </colgroup>
  );
}

export function TablaResultados({ e, conEnlaces = true }: { e: Estado; conEnlaces?: boolean }) {
  const s = e.secciones;
  return (
    <div className="caja-er-marco">
      <table className="tabla caja-er">
        <caption className="sr-solo">Estado de resultados: presupuestado, real, diferencia y porcentaje de cumplimiento, en RD$</caption>
        <Columnas />
        <thead>
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col" className="num">
              Presupuestado
            </th>
            <th scope="col" className="num">
              Real
            </th>
            <th scope="col" className="num">
              Diferencia
            </th>
            <th scope="col" className="num">
              % cumplido
            </th>
          </tr>
        </thead>
        <FilasSeccion s={s.ingreso} conEnlaces={conEnlaces} />
        <FilasSeccion s={s.costo} conEnlaces={conEnlaces} />
        <Subtotal nombre="Utilidad bruta" c={e.utilidadBruta} ayuda="Lo que te queda de tus ingresos después de pagar lo que te costó generarlos." />
        <FilasSeccion s={s.gasto} conEnlaces={conEnlaces} />
        <Subtotal nombre="Utilidad operativa" c={e.utilidadOperativa} ayuda="Lo que te queda después de tus gastos del día a día." />
        <FilasSeccion s={s.gasto_financiero} conEnlaces={conEnlaces} />
        <FilasSeccion s={s.otro_ingreso} conEnlaces={conEnlaces} />
        <FilasSeccion s={s.otro_gasto} conEnlaces={conEnlaces} />
        <Subtotal nombre="Utilidad neta" c={e.utilidadNeta} clase="neta" ayuda="Lo que de verdad te sobró (o te faltó) en el mes, después de todo." />
      </table>

      <h3 className="caja-er-destino-titulo">Destino de la utilidad: ahorro e inversión</h3>
      <table className="tabla caja-er">
        <caption className="sr-solo">Destino de la utilidad: ahorro e inversión y lo que te queda disponible, en RD$</caption>
        <Columnas />
        <thead className="sr-solo">
          <tr>
            <th scope="col">Concepto</th>
            <th scope="col">Presupuestado</th>
            <th scope="col">Real</th>
            <th scope="col">Diferencia</th>
            <th scope="col">% cumplido</th>
          </tr>
        </thead>
        <FilasSeccion s={s.ahorro_inversion} conEnlaces={conEnlaces} />
        <Subtotal nombre="Te queda disponible" c={e.disponible} clase="neta" ayuda="Tu utilidad neta menos lo que apartas para ahorro e inversión." />
      </table>
    </div>
  );
}
