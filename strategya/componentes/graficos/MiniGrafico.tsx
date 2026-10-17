"use client";

// Minigráfico de área (TradingView Lightweight Charts, Apache-2.0). Solo dibuja: las cifras ya vienen
// guardadas y formateadas desde el servidor; Number() se usa únicamente para ubicar cada punto en pantalla.
// La descripción y la tabla equivalente van en texto para lectores de pantalla.

import { useEffect, useRef } from "react";

export interface PuntoMini {
  /** Segundos Unix (UTC) del dato. */
  t: number;
  /** Valor exacto como texto. */
  v: string;
  /** Rótulo legible para la tabla equivalente (hora RD o fecha). */
  rotulo: string;
  /** Valor formateado para la tabla equivalente. */
  texto: string;
}

export type Tono = "sube" | "baja" | "igual";

const COLOR: Record<Tono, { linea: string; arriba: string; abajo: string }> = {
  sube: {
    linea: "#22ab94",
    arriba: "rgba(34, 171, 148, 0.28)",
    abajo: "rgba(34, 171, 148, 0)",
  },
  baja: {
    linea: "#f23645",
    arriba: "rgba(242, 54, 69, 0.26)",
    abajo: "rgba(242, 54, 69, 0)",
  },
  igual: {
    linea: "#7c8296",
    arriba: "rgba(124, 130, 150, 0.22)",
    abajo: "rgba(124, 130, 150, 0)",
  },
};

export function MiniGrafico({
  puntos,
  tono,
  descripcion,
  alto = 56,
  tituloTabla,
}: {
  puntos: PuntoMini[];
  tono: Tono;
  /** Resumen para lectores de pantalla (p. ej. «S&P 500: 78 lecturas de hoy, de 7,700 a 7,705»). */
  descripcion: string;
  alto?: number;
  tituloTabla: string;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const clave = puntos.map((p) => `${p.t}:${p.v}`).join("|");

  useEffect(() => {
    const el = caja.current;
    if (!el || puntos.length < 2) return;
    let vivo = true;
    let destruir: (() => void) | null = null;
    void import("lightweight-charts").then(
      ({ createChart, AreaSeries, LineType, ColorType }) => {
        if (!vivo) return;
        const c = COLOR[tono];
        const chart = createChart(el, {
          autoSize: true,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#7c8296",
            attributionLogo: false,
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
          },
          rightPriceScale: { visible: false },
          leftPriceScale: { visible: false },
          timeScale: {
            visible: false,
            borderVisible: false,
            fixLeftEdge: true,
            fixRightEdge: true,
          },
          crosshair: {
            vertLine: { visible: false, labelVisible: false },
            horzLine: { visible: false, labelVisible: false },
          },
          handleScroll: false,
          handleScale: false,
        });
        const serie = chart.addSeries(AreaSeries, {
          lineColor: c.linea,
          topColor: c.arriba,
          bottomColor: c.abajo,
          lineWidth: 2,
          lineType: LineType.Curved,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        // Tiempos estrictamente crecientes: si dos lecturas comparten segundo, queda la última.
        const porTiempo = new Map<number, number>();
        for (const p of puntos) porTiempo.set(p.t, Number(p.v));
        const datos = [...porTiempo.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([t, value]) => ({ time: t as never, value }));
        serie.setData(datos);
        chart.timeScale().fitContent();
        destruir = () => chart.remove();
      },
    );
    return () => {
      vivo = false;
      destruir?.();
    };
    // `clave` resume los puntos: el gráfico se vuelve a crear solo si cambian los datos o el tono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, tono]);

  if (puntos.length < 2) return null;
  return (
    <figure className="mini">
      <div
        ref={caja}
        className="mini-lienzo"
        style={{ height: alto }}
        role="img"
        aria-label={descripcion}
      />
      <div className="sr-solo">
        <table>
          <caption>{tituloTabla}</caption>
          <thead>
            <tr>
              <th scope="col">Momento</th>
              <th scope="col">Valor</th>
            </tr>
          </thead>
          <tbody>
            {puntos.map((p) => (
              <tr key={p.t}>
                <th scope="row">{p.rotulo}</th>
                <td>{p.texto}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
