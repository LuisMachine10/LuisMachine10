"use client";

// Serie de tiempo de Mena Capital con lightweight-charts (TradingView, Apache-2.0). Recibe las cifras
// como TEXTO decimal; Number() solo ubica cada punto en el dibujo (regla de la casa). Las cifras que se
// leen están en la tabla equivalente que acompaña al gráfico y en la leyenda, formateadas desde el texto.

import { useEffect, useRef, useState } from "react";
import { AreaSeries, ColorType, createChart, type IChartApi, LineSeries, LineStyle, type Time } from "lightweight-charts";
import { cifra } from "@/lib/formato";

export interface PuntoSerie {
  /** AAAA-MM-DD */
  t: string;
  /** Decimal como texto. */
  v: string;
}

export interface SerieGrafico {
  nombre: string;
  color: string;
  puntos: PuntoSerie[];
  /** Área rellena bajo la línea (la serie principal). */
  area?: boolean;
  ancho?: number;
}

const COLORES = {
  texto: "#7c8296",
  rejilla: "rgba(35, 42, 59, 0.55)",
  cruz: "#4a5168",
};

/** "1,234,567" → "1.2M", "45,000" → "45k" (solo para el eje). */
function corto(x: number): string {
  const a = Math.abs(x);
  if (a >= 1e6) return `${(x / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${Math.round(x / 1e3)}k`;
  return x.toFixed(0);
}

function fechaLeyenda(t: string): string {
  const [y, m, d] = t.split("-").map(Number);
  return new Intl.DateTimeFormat("es-DO", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function GraficoSerie({
  series,
  etiqueta,
  alto = 240,
  prefijo = "RD$",
  meta,
}: {
  series: SerieGrafico[];
  etiqueta: string;
  alto?: number;
  prefijo?: string;
  /** Línea horizontal punteada (p. ej. la meta de independencia). */
  meta?: { v: string; nombre: string } | null;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState<{ t: string; valores: { nombre: string; color: string; v: string }[] } | null>(null);
  const ultimo = (() => {
    const s = series[0];
    const p = s?.puntos.at(-1);
    return p ? { t: p.t, valores: series.map((x) => ({ nombre: x.nombre, color: x.color, v: x.puntos.at(-1)?.v ?? "" })) } : null;
  })();

  const clave = JSON.stringify([series, meta, alto]);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const chart: IChartApi = createChart(el, {
      autoSize: true,
      height: alto,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COLORES.texto,
        fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
        fontSize: 11,
        // El crédito de TradingView Lightweight Charts va en el pie de Mena Capital (con enlace).
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORES.rejilla } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.18, bottom: 0.06 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      crosshair: {
        vertLine: { color: COLORES.cruz, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a3045" },
        horzLine: { color: COLORES.cruz, width: 1, style: LineStyle.Dashed, labelBackgroundColor: "#2a3045" },
      },
      localization: { locale: "es-DO", priceFormatter: corto },
      handleScroll: false,
      handleScale: false,
    });

    const textos = new Map<string, Map<string, string>>();
    series.forEach((s, i) => {
      const datos = s.puntos.map((p) => ({ time: p.t as Time, value: Number(p.v) }));
      const comun = { lineWidth: (s.ancho ?? 2) as 1 | 2 | 3 | 4, priceLineVisible: false, lastValueVisible: i === 0, crosshairMarkerRadius: 4 };
      const serie = s.area
        ? chart.addSeries(AreaSeries, { ...comun, lineColor: s.color, topColor: `${s.color}55`, bottomColor: `${s.color}05` })
        : chart.addSeries(LineSeries, { ...comun, color: s.color });
      serie.setData(datos);
      if (i === 0 && meta) {
        serie.createPriceLine({ price: Number(meta.v), color: "#f5a623", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: meta.nombre });
      }
      textos.set(s.nombre, new Map(s.puntos.map((p) => [p.t, p.v])));
    });
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setCursor(null);
        return;
      }
      const t = String(param.time);
      setCursor({ t, valores: series.map((s) => ({ nombre: s.nombre, color: s.color, v: textos.get(s.nombre)?.get(t) ?? "" })) });
    });

    return () => chart.remove();
    // `clave` resume series, meta y alto: el gráfico se recrea solo si cambian los datos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const mostrar = cursor ?? ultimo;
  return (
    <div className="cap-serie">
      {mostrar ? (
        <div className="cap-serie-leyenda" aria-hidden="true">
          <span>{fechaLeyenda(mostrar.t)}</span>
          {mostrar.valores
            .filter((x) => x.v)
            .map((x) => (
              <span key={x.nombre}>
                <span className="clave" style={{ background: x.color }} />
                {series.length > 1 ? `${x.nombre} ` : ""}
                <strong>
                  {prefijo} {cifra(x.v, 0)}
                </strong>
              </span>
            ))}
        </div>
      ) : null}
      <div ref={caja} className="cap-serie-lienzo" role="img" aria-label={etiqueta} style={{ height: alto }} />
    </div>
  );
}
