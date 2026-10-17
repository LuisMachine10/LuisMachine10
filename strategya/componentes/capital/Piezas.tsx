// Piezas comunes de las vistas de Mena Capital.

import type Big from "big.js";
import Link from "next/link";
import type { Hallazgo } from "@/lib/capital/alertas";
import { claseSigno, flecha, pctSg, sg, type Tono } from "@/lib/capital/formato";
import { Icono, type NombreIcono } from "./Iconos";

export function Panel({
  titulo,
  id,
  extra,
  ancho,
  children,
  cuerpo = true,
  clase,
}: {
  titulo: string;
  id: string;
  extra?: React.ReactNode;
  ancho?: boolean;
  children: React.ReactNode;
  cuerpo?: boolean;
  clase?: string;
}) {
  return (
    <section className={`panel${ancho ? " cap-ancho" : ""}${clase ? ` ${clase}` : ""}`} aria-labelledby={id}>
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

const NOMBRE_TONO: Record<Tono, string> = { ok: "en meta", alerta: "vigilar", error: "fuera de meta", neutra: "" };

/** Mosaico de KPI: rótulo, cifra grande y una línea tenue con la meta (el punto de color lleva texto oculto). */
export function Kpi({ rotulo, valor, meta, tono, unidad, ayuda }: { rotulo: string; valor: React.ReactNode; meta: string; tono: Tono; unidad?: string; ayuda?: string }) {
  return (
    <div className="cap-kpi" title={ayuda}>
      <div className="rotulo">{rotulo}</div>
      <div className="valor">
        {unidad === "RD$" ? <small className="antes">RD$</small> : null}
        {valor}
        {unidad && unidad !== "RD$" ? <small>{unidad}</small> : null}
      </div>
      <div className="meta">
        {tono !== "neutra" ? (
          <>
            <span className={`cap-punto ${tono}`} aria-hidden="true" />
            <span className="sr-solo">{NOMBRE_TONO[tono]}:</span>
          </>
        ) : null}
        <span>{meta}</span>
      </div>
    </div>
  );
}

/** Contenedor de mosaicos; `columnas` 4 o 6 en escritorio. */
export function Mosaicos({ children, columnas = 6, etiqueta }: { children: React.ReactNode; columnas?: 4 | 6; etiqueta: string }) {
  return (
    <section className={`cap-mosaicos cap-ancho ${columnas === 4 ? "cuatro" : "seis"}`} aria-label={etiqueta}>
      {children}
    </section>
  );
}

export function Dato({ rotulo, children, signo }: { rotulo: string; children: React.ReactNode; signo?: Big | null }) {
  return (
    <div className="cap-dato">
      <div className="rotulo">{rotulo}</div>
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

/** Cambio porcentual en pastilla de color suave, con flecha y signo. */
export function Pastilla({ v, d = 1 }: { v: Big | null; d?: number }) {
  if (v === null) return null;
  const c = claseSigno(v);
  return (
    <span className={`pastilla ${c}`}>
      {flecha(v)} {pctSg(v, d)}
    </span>
  );
}

/** Pastilla de estado (en meta, vigilar, fuera de meta…). */
export function Estado({ tono, children }: { tono: Tono; children: React.ReactNode }) {
  return <span className={`cap-estado ${tono === "neutra" ? "" : tono}`}>{children}</span>;
}

const MARCA: Record<Hallazgo["n"], string> = { error: "✕", alerta: "!", ok: "✓" };

export function ListaHallazgos({ lista, columnas }: { lista: Hallazgo[]; columnas?: boolean }) {
  return (
    <ul className={`cap-hallazgos${columnas ? " columnas" : ""}`}>
      {lista.map((h, i) => (
        <li key={`${h.t}-${i}`} className={h.n}>
          <span className="marca-nivel" role="img" aria-label={h.n === "error" ? "crítico" : h.n === "alerta" ? "vigilar" : "en meta"}>
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

/** Estado vacío amable: qué falta y una acción clara. */
export function SinDatos({
  children,
  accion,
  icono = "info",
  centro,
}: {
  children: React.ReactNode;
  accion?: { href: string; texto: string };
  icono?: NombreIcono;
  centro?: boolean;
}) {
  return (
    <div className={`cap-vacio${centro ? " centro" : ""}`}>
      {centro ? <Icono nombre={icono} clase="cap-icono-grande" /> : null}
      <p>{children}</p>
      {accion ? (
        <Link href={accion.href} className="boton secundario chico">
          {accion.texto}
        </Link>
      ) : null}
    </div>
  );
}

export function EtiquetaTono({ tono, texto }: { tono: Tono; texto?: string }) {
  if (tono === "neutra") return null;
  const t = texto ?? (tono === "ok" ? "✓ en meta" : tono === "alerta" ? "! vigilar" : "✕ bajo");
  return <Estado tono={tono}>{t}</Estado>;
}

/** Texto explicativo plegado: lo secundario no compite con las cifras. */
export function Mas({ titulo = "Cómo se calcula", children }: { titulo?: string; children: React.ReactNode }) {
  return (
    <details className="cap-mas">
      <summary>{titulo}</summary>
      {children}
    </details>
  );
}
