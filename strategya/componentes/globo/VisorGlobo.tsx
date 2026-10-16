"use client";

// Globo «Ojo de Dios»: elige el visor (Cesium 3D si hay WebGL; si no, mapa 2D), maneja las capas, el mapa
// base, el punto seleccionado y la lista accesible equivalente con todos los puntos visibles.
// Las cifras llegan ya formateadas desde el servidor; aquí solo se ubican y se muestran.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CAPAS, type CapaId, type EstadoCapa, type PuntoGlobo } from "@/lib/globo/capas";
import {
  CLAVE_PREFERENCIAS,
  escribirPreferencias,
  hayWebGL,
  leerPreferencias,
  MAPAS_BASE,
  type MapaBaseId,
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

const Cargando = () => <div className="globo-cargando">Cargando el globo…</div>;
const VisorCesium = dynamic(() => import("./VisorCesium"), { ssr: false, loading: Cargando });
const Mapa2D = dynamic(() => import("./Mapa2D"), { ssr: false, loading: Cargando });

type Modo = "decidiendo" | "3d" | "2d";

export function VisorGlobo({
  puntos,
  estados,
  ahoraIso,
}: {
  puntos: PuntoGlobo[];
  estados: Record<CapaId, EstadoCapa>;
  ahoraIso: string;
}) {
  const ahora = useMemo(() => new Date(ahoraIso), [ahoraIso]);
  const [prefs, setPrefs] = useState<PreferenciasGlobo>(preferenciasPorDefecto);
  const [modo, setModo] = useState<Modo>("decidiendo");
  const [motivo2D, setMotivo2D] = useState<string | null>(null);
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
    if (hayWebGL()) setModo("3d");
    else {
      setModo("2d");
      setMotivo2D("Este navegador no tiene WebGL: se muestra el mapa 2D con las mismas capas.");
    }
    setPanelAbierto(window.matchMedia?.("(min-width: 900px)").matches ?? false);
  }, []);

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

  const alFallar = useCallback((m: string) => {
    setModo("2d");
    setMotivo2D(`No se pudo iniciar el globo 3D (${m}). Se muestra el mapa 2D con las mismas capas.`);
  }, []);

  const conteo = (id: CapaId) => puntos.filter((p) => p.capa === id).length;

  return (
    <div className="globo">
      <div className="globo-escena">
        {modo === "3d" ? (
          <VisorCesium puntos={visibles} seleccion={seleccion} mapa={prefs.mapa} alSeleccionar={setSeleccion} alFallar={alFallar} />
        ) : modo === "2d" ? (
          <Mapa2D puntos={visibles} seleccion={seleccion} mapa={prefs.mapa} alSeleccionar={setSeleccion} alFallar={() => {}} />
        ) : (
          <Cargando />
        )}

        <div className="globo-hud">
          <span className="mono globo-hud-modo">{modo === "3d" ? "3D" : modo === "2d" ? "2D" : "…"}</span>
          <button
            type="button"
            className="boton-texto globo-boton-capas"
            aria-expanded={panelAbierto}
            aria-controls="globo-panel-capas"
            onClick={() => setPanelAbierto((v) => !v)}
          >
            Capas ({visibles.length})
          </button>
        </div>

        <div id="globo-panel-capas" className="globo-panel-capas" hidden={!panelAbierto}>
          <fieldset>
            <legend>Capas</legend>
            {CAPAS.map((c) => (
              <label key={c.id} className={`globo-capa tono-capa-${c.id}`}>
                <input
                  type="checkbox"
                  checked={prefs.capas[c.id]}
                  onChange={(e) => cambiar({ ...prefs, capas: { ...prefs.capas, [c.id]: e.target.checked } })}
                />
                <span className="globo-marca" aria-hidden="true" />
                <span>
                  {c.nombre} <span className="mono tenue">{conteo(c.id)}</span>
                  {estados[c.id]?.mensaje ? <span className="globo-capa-nota">{estados[c.id].mensaje}</span> : null}
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Mapa base</legend>
            {Object.values(MAPAS_BASE).map((m) => (
              <label key={m.id} className="globo-capa">
                <input type="radio" name="globo-mapa" checked={prefs.mapa === m.id} onChange={() => cambiar({ ...prefs, mapa: m.id })} />
                <span>{m.nombre}</span>
              </label>
            ))}
          </fieldset>
        </div>

        <p className="globo-atribucion">
          <a href={MAPAS_BASE[prefs.mapa].enlaceTerminos} target="_blank" rel="noopener noreferrer">
            {MAPAS_BASE[prefs.mapa].atribucion}
          </a>
          {modo === "2d" ? " · Fronteras: Natural Earth (dominio público)" : " · CesiumJS"}
        </p>
      </div>

      {motivo2D ? <p className="chico tenue globo-aviso">{motivo2D}</p> : null}

      <div className="globo-seleccion" aria-live="polite">
        {elegido ? (
          <>
            <TarjetaPunto punto={elegido} ahora={ahora} />
            <button type="button" className="boton-texto" onClick={() => setSeleccion(null)}>
              Cerrar
            </button>
          </>
        ) : (
          <p className="chico tenue">Toca un punto del globo (o elige uno en la lista) para ver su tarjeta.</p>
        )}
      </div>

      <section className="globo-lista" aria-labelledby="titulo-lista-globo">
        <h3 id="titulo-lista-globo" className="panel-titulo">
          Todos los puntos visibles ({visibles.length})
        </h3>
        {CAPAS.filter((c) => prefs.capas[c.id]).map((c) => {
          const deCapa = visibles.filter((p) => p.capa === c.id);
          return (
            <details key={c.id} className="globo-lista-capa" open={c.id !== "noticias" && c.id !== "sismos"}>
              <summary>
                {c.nombre} <span className="mono tenue">({deCapa.length})</span>
              </summary>
              {deCapa.length === 0 ? <p className="chico tenue">{estados[c.id]?.mensaje ?? "Sin puntos."}</p> : null}
              <ul>
                {deCapa.map((p) => (
                  <li key={p.id} className={`tono-${p.tono}`}>
                    <button
                      type="button"
                      className="globo-lista-boton"
                      aria-pressed={seleccion === p.id}
                      onClick={() => setSeleccion(p.id)}
                    >
                      <span className="globo-marca" aria-hidden="true" />
                      <span className="globo-lista-titulo">{p.titulo}</span>
                      {p.cifras[0]?.valor ? (
                        <span className="mono chico">
                          <span className="tenue">{p.cifras[0].etiqueta} </span>
                          {p.cifras[0].valor}
                          {p.cifras[0].cambio ? <span className={p.cifras[0].direccion ?? "igual"}> {p.cifras[0].cambio}</span> : null}
                        </span>
                      ) : null}
                    </button>
                    {seleccion === p.id ? (
                      <div className="globo-lista-tarjeta">
                        <TarjetaPunto punto={p} ahora={ahora} encabezado="h4" />
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          );
        })}
      </section>
    </div>
  );
}
