// Tarjeta de un punto del globo: qué es, sus cifras (cada una con su sello de fuente) y sus enlaces.
// Sin estado: la usan el visor (cliente) y la lista accesible.

import { SelloFuente } from "@/componentes/SelloFuente";
import type { PuntoGlobo } from "@/lib/globo/capas";

export function TarjetaPunto({ punto, ahora, encabezado = "h3" }: { punto: PuntoGlobo; ahora: Date; encabezado?: "h3" | "h4" }) {
  const Titulo = encabezado;
  return (
    <article className={`globo-tarjeta-punto tono-${punto.tono}`} aria-label={punto.titulo}>
      <Titulo className="globo-tarjeta-titulo">
        <span className="globo-marca" aria-hidden="true" />
        {punto.titulo}
      </Titulo>
      <p className="globo-que">{punto.que}</p>
      {punto.cifras.length ? (
        <dl className="globo-cifras">
          {punto.cifras.map((c, i) => (
            <div key={`${c.etiqueta}-${i}`} className="globo-cifra">
              <dt>{c.etiqueta}</dt>
              <dd>
                {c.valor === null ? (
                  <span className="tenue">no confirmado</span>
                ) : (
                  <>
                    <span className="mono globo-valor">{c.valor}</span>
                    {c.unidad ? <span className="tenue chico"> {c.unidad}</span> : null}
                    {c.cambio ? <span className={`mono chico ${c.direccion ?? "igual"}`}> {c.cambio}</span> : null}
                  </>
                )}
                {c.sello ? (
                  <SelloFuente d={c.sello} ahora={ahora} />
                ) : c.enlace ? (
                  <div className="sello">
                    <a href={c.enlace.url} target="_blank" rel="noopener noreferrer">
                      {c.enlace.titulo} ↗
                    </a>
                    <span>· sin dato guardado</span>
                  </div>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {punto.notas.length ? (
        <ul className="globo-notas">
          {punto.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {punto.enlaces.length ? (
        <p className="globo-enlaces">
          {punto.enlaces.map((e) => (
            <a key={e.url} href={e.url} target="_blank" rel="noopener noreferrer">
              {e.titulo} ↗
            </a>
          ))}
        </p>
      ) : null}
    </article>
  );
}
