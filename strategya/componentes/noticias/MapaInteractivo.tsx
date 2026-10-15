"use client";

// Capa interactiva del mapa: pines con forma y color por tipo, y una ficha con titulares y enlaces.
// Ratón: pasar por encima muestra la ficha; clic (o toque, o Enter/Espacio) la deja fija.
// En pantallas angostas la ficha aparece debajo del mapa en lugar de flotar.
// Los contornos de los países llegan ya dibujados desde el servidor (children).

import { useEffect, useRef, useState } from "react";
import { ETIQUETA_PIN, type TipoPin } from "@/lib/noticias";
import type { PinProyectado } from "@/lib/mapa";

export function FormaPin({ tipo }: { tipo: TipoPin }) {
  switch (tipo) {
    case "guerra":
      return <path d="M0,-8 L8,0 L0,8 L-8,0Z" className="nt-forma nt-forma-guerra" />;
    case "rd":
      return <rect x={-6} y={-6} width={12} height={12} className="nt-forma nt-forma-rd" />;
    case "sube":
      return <path d="M0,-8 L7.5,5.5 L-7.5,5.5Z" className="nt-forma nt-forma-sube" />;
    case "baja":
      return <path d="M0,8 L7.5,-5.5 L-7.5,-5.5Z" className="nt-forma nt-forma-baja" />;
    case "igual":
      return <circle r={5} className="nt-forma nt-forma-igual" />;
    default:
      return <circle r={6.5} className="nt-forma nt-forma-noticia" />;
  }
}

export function MapaInteractivo({
  pines,
  ancho,
  alto,
  children,
}: {
  pines: PinProyectado[];
  ancho: number;
  alto: number;
  children: React.ReactNode;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1.4);
  const [fijo, setFijo] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);

  // Los pines se agrandan al achicarse el mapa para que se vean y se puedan tocar en un celular.
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const px = e.contentRect.width || ancho;
      setEscala(Math.min(2.6, Math.max(1, (ancho / px) * 0.55)));
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
  // Los pines activos se dibujan al final para quedar encima.
  const orden = activo ? [...pines.filter((p) => p.id !== activo.id), activo] : pines;

  return (
    <div ref={caja} className="nt-mapa">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="nt-mapa-svg"
        role="group"
        aria-label={`Mapa del mundo con ${pines.length} lugares marcados. La lista equivalente está debajo del mapa.`}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) setFijo(null);
        }}
      >
        {children}
        {orden.map((p) => {
          const n = p.elementos.length;
          const etiqueta = `${ETIQUETA_PIN[p.tipo]} · ${p.lugar}: ${n} ${n === 1 ? "elemento" : "elementos"}`;
          return (
            <g
              key={p.id}
              className={`nt-pin${p.id === activoId ? " nt-pin-activo" : ""}`}
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
              <circle r={13} className="nt-pin-zona" />
              <FormaPin tipo={p.tipo} />
              {n > 1 ? (
                <text x={9} y={-7} className="nt-pin-cuenta">
                  {n}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {activo ? (
        <div
          className={`nt-ficha${fijo ? " nt-ficha-fija" : ""}${derecha ? " nt-ficha-derecha" : ""}${abajo ? " nt-ficha-arriba" : ""}`}
          style={{ left: `${(activo.x / ancho) * 100}%`, top: `${(activo.y / alto) * 100}%` }}
          role="dialog"
          aria-label={`${ETIQUETA_PIN[activo.tipo]} · ${activo.lugar}`}
          onPointerEnter={() => setEncima(activo.id)}
        >
          <div className="nt-ficha-cabeza">
            <svg width={16} height={16} viewBox="-9 -9 18 18" aria-hidden="true">
              <FormaPin tipo={activo.tipo} />
            </svg>
            <strong>{activo.lugar}</strong>
            <span className="tenue">· {ETIQUETA_PIN[activo.tipo]}</span>
            {fijo ? (
              <button type="button" className="boton-texto nt-ficha-cerrar" onClick={() => setFijo(null)} aria-label="Cerrar">
                ✕
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
                  el.texto
                )}
                <span className="tenue"> · {el.detalle}</span>
              </li>
            ))}
          </ul>
          {!fijo ? <p className="tenue nt-ficha-pista">Clic en el pin para fijar y abrir los enlaces.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
