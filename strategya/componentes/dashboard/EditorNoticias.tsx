"use client";

// Elegir «Mis noticias»: temas, medios y palabras clave, en una ventana. Se guarda en la base
// (personal.preferencias, clave «noticias»). Solo filtra titulares ya guardados; no busca en internet.

import { useActionState, useEffect, useRef } from "react";
import type { PrefNoticias } from "@/lib/dashboard/noticias";
import { type EstadoNoticias, guardarMisNoticias } from "./acciones";

const TEMAS = [
  { id: "mercado", nombre: "Mercados", ej: "bolsas, tasas, petróleo" },
  { id: "rd", nombre: "República Dominicana", ej: "economía local" },
  { id: "guerra", nombre: "Conflictos", ej: "guerras y tensiones" },
  { id: "instituciones", nombre: "Instituciones", ej: "Fed, BCE, FMI" },
] as const;

const INICIAL: EstadoNoticias = { ok: false, mensaje: null, vez: 0 };

export function EditorNoticias({ inicial, medios, vacio }: { inicial: PrefNoticias; medios: string[]; vacio: boolean }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [estado, accion, enviando] = useActionState(guardarMisNoticias, INICIAL);
  // Medios guardados que hoy no tienen titulares también se pueden desmarcar.
  const todos = [...new Set([...inicial.medios, ...medios])].sort((a, b) => a.localeCompare(b, "es"));

  useEffect(() => {
    if (estado.ok && estado.vez) dialogo.current?.close();
  }, [estado]);

  return (
    <>
      <button
        type="button"
        className={vacio ? "boton dash-boton-grande" : "boton secundario dash-boton-chico"}
        onClick={() => dialogo.current?.showModal()}
      >
        {vacio ? "Elegir mis noticias" : "Cambiar filtro"}
      </button>
      <dialog ref={dialogo} className="dash-dialogo" aria-labelledby="dlg-noticias-titulo">
        <form action={accion} className="dash-form">
          <div className="dash-dialogo-cab">
            <h2 id="dlg-noticias-titulo">Mis noticias</h2>
            <p>Marca lo que te interesa. Si llenas varias partes, el titular debe cumplir todas (por ejemplo: de El Dinero y con «dólar»).</p>
          </div>

          <fieldset>
            <legend>Temas</legend>
            <div className="dash-chips">
              {TEMAS.map((t) => (
                <label key={t.id} className="dash-chip">
                  <input type="checkbox" name="categoria" value={t.id} defaultChecked={inicial.categorias.includes(t.id)} />
                  <span>
                    {t.nombre}
                    <small>{t.ej}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Medios</legend>
            {todos.length ? (
              <div className="dash-chips dash-chips-medios">
                {todos.map((m) => (
                  <label key={m} className="dash-chip">
                    <input type="checkbox" name="medio" value={m} defaultChecked={inicial.medios.includes(m)} />
                    <span>{m}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="tenue chico">Todavía no hay titulares guardados de ningún medio. Llegan solos cada 10 a 30 minutos.</p>
            )}
            <p className="tenue chico">Sin marcar ninguno = todos los medios.</p>
          </fieldset>

          <label className="dash-campo">
            <span>Palabras clave</span>
            <input
              name="palabras"
              type="text"
              defaultValue={inicial.palabras.join(", ")}
              placeholder="Ej.: petróleo, Banco Central, Popular"
              autoComplete="off"
              aria-describedby="dlg-noticias-ayuda"
            />
            <small id="dlg-noticias-ayuda">Sepáralas con comas. No importan mayúsculas ni tildes. Basta que una aparezca en el titular.</small>
          </label>

          {estado.mensaje && !estado.ok ? (
            <p className="dash-error" role="alert">
              {estado.mensaje}
            </p>
          ) : null}

          <div className="dash-dialogo-acciones">
            <button type="button" className="boton secundario" onClick={() => dialogo.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="boton dash-boton-grande" disabled={enviando}>
              {enviando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </form>
      </dialog>
      <span className="sr-solo" role="status">
        {estado.ok ? estado.mensaje : ""}
      </span>
    </>
  );
}
