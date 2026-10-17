"use client";

// Importación del archivo de Mena Capital en dos pasos: subir y revisar (validación completa en el
// servidor) → confirmar (se valida otra vez y se reemplaza en una sola transacción).

import Link from "next/link";
import { useActionState } from "react";
import { type EstadoImportacion, importarCapital } from "@/app/capital/acciones";
import { nombreClase } from "@/lib/capital/tipos";

const INICIAL: EstadoImportacion = { paso: "inicio", analisis: null, contenido: null, nombre: null, error: null, resultado: null };

const NOMBRES: Record<string, string> = {
  parametros: "Parámetros",
  activos: "Instrumentos",
  transacciones: "Transacciones",
  cierres: "Cierres mensuales",
  ips: "Política de inversión",
};

export function Importador() {
  const [estado, enviar, enviando] = useActionState(importarCapital, INICIAL);
  const a = estado.analisis;
  const r = a?.resumen;

  return (
    <div className="cap-form">
      <form action={enviar} className="cap-form">
        <input type="hidden" name="accion" value="revisar" />
        <label className="cap-campo">
          Archivo de Mena Capital (.json)
          <input type="file" name="archivo" accept="application/json,.json" required />
        </label>
        <div className="cap-botones">
          <button className="boton secundario" type="submit" disabled={enviando}>
            {enviando ? "Procesando…" : "Revisar el archivo"}
          </button>
        </div>
      </form>

      {estado.error ? (
        <p className="cap-aviso error" role="alert">
          ✕ {estado.error}
        </p>
      ) : null}

      {a && !a.ok ? (
        <div className="cap-aviso error" role="alert">
          <div style={{ minWidth: 0 }}>
            <strong>El archivo tiene {a.errores.length} problema(s). No se importará nada hasta corregirlos:</strong>
            <ul>
              {a.errores.map((e) => (
                <li key={e} className="chico" style={{ overflowWrap: "anywhere" }}>
                  {e}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {a && r ? (
        <section aria-labelledby="cap-t-revision">
          <h3 className="cap-rotulo" id="cap-t-revision">
            {estado.paso === "hecho" ? "Importado" : "Lo que se va a importar"}
            {estado.nombre ? ` · ${estado.nombre}` : ""}
          </h3>
          <div className="desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Sección</th>
                  <th scope="col">Contenido</th>
                  <th scope="col">Efecto</th>
                </tr>
              </thead>
              <tbody>
                {r.parametros ? (
                  <tr>
                    <th scope="row">{NOMBRES.parametros}</th>
                    <td>
                      {r.parametros.partidas} partidas de presupuesto · {r.parametros.tarjetas} tarjeta(s) · {r.parametros.escenarios} escenario(s)
                      {r.parametros.fxManual.length ? ` · tipo de cambio manual ${r.parametros.fxManual.join(" y ")}` : " · sin tipo de cambio manual"}
                    </td>
                    <td>reemplaza</td>
                  </tr>
                ) : null}
                {r.activos ? (
                  <tr>
                    <th scope="row">{NOMBRES.activos}</th>
                    <td>
                      {r.activos.total}:{" "}
                      {Object.entries(r.activos.porClase)
                        .map(([c, k]) => `${k} ${nombreClase(c).toLowerCase()}`)
                        .join(", ")}
                      {r.activos.conSimbolo.length ? ` · símbolos ${r.activos.conSimbolo.join(", ")}` : ""}
                    </td>
                    <td>reemplaza todos</td>
                  </tr>
                ) : null}
                {r.transacciones ? (
                  <tr>
                    <th scope="row">{NOMBRES.transacciones}</th>
                    <td>
                      {r.transacciones.total}
                      {r.transacciones.desde ? ` · del ${r.transacciones.desde} al ${r.transacciones.hasta}` : ""}
                    </td>
                    <td>reemplaza todas</td>
                  </tr>
                ) : null}
                {r.cierres ? (
                  <tr>
                    <th scope="row">{NOMBRES.cierres}</th>
                    <td>
                      {r.cierres.total}
                      {r.cierres.desde ? ` · ${r.cierres.desde} a ${r.cierres.hasta}` : ""} · {r.cierres.cerrados} cerrados · {r.cierres.conFoto} con foto
                      de patrimonio
                    </td>
                    <td>reemplaza todos</td>
                  </tr>
                ) : null}
                {r.ips ? (
                  <tr>
                    <th scope="row">{NOMBRES.ips}</th>
                    <td>
                      {r.ips.secciones} de 8 secciones escritas · {r.ips.editadoPor === "mena" ? "revisada" : "borrador"}
                    </td>
                    <td>reemplaza</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="cap-nota">Las secciones que no vienen en el archivo no se tocan.</p>
          {a.avisos.length ? (
            <details className="cap-mas">
              <summary>Avisos ({a.avisos.length})</summary>
              <ul className="chico" style={{ paddingLeft: 18, overflowWrap: "anywhere" }}>
                {a.avisos.map((x) => (
                  <li key={x} className="chico">
                    {x}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {a?.ok && estado.paso === "revision" && estado.contenido ? (
        <form action={enviar} className="cap-botones">
          <input type="hidden" name="accion" value="confirmar" />
          <input type="hidden" name="contenido" value={estado.contenido} />
          <input type="hidden" name="nombre" value={estado.nombre ?? ""} />
          <button className="boton" type="submit" disabled={enviando}>
            {enviando ? "Importando…" : "Confirmar e importar"}
          </button>
        </form>
      ) : null}

      {estado.paso === "hecho" && estado.resultado ? (
        <p className="cap-aviso ok" role="status">
          ✓ Importado en una sola transacción:{" "}
          {Object.entries(estado.resultado)
            .map(([k, v]) => `${NOMBRES[k] ?? k} ${v}`)
            .join(" · ")}
          . <Link href="/capital">Ver el resumen</Link>
        </p>
      ) : null}
    </div>
  );
}
