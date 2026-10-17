// Asignación por las 4 clases contra la meta de la política: donut de hoy + barra por clase con la
// marca de la meta y su estado de banda. Descriptivo: es aritmética sobre la política de Mena, no una
// recomendación.

import Big from "big.js";
import Link from "next/link";
import { n } from "@/lib/capital/decimal";
import { compacto, num, pct, pp, sg, type Tono } from "@/lib/capital/formato";
import { posicion } from "@/lib/capital/posicion";
import { type EstadoBanda, rebalanceo } from "@/lib/capital/riesgo";
import type { Clase } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { Barra, Donut } from "./Graficos";
import { Estado, Mas, Panel, SinDatos } from "./Piezas";
import { SelloFx } from "./Sellos";

export const COLOR_CLASE: Record<Clase, string> = {
  efectivo: "var(--cap-efectivo)",
  ahorros: "var(--cap-ahorros)",
  rentafija: "var(--cap-rentafija)",
  rentavariable: "var(--cap-rentavariable)",
};

const TONO_BANDA: Record<EstadoBanda, Tono> = { "en banda": "ok", "sobre meta": "alerta", "bajo meta": "alerta" };

export function PanelAsignacion({ datos, titulo = "Asignación contra tu meta", id = "cap-t-asignacion", detalle = false }: { datos: DatosCapital; titulo?: string; id?: string; detalle?: boolean }) {
  const { ctx, ahora } = datos;
  const pos = posicion(ctx);
  const filas = rebalanceo(ctx);
  const hayMeta = filas.some((f) => f.obj.gt(0));
  const banda = n(ctx.p.bandaRebalanceo).gt(0) ? n(ctx.p.bandaRebalanceo) : null;
  const fuera = filas.filter((f) => f.estado !== "en banda" && hayMeta).length;
  const extra = hayMeta ? (
    <Estado tono={fuera ? "alerta" : "ok"}>{fuera ? `${fuera} fuera de banda` : "todo en banda"}</Estado>
  ) : (
    <Estado tono="neutra">sin meta escrita</Estado>
  );

  if (pos.total.lte(0)) {
    return (
      <Panel titulo={titulo} id={id} extra={extra}>
        <SinDatos accion={{ href: "/capital/cartera", texto: "Agregar un instrumento" }}>Todavía no hay instrumentos valorados para repartir en las 4 clases.</SinDatos>
      </Panel>
    );
  }

  return (
    <Panel titulo={titulo} id={id} extra={extra}>
      <div className="cap-asignacion">
        <Donut
          porciones={filas.map((f) => ({ id: f.id, nombre: f.nom, pct: f.pctA, color: COLOR_CLASE[f.id] }))}
          centro={compacto(pos.total)}
          rotulo="RD$ en 4 clases"
          etiqueta={`Asignación de hoy: ${filas.map((f) => `${f.nom} ${pct(f.pctA, 0)}`).join(", ")}`}
        />
        <ul className="cap-clases">
          {filas.map((f) => (
            <li key={f.id} className="cap-clase">
              <div className="cap-clase-fila">
                <span className="nombre">
                  <span className={`cap-muestra ${f.id}`} aria-hidden="true" />
                  {f.nom}
                </span>
                <span className="cifras">
                  {pct(f.pctA, 1)}
                  {hayMeta ? <span className="tenue"> / {pct(f.obj, 0)}</span> : null}
                </span>
              </div>
              <Barra pct={f.pctA} meta={hayMeta ? f.obj : null} clase={f.id} />
              <div className="cap-clase-pie">
                <span className="mono">RD$ {num(f.actual)}</span>
                {hayMeta ? (
                  <>
                    <Estado tono={TONO_BANDA[f.estado]}>
                      {f.estado === "en banda" ? "en banda" : `${f.estado} ${pp(f.dpp, 1)}`}
                    </Estado>
                    {detalle && !f.dif.eq(0) ? <span className="mono">{sg(f.dif)} para la meta</span> : null}
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div style={{ marginTop: 14 }}>
        <SelloFx fx={ctx.mercado.fx.USD} moneda="USD" ahora={ahora} hoy={ctx.hoy} />
      </div>
      <Mas titulo="Cómo leerlo">
        <p className="cap-nota">
          La marca blanca en cada barra es tu meta de la política; la banda es ±{banda ? pp(banda, 0) : `${pp(new Big("0.02"), 0)} (sin banda escrita)`}.
          {detalle ? " «Para la meta» es la diferencia en RD$ entre la meta y lo que hay hoy (+ falta, − sobra)." : ""} Es aritmética sobre tu política, no
          una recomendación. {hayMeta ? "" : <Link href="/capital/ips">Escribe tus metas por clase en Política.</Link>}
        </p>
      </Mas>
    </Panel>
  );
}
