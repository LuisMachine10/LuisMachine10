"use client";

// Dólar y euro en UNA gráfica (lightweight-charts de TradingView, Apache-2.0). Los colores salen de las
// variables de app/globals.css (un solo archivo para cambiar la paleta). Las cifras llegan como texto;
// Number() solo ubica cada punto en el gráfico. La tabla equivalente está junto al gráfico.

import { useEffect, useRef } from "react";
import { ColorType, createChart, LineSeries, LineStyle } from "lightweight-charts";

export interface SerieDivisa {
  id: string;
  nombre: string;
  puntos: { fecha: string; valor: string }[];
  /** Variable de color de app/globals.css, p. ej. "--rd". */
  color: string;
  punteada?: boolean;
  /** Escala de precios: el euro va a la izquierda para que se vea su propio movimiento. */
  escala?: "left" | "right";
}

function token(nombre: string, respaldo: string): string {
  if (typeof window === "undefined") return respaldo;
  const v = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return v || respaldo;
}

/** Orden ascendente y un punto por fecha (el gráfico rechaza fechas repetidas). */
function aSerie(puntos: SerieDivisa["puntos"]) {
  const porFecha = new Map<string, string>();
  for (const p of puntos) if (!porFecha.has(p.fecha)) porFecha.set(p.fecha, p.valor);
  return [...porFecha.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([time, v]) => ({ time, value: Number(v) }));
}

export function GraficoDivisas({ series, etiqueta }: { series: SerieDivisa[]; etiqueta: string }) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const texto3 = token("--texto-3", "#7c8296");
    const rejilla = token("--rejilla", "#1c2130");
    const alto = token("--panel-alto", "#1c2130");
    const borde = token("--borde-fuerte", "#2f3850");
    const usaIzquierda = series.some((s) => s.escala === "left" && s.puntos.length);
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: texto3,
        fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
        fontSize: 11,
        attributionLogo: false,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: rejilla } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      leftPriceScale: { visible: usaIzquierda, borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      crosshair: {
        vertLine: { color: borde, style: LineStyle.Dashed, labelBackgroundColor: alto },
        horzLine: { color: borde, style: LineStyle.Dashed, labelBackgroundColor: alto },
      },
      localization: { locale: "es-DO", priceFormatter: (p: number) => p.toFixed(4) },
      // Sin arrastrar ni hacer zoom: en el celular el dedo debe poder desplazar la página.
      handleScroll: false,
      handleScale: false,
      kineticScroll: { touch: false, mouse: false },
    });
    for (const s of series) {
      if (!s.puntos.length) continue;
      const linea = chart.addSeries(LineSeries, {
        color: token(s.color, "#4c8dff"),
        lineWidth: s.punteada ? 1 : 2,
        lineStyle: s.punteada ? LineStyle.Dotted : LineStyle.Solid,
        priceLineVisible: false,
        lastValueVisible: !s.punteada,
        crosshairMarkerRadius: 3,
        // Un punto suelto (p. ej. el euro con una sola fecha) se ve como marcador.
        pointMarkersVisible: s.puntos.length < 3,
        priceScaleId: s.escala ?? "right",
        priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      });
      linea.setData(aSerie(s.puntos));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series]);

  return <div ref={caja} className="rd-grafico" role="img" aria-label={etiqueta} />;
}
