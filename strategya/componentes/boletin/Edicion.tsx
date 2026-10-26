// Una edición del Boletín como página: el mismo contenido que el correo (sale del mismo JSON), con los
// colores de la app en claro y oscuro. Verde y rojo solo para lo que sube y baja, siempre con flecha y signo.

import "@/estilos/boletin.css";
import type { EstadoEdicion } from "@/lib/datos-boletin";
import { PIE_TEXTO } from "@/supabase/functions/_shared/boletin/render";
import type { Edicion, Fila, Item, Seccion } from "@/supabase/functions/_shared/boletin/tipos";

const FLECHA = { sube: "↑", baja: "↓", igual: "" } as const;

function Enlace({ texto, url }: { texto: string; url: string | null | undefined }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {texto}
      <span className="sr-solo"> (abre en otra pestaña)</span>
    </a>
  ) : (
    <>{texto}</>
  );
}

function FilaVista({ f, numero }: { f: Fila; numero?: number }) {
  const dir = f.dir ?? "igual";
  return (
    <li className="bol-fila">
      <div className="bol-fila-texto">
        <span className="bol-fila-nombre">
          {numero !== undefined ? <span className="bol-num">{numero}.</span> : null}
          {f.etiqueta}
        </span>
        <span className="bol-fila-meta">
          {[f.fecha, f.nota].filter(Boolean).join(" · ")}
          {f.fuente ? (
            <>
              {f.fecha || f.nota ? " · " : ""}
              <Enlace texto={f.fuente.nombre} url={f.fuente.url} />
            </>
          ) : null}
          {f.estado === "viejo" ? <span className="bol-pildora bol-viejo">Dato viejo</span> : null}
          {f.estado === "no_confirmado" ? <span className="bol-pildora bol-nc">No confirmado</span> : null}
        </span>
        {f.porque !== undefined ? (
          <span className="bol-porque">
            <strong>¿Por qué?</strong>{" "}
            {f.porque ? (
              <>
                «<Enlace texto={f.porque.titular} url={f.porque.url} />» <span className="tenue">{f.porque.medio}</span>
              </>
            ) : (
              <em>Causa no confirmada.</em>
            )}
          </span>
        ) : null}
      </div>
      <div className="bol-fila-cifra">
        <span className={`bol-nivel${f.nivel ? "" : " bol-sin"}`}>{f.nivel ?? "no confirmado"}</span>
        {f.cambio ? (
          <span className={`bol-cambio ${dir}`}>
            {FLECHA[dir] ? `${FLECHA[dir]} ` : ""}
            {f.cambio}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function ItemVista({ it }: { it: Item }) {
  return (
    <li className="bol-item">
      <span>{it.texto}</span>
      {it.meta || it.medio || it.url ? (
        <span className="bol-fila-meta">
          {it.meta}
          {it.meta && (it.medio || it.url) ? " · " : ""}
          {it.medio || it.url ? <Enlace texto={it.medio ?? "enlace"} url={it.url} /> : null}
        </span>
      ) : null}
    </li>
  );
}

function SeccionVista({ s }: { s: Seccion }) {
  const grupos: { grupo: string | undefined; filas: { f: Fila; i: number }[] }[] = [];
  (s.filas ?? []).forEach((f, i) => {
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.grupo === f.grupo) ultimo.filas.push({ f, i });
    else grupos.push({ grupo: f.grupo, filas: [{ f, i }] });
  });
  const id = `bol-s-${s.id}`;
  return (
    <section className={`bol-seccion${s.personal ? " bol-personal" : ""}`} aria-labelledby={id}>
      <h2 id={id}>
        {s.titulo}
        {s.personal ? <span className="etiqueta neutra">Solo tú</span> : null}
      </h2>
      {s.intro ? <p className="bol-intro">{s.intro}</p> : null}
      {grupos.map((g, k) => (
        <div key={k} className="bol-grupo">
          {g.grupo ? <h3>{g.grupo}</h3> : null}
          <ol className="bol-filas">
            {g.filas.map(({ f, i }) => (
              <FilaVista key={i} f={f} numero={s.id === "cinco" ? i + 1 : undefined} />
            ))}
          </ol>
        </div>
      ))}
      {s.items?.length ? (
        <ul className="bol-items">
          {s.items.map((it, i) => (
            <ItemVista key={i} it={it} />
          ))}
        </ul>
      ) : null}
      {s.vacio ? <p className="bol-vacio">{s.vacio}</p> : null}
    </section>
  );
}

export const NOMBRE_ESTADO: Record<EstadoEdicion, { texto: string; clase: string }> = {
  armando: { texto: "Armando", clase: "neutra" },
  lista: { texto: "Guardada", clase: "neutra" },
  enviada: { texto: "Enviada", clase: "ok" },
  sin_envio: { texto: "Sin envío", clase: "alerta" },
  error: { texto: "Error al enviar", clase: "error" },
};

export function EtiquetaEstado({ estado }: { estado: EstadoEdicion }) {
  const e = NOMBRE_ESTADO[estado] ?? NOMBRE_ESTADO.lista;
  return <span className={`etiqueta ${e.clase}`}>{e.texto}</span>;
}

export function EdicionVista({ e }: { e: Edicion }) {
  return (
    <article className="bol-edicion" aria-labelledby="bol-titulo">
      <header className="bol-cab">
        <p className="bol-marca">Strategya{e.prueba ? " · prueba" : ""}</p>
        <h1 id="bol-titulo">{e.nombre}</h1>
        <p className="bol-fecha">{e.fechaTexto} · hora RD</p>
        {e.datoDelDia ? (
          <p className="bol-dato">
            <span>Dato del día:</span> <strong>{e.datoDelDia}</strong>
          </p>
        ) : null}
      </header>
      <ul className="bol-resumen">
        {e.resumen.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      {e.secciones.map((s) => (
        <SeccionVista key={s.id} s={s} />
      ))}
      <footer className="bol-pie">
        <div>
          <h2>Fuentes:</h2>
          <ul>
            {e.fuentes.map((f) => (
              <li key={f.nombre}>
                <Enlace texto={f.nombre} url={f.url} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2>No confirmado:</h2>
          <ul>{e.noConfirmado.length ? e.noConfirmado.map((x) => <li key={x}>{x}</li>) : <li>Nada pendiente: todas las cifras tienen fuente y fecha.</li>}</ul>
        </div>
        <p className="bol-legal">{PIE_TEXTO}</p>
      </footer>
    </article>
  );
}
