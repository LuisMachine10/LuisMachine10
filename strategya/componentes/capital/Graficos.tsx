// Gráficos SVG de Mena Capital (sin JavaScript en el navegador). Number() solo ubica puntos en el
// dibujo; las cifras que se leen salen de la tabla o la lista equivalente que acompaña a cada gráfico.
// Las series de tiempo usan lightweight-charts (GraficoSerie.tsx).

import type Big from "big.js";

const n = (b: Big) => Number(b.toFixed(4));

/** Tornado en HTML (se lee igual de nítido a 390 px que en escritorio): barra roja a la izquierda = menos patrimonio. */
export function Tornado({ filas, etiqueta }: { filas: { nom: string; bajo: Big; alto: Big }[]; etiqueta: string }) {
  if (!filas.length) return null;
  const max = Math.max(...filas.flatMap((f) => [Math.abs(n(f.bajo)), Math.abs(n(f.alto))]), 1);
  const lado = (v: Big) => {
    const vv = n(v);
    return { ancho: `${Math.max(0.6, (Math.abs(vv) / max) * 100)}%`, clase: vv >= 0 ? "pos" : "neg", derecha: vv >= 0 };
  };
  return (
    <div className="cap-tornado" role="img" aria-label={etiqueta}>
      {filas.map((f) => {
        const b = lado(f.bajo);
        const a = lado(f.alto);
        return (
          <div className="fila" key={f.nom}>
            <span className="nom">{f.nom}</span>
            <span className="mitad izq">{[b, a].filter((x) => !x.derecha).map((x, i) => <i key={i} className={x.clase} style={{ width: x.ancho }} />)}</span>
            <span className="mitad der">{[b, a].filter((x) => x.derecha).map((x, i) => <i key={i} className={x.clase} style={{ width: x.ancho }} />)}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Barra horizontal con marca de meta. pct y meta en fracción 0–1; `clase` pinta la barra con el color de la clase. */
export function Barra({ pct, meta, tono, clase }: { pct: Big | null; meta?: Big | null; tono?: "alerta" | "error" | null; clase?: string }) {
  const ancho = pct ? Math.max(0, Math.min(100, n(pct.times(100)))) : 0;
  const m = meta ? Math.max(0, Math.min(100, n(meta.times(100)))) : null;
  return (
    <div className="cap-barra" aria-hidden="true">
      <span className={tono ?? clase ?? undefined} style={{ width: `${ancho}%` }} />
      {m !== null ? <i style={{ left: `${m}%` }} /> : null}
    </div>
  );
}

export interface Porcion {
  id: string;
  nombre: string;
  /** Fracción del total (0–1). */
  pct: Big;
  color: string;
}

/** Donut de asignación. El centro muestra un texto corto (lo da quien lo usa). */
export function Donut({ porciones, centro, rotulo, etiqueta }: { porciones: Porcion[]; centro: string; rotulo: string; etiqueta: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const total = porciones.reduce((s, p) => s + Math.max(0, n(p.pct)), 0);
  let acum = 0;
  const separador = porciones.filter((p) => n(p.pct) > 0).length > 1 ? 1.5 : 0;
  return (
    <svg className="cap-donut" viewBox="0 0 148 148" role="img" aria-label={etiqueta}>
      <circle cx={74} cy={74} r={r} fill="none" stroke="var(--panel-alto)" strokeWidth={16} />
      {total > 0
        ? porciones.map((p) => {
            const f = Math.max(0, n(p.pct)) / total;
            if (f <= 0) return null;
            const largo = Math.max(0, f * c - separador);
            const el = (
              <circle
                key={p.id}
                cx={74}
                cy={74}
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth={16}
                strokeDasharray={`${largo} ${c - largo}`}
                strokeDashoffset={-acum * c}
                transform="rotate(-90 74 74)"
              />
            );
            acum += f;
            return el;
          })
        : null}
      <text x={74} y={72} textAnchor="middle" fontSize={17} fontWeight={650}>
        {centro}
      </text>
      <text className="centro-rotulo" x={74} y={89} textAnchor="middle">
        {rotulo}
      </text>
    </svg>
  );
}
