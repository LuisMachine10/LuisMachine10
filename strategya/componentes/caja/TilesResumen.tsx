// Tiles de arriba del Calendario de Caja (y de la sección Caja de la terminal).

import Big from "big.js";
import { fechaBreve } from "@/lib/caja/fechas";
import { rd } from "@/lib/caja/formato";
import { NOMBRE_ESTADO, type ResumenCalculado } from "@/lib/caja/motor";

export function TilesResumen({ r, colchon }: { r: ResumenCalculado; colchon: string }) {
  const pc = r.porConfirmar;
  return (
    <div className="caja-tiles">
      <div className="caja-tile principal">
        <p className="caja-tile-titulo">
          {r.puedesGastar?.hasta ? `Puedes gastar hasta el ${fechaBreve(r.puedesGastar.hasta)}` : "Puedes gastar"}
        </p>
        {r.puedesGastar ? (
          <>
            <p className="caja-tile-cifra">{rd(r.puedesGastar.monto)}</p>
            <p className="caja-tile-nota">
              {r.puedesGastar.hasta
                ? `Lo que sobra sobre tu colchón (${rd(colchon)}) en el día más justo antes del próximo ingreso (${fechaBreve(r.puedesGastar.diaMinimo)}).`
                : `Sin ingreso a la vista en los próximos 62 días: lo que sobra sobre tu colchón (${rd(colchon)}) en el día más justo (${fechaBreve(r.puedesGastar.diaMinimo)}).`}
            </p>
          </>
        ) : (
          <p className="caja-tile-nota">Sin días simulados desde hoy.</p>
        )}
      </div>
      <div className="caja-tile">
        <p className="caja-tile-titulo">Disponible hoy</p>
        <p className="caja-tile-cifra">{r.disponibleHoy ? rd(r.disponibleHoy) : "—"}</p>
        {r.estadoHoy ? (
          <p className="caja-tile-nota">
            <span className={`caja-estado ${r.estadoHoy}`}>{NOMBRE_ESTADO[r.estadoHoy]}</span> · banco + efectivo
          </p>
        ) : (
          <p className="caja-tile-nota">Hoy es antes del inicio de la simulación.</p>
        )}
      </div>
      <div className="caja-tile">
        <p className="caja-tile-titulo">Deuda en tarjetas</p>
        <p className="caja-tile-cifra">{r.deudaTarjetas ? rd(r.deudaTarjetas) : "—"}</p>
      </div>
      <div className="caja-tile">
        <p className="caja-tile-titulo">Ahorro e inversión</p>
        <p className="caja-tile-cifra">{r.ahorroTotal ? rd(r.ahorroTotal) : "—"}</p>
      </div>
      <div className="caja-tile">
        <p className="caja-tile-titulo">Por confirmar</p>
        <p className={`caja-tile-cifra ${pc.cantidad ? "" : "tenue"}`}>{pc.cantidad}</p>
        <p className="caja-tile-nota">
          {pc.cantidad
            ? [
                new Big(pc.salidas).gt(0) ? `${rd(pc.salidas)} en gastos` : null,
                new Big(pc.entradas).gt(0) ? `${rd(pc.entradas)} en ingresos` : null,
                new Big(pc.otros).gt(0) ? `${rd(pc.otros)} en transferencias` : null,
                pc.sinTasa ? `${pc.sinTasa} en US$ sin tasa` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "recurrentes pasados sin confirmar"
            : "Nada pendiente de días pasados."}
        </p>
      </div>
    </div>
  );
}
