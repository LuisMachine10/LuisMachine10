// Manual, sección F: términos y privacidad. La casilla se acepta una vez por versión; se guarda versión y fecha.
import { describe, expect, it } from "vitest";
import { aceptoVigente, leerAceptacion, pideTerminos, rutaVolver, TEXTO_TERMINOS, VERSION_TERMINOS } from "./terminos";

const base = { ruta: "/", metodo: "GET", cookie: undefined as string | undefined, conSesion: true, esAccion: false };

describe("términos y privacidad", () => {
  it("el texto dice lo del manual: la información es del usuario, no se vende ni comparte, se descarga o borra, no es asesoría y las cifras son de fuentes públicas citadas", () => {
    const t = TEXTO_TERMINOS.flatMap((s) => [s.titulo, ...s.parrafos]).join(" ");
    for (const frase of ["es tuyo", "No se vende ni se comparte", "descargar", "borrar", "No es asesoría de inversión", "fuentes públicas citadas"]) expect(t).toContain(frase);
  });

  it("se pide una sola vez: con la cookie de la versión vigente ya no se pide", () => {
    expect(pideTerminos(base)).toBe(true);
    expect(pideTerminos({ ...base, cookie: VERSION_TERMINOS })).toBe(false);
    expect(pideTerminos({ ...base, cookie: "2020-01-01" })).toBe(true);
  });

  it("nunca en /terminos, /login, archivos, acciones de formularios ni sin sesión", () => {
    expect(pideTerminos({ ...base, ruta: "/terminos" })).toBe(false);
    expect(pideTerminos({ ...base, ruta: "/login" })).toBe(false);
    expect(pideTerminos({ ...base, ruta: "/icono.svg" })).toBe(false);
    expect(pideTerminos({ ...base, metodo: "POST" })).toBe(false);
    expect(pideTerminos({ ...base, esAccion: true })).toBe(false);
    expect(pideTerminos({ ...base, conSesion: false })).toBe(false);
  });

  it("guarda versión y fecha; lo mal formado = no aceptado", () => {
    const a = leerAceptacion({ version: VERSION_TERMINOS, aceptadoEn: "2026-10-26T12:00:00.000Z" });
    expect(aceptoVigente(a)).toBe(true);
    expect(leerAceptacion({ version: "x" })).toBeNull();
    expect(aceptoVigente(leerAceptacion({ version: "2020-01-01", aceptadoEn: "2020-01-01T00:00:00Z" }))).toBe(false);
  });

  it("«volver» solo a rutas internas", () => {
    expect(rutaVolver("/capital?mes=2026-10")).toBe("/capital?mes=2026-10");
    expect(rutaVolver("https://otro.sitio")).toBe("/");
    expect(rutaVolver("//otro.sitio")).toBe("/");
  });
});
