// Gráficos SVG de Mena Capital (sin JavaScript en el navegador). Number() solo ubica puntos en el
// dibujo; las cifras que se leen salen de la tabla equivalente que acompaña a cada gráfico.

import type Big from "big.js";

const n = (b: Big) => Number(b.toFixed(2));

export function Sparkline({ valores, etiqueta }: { valores: Big[]; etiqueta: string }) {
  if (valores.length < 2) return null;
  const w = 560;
  const h = 56;
  const vs = valores.map(n);
  const min = Math.min(...vs);
  const max = Math.max(...vs);
  const rango = max - min || 1;
  const x = (i: number) => (i / (vs.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 6 - ((v - min) / rango) * (h - 14);
  const d = vs.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="cap-grafico" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={etiqueta} style={{ height: 56 }}>
      <path d={d} fill="none" stroke="var(--ambar)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={x(vs.length - 1)} cy={y(vs[vs.length - 1])} r={3} fill="var(--ambar)" />
    </svg>
  );
}

export interface SerieLinea {
  nombre: string;
  color: string;
  datos: Big[];
  ancho?: number;
}

export function Lineas({ series, etiquetas, meta, etiqueta }: { series: SerieLinea[]; etiquetas: string[]; meta?: Big | null; etiqueta: string }) {
  if (!series.length || series[0].datos.length < 2) return null;
  const w = 560;
  const h = 200;
  const pl = 52;
  const pr = 8;
  const pt = 10;
  const pb = 22;
  const todos = series.flatMap((s) => s.datos.map(n));
  const metaN = meta ? n(meta) : null;
  const max = Math.max(...todos, metaN && metaN < Math.max(...todos) * 3 ? metaN : 0) * 1.06 || 1;
  const min = Math.min(0, ...todos);
  const largo = series[0].datos.length;
  const x = (i: number) => pl + (i / Math.max(1, largo - 1)) * (w - pl - pr);
  const y = (v: number) => h - pb - ((v - min) / (max - min || 1)) * (h - pt - pb);
  const marcas = [0, 1, 2, 3, 4].map((i) => min + ((max - min) * i) / 4);
  const corto = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`);
  return (
    <svg className="cap-grafico" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={etiqueta}>
      {marcas.map((v) => (
        <g key={v}>
          <line className="rejilla" x1={pl} x2={w - pr} y1={y(v)} y2={y(v)} />
          <text x={pl - 6} y={y(v) + 3} textAnchor="end">
            {corto(v)}
          </text>
        </g>
      ))}
      {etiquetas.map((l, i) =>
        l ? (
          <text key={i} x={x(i)} y={h - 6} textAnchor="middle">
            {l}
          </text>
        ) : null,
      )}
      {metaN !== null && metaN <= max ? (
        <line x1={pl} x2={w - pr} y1={y(metaN)} y2={y(metaN)} stroke="var(--ambar)" strokeDasharray="4 3" strokeWidth={1.2} />
      ) : null}
      {series.map((s) => (
        <path
          key={s.nombre}
          d={s.datos.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(n(v)).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={s.color}
          strokeWidth={s.ancho ?? 2}
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

export function Tornado({ filas, etiqueta }: { filas: { nom: string; bajo: Big; alto: Big }[]; etiqueta: string }) {
  if (!filas.length) return null;
  const w = 560;
  const fila = 40;
  const h = filas.length * fila + 8;
  const cx = w / 2;
  const mitad = w * 0.46;
  const max = Math.max(...filas.flatMap((f) => [Math.abs(n(f.bajo)), Math.abs(n(f.alto))]), 1);
  return (
    <svg className="cap-grafico cap-tornado" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={etiqueta}>
      <line x1={cx} x2={cx} y1={2} y2={h - 2} stroke="var(--borde)" />
      {filas.map((f, i) => {
        const yT = 12 + i * fila;
        return (
          <g key={f.nom}>
            <text x={0} y={yT}>
              {f.nom}
            </text>
            {[f.bajo, f.alto].map((v, j) => {
              const vv = n(v);
              const largo = Math.max(1.5, (Math.abs(vv) / max) * mitad);
              return <rect key={j} className={vv >= 0 ? "pos" : "neg"} x={vv >= 0 ? cx : cx - largo} y={yT + 5} width={largo} height={14} opacity={0.85} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}

/** Barra horizontal con marca de meta (CSS). pct y meta en fracción 0–1. */
export function Barra({ pct, meta, tono }: { pct: Big | null; meta?: Big | null; tono?: "alerta" | "error" | null }) {
  const ancho = pct ? Math.max(0, Math.min(100, n(pct.times(100)))) : 0;
  const m = meta ? Math.max(0, Math.min(100, n(meta.times(100)))) : null;
  return (
    <div className="cap-barra" aria-hidden="true">
      <span className={tono ?? undefined} style={{ width: `${ancho}%` }} />
      {m !== null ? <i style={{ left: `${m}%` }} /> : null}
    </div>
  );
}
