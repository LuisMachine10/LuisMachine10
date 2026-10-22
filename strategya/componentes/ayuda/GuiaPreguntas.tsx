"use client";
import "@/estilos/ayuda.css";
import "@/estilos/dashboard.css";
// Guía por preguntas con buscador simple (sin tildes ni mayúsculas). Sin JavaScript se ve todo.

import Link from "next/link";
import { useMemo, useState } from "react";
import type { GrupoGuia } from "./guia";

function plano(t: string): string {
  return t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es");
}

export function GuiaPreguntas({ grupos }: { grupos: GrupoGuia[] }) {
  const [q, setQ] = useState("");
  const termino = plano(q.trim());
  const filtrados = useMemo(() => {
    if (!termino) return grupos;
    const palabras = termino.split(/\s+/);
    return grupos
      .map((g) => ({
        ...g,
        preguntas: g.preguntas.filter((x) => {
          const t = plano(`${g.pantalla} ${x.p} ${x.r}`);
          return palabras.every((w) => t.includes(w));
        }),
      }))
      .filter((g) => g.preguntas.length);
  }, [grupos, termino]);
  const total = filtrados.reduce((n, g) => n + g.preguntas.length, 0);

  return (
    <div className="guia">
      <div className="guia-buscar">
        <label htmlFor="guia-q">Busca tu duda</label>
        <input
          id="guia-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ej.: mover una tarjeta, colchón, dato viejo"
          autoComplete="off"
          aria-describedby="guia-conteo"
        />
        <span id="guia-conteo" className="tenue chico" role="status">
          {termino ? (total ? `${total} ${total === 1 ? "respuesta" : "respuestas"}` : "Sin resultados") : ""}
        </span>
      </div>

      {!termino ? (
        <nav className="guia-indice" aria-label="Ir a una pantalla">
          {grupos.map((g) => (
            <a key={g.id} href={`#guia-${g.id}`}>
              {g.pantalla}
            </a>
          ))}
        </nav>
      ) : null}

      {total === 0 ? (
        <div className="dash-w-vacio guia-vacio">
          <p className="dash-guia-titulo">No encontramos «{q.trim()}»</p>
          <p className="dash-w-motivo">Prueba con otra palabra (por ejemplo «dólar», «alerta» o «tarjeta») o mira las preguntas por pantalla.</p>
          <button type="button" className="boton secundario dash-boton-chico" onClick={() => setQ("")}>
            Ver todas las preguntas
          </button>
        </div>
      ) : (
        filtrados.map((g) => (
          <section key={g.id} id={`guia-${g.id}`} className="guia-grupo" aria-labelledby={`guia-t-${g.id}`}>
            <div className="guia-grupo-cab">
              <h2 id={`guia-t-${g.id}`}>{g.pantalla}</h2>
              {g.href ? (
                <Link href={g.href} className="dash-w-enlace">
                  Abrir {g.pantalla} <span aria-hidden="true">→</span>
                </Link>
              ) : null}
            </div>
            <div className="ayuda-preguntas">
              {g.preguntas.map((x) => (
                <details key={x.p} open={Boolean(termino)}>
                  <summary>{x.p}</summary>
                  <p>{x.r}</p>
                </details>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
