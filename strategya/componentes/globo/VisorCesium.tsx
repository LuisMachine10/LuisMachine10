"use client";

// Visor 3D con CesiumJS (Apache-2.0). Se carga solo en el navegador (next/dynamic, ssr: false).
// Cesium no se empaqueta con la app: scripts/copiar-cesium.mjs copia su build oficial a public/cesium y aquí
// se carga /cesium/Cesium.js con window.CESIUM_BASE_URL = "/cesium" (Workers, Assets, Widgets, ThirdParty).
// Configuración del visor y del mapa base adaptada de God's Eye View (ver lib/globo/visor.ts).
// Sin Cesium ion: token vacío, sin terreno ion, sin geocodificador, sin selector de capas.

import { useEffect, useRef } from "react";
import type * as CesiumTipos from "cesium";
import type { PuntoGlobo } from "@/lib/globo/capas";
import { MAPAS_BASE, OPCIONES_VISOR, RUTA_CESIUM, tamanoMarcador, VARIABLE_TONO } from "@/lib/globo/visor";
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
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || "#a9b5c1";
}

export default function VisorCesium({ puntos, seleccion, mapa, alSeleccionar, alFallar }: PropsVisorInterno) {
  const contenedor = useRef<HTMLDivElement>(null);
  const creditos = useRef<HTMLDivElement>(null);
  const visor = useRef<{ C: Cesium; v: CesiumTipos.Viewer } | null>(null);
  const seleccionar = useRef(alSeleccionar);
  seleccionar.current = alSeleccionar;
  const fallar = useRef(alFallar);
  fallar.current = alFallar;
  const listo = useRef<(() => void) | null>(null);
  const pendiente = useRef({ puntos, mapa, seleccion });
  pendiente.current = { puntos, mapa, seleccion };

  // Crear el visor una sola vez.
  useEffect(() => {
    let cancelado = false;
    let destruir: (() => void) | null = null;
    cargarCesium()
      .then((C) => {
        if (cancelado || !contenedor.current || !creditos.current) return;
        C.Ion.defaultAccessToken = "";
        const v = new C.Viewer(contenedor.current, { ...OPCIONES_VISOR, creditContainer: creditos.current });
        const fondo = C.Color.fromCssColorString(colorCss("--fondo"));
        v.scene.backgroundColor = fondo;
        v.scene.globe.baseColor = C.Color.fromCssColorString(colorCss("--panel"));
        v.scene.globe.enableLighting = false;
        if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true;
        v.scene.screenSpaceCameraController.minimumZoomDistance = 50_000;
        v.camera.setView({ destination: C.Cartesian3.fromDegrees(-50, 20, 22_000_000) });
        const manejador = new C.ScreenSpaceEventHandler(v.scene.canvas);
        manejador.setInputAction((m: { position: CesiumTipos.Cartesian2 }) => {
          const elegido = v.scene.pick(m.position) as { id?: { id?: unknown } } | undefined;
          const id = elegido?.id?.id;
          if (typeof id === "string") seleccionar.current(id.split("#")[0]);
        }, C.ScreenSpaceEventType.LEFT_CLICK);
        visor.current = { C, v };
        destruir = () => {
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
      const mono = getComputedStyle(document.documentElement).getPropertyValue("--mono").trim() || "monospace";
      for (const p of pendiente.current.puntos as PuntoGlobo[]) {
        const color = C.Color.fromCssColorString(colorCss(VARIABLE_TONO[p.tono]));
        const conEtiqueta = p.capa === "rd" || p.capa === "pasos" || p.capa === "mercados" || p.destacado;
        v.entities.add({
          id: p.id,
          name: p.titulo,
          position: C.Cartesian3.fromDegrees(p.lon, p.lat),
          point: {
            pixelSize: tamanoMarcador(p.capa, p.destacado),
            color: p.capa === "ciclones" ? C.Color.TRANSPARENT : color,
            outlineColor: p.capa === "ciclones" ? color : C.Color.fromCssColorString(colorCss("--fondo")),
            outlineWidth: p.capa === "ciclones" ? 3 : 1.5,
          },
          label: conEtiqueta
            ? {
              text: p.capa === "mercados" ? p.titulo.split(" (")[0] : p.titulo.length > 28 ? `${p.titulo.slice(0, 27)}…` : p.titulo,
              font: `11px ${mono}`,
              fillColor: C.Color.fromCssColorString(colorCss("--texto")),
              showBackground: true,
              backgroundColor: C.Color.fromCssColorString(colorCss("--panel")).withAlpha(0.85),
              pixelOffset: new C.Cartesian2(0, -16),
              distanceDisplayCondition: new C.DistanceDisplayCondition(0, p.capa === "rd" || p.destacado ? 3.0e7 : 1.4e7),
            }
            : undefined,
        });
        (p.lineas ?? []).forEach((l, i) => {
          v.entities.add({
            id: `${p.id}#linea${i}`,
            polyline: { positions: C.Cartesian3.fromDegreesArray(l.flatMap((q) => [q.lon, q.lat])), width: 2, material: color },
          });
        });
        (p.areas ?? []).forEach((a, i) => {
          v.entities.add({
            id: `${p.id}#area${i}`,
            polygon: {
              hierarchy: new C.PolygonHierarchy(C.Cartesian3.fromDegreesArray(a.flatMap((q) => [q.lon, q.lat]))),
              material: color.withAlpha(0.15),
              height: 0,
            },
          });
        });
      }
      v.entities.resumeEvents();
      v.scene.requestRender();
    };
    dibujar();
    const previo = listo.current;
    listo.current = () => {
      previo?.();
      dibujar();
    };
  }, [puntos]);

  // Volar al punto elegido (también desde la lista).
  useEffect(() => {
    const x = visor.current;
    if (!x || !seleccion) return;
    const p = pendiente.current.puntos.find((q) => q.id === seleccion);
    if (!p) return;
    const altura = Math.max(x.v.camera.positionCartographic.height * 0.6, 3_500_000);
    x.v.camera.flyTo({ destination: x.C.Cartesian3.fromDegrees(p.lon, p.lat, Math.min(altura, 12_000_000)), duration: 1.2 });
  }, [seleccion]);

  return (
    <div className="globo-cesium">
      <div
        ref={contenedor}
        className="globo-lienzo"
        role="application"
        aria-label="Globo 3D. Arrastra para girar, pellizca para acercar. La lista de abajo tiene los mismos puntos."
      />
      <div ref={creditos} className="globo-creditos" />
    </div>
  );
}
