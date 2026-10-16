// Sección «Caja» de la terminal: puedes gastar hasta…, disponible hoy, deuda en tarjetas, por
// confirmar y lo planificado de los próximos 7 días. Server Component: lee y simula en el servidor.

import "@/estilos/caja.css";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { fechaBreve, hoyRD, mesDe } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import { horizonte, resumir, simular } from "@/lib/caja/motor";
import { NOMBRE_TIPO } from "@/lib/caja/tipos";
import { proximos, ultimoCuadre } from "@/lib/caja/vista";
import { SelloCaja } from "./SelloCaja";
import { TilesResumen } from "./TilesResumen";

export async function ResumenCaja({ ahora = new Date() }: { ahora?: Date } = {}) {
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return <PanelError titulo="Calendario de Caja" mensaje={(e as Error).message} />;
  }
  const { datos, editadoEn } = lectura;
  const hoy = hoyRD(ahora);

  if (!datos.config) {
    return (
      <section className="panel caja" aria-labelledby="t-resumen-caja">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-resumen-caja">
            Caja
          </h2>
        </div>
        <p className="vacio">
          Sin datos todavía: <Link href="/caja/importar">importa tu Calendario de Caja</Link> o ponle una fecha de inicio en{" "}
          <Link href="/caja/ajustes">Ajustes</Link>.
        </p>
      </section>
    );
  }

  const sim = simular(datos, { hoy, hasta: horizonte(mesDe(hoy), hoy) });
  const r = resumir(sim, datos.config);
  const siguientes = proximos(sim, 7);

  return (
    <section className="panel caja" aria-labelledby="t-resumen-caja">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-resumen-caja">
          <Link href="/caja">Caja</Link>
        </h2>
        <SelloCaja ultimoCuadre={ultimoCuadre(datos, hoy)} inicio={datos.config.inicio} editadoEn={editadoEn} ahora={ahora} />
      </div>
      <div className="panel-cuerpo">
        <TilesResumen r={r} colchon={datos.config.colchon} />
        {sim.advertencias.map((a) => (
          <p key={a} className="caja-mensaje error">
            {a}
          </p>
        ))}
        <h3 className="caja-tile-titulo" style={{ marginTop: 12 }}>
          Próximos 7 días
        </h3>
        {siguientes.length ? (
          <ul className="caja-resumen-proximos">
            {siguientes.slice(0, 8).map(({ fecha, o }) => (
              <li key={`${fecha}-${o.recurrenteId}`}>
                <span>
                  <span className="tenue mono">{fechaBreve(fecha)}</span> {o.nombre}{" "}
                  <span className="tenue chico">· {NOMBRE_TIPO[o.tipo].toLowerCase()}</span>
                </span>
                <span className={`mono ${o.tipo === "ingreso" ? "sube" : ""}`}>
                  {o.tipo === "ingreso" ? "+" : o.tipo === "gasto" ? "−" : ""}
                  {o.montoDOP ? rd(o.montoDOP) : `${enMoneda(o.monto, o.moneda)} (sin tasa)`}
                </span>
              </li>
            ))}
            {siguientes.length > 8 ? (
              <li className="tenue chico">
                <Link href="/caja">y {siguientes.length - 8} más…</Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="tenue chico">Nada planificado en los próximos 7 días.</p>
        )}
      </div>
    </section>
  );
}
