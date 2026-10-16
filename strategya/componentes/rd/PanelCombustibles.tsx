// Precios oficiales de combustibles de la semana (aviso del MICM) con su cambio.

import "@/estilos/rd.css";
import Link from "next/link";
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
    <section className="panel" aria-labelledby="t-combustibles">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-combustibles">
          Combustibles RD
        </h2>
        <span className="sello">{semana ? `Semana del ${semanaVigencia(semana)}` : "Precios oficiales del MICM"}</span>
      </div>
      <div className="panel-cuerpo">
        {filas.length === 0 ? (
          <SinDatos tarea={tarea}>
            Sin precios todavía. El aviso del MICM sale los viernes y se lee el viernes a las 7:30 PM y el sábado a las 9:30 AM. Si el
            aviso no trae cifras legibles, los precios se cargan en <Link href="/carga">Carga manual</Link>.
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
            <div className="desplazable">
              <table className="tabla">
                <caption className="sr-solo">Precios de combustibles de la semana, en RD$</caption>
                <thead>
                  <tr>
                    <th scope="col">Producto</th>
                    <th scope="col" className="num">
                      Precio RD$
                    </th>
                    <th scope="col" className="num">
                      Semana
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.serie.id}>
                      <th scope="row">
                        {f.serie.nombre}
                        <span className="rd-mes">
                          {f.serie.unidad.replace("RD$/", "por ")}
                          {f.obs.fecha_dato !== semana ? ` · semana del ${fechaCorta(f.obs.fecha_dato)}` : ""}
                        </span>
                      </th>
                      <td className="num">{cifra(f.obs.valor, 2)}</td>
                      <td className="num">
                        <Cambio cambio={f.obs.cambio} decimales={2} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <SellosAgrupados datos={filas} tareas={d.tareas} ahora={ahora} />
          </>
        )}
      </div>
    </section>
  );
}
