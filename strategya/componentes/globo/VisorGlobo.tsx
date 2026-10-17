"use client";

// Globo «Ojo de Dios»: elige el visor (Cesium 3D si hay WebGL; si no, o si Mena lo pide, mapa 2D), maneja
// las capas, el mapa base, el punto seleccionado y la lista accesible equivalente con todos los puntos visibles.
// Las cifras llegan ya formateadas desde el servidor; aquí solo se ubican y se muestran.

import dynamic from "next/dynamic";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { SelloFuente } from "@/componentes/SelloFuente";
import { CAPAS, type CapaId, type EstadoCapa, type PuntoGlobo } from "@/lib/globo/capas";
import {
  CLAVE_PREFERENCIAS,
  escribirPreferencias,
  hayWebGL,
  leerPreferencias,
  MAPAS_BASE,
  type MapaBaseId,
  esAlerta,
  preferenciasPorDefecto,
  type PreferenciasGlobo,
} from "@/lib/globo/visor";
import { TarjetaPunto } from "./TarjetaPunto";
import "@/estilos/globo.css";

export interface PropsVisorInterno {
  puntos: PuntoGlobo[];
  seleccion: string | null;
  mapa: MapaBaseId;
  alSeleccionar: (id: string) => void;
  alFallar: (motivo: string) => void;
}

const Cargando = () => (
  <div className="globo-cargando" role="status">
    <span className="globo-girando" aria-hidden="true" />
    Cargando el globo…
  </div>
);
const VisorCesium = dynamic(() => import("./VisorCesium"), { ssr: false, loading: Cargando });
const Mapa2D = dynamic(() => import("./Mapa2D"), { ssr: false, loading: Cargando });

type Modo = "decidiendo" | "3d" | "2d";

const TRAZO = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...TRAZO}>
      <path d={d} />
    </svg>
  );
}

const ICONO_CAPAS = "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5";
const ICONO_CERRAR = "M6 6l12 12M18 6L6 18";
const ICONO_TOCAR = "M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V11m0-.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a6 6 0 0 1-4.9-2.5L4.3 15a1.5 1.5 0 0 1 2.4-1.8L9 15.5";

/** Ficha compacta de la lista: botón con el título y la primera cifra; el sello va fuera del botón. */
function Ficha({ p, elegido, alElegir, ahora }: { p: PuntoGlobo; elegido: boolean; alElegir: () => void; ahora: Date }) {
  const c = p.cifras[0];
  return (
    <li className={`globo-ficha tono-${p.tono}${elegido ? " elegida" : ""}${esAlerta(p) ? " destacada" : ""}`}>
      <button type="button" className="globo-ficha-boton" aria-pressed={elegido} aria-controls={elegido ? `globo-detalle-${p.id}` : undefined} onClick={alElegir}>
        <span className="globo-ficha-fila">
          <span className="globo-marca" aria-hidden="true" />
          <span className="globo-ficha-titulo">{p.titulo}</span>
          {esAlerta(p) ? <span className="etiqueta alerta">Alerta</span> : null}
        </span>
        {c ? (
          <span className="globo-ficha-cifra">
            <span className="tenue chico">{c.etiqueta}</span>
            {c.valor === null ? (
              <span className="tenue chico">no confirmado</span>
            ) : (
              <span className="globo-ficha-valor">
                <span className="mono">{c.valor}</span>
                {c.unidad ? <span className="tenue chico"> {c.unidad}</span> : null}
              </span>
            )}
            {c.valor !== null && c.cambio ? <span className={`pastilla ${c.direccion ?? "igual"}`}>{c.cambio}</span> : null}
          </span>
        ) : (
          <span className="globo-ficha-que chico tenue">{p.que}</span>
        )}
      </button>
      {c?.sello ? (
        <SelloFuente d={c.sello} ahora={ahora} />
      ) : c?.enlace ? (
        <div className="sello">
          <a href={c.enlace.url} target="_blank" rel="noopener noreferrer">
            {c.enlace.titulo} ↗
          </a>
          <span>· sin dato guardado</span>
        </div>
      ) : null}
    </li>
  );
}

export function VisorGlobo({
  puntos,
  estados,
  ahoraIso,
  lateral,
}: {
  puntos: PuntoGlobo[];
  estados: Record<CapaId, EstadoCapa>;
  ahoraIso: string;
  /** Contenido extra de la columna lateral (en escritorio, al lado del globo; en el celular, debajo). */
  lateral?: ReactNode;
}) {
  const ahora = useMemo(() => new Date(ahoraIso), [ahoraIso]);
  const [prefs, setPrefs] = useState<PreferenciasGlobo>(preferenciasPorDefecto);
  const [conWebGL, setConWebGL] = useState<boolean | null>(null);
  const [fallo3D, setFallo3D] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [panelAbierto, setPanelAbierto] = useState(false);

  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = window.localStorage.getItem(CLAVE_PREFERENCIAS);
    } catch {
      // almacenamiento bloqueado: se usan los valores por defecto
    }
    setPrefs(leerPreferencias(guardado));
    setConWebGL(hayWebGL());
  }, []);

  const modo: Modo = conWebGL === null ? "decidiendo" : conWebGL && !fallo3D && prefs.vista === "3d" ? "3d" : "2d";
  const motivo2D = conWebGL === false
    ? "Este navegador no tiene WebGL: se muestra el mapa 2D con las mismas capas."
    : fallo3D
      ? `No se pudo iniciar el globo 3D (${fallo3D}). Se muestra el mapa 2D con las mismas capas.`
      : null;

  const cambiar = useCallback((p: PreferenciasGlobo) => {
    setPrefs(p);
    try {
      window.localStorage.setItem(CLAVE_PREFERENCIAS, escribirPreferencias(p));
    } catch {
      // sin almacenamiento: la preferencia dura hasta recargar
    }
  }, []);

  const visibles = useMemo(() => puntos.filter((p) => prefs.capas[p.capa]), [puntos, prefs.capas]);
  const elegido = visibles.find((p) => p.id === seleccion) ?? null;
  const sugeridos = useMemo(
    () => [...visibles.filter(esAlerta), ...visibles.filter((p) => p.capa === "rd")].slice(0, 4),
    [visibles],
  );

  const alFallar = useCallback((m: string) => setFallo3D(m), []);
  const conteo = (id: CapaId) => puntos.filter((p) => p.capa === id).length;
  const sin3D = conWebGL === false || !!fallo3D;

  return (
    <div className="globo">
      <div className={`globo-escena es-${modo}`}>
        {modo === "3d" ? (
          <VisorCesium puntos={visibles} seleccion={seleccion} mapa={prefs.mapa} alSeleccionar={setSeleccion} alFallar={alFallar} />
        ) : modo === "2d" ? (
          <Mapa2D puntos={visibles} seleccion={seleccion} mapa={prefs.mapa} alSeleccionar={setSeleccion} alFallar={() => {}} />
        ) : (
          <Cargando />
        )}

        <div className="globo-hud">
          <div className="globo-segmento" role="group" aria-label="Tipo de vista">
            <button
              type="button"
              aria-pressed={modo === "3d"}
              disabled={sin3D}
              title={sin3D ? (motivo2D ?? undefined) : "Globo 3D"}
              onClick={() => cambiar({ ...prefs, vista: "3d" })}
            >
              3D
            </button>
            <button type="button" aria-pressed={modo === "2d"} title="Mapa 2D" onClick={() => cambiar({ ...prefs, vista: "2d" })}>
              2D
            </button>
          </div>
          <button
            type="button"
            className="globo-boton-capas"
            aria-expanded={panelAbierto}
            aria-controls="globo-panel-capas"
            onClick={() => setPanelAbierto((v) => !v)}
          >
            <Icono d={ICONO_CAPAS} />
            Capas
            <span className="globo-conteo mono" aria-label={`${visibles.length} puntos visibles`}>
              {visibles.length}
            </span>
          </button>
        </div>

        <div id="globo-panel-capas" className="globo-panel-capas globo-vidrio" hidden={!panelAbierto}>
          <div className="globo-panel-cabecera">
            <span className="globo-panel-titulo">Capas</span>
            <button type="button" className="globo-boton-icono chico-icono" aria-label="Cerrar el panel de capas" onClick={() => setPanelAbierto(false)}>
              <Icono d={ICONO_CERRAR} />
            </button>
          </div>
          <fieldset>
            <legend className="sr-solo">Capas visibles</legend>
            {CAPAS.map((c) => (
              <label key={c.id} className={`globo-capa tono-capa-${c.id}`}>
                <span className="globo-marca" aria-hidden="true" />
                <span className="globo-capa-texto">
                  <span className="globo-capa-nombre">
                    {c.nombre} <span className="globo-capa-conteo mono">{conteo(c.id)}</span>
                  </span>
                  {estados[c.id]?.mensaje ? <span className="globo-capa-nota">{estados[c.id].mensaje}</span> : null}
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  className="globo-interruptor"
                  checked={prefs.capas[c.id]}
                  onChange={(e) => cambiar({ ...prefs, capas: { ...prefs.capas, [c.id]: e.target.checked } })}
                />
              </label>
            ))}
          </fieldset>
          <fieldset className="globo-mapas">
            <legend className="globo-panel-subtitulo">Mapa base{modo === "2d" ? <span className="tenue"> · solo en 3D</span> : null}</legend>
            <div className="globo-segmento ancho">
              {Object.values(MAPAS_BASE).map((m) => (
                <label key={m.id} title={m.nombre}>
                  <input type="radio" name="globo-mapa" className="sr-solo" checked={prefs.mapa === m.id} onChange={() => cambiar({ ...prefs, mapa: m.id })} />
                  <span>{m.id === "imagen" ? "Satélite" : "Gris oscuro"}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="globo-leyenda" aria-label="Leyenda">
            <span className="tono-sube"><span className="globo-marca" aria-hidden="true" />Sube</span>
            <span className="tono-baja"><span className="globo-marca" aria-hidden="true" />Baja</span>
            <span className="tono-neutro"><span className="globo-marca" aria-hidden="true" />Sin dato</span>
            <span className="tono-ambar"><span className="globo-marca halo" aria-hidden="true" />Alerta</span>
            <span className="tono-ciclon"><span className="globo-marca anillo" aria-hidden="true" />Ciclón</span>
          </div>
        </div>

        <p className="globo-atribucion">
          {modo === "2d" ? (
            <a href="https://www.naturalearthdata.com/" target="_blank" rel="noopener noreferrer">
              Fronteras: Natural Earth (dominio público)
            </a>
          ) : (
            <>
              <a href={MAPAS_BASE[prefs.mapa].enlaceTerminos} target="_blank" rel="noopener noreferrer">
                {MAPAS_BASE[prefs.mapa].atribucion}
              </a>
              {" · CesiumJS"}
            </>
          )}
        </p>
      </div>

      {motivo2D ? <p className="chico tenue globo-aviso">{motivo2D}</p> : null}

      <aside className="globo-lateral" aria-label="Detalle y alertas">
        <section className="panel globo-seleccion" aria-labelledby="titulo-seleccion-globo" aria-live="polite">
          <div className="panel-cabecera">
            <h2 id="titulo-seleccion-globo" className="panel-titulo">
              Punto elegido
            </h2>
            {elegido ? (
              <button type="button" className="globo-boton-icono chico-icono globo-cerrar" aria-label="Cerrar la tarjeta" onClick={() => setSeleccion(null)}>
                <Icono d={ICONO_CERRAR} />
              </button>
            ) : null}
          </div>
          <div className="panel-cuerpo">
            {elegido ? (
              <TarjetaPunto punto={elegido} ahora={ahora} />
            ) : (
              <div className="globo-vacio">
                <span className="globo-vacio-icono" aria-hidden="true">
                  <Icono d={ICONO_TOCAR} />
                </span>
                <p>Toca un punto del globo o elige uno en la lista para ver sus cifras y su fuente.</p>
                {sugeridos.length ? (
                  <div className="globo-sugeridos">
                    {sugeridos.map((p) => (
                      <button key={p.id} type="button" className={`globo-chip tono-${p.tono}`} onClick={() => setSeleccion(p.id)}>
                        <span className="globo-marca" aria-hidden="true" />
                        {p.titulo.length > 30 ? `${p.titulo.slice(0, 29)}…` : p.titulo}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
        {lateral}
      </aside>

      <section className="panel globo-lista" aria-labelledby="titulo-lista-globo">
        <div className="panel-cabecera">
          <h2 id="titulo-lista-globo" className="panel-titulo">
            Todos los puntos visibles
          </h2>
          <span className="tenue chico mono">{visibles.length}</span>
        </div>
        <div className="globo-lista-cuerpo">
          {CAPAS.filter((c) => prefs.capas[c.id]).map((c) => {
            const deCapa = visibles.filter((p) => p.capa === c.id);
            return (
              <details key={c.id} className={`globo-lista-capa tono-capa-${c.id}`} open={c.id !== "noticias" && c.id !== "sismos"}>
                <summary>
                  <span className="globo-marca" aria-hidden="true" />
                  <span className="globo-lista-nombre">{c.nombre}</span>
                  <span className="globo-capa-conteo mono">{deCapa.length}</span>
                  <svg className="globo-flecha" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...TRAZO}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                {deCapa.length === 0 ? <p className="chico tenue globo-lista-vacia">{estados[c.id]?.mensaje ?? "Sin puntos."}</p> : null}
                <ul className="globo-fichas">
                  {deCapa.flatMap((p) => {
                    const items = [<Ficha key={p.id} p={p} elegido={seleccion === p.id} alElegir={() => setSeleccion(seleccion === p.id ? null : p.id)} ahora={ahora} />];
                    if (seleccion === p.id) {
                      items.push(
                        <li key={`${p.id}-detalle`} id={`globo-detalle-${p.id}`} className="globo-ficha-detalle">
                          <TarjetaPunto punto={p} ahora={ahora} encabezado="h4" />
                        </li>,
                      );
                    }
                    return items;
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
