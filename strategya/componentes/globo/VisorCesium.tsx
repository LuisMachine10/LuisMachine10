"use client";

// Visor 3D con CesiumJS (Apache-2.0). Se carga solo en el navegador (next/dynamic, ssr: false).
// Cesium no se empaqueta con la app: scripts/copiar-cesium.mjs copia su build oficial a public/cesium y aquí
// se carga /cesium/Cesium.js con window.CESIUM_BASE_URL = "/cesium" (Workers, Assets, Widgets, ThirdParty).
// Configuración del visor y del mapa base adaptada de God's Eye View (ver lib/globo/visor.ts).
// Sin Cesium ion: token vacío, sin terreno ion, sin geocodificador, sin selector de capas.
//
// Nitidez: se dibuja a la densidad del dispositivo (tope 2), con MSAA ×4 si WebGL2 lo permite (si no, FXAA),
// y las etiquetas se rasterizan al doble y se reducen, en Inter. Para no amontonar texto, solo unas pocas
// etiquetas son fijas (RD; resaltados y bolsas al acercarse); las demás aparecen al pasar o al elegir.

import { useEffect, useRef } from "react";
import type * as CesiumTipos from "cesium";
import type { PuntoGlobo } from "@/lib/globo/capas";
import {
  alturaInicial,
  anchoEtiqueta,
  type CajaEtiqueta,
  CENTRO_INICIAL,
  descongestionar,
  esAlerta,
  DISTANCIA_ETIQUETAS_M,
  escalaResolucion,
  factorEtiqueta,
  LETRA_ETIQUETA,
  MAPAS_BASE,
  OPCIONES_VISOR,
  RUTA_CESIUM,
  tamanoMarcador,
  textoEtiqueta,
  VARIABLE_TONO,
} from "@/lib/globo/visor";
import type { PropsVisorInterno } from "./VisorGlobo";

type Cesium = typeof CesiumTipos;

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: Cesium;
  }
}

let carga: Promise<Cesium> | null = null;

function cargarCesium(): Promise<Cesium> {
  if (window.Cesium) return Promise.resolve(window.Cesium);
  if (carga) return carga;
  window.CESIUM_BASE_URL = RUTA_CESIUM;
  if (!document.querySelector("link[data-cesium-css]")) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${RUTA_CESIUM}/Widgets/widgets.css`;
    css.dataset.cesiumCss = "1";
    document.head.appendChild(css);
  }
  carga = new Promise<Cesium>((resolver, rechazar) => {
    const s = document.createElement("script");
    s.src = `${RUTA_CESIUM}/Cesium.js`;
    s.async = true;
    s.onload = () => (window.Cesium ? resolver(window.Cesium) : rechazar(new Error("Cesium.js no definió window.Cesium")));
    s.onerror = () => {
      carga = null;
      rechazar(new Error(`no se pudo cargar ${RUTA_CESIUM}/Cesium.js`));
    };
    document.head.appendChild(s);
  });
  return carga;
}

function colorCss(variable: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "#b2b5be";
}

function movimientoReducido(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

/** Hasta qué distancia de cámara se ve la etiqueta sin pasar el puntero (null = solo al pasar o elegir). */
function distanciaEtiquetaFija(p: PuntoGlobo): number | null {
  if (p.capa === "rd") return DISTANCIA_ETIQUETAS_M;
  if (esAlerta(p)) return 14_000_000;
  if (p.destacado) return 8_000_000;
  if (p.capa === "mercados" || p.capa === "pasos") return 7_000_000;
  return null;
}

interface Marcador {
  punto: PuntoGlobo;
  entidad: CesiumTipos.Entity;
  posicion: CesiumTipos.Cartesian3;
}

const ICONO = { strokeWidth: 1.8, stroke: "currentColor", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;

export default function VisorCesium({ puntos, seleccion, mapa, alSeleccionar, alFallar }: PropsVisorInterno) {
  const contenedor = useRef<HTMLDivElement>(null);
  const creditos = useRef<HTMLDivElement>(null);
  const visor = useRef<{ C: Cesium; v: CesiumTipos.Viewer } | null>(null);
  const marcadores = useRef(new Map<string, Marcador>());
  const encima = useRef<string | null>(null);
  const seleccionar = useRef(alSeleccionar);
  seleccionar.current = alSeleccionar;
  const fallar = useRef(alFallar);
  fallar.current = alFallar;
  const listo = useRef<(() => void) | null>(null);
  const pendiente = useRef({ puntos, mapa, seleccion });
  pendiente.current = { puntos, mapa, seleccion };

  /** Etiquetas visibles y contorno del elegido, según el puntero y la selección. */
  const aplicarEstado = useRef(() => {});
  aplicarEstado.current = () => {
    const x = visor.current;
    if (!x) return;
    const { C, v } = x;
    const texto = C.Color.fromCssColorString(colorCss("--texto"));
    const fondo = C.Color.fromCssColorString(colorCss("--fondo"));
    // Desclutter: candidatas = activas (puntero o selección) + fijas dentro de su distancia y de este lado
    // del globo; se muestran por prioridad las que no chocan en pantalla.
    const camara = v.camera.positionWC;
    const oclusor = new C.EllipsoidalOccluder(C.Ellipsoid.WGS84, camara);
    const cajas: CajaEtiqueta[] = [];
    for (const [id, { punto, posicion }] of marcadores.current) {
      const activo = id === encima.current || id === pendiente.current.seleccion;
      const fija = distanciaEtiquetaFija(punto);
      if (!activo && (fija === null || C.Cartesian3.distance(camara, posicion) > fija)) continue;
      if (!oclusor.isPointVisible(posicion)) continue;
      const xy = C.SceneTransforms.worldToWindowCoordinates(v.scene, posicion);
      if (!xy) continue;
      cajas.push({
        id,
        x: xy.x,
        y: xy.y - (tamanoMarcador(punto.capa, punto.destacado) / 2 + 8),
        ancho: anchoEtiqueta(textoEtiqueta(punto)),
        alto: 24,
        prioridad: id === pendiente.current.seleccion ? 0 : activo ? 1 : punto.capa === "rd" ? 2 : esAlerta(punto) ? 3 : punto.destacado ? 4 : 5,
      });
    }
    const mostrar = descongestionar(cajas);
    for (const [id, { punto, entidad }] of marcadores.current) {
      const activo = id === encima.current || id === pendiente.current.seleccion;
      const fija = distanciaEtiquetaFija(punto);
      if (entidad.label) {
        entidad.label.show = new C.ConstantProperty(mostrar.has(id));
        entidad.label.distanceDisplayCondition = activo || fija === null
          ? (undefined as unknown as CesiumTipos.Property)
          : new C.ConstantProperty(new C.DistanceDisplayCondition(0, fija));
      }
      if (entidad.point && punto.capa !== "ciclones") {
        const elegido = id === pendiente.current.seleccion;
        entidad.point.outlineColor = new C.ConstantProperty(elegido ? texto : fondo);
        entidad.point.outlineWidth = new C.ConstantProperty(elegido ? 2.5 : 1.5);
        entidad.point.pixelSize = new C.ConstantProperty(tamanoMarcador(punto.capa, punto.destacado) + (elegido ? 4 : 0));
      }
    }
    v.scene.requestRender();
  };

  const vistaInicial = useRef((_animar: boolean) => {});
  vistaInicial.current = (animar: boolean) => {
    const x = visor.current;
    const el = contenedor.current;
    if (!x || !el) return;
    const destino = x.C.Cartesian3.fromDegrees(CENTRO_INICIAL.lon, CENTRO_INICIAL.lat, alturaInicial(el.clientWidth, el.clientHeight));
    if (animar && !movimientoReducido()) x.v.camera.flyTo({ destination: destino, duration: 1 });
    else x.v.camera.setView({ destination: destino });
    x.v.scene.requestRender();
  };

  // Crear el visor una sola vez.
  useEffect(() => {
    let cancelado = false;
    let destruir: (() => void) | null = null;
    cargarCesium()
      .then(async (C) => {
        // Inter debe estar cargada antes de rasterizar las etiquetas (si no, salen con la letra de respaldo).
        await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).catch(() => undefined);
        if (cancelado || !contenedor.current || !creditos.current) return;
        C.Ion.defaultAccessToken = "";
        const v = new C.Viewer(contenedor.current, { ...OPCIONES_VISOR, creditContainer: creditos.current });
        const escena = v.scene;
        v.resolutionScale = escalaResolucion(window.devicePixelRatio);
        if (escena.msaaSupported) escena.msaaSamples = OPCIONES_VISOR.msaaSamples;
        else escena.postProcessStages.fxaa.enabled = true;
        escena.backgroundColor = C.Color.fromCssColorString(colorCss("--fondo"));
        escena.globe.baseColor = C.Color.fromCssColorString(colorCss("--panel-alto"));
        escena.globe.enableLighting = false;
        escena.globe.showGroundAtmosphere = false;
        escena.globe.maximumScreenSpaceError = 1.5;
        escena.fog.enabled = false;
        if (escena.skyBox) escena.skyBox.show = false;
        if (escena.sun) escena.sun.show = false;
        if (escena.moon) escena.moon.show = false;
        if (escena.skyAtmosphere) escena.skyAtmosphere.show = true;
        escena.screenSpaceCameraController.minimumZoomDistance = 50_000;
        visor.current = { C, v };
        vistaInicial.current(false);
        // Al mover la cámara se recalcula qué etiquetas caben sin encimarse.
        v.camera.percentageChanged = 0.04;
        const alMover = () => aplicarEstado.current();
        const quitarCambio = v.camera.changed.addEventListener(alMover);
        const quitarFin = v.camera.moveEnd.addEventListener(alMover);
        const quitarPrimerCuadro = v.scene.postRender.addEventListener(() => {
          quitarPrimerCuadro();
          aplicarEstado.current();
        });

        const manejador = new C.ScreenSpaceEventHandler(escena.canvas);
        const idEn = (pos: CesiumTipos.Cartesian2): string | null => {
          const elegido = escena.pick(pos) as { id?: { id?: unknown } } | undefined;
          const id = elegido?.id?.id;
          return typeof id === "string" ? id.split("#")[0] : null;
        };
        manejador.setInputAction((m: { position: CesiumTipos.Cartesian2 }) => {
          const id = idEn(m.position);
          if (id) seleccionar.current(id);
        }, C.ScreenSpaceEventType.LEFT_CLICK);
        let cuadro = 0;
        manejador.setInputAction((m: { endPosition: CesiumTipos.Cartesian2 }) => {
          if (cuadro) return;
          const pos = m.endPosition.clone();
          cuadro = requestAnimationFrame(() => {
            cuadro = 0;
            const id = idEn(pos);
            if (id === encima.current) return;
            encima.current = id;
            escena.canvas.style.cursor = id ? "pointer" : "";
            aplicarEstado.current();
          });
        }, C.ScreenSpaceEventType.MOUSE_MOVE);

        destruir = () => {
          if (cuadro) cancelAnimationFrame(cuadro);
          quitarCambio();
          quitarFin();
          manejador.destroy();
          v.destroy();
        };
        listo.current?.();
      })
      .catch((e: unknown) => {
        if (!cancelado) fallar.current((e as Error).message);
      });
    return () => {
      cancelado = true;
      destruir?.();
      visor.current = null;
      marcadores.current.clear();
    };
  }, []);

  // Mapa base.
  useEffect(() => {
    const aplicar = () => {
      const x = visor.current;
      if (!x) return;
      const { C, v } = x;
      const m = MAPAS_BASE[pendiente.current.mapa];
      v.imageryLayers.removeAll();
      v.imageryLayers.addImageryProvider(
        new C.UrlTemplateImageryProvider({ url: m.url, maximumLevel: m.maximoNivel, credit: new C.Credit(m.atribucion, true) }),
      );
      v.scene.requestRender();
    };
    aplicar();
    const previo = listo.current;
    listo.current = () => {
      previo?.();
      aplicar();
    };
  }, [mapa]);

  // Puntos, trayectorias y conos.
  useEffect(() => {
    const dibujar = () => {
      const x = visor.current;
      if (!x) return;
      const { C, v } = x;
      v.entities.suspendEvents();
      v.entities.removeAll();
      marcadores.current.clear();
      const k = factorEtiqueta(window.devicePixelRatio);
      const familia = getComputedStyle(document.body).fontFamily || "Inter, system-ui, sans-serif";
      const fondo = C.Color.fromCssColorString(colorCss("--fondo"));
      const fondoEtiqueta = C.Color.fromCssColorString(colorCss("--panel-alto")).withAlpha(0.94);
      const textoEtq = C.Color.fromCssColorString(colorCss("--texto"));
      const lista = pendiente.current.puntos as PuntoGlobo[];
      // Formas primero (quedan debajo), luego halos de los resaltados y al final los marcadores.
      for (const p of lista) {
        const color = C.Color.fromCssColorString(colorCss(VARIABLE_TONO[p.tono]));
        (p.areas ?? []).forEach((a, i) => {
          v.entities.add({
            id: `${p.id}#area${i}`,
            polygon: {
              hierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(a.flatMap((q) => [q.lon, q.lat]))),
              material: color.withAlpha(0.14),
              outline: false,
              height: 0,
            },
          });
        });
        (p.lineas ?? []).forEach((l, i) => {
          v.entities.add({
            id: `${p.id}#linea${i}`,
            polyline: {
              positions: C.Cartesian3.fromDegreesArray(l.flatMap((q) => [q.lon, q.lat])),
              width: 2,
              material: new C.PolylineDashMaterialProperty({ color, dashLength: 12 }),
            },
          });
        });
      }
      for (const p of lista) {
        if (!p.destacado) continue;
        const color = C.Color.fromCssColorString(colorCss(VARIABLE_TONO[p.tono]));
        v.entities.add({
          id: `${p.id}#halo`,
          position: C.Cartesian3.fromDegrees(p.lon, p.lat),
          point: { pixelSize: tamanoMarcador(p.capa, true) + 12, color: color.withAlpha(0.22), outlineWidth: 0 },
        });
      }
      for (const p of lista) {
        const color = C.Color.fromCssColorString(colorCss(VARIABLE_TONO[p.tono]));
        const tam = tamanoMarcador(p.capa, p.destacado);
        const posicion = C.Cartesian3.fromDegrees(p.lon, p.lat);
        const entidad = v.entities.add({
          id: p.id,
          name: p.titulo,
          position: posicion,
          point: {
            pixelSize: tam,
            color: p.capa === "ciclones" ? C.Color.TRANSPARENT : color,
            outlineColor: p.capa === "ciclones" ? color : fondo,
            outlineWidth: p.capa === "ciclones" ? 3 : 1.5,
          },
          label: {
            text: textoEtiqueta(p),
            font: `600 ${LETRA_ETIQUETA * k}px ${familia}`,
            scale: 1 / k,
            fillColor: textoEtq,
            showBackground: true,
            backgroundColor: fondoEtiqueta,
            backgroundPadding: new C.Cartesian2(8 * k, 5 * k),
            horizontalOrigin: C.HorizontalOrigin.CENTER,
            verticalOrigin: C.VerticalOrigin.BOTTOM,
            pixelOffset: new C.Cartesian2(0, -(tam / 2 + 8)),
            show: false,
          },
        });
        marcadores.current.set(p.id, { punto: p, entidad, posicion });
      }
      v.entities.resumeEvents();
      aplicarEstado.current();
    };
    dibujar();
    const previo = listo.current;
    listo.current = () => {
      previo?.();
      dibujar();
    };
  }, [puntos]);

  // Volar al punto elegido (también desde la lista) y mostrar su etiqueta.
  useEffect(() => {
    const x = visor.current;
    aplicarEstado.current();
    if (!x || !seleccion) return;
    const p = pendiente.current.puntos.find((q) => q.id === seleccion);
    if (!p) return;
    const altura = Math.max(x.v.camera.positionCartographic.height * 0.6, 3_500_000);
    x.v.camera.flyTo({
      destination: x.C.Cartesian3.fromDegrees(p.lon, p.lat, Math.min(altura, 12_000_000)),
      duration: movimientoReducido() ? 0 : 1.2,
    });
  }, [seleccion]);

  const acercar = (factor: number) => {
    const x = visor.current;
    if (!x) return;
    const h = x.v.camera.positionCartographic.height;
    if (factor > 0) x.v.camera.zoomIn(h * factor);
    else x.v.camera.zoomOut(h * -factor);
    x.v.scene.requestRender();
  };

  return (
    <div className="globo-cesium">
      <div
        ref={contenedor}
        className="globo-lienzo"
        role="application"
        aria-label="Globo 3D. Arrastra para girar, pellizca o usa los botones para acercar. La lista de abajo tiene los mismos puntos."
      />
      <div ref={creditos} className="globo-creditos" />
      <div className="globo-zoom" role="group" aria-label="Controles de la cámara">
        <button type="button" className="globo-boton-icono" onClick={() => acercar(0.4)} aria-label="Acercar" title="Acercar">
          <svg viewBox="0 0 24 24" aria-hidden="true" {...ICONO}>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
        <button type="button" className="globo-boton-icono" onClick={() => acercar(-0.6)} aria-label="Alejar" title="Alejar">
          <svg viewBox="0 0 24 24" aria-hidden="true" {...ICONO}>
            <path d="M5 12h14" />
          </svg>
        </button>
        <button type="button" className="globo-boton-icono" onClick={() => vistaInicial.current(true)} aria-label="Volver a la vista inicial" title="Vista inicial">
          <svg viewBox="0 0 24 24" aria-hidden="true" {...ICONO}>
            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
