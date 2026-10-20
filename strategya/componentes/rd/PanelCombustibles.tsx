// Precios oficiales de combustibles de la semana (aviso del MICM) con su cambio semanal.

import "@/estilos/rd.css";
import { PanelError } from "@/componentes/PanelError";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { type DatoRD, semanaVigencia, SERIES_COMBUSTIBLES, ultimosDatos } from "@/lib/rd";
import { Cambio, SellosAgrupados, SinDatos, tareaDe } from "./comun";

export async function PanelCombustibles() {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Combustibles RD" mensaje={(e as Error).message} />;
  }
  return <VistaPanelCombustibles d={d} ahora={ahora} />;
}

export function VistaPanelCombustibles({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  const filas = SERIES_COMBUSTIBLES.map((s) => datos.get(s)).filter((x): x is DatoRD => !!x);
  const semana = filas.map((f) => f.obs.fecha_dato).sort().at(-1);
  const tarea = tareaDe(d.tareas, "micm");
  const aviso = d.avisos.find((a) => a.institucion === "MICM");

  return (
    <section className="panel rd-panel" aria-labelledby="t-combustibles">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-combustibles">
          Combustibles
        </h2>
        <span className="sello">{semana ? `Semana del ${semanaVigencia(semana)}` : "Precios oficiales del MICM"}</span>
      </div>
      <div className="panel-cuerpo">
        {filas.length === 0 ? (
          <SinDatos tarea={tarea} accion={{ href: "/carga", texto: "Cargar precios a mano" }}>
            Sin precios todavía. El aviso del MICM sale los viernes y se lee el viernes a las 7:30 PM y el sábado a las 9:30 AM. Si el
            aviso no trae cifras legibles, los precios se cargan a mano.
            {aviso ? (
              <>
                {" "}
                Último aviso:{" "}
                <a href={aviso.url} target="_blank" rel="noopener noreferrer">
                  {aviso.titulo} ↗
                </a>
              </>
            ) : null}
          </SinDatos>
        ) : (
          <>
            <table className="rd-lista-precios">
              <caption className="sr-solo">Precios oficiales de combustibles de la semana, en RD$, con el cambio contra la semana anterior</caption>
              <thead className="sr-solo">
                <tr>
                  <th scope="col">Producto</th>
                  <th scope="col">Precio RD$</th>
                  <th scope="col">Cambio semanal</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.serie.id}>
                    <th scope="row">
                      <span className="rd-producto">{f.serie.nombre}</span>
                      <span className="rd-unidad">
                        {f.serie.unidad.replace("RD$/", "RD$ por ")}
                        {f.obs.fecha_dato !== semana ? ` · semana del ${fechaCorta(f.obs.fecha_dato)}` : ""}
                      </span>
                    </th>
                    <td className="rd-precio mono">{cifra(f.obs.valor, 2)}</td>
                    <td className="rd-precio-cambio">
                      <Cambio cambio={f.obs.cambio} decimales={2} pastilla />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <SellosAgrupados datos={filas} tareas={d.tareas} ahora={ahora} />
          </>
        )}
      </div>
    </section>
  );
}
