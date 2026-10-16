// Sección 3 de la terminal: «Las 5 del día». Con IA: título, 2–3 oraciones, ¿Por qué?, ¿Y qué? para RD y enlace,
// redactado solo con titulares guardados. Sin IA o sin resumen de las últimas 24 h: los titulares más recientes.

import "@/estilos/alertas-ia.css";
import { PanelError } from "@/componentes/PanelError";
import { agruparPorCategoria, NOMBRE_CATEGORIA } from "@/lib/alertas-ia";
import { cincoDelDia, gastoIA, titularesRecientes } from "@/lib/datos-alertas-ia";
import { fechaHoraRD, hace, horaRD } from "@/lib/formato";
import { AvisoIA } from "./AvisoIA";
import { BotonResumenIA } from "./BotonResumenIA";
import { TitularesRespaldo } from "./TitularesRespaldo";

export async function LasCincoDelDia({ conBoton = true }: { conBoton?: boolean }) {
  const ahora = new Date();
  let datos: [Awaited<ReturnType<typeof cincoDelDia>>, Awaited<ReturnType<typeof gastoIA>>];
  try {
    datos = await Promise.all([cincoDelDia(ahora), gastoIA(ahora)]);
  } catch (e) {
    return <PanelError titulo="Las 5 del día" mensaje={(e as Error).message} />;
  }
  const [resumen, gasto] = datos;

  let respaldo: Array<{ nombre: string; titulares: Awaited<ReturnType<typeof titularesRecientes>> }> = [];
  if (!resumen) {
    try {
      const t = await titularesRecientes(["mercado", "rd"], ahora, 12);
      respaldo = agruparPorCategoria(t).map((g) => ({ nombre: NOMBRE_CATEGORIA[g.categoria] ?? g.categoria, titulares: g.titulares }));
    } catch (e) {
      return <PanelError titulo="Las 5 del día" mensaje={(e as Error).message} />;
    }
  }

  return (
    <section className="panel ia-panel" aria-labelledby="t-cinco">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-cinco">
          Las 5 del día
        </h2>
        {resumen ? (
          <span className="sello">
            <span title={fechaHoraRD(resumen.fecha)}>
              Redactado con IA a las {horaRD(resumen.fecha)} ({hace(resumen.fecha, ahora)})
            </span>
            <span>· solo con titulares guardados, sin cifras propias</span>
          </span>
        ) : (
          <span className="sello">Titulares más recientes (sin resumen de IA)</span>
        )}
      </div>
      <div className="panel-cuerpo">
        <AvisoIA estado={gasto.estado} gasto={gasto.gasto} />
        {resumen ? (
          <ol className="lista-cinco">
            {resumen.lista.map((it) => (
              <li key={it.url}>
                <h3 className="cinco-titulo">{it.titulo}</h3>
                <p>{it.resumen}</p>
                <p>
                  <strong className="ambar">¿Por qué?</strong> {it.porque}
                </p>
                <p>
                  <strong className="rd">¿Y qué?</strong> {it.y_que}
                </p>
                <a href={it.url} target="_blank" rel="noopener noreferrer" className="chico">
                  Fuente ↗
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <>
            {gasto.estado.activa && !gasto.estado.topeAlcanzado ? (
              <p className="chico tenue">No hay un resumen confirmado de las últimas 24 h. Se arma a las 7:35 AM y 5:05 PM (hora RD).</p>
            ) : null}
            <TitularesRespaldo grupos={respaldo} ahora={ahora} vacio="Sin titulares guardados en las últimas 48 h: llegan con la tarea de noticias." />
          </>
        )}
        {conBoton && gasto.estado.activa && !gasto.estado.topeAlcanzado ? <BotonResumenIA /> : null}
      </div>
    </section>
  );
}
