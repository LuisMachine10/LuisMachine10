// Matriz de riesgo 3×3 (impacto × probabilidad) con los 4 riesgos de Mena y una tarjeta por riesgo:
// qué se evalúa, el dato que lo dispara (con su fuente) y qué se puede hacer. Color siempre con texto.

import Link from "next/link";
import { gravedad, matrizRiesgo, NIVELES, NOMBRE_NIVEL, type RiesgoMatriz, tonoGravedad } from "@/lib/capital/matriz";
import type { Contexto } from "@/lib/capital/posicion";

const CORTO: Record<RiesgoMatriz["id"], string> = { liquidez: "Liquidez", concentracion: "Concentración", dolar: "Dólar", presupuesto: "Presupuesto y deuda" };
const NUM: Record<RiesgoMatriz["id"], string> = { liquidez: "1", concentracion: "2", dolar: "3", presupuesto: "4" };
const TEXTO_TONO = { alto: "atención", medio: "vigilar", bajo: "en control" } as const;

export function MatrizRiesgo({ ctx, detalle = true, mes }: { ctx: Contexto; detalle?: boolean; mes?: string }) {
  const riesgos = matrizRiesgo(ctx);
  const filas = [...NIVELES].reverse(); // impacto alto arriba
  const ordenados = [...riesgos].sort((a, b) => gravedad(b) - gravedad(a));
  return (
    <div className="mz">
      <div className="mz-envoltura">
        <div className="mz-eje-y" aria-hidden="true">
          Impacto →
        </div>
        <table className="mz-tabla">
          <caption className="sr-solo">Matriz de riesgo: filas = impacto (alto arriba), columnas = probabilidad (baja a la izquierda).</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-solo">Impacto</span>
              </th>
              {NIVELES.map((p) => (
                <th scope="col" key={p}>
                  {NOMBRE_NIVEL[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((i) => (
              <tr key={i}>
                <th scope="row">{NOMBRE_NIVEL[i]}</th>
                {NIVELES.map((p) => {
                  const aqui = riesgos.filter((r) => r.impacto === i && r.probabilidad === p);
                  const tono = tonoGravedad({ impacto: i, probabilidad: p });
                  return (
                    <td key={p} className={`mz-celda ${tono}`}>
                      <span className="sr-solo">
                        Impacto {NOMBRE_NIVEL[i].toLowerCase()}, probabilidad {NOMBRE_NIVEL[p].toLowerCase()}:
                      </span>
                      {aqui.map((r) => (
                        <span key={r.id} className={`mz-ficha${r.sinDato ? " sin-dato" : ""}`} title={r.titulo}>
                          <span className="mz-num" aria-hidden="true">
                            {NUM[r.id]}
                          </span>
                          {CORTO[r.id]}
                        </span>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mz-eje-x" aria-hidden="true">
          Probabilidad →
        </div>
      </div>
      <ul className="mz-leyenda chico" aria-label="Cómo leer los colores">
        <li>
          <span className="mz-punto alto" /> Rojo: atención
        </li>
        <li>
          <span className="mz-punto medio" /> Ámbar: vigilar
        </li>
        <li>
          <span className="mz-punto bajo" /> Verde: en control
        </li>
        <li>
          <span className="mz-punto sin-dato" /> Punteado: falta un dato
        </li>
      </ul>
      {detalle ? (
        <ol className="mz-lista">
          {ordenados.map((r) => {
            const t = tonoGravedad(r);
            return (
              <li key={r.id} className={`mz-item ${t}`}>
                <div className="mz-item-cabeza">
                  <span className="mz-num" aria-hidden="true">
                    {NUM[r.id]}
                  </span>
                  <strong>{r.titulo}</strong>
                  <span className={`etiqueta mz-etiqueta ${t}`}>
                    {TEXTO_TONO[t]} · impacto {NOMBRE_NIVEL[r.impacto].toLowerCase()}, probabilidad {NOMBRE_NIVEL[r.probabilidad].toLowerCase()}
                  </span>
                </div>
                <p className="mz-que">{r.que}</p>
                <p className="mz-dato">
                  {r.sinDato ? <span className="cap-sin-dato">sin dato</span> : null} {r.dato} <span className="sello">Fuente: {r.fuente}</span>
                </p>
                <p className="mz-hacer">
                  <strong>Qué puedes hacer:</strong> {r.hacer}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
      <p className="tenue chico mz-pie">
        Los límites se cambian en <Link href={`/capital/ajustes${mes ? `?mes=${mes}` : ""}`}>Ajustes</Link>. Describe tus números contra tus reglas: no es una recomendación de inversión.
      </p>
    </div>
  );
}
