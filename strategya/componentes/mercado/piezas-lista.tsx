// Piezas de «Mi lista» y «Mis posiciones» (Server Components sin estado).
import "@/estilos/mercado.css";
import { SelloFuente } from "@/componentes/SelloFuente";
import type { Direccion } from "@/lib/formato";
import { fechaHoraRD, horaRD } from "@/lib/formato";
import type { VistaCotizacion } from "@/lib/mercado-vista";
import { FLECHA } from "./piezas";

const PALABRA: Record<Direccion, string> = { sube: "sube", baja: "baja", igual: "sin cambio" };

/** Botón «?» que abre una explicación corta (1–2 frases). Funciona sin JavaScript. */
export function QueEs({ tema, children }: { tema: string; children: React.ReactNode }) {
  return (
    <details className="ml-que">
      <summary aria-label={`¿Qué es ${tema}?`} title={`¿Qué es ${tema}?`}>
        <span aria-hidden="true">?</span>
      </summary>
      <div className="ml-que-globo" role="note">
        {children}
      </div>
    </details>
  );
}

/** Cambio en pastilla (sube/baja con flecha y palabra para lectores de pantalla) o «sin dato» punteado. */
export function PastillaCambio({ pct, dir, titulo }: { pct: string | null; dir: Direccion; titulo?: string }) {
  if (pct === null)
    return (
      <span className="ml-sin" title={titulo ?? "La fuente no informó el cambio del día"}>
        sin dato
      </span>
    );
  return (
    <span className={`pastilla ${dir}`} title={titulo}>
      <span aria-hidden="true">{FLECHA[dir]}</span>
      <span className="sr-solo">{PALABRA[dir]} </span>
      {pct}
    </span>
  );
}

/** Cifra en US$ con color y flecha según dirección (nunca solo color). */
export function MontoConSigno({ monto, dir }: { monto: string | null; dir: Direccion }) {
  if (monto === null) return <span className="ml-sin">sin dato</span>;
  return (
    <span className={`mono ml-monto ${dir}`}>
      <span className="sr-solo">{PALABRA[dir]} </span>
      {monto}
    </span>
  );
}

/** Barra del rango del día: mínimo — precio — máximo. */
export function RangoDia({ c }: { c: VistaCotizacion }) {
  if (c.minimo === null || c.maximo === null || c.posicionRango === null)
    return (
      <span className="ml-sin" title="La fuente no informó el máximo y el mínimo del día">
        sin rango
      </span>
    );
  const pct = Math.round(c.posicionRango * 100);
  return (
    <span className="ml-rango" title={`Hoy se movió entre ${c.minimo} y ${c.maximo} US$; ahora está en ${c.precio}`}>
      <span className="ml-rango-num mono">
        <span className="sr-solo">mínimo del día </span>
        {c.minimo}
      </span>
      <span className="ml-rango-barra" aria-hidden="true">
        <span className="ml-rango-punto" style={{ left: `${pct}%` }} />
      </span>
      <span className="ml-rango-num mono">
        <span className="sr-solo">máximo del día </span>
        {c.maximo}
      </span>
    </span>
  );
}

/** Sello de la cotización + hora del dato (o «Cierre del …» con la bolsa cerrada). */
export function SelloCotizacion({ c, ahora }: { c: VistaCotizacion; ahora: Date }) {
  return (
    <div className="ml-sello">
      <SelloFuente d={c.sello} ahora={ahora} />
      {c.horaDato ? (
        <span className="mv-hora" title={`Hora del dato: ${fechaHoraRD(c.horaDato)} (RD)`}>
          {c.etiquetaCierre ? c.etiquetaCierre.replace("cierre del ", "Cierre del ") : `Dato ${horaRD(c.horaDato)}`}
        </span>
      ) : null}
    </div>
  );
}

export function Icono({ d, tam = 18 }: { d: string; tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICONO = {
  arriba: "M12 19V5M6 11l6-6 6 6",
  abajo: "M12 5v14M6 13l6 6 6-6",
  quitar: "M6 6l12 12M18 6L6 18",
  lista: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  cartera: "M3 7h18v13H3zM16 13h.01M3 7l2-3h14l2 3",
  reloj: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
};
