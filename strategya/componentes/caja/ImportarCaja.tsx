"use client";

// Importar el JSON del artefacto en dos pasos: 1) revisar (no escribe nada), 2) reemplazar todo.

import { startTransition, useActionState, useState } from "react";
import { type EstadoImportacion, importarCaja } from "@/app/caja/acciones";

const INICIAL: EstadoImportacion = { fase: "inicio", resumen: null, errores: [], advertencias: [], mensaje: null };
const LIMITE = 900_000; // las server actions aceptan hasta 1 MB por defecto

export function ImportarCaja({ hayDatos }: { hayDatos: boolean }) {
  const [estado, enviar, pendiente] = useActionState(importarCaja, INICIAL);
  const [texto, setTexto] = useState<string>("");
  const [archivo, setArchivo] = useState<string | null>(null);
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  const mandar = (confirmar: boolean) => {
    const f = new FormData();
    f.set("texto", texto);
    if (confirmar) f.set("confirmar", "si");
    startTransition(() => enviar(f));
  };

  const r = estado.resumen;
  return (
    <div className="caja-form">
      <label>
        Archivo JSON exportado del artefacto «Calendario de Caja»
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (e) => {
            const a = e.target.files?.[0];
            setErrorLocal(null);
            if (!a) return;
            if (a.size > LIMITE) {
              setErrorLocal(`El archivo pesa ${Math.round(a.size / 1024)} KB; el límite actual es ${Math.round(LIMITE / 1024)} KB.`);
              return;
            }
            setArchivo(a.name);
            setTexto(await a.text());
          }}
        />
      </label>
      <details className="caja-desplegable">
        <summary>…o pega el JSON aquí</summary>
        <div className="caja-form">
          <label className="sr-solo" htmlFor="json-caja">
            JSON del artefacto
          </label>
          <textarea id="json-caja" rows={6} className="mono" value={texto} onChange={(e) => (setArchivo(null), setTexto(e.target.value))} />
        </div>
      </details>
      {errorLocal ? (
        <p className="caja-mensaje error" role="alert">
          {errorLocal}
        </p>
      ) : null}
      <div className="caja-acciones">
        <button type="button" className="caja-boton" disabled={!texto || pendiente} onClick={() => mandar(false)}>
          {pendiente && estado.fase !== "revisado" ? "Revisando…" : "Revisar"}
        </button>
        {archivo ? <span className="chico tenue">{archivo}</span> : null}
      </div>

      <div aria-live="polite">
        {estado.errores.length ? (
          <div role="alert">
            <p className="caja-mensaje error">No se puede importar: hay {estado.errores.length} error(es). No se cambió nada.</p>
            <ul className="caja-avisos caja-errores">
              {estado.errores.slice(0, 50).map((e) => (
                <li key={e}>{e}</li>
              ))}
              {estado.errores.length > 50 ? <li>… y {estado.errores.length - 50} más.</li> : null}
            </ul>
          </div>
        ) : null}

        {r && (estado.fase === "revisado" || estado.fase === "importado") ? (
          <div className="caja-form">
            <h2 className="panel-titulo">{estado.fase === "importado" ? "Importado" : "Esto es lo que trae el archivo"}</h2>
            <table className="tabla">
              <tbody>
                <tr>
                  <th scope="row">Inicio de la simulación</th>
                  <td className="num">{r.inicio}</td>
                </tr>
                <tr>
                  <th scope="row">Días con datos</th>
                  <td className="num">{r.primerDia ? `${r.primerDia} → ${r.ultimoDia}` : "ninguno"}</td>
                </tr>
                {(
                  [
                    ["Cuentas", r.cuentas],
                    ["Categorías", r.categorias],
                    ["Recurrentes", r.recurrentes],
                    ["Movimientos registrados", r.movimientos],
                    ["Recurrentes omitidos", r.omitidos],
                    ["Saldos reales (cuadres)", r.saldos],
                    ["Notas del día", r.notas],
                  ] as const
                ).map(([n, v]) => (
                  <tr key={n}>
                    <th scope="row">{n}</th>
                    <td className="num">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {estado.advertencias.length ? (
              <>
                <p className="chico">Avisos ({estado.advertencias.length}): se importa igual.</p>
                <ul className="caja-avisos">
                  {estado.advertencias.slice(0, 50).map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                  {estado.advertencias.length > 50 ? <li>… y {estado.advertencias.length - 50} más.</li> : null}
                </ul>
              </>
            ) : null}
            {estado.fase === "revisado" ? (
              <div className="caja-acciones">
                <button type="button" className="caja-boton peligro" disabled={pendiente} onClick={() => mandar(true)}>
                  {pendiente ? "Importando…" : hayDatos ? "Reemplazar todo con este archivo" : "Importar"}
                </button>
                {hayDatos ? <span className="chico baja">Borra todo lo que hay hoy en tu Presupuesto y pone esto.</span> : null}
              </div>
            ) : (
              <p className="caja-mensaje ok" role="status">
                {estado.mensaje}
              </p>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
