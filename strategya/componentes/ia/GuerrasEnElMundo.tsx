// Sección 4 de la terminal: «Guerras en el mundo». Con IA: conflicto, estado (ESCALA / TENSIÓN / TREGUA /
// BAJA INTENSIDAD), qué pasó, «Mercado:» y enlace. Sin IA: titulares de guerra guardados, agrupados por país.

import "@/estilos/alertas-ia.css";
import { PanelError } from "@/componentes/PanelError";
import { agruparPorPais, claseEstado } from "@/lib/alertas-ia";
import { gastoIA, guerras, titularesRecientes } from "@/lib/datos-alertas-ia";
import { fechaHoraRD, hace, horaRD } from "@/lib/formato";
import { AvisoIA } from "./AvisoIA";
import { TitularesRespaldo } from "./TitularesRespaldo";

export async function GuerrasEnElMundo() {
  const ahora = new Date();
  let datos: [Awaited<ReturnType<typeof guerras>>, Awaited<ReturnType<typeof gastoIA>>];
  try {
    datos = await Promise.all([guerras(ahora), gastoIA(ahora)]);
  } catch (e) {
    return <PanelError titulo="Guerras en el mundo" mensaje={(e as Error).message} />;
  }
  const [resumen, gasto] = datos;
  const conResumen = resumen && resumen.lista.length > 0;

  let respaldo: Array<{ nombre: string; titulares: Awaited<ReturnType<typeof titularesRecientes>> }> = [];
  if (!conResumen) {
    try {
      const t = await titularesRecientes(["guerra"], ahora, 20);
      respaldo = agruparPorPais(t).map((g) => ({ nombre: g.pais, titulares: g.titulares }));
    } catch (e) {
      return <PanelError titulo="Guerras en el mundo" mensaje={(e as Error).message} />;
    }
  }

  return (
    <section className="panel ia-panel" aria-labelledby="t-guerras">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-guerras">
          Guerras en el mundo
        </h2>
        {resumen ? (
          <span className="sello">
            <span title={fechaHoraRD(resumen.fecha)}>
              Redactado con IA a las {horaRD(resumen.fecha)} ({hace(resumen.fecha, ahora)})
            </span>
            <span>· solo con titulares guardados</span>
          </span>
        ) : (
          <span className="sello">Titulares de conflictos por país (sin resumen de IA)</span>
        )}
      </div>
      <div className="panel-cuerpo">
        <AvisoIA estado={gasto.estado} gasto={gasto.gasto} />
        {conResumen ? (
          <ul className="lista-guerras">
            {resumen.lista.map((c) => (
              <li key={c.url + c.conflicto}>
                <div className="guerra-cabecera">
                  <h3 className="guerra-nombre">{c.conflicto}</h3>
                  {c.pais ? <span className="tenue chico">{c.pais}</span> : null}
                  <span className={`etiqueta estado-${claseEstado(c.estado)}`}>{c.estado}</span>
                </div>
                <p>{c.que_paso}</p>
                <p>
                  <strong className="ambar">Mercado:</strong> {c.mercado}
                </p>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="chico">
                  Fuente ↗
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {resumen ? <p className="chico tenue">El último resumen no encontró conflictos en los titulares guardados.</p> : null}
            <TitularesRespaldo grupos={respaldo} ahora={ahora} vacio="Sin titulares de conflictos en las últimas 48 h." />
          </>
        )}
      </div>
    </section>
  );
}
