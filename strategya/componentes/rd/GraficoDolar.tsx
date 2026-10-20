"use client";

// Gráfico del dólar de referencia del BCRD (compra y venta) con lightweight-charts (TradingView, Apache-2.0).
// Los valores llegan como texto; Number() solo ubica cada punto en el gráfico (la cifra mostrada en las
// tarjetas y en la tabla sale del texto original). La tabla equivalente está junto al gráfico.

import { useEffect, useRef } from "react";
import { AreaSeries, ColorType, createChart, LineSeries, LineStyle } from "lightweight-charts";

export interface PuntoDolar {
  fecha: string;
  valor: string;
}

const COLORES = {
  texto: "#7c8296",
  rejilla: "rgba(35, 42, 59, 0.55)",
  venta: "#4c8dff",
  compra: "#b2b5be",
  cruz: "#3a445c",
};

/** Orden ascendente y un punto por fecha (el gráfico rechaza fechas repetidas); se queda el primero recibido. */
function aSerie(puntos: PuntoDolar[]) {
  const porFecha = new Map<string, PuntoDolar>();
  for (const p of puntos) if (!porFecha.has(p.fecha)) porFecha.set(p.fecha, p);
  return [...porFecha.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((p) => ({ time: p.fecha, value: Number(p.valor) }));
}

export function GraficoDolar({ venta, compra, etiqueta }: { venta: PuntoDolar[]; compra: PuntoDolar[]; etiqueta: string }) {
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: COLORES.texto,
        fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: COLORES.rejilla } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.15, bottom: 0.08 } },
      timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true, lockVisibleTimeRangeOnResize: true },
      crosshair: {
        vertLine: { color: COLORES.cruz, style: LineStyle.Dashed, labelBackgroundColor: "#1c2130" },
        horzLine: { color: COLORES.cruz, style: LineStyle.Dashed, labelBackgroundColor: "#1c2130" },
      },
      localization: { locale: "es-DO", priceFormatter: (p: number) => p.toFixed(4) },
      // Sin arrastrar ni hacer zoom: en el celular el dedo debe poder desplazar la página.
      handleScroll: false,
      handleScale: false,
      kineticScroll: { touch: false, mouse: false },
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: COLORES.venta,
      lineWidth: 2,
      topColor: "rgba(76, 141, 255, 0.28)",
      bottomColor: "rgba(76, 141, 255, 0.02)",
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerRadius: 4,
      title: "Venta",
      priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
    });
    area.setData(aSerie(venta));
    if (compra.length) {
      const linea = chart.addSeries(LineSeries, {
        color: COLORES.compra,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerRadius: 3,
        title: "Compra",
        priceFormat: { type: "price", precision: 4, minMove: 0.0001 },
      });
      linea.setData(aSerie(compra));
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [venta, compra]);

  return <div ref={caja} className="rd-grafico" role="img" aria-label={etiqueta} />;
}
