// Resumen del Presupuesto para el Dashboard («Rendimiento del presupuesto») y News: la utilidad neta del
// mes (presupuestado contra real, del estado de resultados), lo que puedes gastar sin bajar de tu
// colchón, lo que falta por responder y lo que viene en 7 días. Server Component: lee y calcula en el
// servidor. Misma interfaz de siempre: { ahora? }.

import "@/estilos/caja.css";
import Big from "big.js";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { fechaBreve, hoyRD, mesDe, nombreMes } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import { horizonte, resumir, simular } from "@/lib/caja/motor";
import { estadoDeResultados } from "@/lib/caja/resultados";
import { proximos, ultimoCuadre } from "@/lib/caja/vista";
import { Barra, Diferencia } from "./EstadoResultados";
import { Ayuda } from "./Iconos";
import { SelloCaja } from "./SelloCaja";
import { nombreDeMovimiento } from "@/lib/caja/nombre-movimiento";

const MAX_PROXIMOS = 4;

export async function ResumenCaja({ ahora = new Date() }: { ahora?: Date } = {}) {
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return <PanelError titulo="Presupuesto" mensaje={(e as Error).message} />;
  }
  const { datos, editadoEn } = lectura;
  const hoy = hoyRD(ahora);

  if (!datos.config) {
    return (
      <section className="panel caja" aria-labelledby="t-resumen-caja">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-resumen-caja">
            Presupuesto
          </h2>
        </div>
        <div className="panel-cuerpo caja-resumen-vacio">
          <p className="tenue">Anota una vez lo que te entra, lo que gastas y tus cuentas: aquí verás tu utilidad del mes y cuánto puedes gastar.</p>
          <Link href="/caja" className="boton caja-boton-grande">
            Crear mi presupuesto
          </Link>
        </div>
      </section>
    );
  }

  const mes = mesDe(hoy);
  const sim = simular(datos, { hoy, hasta: horizonte(mes, hoy) });
  const r = resumir(sim, datos.config);
  const e = estadoDeResultados(datos, mes, { sim });
  const un = e.utilidadNeta;
  const siguientes = proximos(sim, 7);
  const pc = r.porConfirmar.cantidad;

  return (
    <section className="panel caja caja-resumen-tablero" aria-labelledby="t-resumen-caja">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-resumen-caja">
          <Link href="/caja/resultados">Tu presupuesto de {nombreMes(mes)}</Link>
        </h2>
        <SelloCaja ultimoCuadre={ultimoCuadre(datos, hoy)} inicio={datos.config.inicio} editadoEn={editadoEn} ahora={ahora} />
      </div>
      <div className="panel-cuerpo">
        <div className="caja-rt-neta">
          <div className="caja-mosaico-titulo">
            Utilidad neta del mes
            <Ayuda que="la utilidad neta">
              Ingresos − costos − gastos − gastos financieros + otros ingresos − otros gastos. «Real» es lo anotado o marcado como hecho;
              «presupuestado», tus fijos más lo que escribiste en Configuración.
            </Ayuda>
          </div>
          <p className={`cifra-grande mono ${new Big(un.real).lt(0) ? "baja" : ""}`}>{rd(un.real)}</p>
          <p className="caja-er-heroe-nota">
            <span className="tenue">de {rd(un.presupuestado)} presupuestado</span> <Diferencia d={un.diferencia} corto />
          </p>
          <Barra l={{ presupuestado: un.presupuestado, real: un.real, pendiente: "0" }} entrada />
        </div>
        <dl className="caja-rt-claves">
          <div>
            <dt>Ingresos</dt>
            <dd className="mono">{rd(e.secciones.ingreso.real)}</dd>
            <dd className="chico tenue mono">de {rd(e.secciones.ingreso.presupuestado)}</dd>
          </div>
          <div>
            <dt>Gastos</dt>
            <dd className="mono">{rd(e.gastosTotales.real)}</dd>
            <dd className="chico tenue mono">de {rd(e.gastosTotales.presupuestado)}</dd>
          </div>
          <div>
            <dt>
              {r.puedesGastar?.hasta ? `Puedes gastar hasta el ${fechaBreve(r.puedesGastar.hasta)}` : "Puedes gastar"}
            </dt>
            <dd className={`mono ${r.puedesGastar && !new Big(r.puedesGastar.monto).gt(0) ? "baja" : ""}`}>{r.puedesGastar ? rd(r.puedesGastar.monto) : "—"}</dd>
            <dd className="chico tenue">sin bajar de tu colchón</dd>
          </div>
          <div>
            <dt>¿Ya se hizo?</dt>
            <dd className={`mono ${pc ? "alerta" : ""}`}>{pc ? `${pc} por responder` : "Todo al día"}</dd>
            <dd className="chico tenue">{pc ? <Link href="/caja">Responder en el calendario</Link> : "fijos de días pasados"}</dd>
          </div>
        </dl>
        {sim.advertencias.map((a) => (
          <p key={a} className="caja-aviso">
            {a}
          </p>
        ))}
        <h3 className="caja-subtitulo">Lo que viene en 7 días</h3>
        {siguientes.length ? (
          <ul className="caja-resumen-proximos">
            {siguientes.slice(0, MAX_PROXIMOS).map(({ fecha, o }) => (
              <li key={`${fecha}-${o.recurrenteId}`}>
                <span>
                  <span className="tenue mono">{fechaBreve(fecha)}</span> {o.nombre}{" "}
                  <span className="tenue chico">· {nombreDeMovimiento(o, datos.cuentas, datos.categorias).toLowerCase()}</span>
                </span>
                <span className={`mono ${o.tipo === "ingreso" ? "sube" : ""}`}>
                  {o.tipo === "ingreso" ? "+" : o.tipo === "gasto" ? "−" : ""}
                  {o.montoDOP ? rd(o.montoDOP) : `${enMoneda(o.monto, o.moneda)} (sin tasa)`}
                </span>
              </li>
            ))}
            {siguientes.length > MAX_PROXIMOS ? (
              <li className="tenue chico">
                <Link href="/caja">y {siguientes.length - MAX_PROXIMOS} más…</Link>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="tenue chico">Nada programado en los próximos 7 días.</p>
        )}
      </div>
    </section>
  );
}
