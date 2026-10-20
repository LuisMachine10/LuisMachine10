"use client";

// Capa interactiva del mapa: pines (círculo con halo, glifo por tipo y conteo) sobre el mapa base, que
// llega como un SVG estático (vector, nítido en retina). Ratón: pasar por encima muestra la ficha; clic
// (o toque, o Enter/Espacio) la deja fija. En pantallas angostas la ficha aparece debajo del mapa.

import { useEffect, useRef, useState } from "react";
import { ETIQUETA_PIN, type TipoPin } from "@/lib/noticias";
import type { PinProyectado } from "@/lib/mapa";

/** Glifo dentro del pin: la forma también dice el tipo (nunca solo el color). */
function Glifo({ tipo }: { tipo: TipoPin }) {
  switch (tipo) {
    case "sube":
      return <path d="M0,-3.2 L3,2 L-3,2Z" className="nt-glifo" />;
    case "baja":
      return <path d="M0,3.2 L3,-2 L-3,-2Z" className="nt-glifo" />;
    case "guerra":
      return <path d="M-2.4,-2.4 L2.4,2.4 M2.4,-2.4 L-2.4,2.4" className="nt-glifo-trazo" />;
    case "rd":
      return <path d="M0,-3 L3,0 L0,3 L-3,0Z" className="nt-glifo" />;
    case "igual":
      return <path d="M-2.6,0 L2.6,0" className="nt-glifo-trazo" />;
    default:
      return <circle r={1.6} className="nt-glifo" />;
  }
}

/** Marcador de un tipo de pin (para la leyenda, la ficha y la lista). */
export function FormaPin({ tipo }: { tipo: TipoPin }) {
  return (
    <g className={`nt-marca nt-marca-${tipo}`}>
      <circle r={6.5} className="nt-nucleo" />
      <Glifo tipo={tipo} />
    </g>
  );
}

/** Ícono del marcador en un svg pequeño (leyenda, ficha, lista). */
export function IconoPin({ tipo, tam = 14 }: { tipo: TipoPin; tam?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="-8 -8 16 16" aria-hidden="true" className="nt-icono-pin">
      <FormaPin tipo={tipo} />
    </svg>
  );
}

export function MapaInteractivo({
  pines,
  ancho,
  alto,
  fondo,
}: {
  pines: PinProyectado[];
  ancho: number;
  alto: number;
  /** URL del mapa base (SVG estático). */
  fondo: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [fijo, setFijo] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);

  // Los pines mantienen su tamaño en pantalla al achicarse el mapa: se ven y se pueden tocar en un celular.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const px = e.contentRect.width || ancho;
      setEscala(Math.min(2.8, Math.max(0.85, (ancho / px) * 0.95)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ancho]);

  useEffect(() => {
    if (!fijo) return;
    const cerrar = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setFijo(null);
    };
    window.addEventListener("keydown", cerrar);
    return () => window.removeEventListener("keydown", cerrar);
  }, [fijo]);

  const activoId = fijo ?? encima;
  const activo = pines.find((p) => p.id === activoId) ?? null;
  const derecha = activo ? activo.x > ancho * 0.55 : false;
  const abajo = activo ? activo.y > alto * 0.55 : false;
  // El pin activo se dibuja al final para quedar encima.
  const orden = activo ? [...pines.filter((p) => p.id !== activo.id), activo] : pines;

  return (
    <div className="nt-mapa-envoltura">
      <div ref={caja} className="nt-mapa" style={{ aspectRatio: `${ancho} / ${alto}` }}>
      {/* El mapa base es decorativo: la información está en los pines y en la lista equivalente. */}
      <img src={fondo} alt="" className="nt-mapa-fondo" width={ancho} height={alto} decoding="async" draggable={false} />
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="nt-mapa-svg"
        role="group"
        aria-label={`Mapa del mundo con ${pines.length} lugares marcados. La lista equivalente está debajo del mapa.`}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) setFijo(null);
        }}
      >
        {orden.map((p) => {
          const n = p.elementos.length;
          const etiqueta = `${ETIQUETA_PIN[p.tipo]} · ${p.lugar}: ${n} ${n === 1 ? "elemento" : "elementos"}`;
          const esActivo = p.id === activoId;
          return (
            <g
              key={p.id}
              className={`nt-pin nt-pin-${p.tipo}${esActivo ? " nt-pin-activo" : ""}`}
              transform={`translate(${p.x},${p.y}) scale(${escala})`}
              tabIndex={0}
              role="button"
              aria-label={etiqueta}
              aria-expanded={fijo === p.id}
              onPointerEnter={(ev) => {
                if (ev.pointerType === "mouse") setEncima(p.id);
              }}
              onPointerLeave={(ev) => {
                if (ev.pointerType === "mouse") setEncima(null);
              }}
              onFocus={() => setEncima(p.id)}
              onBlur={() => setEncima(null)}
              onClick={(ev) => {
                ev.stopPropagation();
                setFijo((f) => (f === p.id ? null : p.id));
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setFijo((f) => (f === p.id ? null : p.id));
                }
              }}
            >
              <title>{etiqueta}</title>
              <circle r={14} className="nt-pin-zona" />
              <circle r={11} className="nt-halo" />
              <FormaPin tipo={p.tipo} />
              {esActivo ? <circle r={9} className="nt-anillo" /> : null}
              {n > 1 ? (
                <g transform="translate(7,-7)" className="nt-cuenta">
                  <rect x={-5.5} y={-5} width={11} height={10} rx={5} />
                  <text textAnchor="middle" dy="0.35em">
                    {n}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}
      </svg>
      </div>
      {activo ? (
        <div
          className={`nt-ficha${fijo ? " nt-ficha-fija" : ""}${derecha ? " nt-ficha-derecha" : ""}${abajo ? " nt-ficha-arriba" : ""}`}
          style={{ left: `${(activo.x / ancho) * 100}%`, top: `${(activo.y / alto) * 100}%` }}
          role="dialog"
          aria-label={`${ETIQUETA_PIN[activo.tipo]} · ${activo.lugar}`}
          onPointerEnter={() => setEncima(activo.id)}
        >
          <div className="nt-ficha-cabeza">
            <IconoPin tipo={activo.tipo} tam={16} />
            <strong>{activo.lugar}</strong>
            <span className={`etiqueta nt-tipo-${activo.tipo}`}>{ETIQUETA_PIN[activo.tipo]}</span>
            {fijo ? (
              <button type="button" className="nt-ficha-cerrar" onClick={() => setFijo(null)} aria-label="Cerrar">
                <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            ) : null}
          </div>
          <ul>
            {activo.elementos.map((el, i) => (
              <li key={`${el.url}-${i}`}>
                {el.url ? (
                  <a href={el.url} target="_blank" rel="noopener noreferrer">
                    {el.texto}
                  </a>
                ) : (
                  <span>{el.texto}</span>
                )}
                <span className="nt-ficha-detalle">{el.detalle}</span>
              </li>
            ))}
          </ul>
          {!fijo ? <p className="nt-ficha-pista">Clic en el pin para fijar y abrir los enlaces.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
