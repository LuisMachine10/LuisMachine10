// Sección 4 de la terminal: «Guerras en el mundo». Con IA: conflicto, estado (ESCALA / TENSIÓN / TREGUA /
// BAJA INTENSIDAD), qué pasó, «Mercado:» y enlace. Sin IA: titulares de guerra guardados, agrupados por país.

import "@/estilos/alertas-ia.css";
import { Ayuda } from "@/componentes/alertas/Ayuda";
import { PanelError } from "@/componentes/PanelError";
import { agruparPorPais, claseEstado, type Conflicto } from "@/lib/alertas-ia";
import { gastoIA, guerras, titularesRecientes } from "@/lib/datos-alertas-ia";
import { fechaHoraRD, hace, horaRD } from "@/lib/formato";
import { AvisoIA } from "./AvisoIA";
import { TitularesRespaldo } from "./TitularesRespaldo";

/** El estado en tipo oración y con una pista corta de qué significa (el color nunca va solo). */
const ESTADO: Readonly<Record<Conflicto["estado"], { texto: string; pista: string }>> = {
  ESCALA: { texto: "Escala", pista: "Más combates o ataques que antes" },
  "TENSIÓN": { texto: "Tensión", pista: "Amenazas o choques, sin guerra abierta" },
  TREGUA: { texto: "Tregua", pista: "Alto el fuego o negociación en curso" },
  "BAJA INTENSIDAD": { texto: "Baja intensidad", pista: "Conflicto activo pero estable" },
};

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
      <div className="panel-cabecera aj-cabecera">
        <h2 className="panel-titulo" id="t-guerras">
          Guerras en el mundo
        </h2>
        {resumen ? <span className="etiqueta ia-sello">Redactado con IA</span> : null}
        <Ayuda titulo="¿Qué significa cada estado?">
          <span className="leyenda-estados">
            {(Object.keys(ESTADO) as Array<Conflicto["estado"]>).map((k) => (
              <span key={k}>
                <span className={`pildora-estado estado-${claseEstado(k)}`}>{ESTADO[k].texto}</span> {ESTADO[k].pista}.
              </span>
            ))}
          </span>
          La IA solo redacta a partir de titulares ya guardados; cada conflicto lleva el enlace a su fuente.
        </Ayuda>
        <p className="aj-subtitulo">
          {resumen ? (
            <>
              Los conflictos que pueden mover los mercados, y cómo.{" "}
              <span className="tenue" title={fechaHoraRD(resumen.fecha)}>
                {horaRD(resumen.fecha)} · {hace(resumen.fecha, ahora)}
              </span>
            </>
          ) : (
            "Titulares de conflictos, agrupados por país, tal como llegaron."
          )}
        </p>
      </div>
      <div className="panel-cuerpo">
        <AvisoIA estado={gasto.estado} gasto={gasto.gasto} />
        {conResumen ? (
          <ul className="lista-guerras">
            {resumen.lista.map((c) => (
              <li key={c.url + c.conflicto} className={`guerra borde-${claseEstado(c.estado)}`}>
                <div className="guerra-cabecera">
                  <h3 className="guerra-nombre">{c.conflicto}</h3>
                  <span className={`pildora-estado estado-${claseEstado(c.estado)}`} title={ESTADO[c.estado].pista}>
                    {ESTADO[c.estado].texto}
                  </span>
                </div>
                {c.pais ? <p className="tenue chico guerra-pais">{c.pais}</p> : null}
                <p>{c.que_paso}</p>
                <p className="guerra-mercado">
                  <strong>Mercado:</strong> {c.mercado}
                </p>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className="chico">
                  Leer la fuente <span aria-hidden="true">↗</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <>
            {resumen ? <p className="chico tenue">El último resumen no encontró conflictos en los titulares guardados.</p> : null}
            <TitularesRespaldo grupos={respaldo} ahora={ahora} vacio="No hay titulares de conflictos de las últimas 48 h." />
          </>
        )}
      </div>
    </section>
  );
}
