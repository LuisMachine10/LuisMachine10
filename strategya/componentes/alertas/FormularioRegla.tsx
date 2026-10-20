"use client";

import { useActionState, useRef, useState } from "react";
import { type EstadoRegla, guardarRegla } from "./acciones";

export interface DatosRegla {
  id: number;
  tipo: "cambio_pct_dia" | "nivel_sobre" | "nivel_bajo" | "cualquier_cambio";
  umbral: string | null;
  activa: boolean;
  nota: string | null;
  serie: string;
  tipoTexto: string;
  unidad: string;
}

/** Cómo se dice cada tipo de regla en palabras de la calle. */
const FRASE: Readonly<Record<DatosRegla["tipo"], string>> = {
  cambio_pct_dia: "Si se mueve más de",
  nivel_sobre: "Si sube por encima de",
  nivel_bajo: "Si baja de",
  cualquier_cambio: "Con cualquier cambio",
};

const EJEMPLO: Readonly<Record<DatosRegla["tipo"], string>> = {
  cambio_pct_dia: "Ej.: 2",
  nivel_sobre: "Ej.: 63.50",
  nivel_bajo: "Ej.: 58.00",
  cualquier_cambio: "",
};

/** Una regla de alerta: interruptor (se guarda al tocarlo), umbral y nota. */
export function FormularioRegla({ r }: { r: DatosRegla }) {
  const [sucio, setSucio] = useState(false);
  const [activa, setActiva] = useState(r.activa);
  const guardada = useRef(r.activa);
  const formRef = useRef<HTMLFormElement>(null);
  const [estado, accion, enviando] = useActionState<EstadoRegla, FormData>(async (previo, form) => {
    const res = await guardarRegla(previo, form);
    if (res.ok) {
      setSucio(false);
      guardada.current = form.get("activa") === "on";
    } else {
      setActiva(guardada.current); // si no se guardó, el interruptor vuelve a como está en la base
    }
    return res;
  }, { ok: null, mensaje: null });
  const base = `regla-${r.id}`;
  const unidad = r.tipo === "cambio_pct_dia" ? "% en el día" : r.unidad;
  const conUmbral = r.tipo !== "cualquier_cambio";

  return (
    <form
      ref={formRef}
      action={accion}
      className={`regla${activa ? "" : " apagada"}`}
      aria-labelledby={`${base}-t`}
      onChange={(e) => {
        if ((e.target as unknown as HTMLInputElement).name !== "activa") setSucio(true);
      }}
    >
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="tipo" value={r.tipo} />
      <div className="regla-fila">
        <label className="interruptor" title={activa ? "Encendida: te avisa" : "Apagada: no avisa"}>
          <input
            type="checkbox"
            role="switch"
            name="activa"
            checked={activa}
            aria-checked={activa}
            aria-describedby={estado.mensaje ? `${base}-m` : undefined}
            onChange={(e) => {
              setActiva(e.target.checked);
              // El interruptor guarda al instante; el umbral y la nota se guardan con el botón.
              queueMicrotask(() => formRef.current?.requestSubmit());
            }}
          />
          <span className="interruptor-pista" aria-hidden="true" />
          <span className="sr-solo">
            Alerta de {r.serie}: {r.tipoTexto}
          </span>
        </label>
        <div className="regla-texto">
          <span className="regla-frase" id={`${base}-t`} title={r.tipoTexto}>
            {FRASE[r.tipo]}
          </span>
          {conUmbral ? null : <span className="chico tenue">Te avisa si cambia, aunque sea un poco.</span>}
        </div>
        {conUmbral ? (
          <label className="campo-umbral">
            <span className="sr-solo">
              Umbral de {r.serie} ({r.tipoTexto}), en {unidad}
            </span>
            <input
              name="umbral"
              defaultValue={r.umbral ?? ""}
              inputMode="decimal"
              autoComplete="off"
              required
              placeholder={EJEMPLO[r.tipo]}
              pattern="[0-9][0-9,]*(\.[0-9]+)?"
              title="Solo números, con punto para los decimales. Ej.: 63.50"
              className="mono"
              aria-invalid={estado.ok === false ? true : undefined}
              aria-describedby={estado.mensaje ? `${base}-m` : undefined}
            />
            <span className="unidad">{unidad}</span>
          </label>
        ) : null}
      </div>

      <details className="regla-nota">
        <summary className="chico">
          {r.nota ? (
            <>
              <span className="regla-nota-rotulo">Nota:</span> <span className="regla-nota-vista">{r.nota}</span>
            </>
          ) : (
            "Agregar una nota"
          )}
        </summary>
        <label className="campo-nota chico">
          <span className="sr-solo">Nota para la alerta de {r.serie}</span>
          <textarea name="nota" defaultValue={r.nota ?? ""} rows={2} maxLength={300} placeholder="Ej.: revisar si pasa de este nivel antes de la reunión" />
        </label>
      </details>

      {sucio || enviando || estado.mensaje ? (
        <div className="regla-pie">
          {sucio || enviando ? (
            <button type="submit" className="boton" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar cambios"}
            </button>
          ) : null}
          {estado.mensaje ? (
            <span id={`${base}-m`} role="status" className={`chico ${estado.ok ? "sube" : "baja"}`}>
              {estado.ok ? "✓ " : "✕ "}
              {estado.mensaje}
            </span>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
