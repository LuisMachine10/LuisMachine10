"use client";

// Curva de rendimientos: plazos equiespaciados en X, rendimiento en Y.
// Línea ámbar = última fecha publicada; línea gris = comparación (~1 mes antes).
// Las cifras que se muestran llegan ya formateadas desde el servidor; aquí solo se ubican en pantalla.

import { useEffect, useMemo, useRef, useState } from "react";

export interface PuntoGrafico {
  plazo: string;
  nombre: string;
  /** Texto exacto para mostrar (p. ej. "5.19"). */
  valor: string;
  valorComparacion: string | null;
  /** Diferencia contra la comparación, ya formateada (p. ej. "+19 pb"). */
  diferencia: string | null;
}

const ALTO = 220;
const M = { arriba: 12, derecha: 44, abajo: 26, izquierda: 40 };

function pasoLimpio(rango: number): number {
  for (const p of [0.05, 0.1, 0.25, 0.5, 1, 2]) if (rango / p <= 6) return p;
  return 5;
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
    const decimales = paso < 0.1 ? 2 : paso < 1 ? 2 : 0;
    return { x, y, ticks, decimales };
  }, [puntos, ancho]);

  if (puntos.length === 0) return null;

  const trazo = (sel: (p: PuntoGrafico) => string | null) =>
    puntos
      .map((p, i) => ({ v: sel(p), i }))
      .filter((d): d is { v: string; i: number } => d.v !== null)
      .map((d, k) => `${k === 0 ? "M" : "L"}${g.x(d.i).toFixed(1)},${g.y(Number(d.v)).toFixed(1)}`)
      .join(" ");

  const indiceDesde = (clienteX: number) => {
    const rect = caja.current!.getBoundingClientRect();
    const px = clienteX - rect.left;
    let mejor = 0;
    for (let i = 1; i < puntos.length; i++) if (Math.abs(g.x(i) - px) < Math.abs(g.x(mejor) - px)) mejor = i;
    return mejor;
  };

  const ultimo = puntos.length - 1;
  // Etiquetas del eje X ancladas al último plazo, con al menos ~34 px entre ellas.
  const separacion = ultimo > 0 ? g.x(1) - g.x(0) : Infinity;
  const pasoEtiquetas = Math.max(1, Math.ceil(34 / separacion));
  const yFinActual = g.y(Number(puntos[ultimo].valor));
  const yFinComp = puntos[ultimo].valorComparacion ? g.y(Number(puntos[ultimo].valorComparacion)) : null;
  const etiquetasSeparadas = yFinComp === null || Math.abs(yFinActual - yFinComp) >= 14;
  const p = activo === null ? null : puntos[activo];
  const izquierdaTooltip = activo === null ? 0 : Math.min(Math.max(g.x(activo) + 10, 0), ancho - 170);

  return (
    <div>
      <ul className="leyenda" aria-label="Leyenda">
        <li>
          <span className="clave-linea" style={{ background: "var(--ambar)" }} aria-hidden="true" />
          {etiquetaActual}
        </li>
        {etiquetaComparacion ? (
          <li>
            <span className="clave-linea" style={{ background: "var(--contexto)" }} aria-hidden="true" />
            {etiquetaComparacion}
          </li>
        ) : null}
      </ul>
      <div
        ref={caja}
        className="grafico"
        tabIndex={0}
        role="img"
        aria-label={`Curva de rendimientos del Tesoro, ${etiquetaActual}. Los valores están en la tabla de abajo.`}
        onPointerMove={(e) => setActivo(indiceDesde(e.clientX))}
        onPointerLeave={() => setActivo(null)}
        onBlur={() => setActivo(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") setActivo((a) => Math.min((a ?? -1) + 1, ultimo));
          if (e.key === "ArrowLeft") setActivo((a) => Math.max((a ?? 1) - 1, 0));
          if (e.key === "Escape") setActivo(null);
        }}
      >
        <svg width={ancho} height={ALTO} aria-hidden="true">
          <g className="eje">
            {g.ticks.map((t) => (
              <g key={t}>
                <line x1={M.izquierda} x2={ancho - M.derecha} y1={g.y(t)} y2={g.y(t)} stroke="var(--rejilla)" strokeWidth={1} />
                <text x={M.izquierda - 6} y={g.y(t) + 4} textAnchor="end">
                  {t.toFixed(g.decimales)}
                </text>
              </g>
            ))}
            {puntos.map((pt, i) =>
              (ultimo - i) % pasoEtiquetas === 0 ? (
                <text key={pt.plazo} x={g.x(i)} y={ALTO - 8} textAnchor="middle">
                  {pt.plazo}
                </text>
              ) : null,
            )}
          </g>
          {activo !== null ? (
            <line x1={g.x(activo)} x2={g.x(activo)} y1={M.arriba} y2={ALTO - M.abajo} stroke="var(--texto-3)" strokeWidth={1} />
          ) : null}
          {etiquetaComparacion ? (
            <path d={trazo((pt) => pt.valorComparacion)} fill="none" stroke="var(--contexto)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          ) : null}
          <path d={trazo((pt) => pt.valor)} fill="none" stroke="var(--ambar)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {puntos.map((pt, i) => (
            <circle
              key={pt.plazo}
              cx={g.x(i)}
              cy={g.y(Number(pt.valor))}
              r={activo === i ? 5 : 3.5}
              fill="var(--ambar)"
              stroke="var(--panel)"
              strokeWidth={2}
            />
          ))}
          {etiquetasSeparadas ? (
            <g fontFamily="var(--mono)" fontSize={11} fill="var(--texto-2)">
              <text x={g.x(ultimo) + 8} y={yFinActual + 4}>
                {puntos[ultimo].valor}
              </text>
              {yFinComp !== null ? (
                <text x={g.x(ultimo) + 8} y={yFinComp + 4} fill="var(--texto-3)">
                  {puntos[ultimo].valorComparacion}
                </text>
              ) : null}
            </g>
          ) : null}
        </svg>
        {p ? (
          <div className="tooltip" style={{ left: izquierdaTooltip, top: 4 }} role="status">
            <div className="tenue">{p.nombre}</div>
            <div className="fila">
              <span className="clave-linea" style={{ background: "var(--ambar)" }} />
              <strong>{p.valor}%</strong> <span>{etiquetaActual}</span>
            </div>
            {p.valorComparacion && etiquetaComparacion ? (
              <div className="fila">
                <span className="clave-linea" style={{ background: "var(--contexto)" }} />
                <strong>{p.valorComparacion}%</strong> <span>{etiquetaComparacion}</span>
              </div>
            ) : null}
            {p.diferencia ? <div>Diferencia: <strong>{p.diferencia}</strong></div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
