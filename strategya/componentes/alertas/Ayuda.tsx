// «?» que se abre con una explicación corta (1–2 frases). Es un <details>: funciona sin JavaScript,
// con teclado (Enter / Espacio) y lo anuncian los lectores de pantalla.

import "@/estilos/alertas-ia.css";

export function Ayuda({ titulo, children, conTexto = false }: { titulo: string; children: React.ReactNode; conTexto?: boolean }) {
  return (
    <details className={`aj-ayuda${conTexto ? " con-texto" : ""}`}>
      <summary title={titulo}>
        <span className="aj-ayuda-icono" aria-hidden="true">
          ?
        </span>
        {conTexto ? <span className="aj-ayuda-rotulo">{titulo}</span> : <span className="sr-solo">{titulo}</span>}
      </summary>
      <div className="aj-ayuda-texto">{children}</div>
    </details>
  );
}

/** Título de pantalla con una línea en palabras simples que dice para qué sirve. */
export function IntroPagina({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <header className="aj-intro panel-ancho">
      <div className="aj-intro-texto">
        <h1>{titulo}</h1>
        <p>{children}</p>
      </div>
      {accion ? <div className="aj-intro-accion">{accion}</div> : null}
    </header>
  );
}
