import Big from "big.js";
import type { Metadata } from "next";
import { MarcoCaja } from "@/componentes/caja/MarcoCaja";
import { NavMes } from "@/componentes/caja/NavMes";
import { SinDatosCaja } from "@/componentes/caja/SinDatosCaja";
import { PanelError } from "@/componentes/PanelError";
import { leerCaja } from "@/lib/caja/datos";
import { esMes, hoyRD, mesDe, nombreMes } from "@/lib/caja/fechas";
import { rd } from "@/lib/caja/formato";
import { horizonte, presupuestoDelMes, simular } from "@/lib/caja/motor";
import { NOMBRE_GRUPO } from "@/lib/caja/tipos";

export const metadata: Metadata = { title: "Presupuesto · Caja · Strategya" };
export const dynamic = "force-dynamic";

function Barra({ usado }: { usado: number | null }) {
  if (usado == null) return <span className="tenue chico">—</span>;
  const clase = usado > 100 ? "pasado" : usado >= 85 ? "cerca" : "";
  return (
    <div className="caja-barra-celda">
      <div className={`caja-barra ${clase}`} role="img" aria-label={`${usado}% del presupuesto`}>
        <span style={{ width: `${Math.min(usado, 100)}%` }} />
      </div>
      <span className="mono chico">{usado}%</span>
    </div>
  );
}

export default async function PaginaPresupuesto({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const hoy = hoyRD();
  const q = await searchParams;
  const mes = esMes(q.mes) ? q.mes : mesDe(hoy);
  let lectura: Awaited<ReturnType<typeof leerCaja>>;
  try {
    lectura = await leerCaja();
  } catch (e) {
    return (
      <MarcoCaja actual="presupuesto" editadoEn={null}>
        <PanelError titulo="Presupuesto" mensaje={(e as Error).message} />
      </MarcoCaja>
    );
  }
  const { datos, editadoEn } = lectura;
  if (!datos.config) {
    return (
      <MarcoCaja actual="presupuesto" editadoEn={editadoEn}>
        <SinDatosCaja />
      </MarcoCaja>
    );
  }
  const sim = simular(datos, { hoy, hasta: horizonte(mes, hoy) });
  const grupos = presupuestoDelMes(datos, sim, mes);

  return (
    <MarcoCaja actual="presupuesto" mes={mes} editadoEn={editadoEn}>
      <div className="panel-ancho">
        <NavMes mes={mes} ruta="/caja/presupuesto" hoyMes={mesDe(hoy)} />
        <p className="chico tenue">
          Real = registrado en {nombreMes(mes)}. Viene = planificado de hoy al fin del mes. Queda = presupuesto − real − viene.
          Montos en RD$.
        </p>
      </div>
      {grupos.length === 0 ? (
        <section className="panel panel-ancho">
          <p className="vacio">No hay categorías. Créalas en Ajustes con su presupuesto mensual.</p>
        </section>
      ) : null}
      {grupos.map((g) => (
        <section key={g.grupo} className="panel panel-ancho" aria-labelledby={`t-g-${g.grupo}`}>
          <div className="panel-cabecera">
            <h2 className="panel-titulo" id={`t-g-${g.grupo}`}>
              {NOMBRE_GRUPO[g.grupo]}
            </h2>
          </div>
          <div className="panel-cuerpo desplazable">
            <table className="tabla">
              <thead>
                <tr>
                  <th scope="col">Categoría</th>
                  <th scope="col" className="num">
                    Presupuesto
                  </th>
                  <th scope="col" className="num">
                    Real
                  </th>
                  <th scope="col" className="num">
                    Viene
                  </th>
                  <th scope="col" className="num">
                    Queda
                  </th>
                  <th scope="col">Uso</th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map((f) => (
                  <tr key={f.categoria.id}>
                    <th scope="row">{f.categoria.nombre}</th>
                    <td className="num">{f.presupuesto ? rd(f.presupuesto) : <span className="tenue">sin presupuesto</span>}</td>
                    <td className="num">{rd(f.real)}</td>
                    <td className="num">{rd(f.viene)}</td>
                    <td className={`num ${f.queda && new Big(f.queda).lt(0) ? "baja" : ""}`}>{f.queda ? rd(f.queda) : "—"}</td>
                    <td>
                      <Barra usado={f.usado} />
                    </td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">
                    <strong>Total</strong>
                  </th>
                  <td className="num">
                    <strong>{rd(g.presupuesto)}</strong>
                  </td>
                  <td className="num">
                    <strong>{rd(g.real)}</strong>
                  </td>
                  <td className="num">
                    <strong>{rd(g.viene)}</strong>
                  </td>
                  <td className={`num ${new Big(g.queda).lt(0) ? "baja" : ""}`}>
                    <strong>{rd(g.queda)}</strong>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </MarcoCaja>
  );
}
