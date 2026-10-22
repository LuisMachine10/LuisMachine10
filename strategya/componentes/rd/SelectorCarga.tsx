"use client";

// «¿Qué quieres agregar?»: tarjetas para elegir el tipo de dato y, debajo, solo ese formulario (una sola
// acción principal a la vista). Un enlace /carga#t-carga-fondo abre directo el de fondos.

import { useEffect, useState } from "react";

export interface OpcionCarga {
  id: string;
  titulo: string;
  ayuda: string;
  icono: string;
  contenido: React.ReactNode;
}

export function SelectorCarga({ opciones }: { opciones: OpcionCarga[] }) {
  const [activa, setActiva] = useState(opciones[0]?.id ?? "");

  useEffect(() => {
    const elegir = () => {
      const h = window.location.hash.replace(/^#(t-carga-)?/, "");
      if (opciones.some((o) => o.id === h)) setActiva(h);
    };
    elegir();
    window.addEventListener("hashchange", elegir);
    return () => window.removeEventListener("hashchange", elegir);
  }, [opciones]);

  const actual = opciones.find((o) => o.id === activa) ?? opciones[0];

  return (
    <div className="rd-carga">
      <fieldset className="rd-carga-opciones">
        <legend className="rd-carga-pregunta">¿Qué quieres agregar?</legend>
        {opciones.map((o) => (
          <label key={o.id} className="rd-carga-opcion" data-activa={o.id === actual.id ? "si" : undefined}>
            <input type="radio" name="tipo-carga" value={o.id} checked={o.id === actual.id} onChange={() => setActiva(o.id)} className="sr-solo" />
            <span className="rd-cabecera-icono" aria-hidden="true">
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={o.icono} />
              </svg>
            </span>
            <span className="rd-carga-opcion-textos">
              <span className="rd-carga-opcion-titulo">{o.titulo}</span>
              <span className="rd-carga-opcion-ayuda">{o.ayuda}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <section className="panel rd-panel rd-carga-form" id={`t-carga-${actual.id}`} aria-labelledby={`t-carga-${actual.id}-h`}>
        <div className="panel-cabecera">
          <div>
            <h2 className="panel-titulo" id={`t-carga-${actual.id}-h`}>
              {actual.titulo}
            </h2>
            <p className="rd-carga-form-ayuda">{actual.ayuda}</p>
          </div>
        </div>
        <div className="panel-cuerpo">{actual.contenido}</div>
      </section>
    </div>
  );
}
