"use client";

// Curva de rendimientos: plazos equiespaciados en X, rendimiento en Y.
// Línea azul suave = última fecha publicada; línea gris punteada = comparación (~1 mes antes).
// La curva suave es monótona por tramos (Fritsch–Carlson): pasa por cada dato y no inventa picos entre plazos.
// Las cifras que se muestran llegan ya formateadas desde el servidor; aquí solo se ubican en pantalla.

import { useEffect, useId, useMemo, useRef, useState } from "react";

export interface PuntoGrafico {
  plazo: string;
  nombre: string;
  /** Texto exacto para mostrar (p. ej. "5.19"). */
  valor: string;
  valorComparacion: string | null;
  /** Diferencia contra la comparación, ya formateada (p. ej. "+19 pb"). */
  diferencia: string | null;
}

const ALTO = 240;
const M = { arriba: 16, derecha: 16, abajo: 28, izquierda: 40 };
// Colores del tema activo (app/globals.css): cambian solos entre claro y oscuro.
const PRINCIPAL = "var(--serie-1)";
const GRIS = "var(--texto-3)";

function pasoLimpio(rango: number): number {
  for (const p of [0.05, 0.1, 0.25, 0.5, 1, 2]) if (rango / p <= 5) return p;
  return 5;
}

/** Trazo suave y monótono por tramos que pasa exactamente por cada punto. */
function trazoSuave(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  const d: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].y - pts[i].y) / (pts[i + 1].x - pts[i].x));
  m.push(d[0]);
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let r = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    r += ` C${(pts[i].x + h).toFixed(1)},${(pts[i].y + m[i] * h).toFixed(1)} ${(pts[i + 1].x - h).toFixed(1)},${(pts[i + 1].y - m[i + 1] * h).toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return r;
}

export function GraficoCurva({
  puntos,
  etiquetaActual,
  etiquetaComparacion,
}: {
  puntos: PuntoGrafico[];
  etiquetaActual: string;
  etiquetaComparacion: string | null;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const idGradiente = `curva-relleno-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [ancho, setAncho] = useState(640);
  const [activo, setActivo] = useState<number | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const g = useMemo(() => {
    const valores = puntos.flatMap((p) => [Number(p.valor), ...(p.valorComparacion ? [Number(p.valorComparacion)] : [])]);
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const paso = pasoLimpio(Math.max(max - min, 0.1));
    const y0 = Math.floor(min / paso) * paso;
    const y1 = Math.ceil(max / paso) * paso;
    const ticks: number[] = [];
    for (let t = y0; t <= y1 + paso / 2; t += paso) ticks.push(Number(t.toFixed(4)));
    const anchoUtil = ancho - M.izquierda - M.derecha;
    const altoUtil = ALTO - M.arriba - M.abajo;
    const x = (i: number) => M.izquierda + (puntos.length === 1 ? anchoUtil / 2 : (i * anchoUtil) / (puntos.length - 1));
    const y = (v: number) => M.arriba + altoUtil - ((v - y0) / (y1 - y0 || 1)) * altoUtil;
    const decimales = paso < 1 ? 2 : 0;
    return { x, y, ticks, decimales };
  }, [puntos, ancho]);

  if (puntos.length === 0) return null;

  const coords = (sel: (p: PuntoGrafico) => string | null) =>
    puntos
      .map((p, i) => ({ v: sel(p), i }))
      .filter((d): d is { v: string; i: number } => d.v !== null)
      .map((d) => ({ x: g.x(d.i), y: g.y(Number(d.v)) }));

  const actual = coords((pt) => pt.valor);
  const comparacion = etiquetaComparacion ? coords((pt) => pt.valorComparacion) : [];
  const lineaActual = trazoSuave(actual);
  const base = ALTO - M.abajo;
  const relleno = actual.length > 1 ? `${lineaActual} L${actual.at(-1)!.x.toFixed(1)},${base} L${actual[0].x.toFixed(1)},${base} Z` : "";

  const indiceDesde = (clienteX: number) => {
    const rect = caja.current!.getBoundingClientRect();
    const px = clienteX - rect.left;
    let mejor = 0;
    for (let i = 1; i < puntos.length; i++) if (Math.abs(g.x(i) - px) < Math.abs(g.x(mejor) - px)) mejor = i;
    return mejor;
  };

  const ultimo = puntos.length - 1;
  // Etiquetas del eje X ancladas al último plazo, con al menos ~36 px entre ellas.
  const separacion = ultimo > 0 ? g.x(1) - g.x(0) : Infinity;
  const pasoEtiquetas = Math.max(1, Math.ceil(36 / separacion));
  const p = activo === null ? null : puntos[activo];
  const izquierdaTooltip = activo === null ? 0 : Math.min(Math.max(g.x(activo) - 80, 0), ancho - 176);

  return (
    <div className="curva">
      <ul className="leyenda" aria-label="Leyenda">
        <li>
          <span className="clave-linea" style={{ background: PRINCIPAL }} aria-hidden="true" />
          {etiquetaActual}
        </li>
        {etiquetaComparacion ? (
          <li>
            <span className="clave-linea clave-punteada" aria-hidden="true" />
            {etiquetaComparacion}
          </li>
        ) : null}
      </ul>
      <div
        ref={caja}
        className="grafico"
        tabIndex={0}
        role="img"
        aria-label={`Curva de rendimientos del Tesoro, ${etiquetaActual}. Usa las flechas para recorrer los plazos; los valores están en la tabla.`}
        onPointerMove={(e) => setActivo(indiceDesde(e.clientX))}
        onPointerDown={(e) => setActivo(indiceDesde(e.clientX))}
        onPointerLeave={() => setActivo(null)}
        onBlur={() => setActivo(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActivo((a) => Math.min((a ?? -1) + 1, ultimo));
          if (e.key === "ArrowLeft") setActivo((a) => Math.max((a ?? 1) - 1, 0));
          if (e.key === "Escape") setActivo(null);
        }}
      >
        <svg width={ancho} height={ALTO} aria-hidden="true">
          <defs>
            <linearGradient id={idGradiente} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRINCIPAL} stopOpacity={0.22} />
              <stop offset="100%" stopColor={PRINCIPAL} stopOpacity={0} />
            </linearGradient>
          </defs>
          <g className="eje">
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={M.izquierda} x2={ancho - M.derecha} y1={g.y(t)} y2={g.y(t)} stroke="var(--rejilla)" strokeWidth={1} strokeDasharray="2 4" />
                <text x={M.izquierda - 8} y={g.y(t) + 4} textAnchor="end">
                  {t.toFixed(g.decimales)}
                </text>
              </g>
            ))}
            {puntos.map((pt, i) =>
              (ultimo - i) % pasoEtiquetas === 0 ? (
                <text key={pt.plazo} x={g.x(i)} y={ALTO - 8} textAnchor="middle" className={activo === i ? "activo" : undefined}>
                  {pt.plazo}
                </text>
              ) : null,
            )}
          </g>
          {relleno ? <path d={relleno} fill={`url(#${idGradiente})`} /> : null}
          {comparacion.length > 1 ? (
            <path d={trazoSuave(comparacion)} fill="none" stroke={GRIS} strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
          ) : null}
          <path d={lineaActual} fill="none" stroke={PRINCIPAL} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          {activo !== null ? (
            <g>
              <line x1={g.x(activo)} x2={g.x(activo)} y1={M.arriba} y2={base} stroke="var(--borde-fuerte)" strokeWidth={1} />
              {puntos[activo].valorComparacion && etiquetaComparacion ? (
                <circle cx={g.x(activo)} cy={g.y(Number(puntos[activo].valorComparacion))} r={3.5} fill={GRIS} stroke="var(--panel)" strokeWidth={2} />
              ) : null}
              <circle cx={g.x(activo)} cy={g.y(Number(puntos[activo].valor))} r={5} fill={PRINCIPAL} stroke="var(--panel)" strokeWidth={2.5} />
            </g>
          ) : (
            <circle cx={actual.at(-1)!.x} cy={actual.at(-1)!.y} r={3.5} fill={PRINCIPAL} stroke="var(--panel)" strokeWidth={2} />
          )}
        </svg>
        {p ? (
          <div className="tooltip" style={{ left: izquierdaTooltip, top: 0 }} role="status">
            <div className="tenue">{p.nombre}</div>
            <div className="fila">
              <span className="clave-linea" style={{ background: PRINCIPAL }} />
              <strong>{p.valor}%</strong> <span>{etiquetaActual}</span>
            </div>
            {p.valorComparacion && etiquetaComparacion ? (
              <div className="fila">
                <span className="clave-linea clave-punteada" />
                <strong>{p.valorComparacion}%</strong> <span>{etiquetaComparacion}</span>
              </div>
            ) : null}
            {p.diferencia ? (
              <div>
                Diferencia: <strong>{p.diferencia}</strong>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
