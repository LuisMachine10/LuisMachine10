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

const TRAZO = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONOS = {
  ciclon: "M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 19c-3-3-2.5-9 3-11.5M18 5c3 3 2.5 9-3 11.5M9.5 4.5C13 3 17 4 19 7M14.5 19.5C11 21 7 20 5 17",
  sismo: "M3 12h4l2-6 3 12 3-9 2 3h4",
  paso: "M3 17c2 1.5 4 1.5 6 0s4-1.5 6 0 4 1.5 6 0M5 13l1-6h12l1 6M9 7V4h6v3",
  bien: "M5 12.5l4.5 4.5L19 7.5",
};

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...TRAZO}>
      <path d={d} />
    </svg>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <p className="globo-res-vacio">
      <span className="globo-res-bien" aria-hidden="true">
        <Icono d={ICONOS.bien} />
      </span>
      <span>{children}</span>
    </p>
  );
}

/** Resumen sin estado (lo usan el panel de la terminal y la página /globo). */
export function ResumenGlobo({ capas, ahora }: { capas: Capas; ahora: Date }) {
  const { resumen, puntos } = capas;
  const sismos = resumen.sismosRelevantes.slice(0, 5);
  return (
    <div className="globo-resumen">
      <section aria-labelledby="globo-res-ciclones" className="globo-res-bloque">
        <h3 id="globo-res-ciclones" className="globo-res-titulo">
          <Icono d={ICONOS.ciclon} />
          Ciclones
          <span className="globo-res-fuente">NOAA NHC</span>
          <span className="globo-capa-conteo mono">{resumen.ciclones.length}</span>
        </h3>
        {resumen.ciclones.length === 0 ? (
          <>
            <Vacio>
              {resumen.ciclonesConsultadoEn
                ? `Sin ciclones activos según NHC (consultado ${momento(resumen.ciclonesConsultadoEn)}, hora RD).`
                : "Sin lecturas del NHC todavía (la tarea corre cada 30 min)."}
            </Vacio>
            {resumen.ciclonesTareaFallo ? <span className="etiqueta error globo-res-aviso">La última lectura falló (ver Estado)</span> : null}
          </>
        ) : (
          <ul className="globo-alertas">
            {resumen.ciclones.map((c) => {
              const p = puntos.find((x) => x.id === `ciclones:${c.id}`);
              const dist = p?.cifras.find((x) => x.etiqueta.startsWith("Distancia"));
              return (
                <li key={c.id} className={`globo-alerta tono-${p?.tono ?? "ciclon"}`}>
                  <span className="globo-marca anillo" aria-hidden="true" />
                  <div className="globo-alerta-cuerpo">
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="globo-alerta-titulo">
                      {c.titulo} ↗
                    </a>
                    {c.distanciaKm !== null ? (
                      <div className="globo-alerta-cifra">
                        <span className="mono globo-alerta-valor">{dist?.valor ?? "—"} km</span>
                        <span className="tenue chico">de Santo Domingo · {c.base}</span>
                      </div>
                    ) : (
                      <div className="tenue chico">distancia no confirmada</div>
                    )}
                    {dist?.sello ? <SelloFuente d={dist.sello} ahora={ahora} /> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="globo-res-sismos" className="globo-res-bloque">
        <h3 id="globo-res-sismos" className="globo-res-titulo">
          <Icono d={ICONOS.sismo} />
          Sismos cerca de zonas vigiladas
          <span className="globo-res-fuente">USGS</span>
          <span className="globo-capa-conteo mono">{resumen.sismosRelevantes.length}</span>
        </h3>
        {sismos.length === 0 ? (
          <Vacio>{capas.estados.sismos.mensaje ?? "Ningún sismo M4.5+ cerca de zonas de materias primas ni de RD en los últimos 7 días."}</Vacio>
        ) : (
          <ul className="globo-alertas">
            {sismos.map((s) => (
              <li key={s.id} className="globo-alerta tono-ambar">
                <span className="globo-magnitud mono" aria-label={`Magnitud ${s.cifras[0]?.valor ?? "no confirmada"}`}>
                  M{s.cifras[0]?.valor ?? "?"}
                </span>
                <div className="globo-alerta-cuerpo">
                  <span className="globo-alerta-titulo">{s.titulo.replace(/^M\s*[\d.]+\s*-\s*/, "")}</span>
                  {s.notas[0] ? <span className="globo-alerta-nota">{s.notas[0]}</span> : null}
                  {s.cifras[0]?.sello ? <SelloFuente d={s.cifras[0].sello} ahora={ahora} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="globo-res-pasos" className="globo-res-bloque">
        <h3 id="globo-res-pasos" className="globo-res-titulo">
          <Icono d={ICONOS.paso} />
          Pasos marítimos con alerta
          <span className="globo-capa-conteo mono">{resumen.pasosConAlerta.length}</span>
        </h3>
        {resumen.pasosConAlerta.length === 0 ? (
          <Vacio>Ningún paso con noticias de guerra, sismos M5+ ni ciclones cercanos en las últimas 48 h.</Vacio>
        ) : (
          <ul className="globo-alertas">
            {resumen.pasosConAlerta.map((a) => (
              <li key={a.paso.id} className="globo-alerta tono-ambar">
                <span className="globo-marca halo" aria-hidden="true" />
                <div className="globo-alerta-cuerpo">
                  <span className="globo-alerta-titulo">{a.paso.nombre}</span>
                  <span className="globo-alerta-nota">{a.motivos.join("; ")}.</span>
                  <span className="globo-vigilar">
                    <span className="tenue chico">Vigilar</span>
                    {a.paso.series.map((s) => (
                      <span key={s} className="etiqueta neutra mono">
                        {s}
                      </span>
                    ))}
                  </span>
                </div>
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
      <div className="panel-cabecera globo-cabecera-enlace">
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
