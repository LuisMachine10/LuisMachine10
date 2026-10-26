// Marco común de un widget del Dashboard: título, una línea de qué es, el contenido y el sello.
// Un widget sin datos usa <WidgetVacio>: compacto, con su motivo y una acción, nunca una caja vacía.

import "@/estilos/dashboard.css";
import Link from "next/link";
import type { FichaWidget } from "@/lib/dashboard/widgets";

export function idTitulo(ficha: FichaWidget): string {
  return `w-${ficha.id}`;
}

export function Marco({
  ficha,
  enlace,
  extra,
  pie,
  children,
  clase,
}: {
  ficha: FichaWidget;
  /** «Ver más» hacia la pantalla completa. */
  enlace?: { href: string; texto: string };
  /** Algo pequeño junto al título (p. ej. una píldora con un conteo). */
  extra?: React.ReactNode;
  /** Sello de fuente u otra nota al pie (discreto). */
  pie?: React.ReactNode;
  children: React.ReactNode;
  clase?: string;
}) {
  return (
    <section className={`panel dash-w${clase ? ` ${clase}` : ""}`} aria-labelledby={idTitulo(ficha)}>
      <header className="dash-w-cab">
        <div className="dash-w-titulos">
          <h2 className="panel-titulo" id={idTitulo(ficha)}>
            {ficha.titulo}
            {extra ? <> {extra}</> : null}
          </h2>
          <p className="dash-w-que">{ficha.que}</p>
        </div>
        {enlace ? (
          <Link href={enlace.href} className="dash-w-enlace">
            {enlace.texto}
            <span aria-hidden="true"> →</span>
          </Link>
        ) : null}
      </header>
      <div className="dash-w-cuerpo">{children}</div>
      {pie ? <footer className="dash-w-pie">{pie}  <p className="pie-legal">
          <a href="/terminos">Términos y privacidad</a>
        </p>
      </footer> : null}
    </section>
  );
}

export function WidgetVacio({
  ficha,
  motivo,
  accion,
  error = false,
}: {
  ficha: FichaWidget;
  motivo: React.ReactNode;
  accion?: { href: string; texto: string };
  error?: boolean;
}) {
  return (
    <section className="dash-w dash-w-vacio" aria-labelledby={idTitulo(ficha)} role={error ? "alert" : undefined}>
      <div className="dash-w-vacio-cab">
        <h2 className="panel-titulo" id={idTitulo(ficha)}>
          {ficha.titulo}
        </h2>
        <span className={`etiqueta ${error ? "error" : "neutra"}`}>{error ? "No se pudo leer" : "Sin dato"}</span>
      </div>
      <p className="dash-w-motivo">{motivo}</p>
      {accion ? (
        <Link href={accion.href} className="boton secundario dash-boton-chico">
          {accion.texto}
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Para los resúmenes de otros módulos (Presupuesto, Portafolio, Curva): nuestro título y la línea
 * de qué es arriba; el panel del módulo va dentro sin su propio marco (su sello se conserva).
 */
export function Embebido({ ficha, enlace, children }: { ficha: FichaWidget; enlace?: { href: string; texto: string }; children: React.ReactNode }) {
  return (
    <Marco ficha={ficha} enlace={enlace} clase="dash-w-embebido">
      {children}
    </Marco>
  );
}
