// Fusiones e IPO según el índice diario de EDGAR (SEC): solo qué se presentó, quién y cuándo, con enlace
// a la presentación. No es una recomendación.

import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { leerOperacionesSec } from "@/lib/datos-noticias";
import { fechaCorta } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { agruparOperaciones, type OperacionSec } from "@/lib/noticias";
import { FORMULARIOS_SEC, urlIndiceSec } from "@/supabase/functions/_shared/fuentes/sec-edgar";
import { Cabecera } from "./comun";

/** El índice sale cada día hábil: 4 días cubren fin de semana + un feriado. */
const MAX_ANTIGUEDAD_MIN = 5760;

function Tabla({ titulo, filas }: { titulo: string; filas: OperacionSec[] }) {
  return (
    <div className="nt-bloque">
      <h3 className="nt-subtitulo">{titulo}</h3>
      {filas.length === 0 ? (
        <p className="chico tenue">Ninguna presentación de este tipo en los índices leídos.</p>
      ) : (
        <div className="desplazable">
          <table className="tabla">
            <caption className="sr-solo">{titulo}: formulario, empresa y fecha de presentación ante la SEC</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Form.</th>
                <th scope="col">Empresa</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((o) => (
                <tr key={`${o.url}|${o.cik}|${o.form}`}>
                  <td className="mono nt-nowrap">{fechaCorta(o.fecha, false)}</td>
                  <td className="mono nt-nowrap">
                    <abbr title={FORMULARIOS_SEC[o.form]?.descripcion ?? o.form}>{o.form}</abbr>
                  </td>
                  <th scope="row" className="nt-empresa">
                    <a href={o.url} target="_blank" rel="noopener noreferrer">
                      {o.empresa}
                    </a>
                  </th>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export async function PanelFusionesIPO({ ahora = new Date() }: { ahora?: Date }) {
  let datos: Awaited<ReturnType<typeof leerOperacionesSec>>;
  try {
    datos = await leerOperacionesSec();
  } catch (e) {
    return <PanelError titulo="Fusiones e IPO" mensaje={(e as Error).message} />;
  }
  const { ipo, fusion, ultimoIndice } = agruparOperaciones(datos.operaciones);
  const tarea = datos.tarea;
  const leidos = tarea?.detalle?.leidos;
  const indiceLeido = (Array.isArray(leidos) ? (leidos.at(-1) as string | undefined) : undefined) ?? ultimoIndice;

  return (
    <section className="panel" aria-labelledby="titulo-sec">
      <Cabecera id="titulo-sec" titulo="Fusiones e IPO">
        {indiceLeido ? (
          <SelloFuente
            ahora={ahora}
            d={{
              fuente: "SEC EDGAR · índice diario",
              url: urlIndiceSec(indiceLeido),
              fechaDato: indiceLeido,
              verificadoEn: tarea?.ultima_ok ?? null,
              desactualizado: frescura({ fecha_dato: indiceLeido }, MAX_ANTIGUEDAD_MIN, ahora).desactualizado,
              ultimaCorridaFallo: tarea?.estado === "error",
            }}
          />
        ) : null}
      </Cabecera>
      {datos.operaciones.length === 0 ? (
        <div className="vacio">
          Sin presentaciones de IPO ni de fusiones en los últimos 10 días leídos. El índice diario de la SEC se revisa
          a las 11:40 PM, 7:40 AM, 11:40 AM y 7:40 PM (hora RD).
          {tarea?.estado === "error" && tarea.error ? <p className="baja chico">Última lectura con error: {tarea.error}</p> : null}
        </div>
      ) : (
        <div className="panel-cuerpo">
          <Tabla titulo="Salidas a bolsa (S-1, F-1, 424B4)" filas={ipo} />
          <Tabla titulo="Fusiones y adquisiciones (425, DEFM14A, PREM14A, SC TO-T, SC 14D9)" filas={fusion} />
          <p className="chico tenue">Presentaciones públicas ante la SEC. No es una recomendación de inversión.</p>
        </div>
      )}
    </section>
  );
}
