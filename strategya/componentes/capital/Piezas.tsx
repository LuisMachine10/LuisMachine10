// Piezas comunes de las vistas de Mena Capital.

import type Big from "big.js";
import type { Hallazgo } from "@/lib/capital/alertas";
import { claseSigno, flecha, sg, type Tono } from "@/lib/capital/formato";

export function Panel({
  titulo,
  id,
  extra,
  ancho,
  children,
  cuerpo = true,
}: {
  titulo: string;
  id: string;
  extra?: React.ReactNode;
  ancho?: boolean;
  children: React.ReactNode;
  cuerpo?: boolean;
}) {
  return (
    <section className={`panel${ancho ? " cap-ancho" : ""}`} aria-labelledby={id}>
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id={id}>
          {titulo}
        </h2>
        {extra}
      </div>
      {cuerpo ? <div className="panel-cuerpo">{children}</div> : children}
    </section>
  );
}

export function Kpi({ rotulo, valor, meta, tono }: { rotulo: string; valor: string; meta: string; tono: Tono }) {
  return (
    <div className={`cap-kpi ${tono}`}>
      <div className="cap-rotulo">{rotulo}</div>
      <div className="k">{valor}</div>
      <div className="m">{meta}</div>
    </div>
  );
}

export function Dato({ rotulo, children, signo }: { rotulo: string; children: React.ReactNode; signo?: Big | null }) {
  return (
    <div className="cap-dato">
      <div className="cap-rotulo">{rotulo}</div>
      <div className={`n ${signo !== undefined ? claseSigno(signo) : ""}`}>{children}</div>
    </div>
  );
}

/** Monto con signo, flecha y color (nunca solo color). */
export function ConSigno({ v, d = 0, prefijo = "" }: { v: Big; d?: number; prefijo?: string }) {
  return (
    <span className={`mono ${claseSigno(v)}`}>
      {flecha(v)} {prefijo}
      {sg(v, d)}
    </span>
  );
}

const MARCA: Record<Hallazgo["n"], string> = { error: "✕", alerta: "!", ok: "✓" };

export function ListaHallazgos({ lista }: { lista: Hallazgo[] }) {
  return (
    <ul className="cap-hallazgos">
      {lista.map((h, i) => (
        <li key={`${h.t}-${i}`} className={h.n}>
          <span className="marca-nivel" aria-label={h.n === "error" ? "crítico" : h.n === "alerta" ? "vigilar" : "en meta"}>
            {MARCA[h.n]}
          </span>
          <div>
            <strong>{h.t}</strong>
            <p>{h.d}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function SinDatos({ children }: { children: React.ReactNode }) {
  return <div className="vacio">{children}</div>;
}

export function EtiquetaTono({ tono, texto }: { tono: Tono; texto?: string }) {
  if (tono === "neutra") return null;
  const t = texto ?? (tono === "ok" ? "✓ en meta" : tono === "alerta" ? "! vigilar" : "✕ bajo");
  return <span className={`etiqueta ${tono}`}>{t}</span>;
}
