import type { Metadata } from "next";
import Link from "next/link";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { NavMes } from "@/componentes/caja/NavMes";
import { SinDatosCaja } from "@/componentes/caja/SinDatosCaja";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { esMes, fechaBreve, hoyRD, mesDe, nombreMes } from "@/lib/caja/fechas";
import { enMoneda, rd } from "@/lib/caja/formato";
import { movimientosDelMes } from "@/lib/caja/motor";
import { NOMBRE_TIPO } from "@/lib/caja/tipos";

export const metadata: Metadata = { title: "Movimientos · Caja · Strategya" };
export const dynamic = "force-dynamic";

export default async function PaginaMovimientos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const hoy = hoyRD();
  const q = await searchParams;
  const mes = esMes(q.mes) ? q.mes : mesDe(hoy);
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="movimientos" editadoEn={null}>
        <PanelError titulo="Movimientos del mes" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  if (!datos.config) {
    return (
      <MarcoCaja actual="movimientos" editadoEn={editadoEn}>
        <SinDatosCaja />
      </MarcoCaja>
    );
  }
  const t = movimientosDelMes(datos, mes);
  const cuentas = new Map(datos.cuentas.map((c) => [c.id, c.nombre]));
  const categorias = new Map(datos.categorias.map((c) => [c.id, c.nombre]));
  const cuenta = (id: string | null) => (id ? (cuentas.get(id) ?? `«${id}»`) : "—");

  return (
    <MarcoCaja actual="movimientos" mes={mes} editadoEn={editadoEn}>
      <div className="panel-ancho">
        <NavMes mes={mes} ruta="/caja/movimientos" hoyMes={mesDe(hoy)} />
      </div>
      <section className="panel panel-ancho" aria-labelledby="t-totales">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-totales">
            Totales de {nombreMes(mes)}
          </h2>
          <span className="sello">Solo lo registrado (confirmado). Fuente: tus registros.</span>
        </div>
        <div className="panel-cuerpo">
          <div className="caja-tiles">
            <div className="caja-tile">
              <p className="caja-tile-titulo">Ingresos</p>
              <p className="caja-tile-cifra sube">{rd(t.ingresos)}</p>
            </div>
            <div className="caja-tile">
              <p className="caja-tile-titulo">Gastos</p>
              <p className="caja-tile-cifra baja">{rd(t.gastos)}</p>
            </div>
            <div className="caja-tile">
              <p className="caja-tile-titulo">A ahorro e inversión</p>
              <p className="caja-tile-cifra">{rd(t.ahorro)}</p>
            </div>
            <div className="caja-tile">
              <p className="caja-tile-titulo">Tasa de ahorro</p>
              <p className="caja-tile-cifra">{t.tasaAhorro != null ? `${t.tasaAhorro}%` : "—"}</p>
              <p className="caja-tile-nota">{t.tasaAhorro != null ? "a ahorro ÷ ingresos" : "sin ingresos registrados"}</p>
            </div>
            <div className="caja-tile">
              <p className="caja-tile-titulo">Ingresos − gastos</p>
              <p className="caja-tile-cifra">{rd(t.neto)}</p>
            </div>
            <div className="caja-tile">
              <p className="caja-tile-titulo">Pagos de tarjeta</p>
              <p className="caja-tile-cifra">{rd(t.pagosTarjeta)}</p>
            </div>
          </div>
          {t.sinTasa ? (
            <p className="caja-mensaje error">{t.sinTasa} movimiento(s) en US$ sin tasa no entran en los totales. Pon la tasa US$ en Ajustes.</p>
          ) : null}
        </div>
      </section>
      <section className="panel panel-ancho" aria-labelledby="t-movs">
        <div className="panel-cabecera">
          <h2 className="panel-titulo" id="t-movs">
            Movimientos ({t.movimientos.length})
          </h2>
        </div>
        <div className="panel-cuerpo desplazable">
          {t.movimientos.length ? (
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Día</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Cuenta</th>
                  <th scope="col">Categoría</th>
                  <th scope="col">Nota</th>
                  <th scope="col" className="num">
                    Monto
                  </th>
                  <th scope="col" className="num">
                    En RD$
                  </th>
                </tr>
              </thead>
              <tbody>
                {t.movimientos.map((m) => (
                  <tr key={m.id}>
                    <th scope="row">
                      <Link href={`/caja?mes=${mes}&dia=${m.fecha}`} className="mono">
                        {fechaBreve(m.fecha)}
                      </Link>
                    </th>
                    <td>{NOMBRE_TIPO[m.tipo]}</td>
                    <td className="chico">
                      {cuenta(m.cuenta)}
                      {m.destino ? ` → ${cuenta(m.destino)}` : ""}
                    </td>
                    <td className="chico">{m.categoria ? (categorias.get(m.categoria) ?? `«${m.categoria}»`) : <span className="tenue">—</span>}</td>
                    <td className="chico">{m.nota ?? <span className="tenue">—</span>}</td>
                    <td className={`num ${m.tipo === "ingreso" ? "sube" : m.tipo === "gasto" ? "baja" : ""}`}>
                      {m.tipo === "ingreso" ? "+" : m.tipo === "gasto" ? "−" : ""}
                      {enMoneda(m.monto, m.moneda)}
                    </td>
                    <td className="num">{m.montoDOP ? rd(m.montoDOP) : <span className="baja">sin tasa</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="vacio">Nada registrado en {nombreMes(mes)}.</p>
          )}
        </div>
      </section>
    </MarcoCaja>
  );
}
