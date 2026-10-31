// Mosaicos de arriba del Calendario del Presupuesto: la cifra que
// importa grande, lo demás pequeño. Cada término tiene su «?» con una explicación corta.

import Big from "big.js";
import { fechaBreve } from "@/lib/caja/fechas";
import { rd } from "@/lib/caja/formato";
import { NOMBRE_ESTADO, type ResumenCalculado } from "@/lib/caja/motor";
import { Ayuda } from "./Iconos";

const ESTADO_CORTO = { holgado: "Holgado", cerca: "Cerca del mínimo", bajo: "Bajo tu mínimo" } as const;

export function TilesResumen({ r, colchon }: { r: ResumenCalculado; colchon: string }) {
  const pc = r.porConfirmar;
  const tieneAhorro = r.ahorroTotal && new Big(r.ahorroTotal).gt(0);
  return (
    <div className="caja-mosaicos-marco">
    <div className="caja-mosaicos">
      <div className="caja-mosaico principal">
        <div className="caja-mosaico-titulo">
          {r.puedesGastar?.hasta ? `Puedes gastar hasta el ${fechaBreve(r.puedesGastar.hasta)}` : "Puedes gastar"}
          <Ayuda que="«puedes gastar»">
            Lo que te sobra por encima de tu colchón ({rd(colchon)}) en el día más apretado
            {r.puedesGastar?.hasta ? " antes de tu próximo ingreso" : " de los próximos 62 días"}. Si gastas más, algún día bajarías de tu
            mínimo.
          </Ayuda>
        </div>
        {r.puedesGastar ? (
          <>
            <p className={`caja-mosaico-cifra ${new Big(r.puedesGastar.monto).gt(0) ? "" : "baja"}`}>{rd(r.puedesGastar.monto)}</p>
            <p className="caja-mosaico-nota">
              {new Big(r.puedesGastar.monto).gt(0)
                ? `Sin bajar de tu colchón. Tu día más justo: ${fechaBreve(r.puedesGastar.diaMinimo)}.`
                : `Nada: el ${fechaBreve(r.puedesGastar.diaMinimo)} quedas en tu colchón o por debajo.`}
            </p>
          </>
        ) : (
          <p className="caja-mosaico-nota">Todavía no hay días calculados desde hoy.</p>
        )}
        {tieneAhorro ? (
          <p className="caja-mosaico-extra">
            Además tienes <strong className="mono">{rd(r.ahorroTotal!)}</strong> en ahorro e inversión (no se cuenta para gastar).
          </p>
        ) : null}
      </div>

      <div className="caja-mosaico">
        <div className="caja-mosaico-titulo">
          Disponible hoy
          <Ayuda que="«disponible hoy»">Lo que tienes hoy en tus cuentas de banco y en efectivo, después de lo de hoy. No incluye ahorro ni tarjetas.</Ayuda>
        </div>
        <p className="caja-mosaico-cifra chica">{r.disponibleHoy ? rd(r.disponibleHoy) : "—"}</p>
        {r.estadoHoy ? (
          <p className="caja-mosaico-nota">
            <span className={`caja-estado ${r.estadoHoy}`} title={NOMBRE_ESTADO[r.estadoHoy]}>
              {ESTADO_CORTO[r.estadoHoy]}
            </span>
          </p>
        ) : (
          <p className="caja-mosaico-nota">Tu calendario empieza más adelante.</p>
        )}
      </div>

      <div className="caja-mosaico">
        <div className="caja-mosaico-titulo">Deuda en tarjetas</div>
        <p className="caja-mosaico-cifra chica">{r.deudaTarjetas ? rd(r.deudaTarjetas) : "—"}</p>
        {r.deudaTarjetas && new Big(r.deudaTarjetas).gt(0) ? null : <p className="caja-mosaico-nota">No debes nada</p>}
      </div>

      <div className="caja-mosaico">
        <div className="caja-mosaico-titulo">
          ¿Ya se hizo?
          <Ayuda que="«¿ya se hizo?»">
            Tus fijos se planifican solos. Estos son de días que ya pasaron y aún no dices si de verdad ocurrieron: no se cuentan hasta que
            toques el día con punto ámbar y digas «Sí, ya se hizo» o «Este mes no».
          </Ayuda>
        </div>
        <p className={`caja-mosaico-cifra chica ${pc.cantidad ? "alerta" : "tenue"}`}>{pc.cantidad}</p>
        <p className="caja-mosaico-nota">
          {pc.cantidad
            ? [
                new Big(pc.salidas).gt(0) ? `${rd(pc.salidas)} en gastos` : null,
                new Big(pc.entradas).gt(0) ? `${rd(pc.entradas)} en ingresos` : null,
                new Big(pc.otros).gt(0) ? `${rd(pc.otros)} en transferencias` : null,
                pc.sinTasa ? `${pc.sinTasa} en US$ sin tasa` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "fijos pasados sin responder"
            : "Todo al día"}
        </p>
      </div>
    </div>
    </div>
  );
}
