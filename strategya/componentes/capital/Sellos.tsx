// Sellos de origen de las cifras de Mena Capital: el tipo de cambio (BCRD o manual), los precios
// (Finnhub o manual) y los registros propios de Mena (cierre congelado o cartera de hoy).

import { SelloFuente } from "@/componentes/SelloFuente";
import { dias } from "@/lib/capital/fechas";
import type { FotoCalculada } from "@/lib/capital/cierres";
import { num } from "@/lib/capital/formato";
import type { FxMoneda, PrecioMercado } from "@/lib/capital/posicion";
import { fechaCorta } from "@/lib/formato";
import { frescura } from "@/lib/frescura";

/** Antigüedad máxima antes de pintar «DESACTUALIZADO»: igual que USDDOP_VENTA en el catálogo (4 días). */
export const MAX_ANTIGUEDAD_MERCADO_MIN = 5760;
/** El tipo de cambio manual se marca vencido a los 45 días (regla del artefacto). */
export const MAX_DIAS_FX_MANUAL = 45;

export function SelloFx({ fx, moneda, ahora, hoy }: { fx: FxMoneda; moneda: "USD" | "EUR"; ahora: Date; hoy: string }) {
  if (fx.origen === "bcrd" && fx.fecha) {
    return (
      <SelloFuente
        ahora={ahora}
        d={{
          fuente: `BCRD · US$ venta ${num(fx.valor!, 2)}`,
          url: fx.url,
          fechaDato: fx.fecha,
          verificadoEn: fx.recogidoEn,
          desactualizado: frescura({ fecha_dato: fx.fecha }, MAX_ANTIGUEDAD_MERCADO_MIN, ahora).desactualizado,
          ultimaCorridaFallo: false,
        }}
      />
    );
  }
  if (fx.origen === "manual") {
    const vencido = fx.fecha ? dias(fx.fecha, hoy) > MAX_DIAS_FX_MANUAL : true;
    return (
      <div className="sello">
        <span>
          {moneda === "USD" ? "US$" : "€"} {num(fx.valor!, 2)} · manual (tus parámetros)
          {moneda === "USD" ? ": no hay dólar del BCRD guardado" : ": no hay serie EUR/DOP en Strategya"}
        </span>
        <span>· {fx.fecha ? `actualizado el ${fechaCorta(fx.fecha)}` : "sin fecha"}</span>
        {vencido ? <span className="vencido">· DESACTUALIZADO</span> : null}
      </div>
    );
  }
  return (
    <div className="sello">
      <span className="vencido">Sin tipo de cambio {moneda === "USD" ? "US$" : "€"}: ni dato del BCRD ni manual. Cárgalo en Cartera → Ajustes.</span>
    </div>
  );
}

export function SelloPrecio({ p, ahora }: { p: PrecioMercado | null; ahora: Date }) {
  if (!p) return <span className="sello">precio manual (sin cotización de mercado guardada)</span>;
  return (
    <SelloFuente
      ahora={ahora}
      d={{
        fuente: "Finnhub",
        url: p.url,
        fechaDato: p.fecha,
        verificadoEn: p.recogidoEn,
        desactualizado: frescura({ fecha_dato: p.fecha, hora_dato: p.horaDato }, MAX_ANTIGUEDAD_MERCADO_MIN, ahora).desactualizado,
        ultimaCorridaFallo: false,
      }}
    />
  );
}

export function SelloRegistros({ foto, mesCierre }: { foto: FotoCalculada; mesCierre?: string | null }) {
  return (
    <div className="sello">
      <span>Tus registros (Mena Capital)</span>
      {foto.vivo ? (
        <span>· cartera de hoy, en vivo</span>
      ) : (
        <span>
          · foto congelada{mesCierre ? ` en el cierre de ${mesCierre}` : ""}
          {foto.fecha ? ` (${fechaCorta(foto.fecha)})` : ""}
        </span>
      )}
    </div>
  );
}
