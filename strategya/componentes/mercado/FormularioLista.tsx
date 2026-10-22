"use client";

// Formulario «Agregar a mi lista»: etiqueta visible, ejemplo en el campo y error que dice cómo arreglarlo.
// El mensaje va debajo de la fila de campos, así nada se mueve al escribir.
import { useActionState, useEffect, useRef } from "react";
import { agregarALista, type EstadoFormularioLista } from "@/app/mercado/acciones";

export function FormularioLista({ lleno }: { lleno: boolean }) {
  const [estado, enviar, enviando] = useActionState<EstadoFormularioLista, FormData>(agregarALista, {});
  const form = useRef<HTMLFormElement>(null);
  const simbolo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (estado.ok) form.current?.reset();
    if (estado.error) simbolo.current?.focus();
  }, [estado.vez, estado.ok, estado.error]);

  return (
    <form ref={form} action={enviar} className="ml-form" noValidate>
      <div className="ml-form-fila">
        <label className="ml-campo ml-campo-simbolo">
          <span>Símbolo</span>
          <input
            ref={simbolo}
            name="simbolo"
            key={`s-${estado.vez ?? 0}`}
            defaultValue={estado.error ? estado.simbolo : ""}
            placeholder="Ej.: AAPL"
            maxLength={8}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            required
            aria-invalid={estado.error ? true : undefined}
            aria-describedby="ml-form-mensaje"
            disabled={lleno}
          />
        </label>
        <label className="ml-campo ml-campo-nota">
          <span>
            Nota <span className="tenue">(opcional)</span>
          </span>
          <input
            name="nota"
            key={`n-${estado.vez ?? 0}`}
            defaultValue={estado.error ? estado.nota : ""}
            placeholder="Ej.: comprar si baja de 200"
            maxLength={140}
            autoComplete="off"
            disabled={lleno}
          />
        </label>
        <button type="submit" className="boton ml-boton-agregar" disabled={enviando || lleno}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {enviando ? "Agregando…" : "Agregar a mi lista"}
        </button>
      </div>
      <p id="ml-form-mensaje" className={`ml-form-mensaje${estado.error ? " es-error" : estado.ok ? " es-ok" : ""}`} aria-live="polite">
        {lleno
          ? "Tu lista llegó al máximo de 40 símbolos: quita uno para agregar otro."
          : (estado.error ?? estado.ok ?? "Acciones y ETF de la bolsa de EE. UU. No hace falta ninguna cuenta: solo el símbolo.")}
      </p>
    </form>
  );
}
