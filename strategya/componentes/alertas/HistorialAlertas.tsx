// Historial de alertas disparadas (todas las fechas), con dato, umbral cruzado, fuente y si salió el correo.

import "@/estilos/alertas-ia.css";
import { PanelError } from "@/componentes/PanelError";
import { type AlertaDisparada, historialAlertas } from "@/lib/datos-alertas-ia";
import { fechaCorta, fechaHoraRD, horaRD } from "@/lib/formato";
import { valorConUnidad } from "./BannerAlertas";

export async function HistorialAlertas({ limite = 60 }: { limite?: number }) {
  let filas: AlertaDisparada[];
  try {
    filas = await historialAlertas(limite);
  } catch (e) {
    return <PanelError titulo="Historial de alertas" mensaje={(e as Error).message} />;
  }
  return (
    <section className="panel panel-ancho" aria-labelledby="t-historial-alertas">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-historial-alertas">
          Historial de alertas
        </h2>
        <span className="sello">Últimas {limite} · una por activo y día · hora RD</span>
      </div>
      {filas.length === 0 ? (
        <p className="vacio">
          Todavía no se ha disparado ninguna alerta. Las reglas se evalúan cada 5 minutos con datos confirmados del día.
        </p>
      ) : (
        <div className="panel-cuerpo desplazable">
          <table className="tabla">
            <thead>
              <tr>
                <th scope="col">Día</th>
                <th scope="col">Activo</th>
                <th scope="col" className="num">
                  Dato
                </th>
                <th scope="col">Umbral cruzado</th>
                <th scope="col">Fuente</th>
                <th scope="col">Correo</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((a) => {
                const url = a.observaciones?.url_dato ?? a.observaciones?.fuentes?.url ?? null;
                const fuente = a.observaciones?.fuentes?.nombre ?? "sin registrar";
                return (
                  <tr key={a.id}>
                    <td className="mono chico" title={fechaHoraRD(a.disparada_en)}>
                      {fechaCorta(a.fecha)} {horaRD(a.disparada_en)}
                    </td>
                    <th scope="row">{a.series?.nombre_corto ?? a.serie_id}</th>
                    <td className="num">{valorConUnidad(a.valor, a.series?.unidad)}</td>
                    <td className="chico">{a.mensaje}</td>
                    <td className="chico">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          {fuente} ↗
                        </a>
                      ) : (
                        fuente
                      )}
                      {a.observaciones ? <span className="tenue"> · dato del {fechaCorta(a.observaciones.fecha_dato)}</span> : null}
                    </td>
                    <td className="chico">
                      {a.enviada_en ? <span title={fechaHoraRD(a.enviada_en)}>✓ {horaRD(a.enviada_en)}</span> : <span className="tenue">no enviado</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
