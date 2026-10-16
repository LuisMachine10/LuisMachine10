# Avisos de terceros

Strategya incluye código adaptado de terceros y muestra datos de fuentes externas. Este archivo reúne sus
licencias y atribuciones.

## 1. God's Eye View (código, licencia MIT)

El módulo Globo («ojo de Dios») está inspirado en God's Eye View de Bilawal Sidhu
(<https://github.com/bilawalsidhu/gods-eye-view>) y adapta (porta a TypeScript estricto) algunas de sus piezas.
Cada archivo adaptado lleva arriba el comentario
«Adaptado de God's Eye View (MIT, © 2026 Bilawal Sidhu) — <ruta original>».

### Archivos adaptados

| Archivo de Strategya | Origen en God's Eye View | Qué se adaptó |
| --- | --- | --- |
| `supabase/functions/_shared/fuentes/sismos-usgs.ts` | `src/layers/earthquakes/records.js`, `src/layers/earthquakes/source.js` | Validación y normalización de los feeds GeoJSON de USGS |
| `supabase/functions/_shared/fuentes/ciclones-nhc.ts` | `server/providers/cyclones.js` | `parseCycloneStatus`, unión con la geometría del pronóstico y consulta al MapServer de resumen tropical del NHC |
| `supabase/functions/_shared/fuentes/buques-ais.ts` | `src/data/aisStreamAdapter.js`, `server/providers/vessels/ais-live.js` | Clasificación de fallos de AISStream, lectura de `Retry-After`, decodificación y validación de mensajes, forma del mensaje de suscripción |
| `lib/globo/visor.ts` | `src/app/viewer.js`, `src/maps/imagery.js` | Opciones del visor Cesium sin widgets ni servicios de pago, mapa base Esri sin clave y su atribución |

Lo que Strategya **no** trae del proyecto original (y por qué) está en la página `/globo`, sección
«Qué no incluye»: cámaras CCTV y ALPR, Street View/Mapillary, tráfico simulado, vuelos y satélites, voz y HUD con
OpenAI, mosaicos 3D fotorrealistas de Google y cables submarinos de TeleGeography. Tampoco trae ninguno de sus
conjuntos de datos locales (`src/data/local_data/`) ni sus modelos 3D (`public/models/`).

### Texto completo de la licencia (copiado de `LICENSE` de God's Eye View)

```text
MIT License

Copyright (c) 2026 Bilawal Sidhu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

NOTE ON THIRD-PARTY DATA AND ASSETS — THE MIT LICENSE ABOVE COVERS THE SOURCE
CODE ONLY.

The datasets bundled under src/data/local_data/, and all data fetched from
third-party providers at runtime, are owned by their respective sources and
are NOT licensed under MIT. They are included/visualized for convenience and
remain subject to their own licenses and terms. Notably:

  - TeleGeography Submarine Cable Map (src/data/local_data/
    telegeography_submarine_cables/): CC BY-NC-SA 3.0 — NonCommercial +
    ShareAlike. NOT for commercial use. If you use this project commercially,
    remove these files or obtain a commercial license from TeleGeography.
  - Datacenters and Dams (OpenStreetMap / Open Infrastructure Map extracts):
    Open Database License (ODbL) 1.0 — attribution + share-alike on the data.
  - NASA FIRMS active-fire snapshot: CC0 / U.S. public domain (citation
    requested).
  - Bhote Koshi event imagery and derived river centerline
    (public/events/bhote-koshi-2026/ and the coordinate dataset in
    src/data/bhoteKoshiFloodPath.js): Vantor / GeoPera, CC BY-NC 4.0.
    NOT for commercial use without separate permission. Source-linked witness
    posts retain their owners' terms; no witness clips are bundled. See the
    folder README for attribution and modification notices. The derived
    coordinates remain third-party data even though they are embedded in a
    JavaScript source file; the MIT grant does not cover that dataset.

Live sources (Google Maps, OpenSky, adsb.lol, AISStream, CelesTrak, USGS,
OSM Overpass, City of Austin, GBFS) are fetched at runtime under each
provider's terms; some (e.g. Google Maps, OpenSky) restrict commercial use
and require you to supply your own credentials.

In short: the MIT grant does not extend to any third-party data. See
DATA_SOURCES.md for the full per-source license + attribution summary, and
remove any dataset whose terms don't fit your use.

The 3D models under public/models/ are also third-party works and are NOT
licensed under MIT. They remain under their individual licenses. See
public/models/README.md for the author, source, license, modification notice,
and attribution covering each model file.
```

## 2. CesiumJS (biblioteca, Apache-2.0)

El globo 3D usa CesiumJS (paquete npm `cesium`, © Cesium GS, Inc. y colaboradores), licencia Apache 2.0:
<https://github.com/CesiumGS/cesium/blob/main/LICENSE.md>. `scripts/copiar-cesium.mjs` copia su build oficial a
`public/cesium` junto con su `LICENSE.md`. Strategya no usa Cesium ion (ni token, ni terreno, ni geocodificador).

## 3. Datos

| Fuente | Uso en Strategya | Licencia / atribución |
| --- | --- | --- |
| USGS · Earthquake Hazards Program | Sismos (feeds `4.5_day` y `significant_week`) | Dominio público de EE. UU. «Data courtesy of the U.S. Geological Survey». |
| NOAA / NWS · National Hurricane Center | Ciclones activos (`CurrentStorms.json`) y su pronóstico (MapServer `NHC_tropical_weather_summary`) | Información pública del Gobierno de EE. UU. (<https://www.weather.gov/disclaimer>). Sin respaldo implícito de NOAA/NWS. |
| Esri · World Imagery | Mapa base satelital del globo 3D | «Powered by Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community». Términos: <https://www.esri.com/en-us/legal/terms/full-master-agreement>. |
| Esri · World Dark Gray Canvas | Mapa base oscuro del globo 3D | «Powered by Esri — Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community». |
| AISStream.io | Conteos de buques en pasos críticos (opcional, apagado por defecto) | Servicio gratuito con clave (beta). Solo se guardan conteos; nunca nombres ni MMSI. |
| Natural Earth (vía `world-atlas`) | Fronteras del mapa 2D de respaldo | Dominio público (<https://www.naturalearthdata.com/>). `world-atlas` © Mike Bostock, licencia ISC. |
| EIA · World Oil Transit Chokepoints y autoridades de los canales | Enlaces de referencia de los pasos marítimos (sin cifras copiadas) | Información pública del Gobierno de EE. UU. / sitios oficiales de cada autoridad. |
