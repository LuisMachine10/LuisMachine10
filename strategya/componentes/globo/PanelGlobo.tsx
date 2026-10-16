// Panel compacto del globo para la terminal principal: sismos relevantes, ciclones activos y su distancia a
// Santo Domingo, y pasos marítimos con alerta. Server Component: lee la base y arma las capas en el servidor.

import Link from "next/link";
import { PanelError } from "@/componentes/PanelError";
import { SelloFuente } from "@/componentes/SelloFuente";
import { datosResumenGlobo } from "@/lib/datos-globo";
import { armarCapas, type Capas, fechaRD } from "@/lib/globo/capas";
import { fechaCorta, horaRD } from "@/lib/formato";
import "@/estilos/globo.css";

function momento(iso: string): string {
  return `${fechaCorta(fechaRD(iso), false)}, ${horaRD(iso)}`;
}

/** Resumen sin estado (lo usan el panel de la terminal y la página /globo). */
export function ResumenGlobo({ capas, ahora }: { capas: Capas; ahora: Date }) {
  const { resumen, puntos } = capas;
  return (
    <div className="globo-resumen">
      <section aria-labelledby="globo-res-ciclones">
        <h3 id="globo-res-ciclones">Ciclones (NOAA NHC)</h3>
        {resumen.ciclones.length === 0 ? (
          <p className="chico tenue">
            {resumen.ciclonesConsultadoEn
              ? `Sin ciclones activos según NHC (consultado ${momento(resumen.ciclonesConsultadoEn)}, hora RD).`
              : "Sin lecturas del NHC todavía (la tarea corre cada 30 min)."}
            {resumen.ciclonesTareaFallo ? <span className="baja"> La última lectura falló (ver Estado).</span> : null}
          </p>
        ) : (
          <ul>
            {resumen.ciclones.map((c) => {
              const p = puntos.find((x) => x.id === `ciclones:${c.id}`);
              const dist = p?.cifras.find((x) => x.etiqueta.startsWith("Distancia"));
              return (
                <li key={c.id} className={`tono-${p?.tono ?? "ciclon"}`}>
                  <span className="globo-marca" aria-hidden="true" />
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {c.titulo} ↗
                  </a>{" "}
                  {c.distanciaKm !== null ? (
                    <span className="mono">
                      {dist?.valor ?? "—"} km de Santo Domingo <span className="tenue chico">({c.base})</span>
                    </span>
                  ) : (
                    <span className="tenue">distancia no confirmada</span>
                  )}
                  {dist?.sello ? <SelloFuente d={dist.sello} ahora={ahora} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="globo-res-sismos">
        <h3 id="globo-res-sismos">Sismos cerca de zonas vigiladas (USGS)</h3>
        {resumen.sismosRelevantes.length === 0 ? (
          <p className="chico tenue">{capas.estados.sismos.mensaje ?? "Ningún sismo M4.5+ cerca de zonas de materias primas ni de RD en los últimos 7 días."}</p>
        ) : (
          <ul>
            {resumen.sismosRelevantes.slice(0, 5).map((s) => (
              <li key={s.id}>
                <span className="globo-marca tono-ambar" aria-hidden="true" />
                <span className="mono">M{s.cifras[0]?.valor ?? "?"}</span> · {s.titulo}
                {s.notas[0] ? <span className="tenue chico"> — {s.notas[0]}</span> : null}
                {s.cifras[0]?.sello ? <SelloFuente d={s.cifras[0].sello} ahora={ahora} /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="globo-res-pasos">
        <h3 id="globo-res-pasos">Pasos marítimos con alerta</h3>
        {resumen.pasosConAlerta.length === 0 ? (
          <p className="chico tenue">Ningún paso con noticias de guerra, sismos M5+ ni ciclones cercanos en las últimas 48 h.</p>
        ) : (
          <ul>
            {resumen.pasosConAlerta.map((a) => (
              <li key={a.paso.id}>
                <span className="globo-marca tono-ambar" aria-hidden="true" />
                <strong>{a.paso.nombre}</strong>: {a.motivos.join("; ")}.{" "}
                <span className="tenue chico">Vigilar: {a.paso.series.join(", ")}.</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Sección «Globo» de la terminal principal. */
export async function PanelGlobo() {
  const ahora = new Date();
  let capas: Capas;
  try {
    capas = armarCapas(await datosResumenGlobo(ahora));
  } catch (e) {
    return <PanelError titulo="Globo · ojo de Dios" mensaje={(e as Error).message} />;
  }
  return (
    <section className="panel" aria-labelledby="titulo-panel-globo">
      <div className="panel-cabecera">
        <h2 id="titulo-panel-globo" className="panel-titulo">
          Globo · ojo de Dios
        </h2>
        <Link href="/globo" className="chico">
          Abrir el globo →
        </Link>
      </div>
      <div className="panel-cuerpo">
        <ResumenGlobo capas={capas} ahora={ahora} />
      </div>
    </section>
  );
}

/** Alias: el mismo panel compacto. */
export const MiniGlobo = PanelGlobo;
