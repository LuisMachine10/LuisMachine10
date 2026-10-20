import type { Metadata } from "next";
import { Actualizador } from "@/componentes/Actualizador";
import { Encabezado } from "@/componentes/Encabezado";
import { PanelError } from "@/componentes/PanelError";
import { ResumenGlobo } from "@/componentes/globo/PanelGlobo";
import { VisorGlobo } from "@/componentes/globo/VisorGlobo";
import { datosGlobo } from "@/lib/datos-globo";
import { armarCapas, type Capas } from "@/lib/globo/capas";
import { ZONAS_VIGILANCIA } from "@/lib/globo/geo";
import { EIA_CHOKEPOINTS } from "@/lib/globo/pasos";
import { esAlerta } from "@/lib/globo/visor";
import "@/estilos/globo.css";

export const metadata: Metadata = { title: "Globo · Strategya" };
export const dynamic = "force-dynamic";

const FUENTES = [
  { nombre: "USGS · Earthquake Hazards Program (dominio público)", url: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php" },
  { nombre: "NOAA / NWS · Centro Nacional de Huracanes", url: "https://www.nhc.noaa.gov/" },
  { nombre: "EIA · World Oil Transit Chokepoints", url: EIA_CHOKEPOINTS.url },
  { nombre: "AISStream.io (opcional, apagado por defecto)", url: "https://aisstream.io/" },
  { nombre: "Esri · World Imagery y World Dark Gray (mapa base)", url: "https://www.esri.com/en-us/legal/terms/full-master-agreement" },
  { nombre: "Natural Earth (fronteras del mapa 2D, dominio público)", url: "https://www.naturalearthdata.com/" },
  { nombre: "CesiumJS (Apache-2.0)", url: "https://cesium.com/platform/cesiumjs/" },
  { nombre: "God's Eye View de Bilawal Sidhu (MIT): proyecto original adaptado", url: "https://github.com/bilawalsidhu/gods-eye-view" },
];

const NO_INCLUYE: { que: string; porque: string }[] = [
  { que: "Cámaras CCTV y cámaras de placas (ALPR)", porque: "Son vigilancia de personas y no tienen relación con finanzas." },
  { que: "Street View y Mapillary", porque: "Imágenes a nivel de calle: no aportan a mercados y exponen a personas." },
  { que: "Tráfico simulado", porque: "Es una simulación, no un dato con fuente; Strategya no muestra nada inventado." },
  { que: "Vuelos y satélites", porque: "Rastreo de aeronaves y objetos sin relación directa con las finanzas de Mena; además pueden identificar personas." },
  {
    que: "Voz y HUD con OpenAI",
    porque: "Regla de Strategya: la IA es Anthropic con tope de gasto, y ninguna cifra sale de un modelo de lenguaje.",
  },
  { que: "Mosaicos 3D fotorrealistas de Google", porque: "Cuestan dinero por uso y requieren cuenta y clave." },
  {
    que: "Cables submarinos de TeleGeography",
    porque: "Su licencia es no comercial con «share-alike», incompatible con este repositorio.",
  },
  { que: "Nombres o identificadores de buques", porque: "Del AIS solo se guardan conteos por paso: nada que rastree personas o embarcaciones concretas." },
];

export default async function Globo() {
  const ahora = new Date();
  let capas: Capas;
  try {
    capas = armarCapas(await datosGlobo(ahora));
  } catch (e) {
    return (
      <>
        <Encabezado actual="globo" ultimaActualizacion={null} />
        <main className="globo-pagina">
          <PanelError titulo="Globo · ojo de Dios" mensaje={(e as Error).message} />
        </main>
      </>
    );
  }

  const ultima = capas.puntos.map((p) => p.momento).filter((m): m is string => !!m).sort().at(-1) ?? null;
  const alertas = capas.puntos.filter(esAlerta).length;

  return (
    <>
      <Encabezado actual="globo" ultimaActualizacion={ultima} />
      <main className="globo-pagina">
        <header className="globo-titular">
          <div className="globo-titular-textos">
            <h1 className="globo-titulo">Mapa del mundo</h1>
            <p className="globo-subtitulo">Gíralo con el dedo o el mouse y toca un punto para ver qué pasa ahí: bolsas, conflictos, rutas de barcos, sismos y huracanes que pueden mover precios.</p>
          </div>
          <div className="globo-titular-datos">
            {alertas > 0 ? (
              <span className="etiqueta alerta">
                <span className="mono">{alertas}</span> {alertas === 1 ? "alerta" : "alertas"}
              </span>
            ) : (
              <span className="etiqueta ok">Sin alertas</span>
            )}
            <span className="etiqueta neutra">
              <span className="mono">{capas.puntos.length}</span> puntos
            </span>
            <details className="globo-ayuda">
              <summary>Cómo leer el mapa</summary>
              <div className="globo-ayuda-cuerpo">
                <p>
                  Bolsas en verde si suben, rojo si bajan y gris sin dato; noticias y guerras de las últimas 48 h; República
                  Dominicana; pasos marítimos críticos para las materias primas; sismos (USGS) y ciclones (NHC). Los puntos con
                  halo tienen una alerta. Cada cifra lleva su fuente y su fecha.
                </p>
              </div>
            </details>
          </div>
        </header>

        <VisorGlobo
          puntos={capas.puntos}
          estados={capas.estados}
          ahoraIso={ahora.toISOString()}
          lateral={
            <section className="panel" aria-labelledby="titulo-resumen-globo">
              <div className="panel-cabecera">
                <h2 id="titulo-resumen-globo" className="panel-titulo">
                  Alertas
                </h2>
              </div>
              <div className="panel-cuerpo">
                <ResumenGlobo capas={capas} ahora={ahora} />
              </div>
            </section>
          }
        />

        <section className="panel globo-info" aria-labelledby="titulo-reglas-globo">
          <div className="panel-cabecera">
            <h2 id="titulo-reglas-globo" className="panel-titulo">
              Cómo funciona
            </h2>
          </div>
          <div className="panel-cuerpo globo-info-cuerpo">
            <details className="globo-plegable">
              <summary>Cómo se resalta un punto</summary>
              <p className="tenue">Reglas fijas de Strategya (distancias aproximadas sobre la esfera; no son de la fuente).</p>
              <h3 className="globo-info-sub">Sismo M4.5+ dentro del radio de una zona vigilada</h3>
              <ul className="globo-zonas">
                {ZONAS_VIGILANCIA.map((z) => (
                  <li key={z.id}>
                    <span>
                      {z.nombre} <span className="tenue">· {z.motivo}</span>
                    </span>
                    <span className="mono">{z.radioKm} km</span>
                  </li>
                ))}
              </ul>
              <ul className="globo-reglas">
                <li>Ciclón: a 500 km o menos de Santo Domingo (posición actual o pronóstico oficial).</li>
                <li>Paso con alerta: noticia de guerra a menos de 800 km, sismo M5+ a menos de 500 km o ciclón a menos de 500 km.</li>
              </ul>
            </details>
            <details className="globo-plegable">
              <summary>Qué no incluye y por qué</summary>
              <p className="tenue">Piezas del proyecto original que Strategya deja fuera a propósito.</p>
              <ul className="globo-reglas">
                {NO_INCLUYE.map((n) => (
                  <li key={n.que}>
                    <strong>{n.que}.</strong> {n.porque}
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      </main>
      <footer className="pie">
        <h2>Fuentes</h2>
        <ul>
          {FUENTES.map((f) => (
            <li key={f.url}>
              <a href={f.url} target="_blank" rel="noopener noreferrer">
                {f.nombre}
              </a>
            </li>
          ))}
        </ul>
        <p>
          Basado en God&apos;s Eye View (MIT, © 2026 Bilawal Sidhu). Avisos y licencias en THIRD_PARTY_NOTICES.md del
          repositorio. Los avisos de ciclones y sismos no reemplazan a los oficiales del NHC, USGS, COE ni ONAMET.
        </p>
        <p>Strategya no es asesoría de inversión. Cifras de fuentes oficiales; ninguna sale de un modelo de lenguaje.</p>
      </footer>
      <Actualizador />
    </>
  );
}
