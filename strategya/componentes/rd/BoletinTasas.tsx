// Boletín de tasas de RD: activas y pasivas del BCRD (con su mes), última subasta de Hacienda,
// rendimientos de fondos por SAFI y los datos que Mena cargó a mano. Cada cifra con su fuente.

import "@/estilos/rd.css";
import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { type DatosRD, datosRD } from "@/lib/datos-rd";
import { cifra, fechaCorta } from "@/lib/formato";
import { frescura } from "@/lib/frescura";
import { type DatoRD, FILAS_ACTIVAS, FILAS_PASIVAS, fondosPorSafi, mesCorto, ultimosDatos } from "@/lib/rd";
import { Cambio, SellosAgrupados, SinDatos, tareaDe } from "./comun";

/** Un fondo se marca desactualizado si su corte tiene más de 10 días. */
const MAX_FONDO_MIN = 14_400;

export async function BoletinTasas() {
  const ahora = new Date();
  let d: DatosRD;
  try {
    d = await datosRD();
  } catch (e) {
    return <PanelError titulo="Boletín de tasas RD" mensaje={(e as Error).message} />;
  }
  return <VistaBoletinTasas d={d} ahora={ahora} />;
}

function CeldaTasa({ dato, mesComun }: { dato: DatoRD | undefined; mesComun: string | null }) {
  if (!dato) return <td className="num tenue">—</td>;
  const mes = mesCorto(dato.obs.fecha_dato);
  return (
    <td className="num">
      {cifra(dato.obs.valor, 2)}%
      {dato.obs.cambio !== null ? (
        <span className="rd-mes">
          <Cambio cambio={dato.obs.cambio} pb />
        </span>
      ) : null}
      {mes !== mesComun ? <span className="rd-mes">{mes}</span> : null}
      {dato.desactualizado ? <span className="rd-mes baja">desactualizado</span> : null}
    </td>
  );
}

function TablaTasas({
  titulo,
  filas,
  datos,
  d,
  ahora,
}: {
  titulo: string;
  filas: typeof FILAS_ACTIVAS;
  datos: Map<string, DatoRD>;
  d: DatosRD;
  ahora: Date;
}) {
  const presentes = filas.flatMap(([, mn, me]) => [mn, me]).map((s) => (s ? datos.get(s) : undefined)).filter((x): x is DatoRD => !!x);
  const meses = presentes.map((p) => mesCorto(p.obs.fecha_dato));
  // El mes más frecuente va en el encabezado; las celdas de otro mes lo indican.
  const conteo = new Map<string, number>();
  for (const m of meses) conteo.set(m, (conteo.get(m) ?? 0) + 1);
  const mesComun = [...conteo.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const id = `t-${titulo.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="rd-bloque">
      <h3 id={id}>
        {titulo}
        {mesComun ? <span className="tenue"> · {mesComun}</span> : null}
      </h3>
      {presentes.length === 0 ? (
        <SinDatos tarea={tareaDe(d.tareas, "bcrd-excel")}>
          Sin datos todavía: los cuadros de tasas del BCRD se leen los días hábiles a las 10:00 AM (hora RD).
        </SinDatos>
      ) : (
        <>
          <div className="desplazable">
            <table className="tabla" aria-labelledby={id}>
              <thead>
                <tr>
                  <th scope="col">Tasa (anual)</th>
                  <th scope="col" className="num">
                    RD$
                  </th>
                  <th scope="col" className="num">
                    US$
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map(([etiqueta, mn, me]) => (
                  <tr key={etiqueta}>
                    <th scope="row">{etiqueta}</th>
                    {mn ? <CeldaTasa dato={datos.get(mn)} mesComun={mesComun} /> : <td className="num tenue">n/a</td>}
                    {me ? <CeldaTasa dato={datos.get(me)} mesComun={mesComun} /> : <td className="num tenue">n/a</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SellosAgrupados datos={presentes} tareas={d.tareas} ahora={ahora} />
        </>
      )}
    </div>
  );
}

export function VistaBoletinTasas({ d, ahora }: { d: DatosRD; ahora: Date }) {
  const datos = ultimosDatos(d.series, d.observaciones, d.fuentes, ahora);
  const subasta = d.emisiones.find((e) => e.fuente === "CREDITO_PUBLICO");
  const tareaCp = tareaDe(d.tareas, "credito-publico");
  const fuenteCp = d.fuentes.find((f) => f.id === "credito_publico");
  const safis = fondosPorSafi(d.fondos);

  return (
    <section className="panel panel-ancho" aria-labelledby="t-boletin">
      <div className="panel-cabecera">
        <h2 className="panel-titulo" id="t-boletin">
          Boletín de tasas RD
        </h2>
        <span className="sello">Promedios del sistema bancario; no es una oferta ni una recomendación.</span>
      </div>
      <div className="panel-cuerpo">
        <div className="rd-rejilla-2">
          <TablaTasas titulo="Tasas activas" filas={FILAS_ACTIVAS} datos={datos} d={d} ahora={ahora} />
          <TablaTasas titulo="Tasas pasivas" filas={FILAS_PASIVAS} datos={datos} d={d} ahora={ahora} />
        </div>

        <div className="rd-bloque">
          <h3>Última subasta de Hacienda</h3>
          {subasta ? (
            <>
              <p className="chico">
                <span className="mono">{fechaCorta(subasta.fecha)}</span> · {subasta.instrumento ?? "Subasta"}
                {subasta.monto ? (
                  <>
                    {" "}
                    · monto <span className="mono">{subasta.moneda === "USD" ? "US$" : "RD$"} {cifra(subasta.monto, 2)}</span>
                  </>
                ) : null}
                {subasta.tasa ? (
                  <>
                    {" "}
                    · tasa <span className="mono">{cifra(subasta.tasa, 4)}%</span>
                  </>
                ) : null}{" "}
                ·{" "}
                <a href={subasta.url} target="_blank" rel="noopener noreferrer">
                  resultado oficial (PDF) ↗
                </a>
              </p>
              {!subasta.monto && !subasta.tasa ? (
                <p className="chico tenue">La página de Crédito Público no publica el monto ni la tasa de corte fuera del PDF: no se muestran.</p>
              ) : null}
              <SelloFuente
                ahora={ahora}
                d={{
                  fuente: fuenteCp?.nombre ?? "Crédito Público",
                  url: subasta.url,
                  fechaDato: subasta.fecha,
                  verificadoEn: tareaCp?.ultima_ok ?? subasta.recogido_en,
                  desactualizado: false,
                  ultimaCorridaFallo: tareaCp?.estado === "error",
                }}
              />
            </>
          ) : (
            <SinDatos tarea={tareaCp}>Sin datos: la página de subastas de Crédito Público se lee una vez al día (11:15 AM).</SinDatos>
          )}
        </div>

        <div className="rd-bloque">
          <h3>Fondos de inversión por SAFI</h3>
          {safis.length === 0 ? (
            <SinDatos>
              Sin datos: los rendimientos de los fondos no tienen una fuente de lectura automática permitida. Se cargan a mano en{" "}
              <Link href="/carga">Carga manual</Link>, con el enlace de la SAFI.
            </SinDatos>
          ) : (
            safis.map((g) => (
              <div key={g.safi} className="desplazable">
                <table className="tabla">
                  <caption className="rd-caption">
                    {g.safi}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Fondo</th>
                      <th scope="col">Moneda</th>
                      <th scope="col" className="num">
                        Base
                      </th>
                      <th scope="col" className="num">
                        Rend. %
                      </th>
                      <th scope="col">Corte · fuente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.fondos.map((f) => {
                      const vencido = frescura({ fecha_dato: f.fecha_corte }, MAX_FONDO_MIN, ahora).desactualizado;
                      return (
                        <tr key={f.id}>
                          <th scope="row">{f.fondo}</th>
                          <td>{f.moneda === "USD" ? "US$" : "RD$"}</td>
                          <td className="num">{f.plazo_dias} d</td>
                          <td className="num">{cifra(f.rendimiento, 2)}</td>
                          <td className="chico">
                            <span className="mono">{fechaCorta(f.fecha_corte)}</span> ·{" "}
                            <a href={f.url_fuente} target="_blank" rel="noopener noreferrer">
                              carga manual ↗
                            </a>
                            {vencido ? <span className="baja"> · DESACTUALIZADO</span> : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>

        <div className="rd-bloque">
          <h3>Datos cargados a mano</h3>
          {d.manuales.length === 0 ? (
            <SinDatos>
              Ninguno todavía. En <Link href="/carga">Carga manual</Link> se agrega cualquier dato (p. ej. la tasa del BoJ) con su enlace.
            </SinDatos>
          ) : (
            <div className="desplazable">
              <table className="tabla">
                <thead>
                  <tr>
                    <th scope="col">Dato</th>
                    <th scope="col" className="num">
                      Valor
                    </th>
                    <th scope="col">Fecha · fuente</th>
                  </tr>
                </thead>
                <tbody>
                  {d.manuales.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">
                        {m.dato}
                        {m.nota ? <span className="rd-mes">{m.nota}</span> : null}
                      </th>
                      <td className="num">{m.valor}</td>
                      <td className="chico">
                        <span className="mono">{fechaCorta(m.fecha)}</span>
                        {m.url_fuente ? (
                          <>
                            {" "}
                            ·{" "}
                            <a href={m.url_fuente} target="_blank" rel="noopener noreferrer">
                              fuente ↗
                            </a>
                          </>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
