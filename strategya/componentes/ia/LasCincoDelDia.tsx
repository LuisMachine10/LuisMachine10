// Sección 3 de la terminal: «Las 5 del día». Con IA: título, 2–3 oraciones, ¿Por qué?, ¿Y qué? para RD y enlace,
// redactado solo con titulares guardados. Sin IA o sin resumen de las últimas 24 h: los titulares más recientes.

import "@/estilos/alertas-ia.css";
import { Ayuda } from "@/componentes/alertas/Ayuda";
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
      <div className="panel-cabecera aj-cabecera">
        <h2 className="panel-titulo" id="t-cinco">
          Las 5 del día
        </h2>
        {resumen ? <span className="etiqueta ia-sello">Redactado con IA</span> : null}
        <Ayuda titulo="¿Cómo se arma esto?">
          Dos veces al día (7:35 AM y 5:05 PM, hora RD) la IA lee los titulares ya guardados y escoge las 5 noticias que más pesan. Solo
          redacta: ninguna cifra sale de la IA y cada punto lleva el enlace a su fuente.
        </Ayuda>
        <p className="aj-subtitulo">
          {resumen ? (
            <>
              Las 5 noticias que más pesan hoy, explicadas en simple.{" "}
              <span className="tenue" title={fechaHoraRD(resumen.fecha)}>
                {horaRD(resumen.fecha)} · {hace(resumen.fecha, ahora)}
              </span>
            </>
          ) : (
            "Los titulares más recientes de mercados y RD, tal como llegaron."
          )}
        </p>
      </div>
      <div className="panel-cuerpo">
        <AvisoIA estado={gasto.estado} gasto={gasto.gasto} />
        {resumen ? (
          <ol className="lista-cinco">
            {resumen.lista.map((it, i) => (
              <li key={it.url} className="cinco-item">
                <span className="cinco-numero mono" aria-hidden="true">
                  {i + 1}
                </span>
                <div className="cinco-cuerpo">
                  <h3 className="cinco-titulo">{it.titulo}</h3>
                  <p>{it.resumen}</p>
                  <dl className="cinco-claves">
                    <div>
                      <dt>¿Por qué importa?</dt>
                      <dd>{it.porque}</dd>
                    </div>
                    <div className="cinco-rd">
                      <dt>¿Y para RD?</dt>
                      <dd>{it.y_que}</dd>
                    </div>
                  </dl>
                  <a href={it.url} target="_blank" rel="noopener noreferrer" className="chico">
                    Leer la fuente <span aria-hidden="true">↗</span>
                  </a>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <>
            {gasto.estado.activa && !gasto.estado.topeAlcanzado ? (
              <p className="chico tenue">Todavía no hay un resumen confirmado de las últimas 24 h. Se arma a las 7:35 AM y 5:05 PM (hora RD).</p>
            ) : null}
            <TitularesRespaldo grupos={respaldo} ahora={ahora} vacio="No hay titulares guardados de las últimas 48 h. Llegan solos con la lectura de noticias." />
          </>
        )}
        {conBoton && gasto.estado.activa && !gasto.estado.topeAlcanzado ? <BotonResumenIA /> : null}
      </div>
    </section>
  );
}
