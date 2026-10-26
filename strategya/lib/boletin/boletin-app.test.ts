// Piezas del Boletín en la app: la foto de «Tu dinero» (motor del Portafolio, solo totales) y sus preferencias.
import { describe, expect, it } from "vitest";
import { contextoEjemplo } from "../capital/apoyo-pruebas";
import { leerFoto } from "../../supabase/functions/_shared/boletin/armar.ts";
import { fotoTuDinero } from "./foto";
import { cuandoSale, normalizarPrefBoletin } from "./preferencias";

describe("foto de «Tu dinero»", () => {
  const ctx = contextoEjemplo({ activos: contextoEjemplo().activos.map((a) => ({ ...a, nombre: `${a.nombre} cuenta 0012345678`, inst: "Banco 9876543210" })) });
  const foto = fotoTuDinero({ ctx, configurado: true, registroCompleto: [], aportesConfirmados: [] });

  it("lleva solo totales del mes: ningún nombre, institución ni número de cuenta", () => {
    expect(foto.mes).toBe("2026-10");
    expect(foto.patrimonio).toMatch(/^-?\d+\.\d{2}$/);
    expect(JSON.stringify(foto)).not.toMatch(/cuenta|Banco|0012345678|9876543210/);
  });

  it("los riesgos que pasan son solo los de nivel alto, con su título", () => {
    for (const r of foto.riesgos) {
      expect(["bajo", "medio", "alto"]).toContain(r.impacto);
      expect(r.titulo.length).toBeGreaterThan(3);
    }
    expect(foto.riesgos_evaluados).toBeGreaterThanOrEqual(foto.riesgos.length);
  });

  it("sin nada anotado, el patrimonio queda sin confirmar (no un cero inventado)", () => {
    const vacia = fotoTuDinero({ ctx: contextoEjemplo({ activos: [] }), configurado: false, registroCompleto: [], aportesConfirmados: [] });
    expect(vacia.patrimonio).toBeNull();
    expect(vacia.riesgos).toEqual([]);
  });

  it("al leerla para el correo se valida campo por campo; lo que no tiene forma se descarta", () => {
    expect(leerFoto(null)).toBeNull();
    expect(leerFoto({ mes: "octubre" })).toBeNull();
    expect(leerFoto({ mes: "2026-10", patrimonio: "300" })).toMatchObject({ patrimonio: "300", riesgos: [], aportes: null });
    expect(leerFoto({ mes: "2026-10", patrimonio: 12.5, cambio: "1e3", riesgos: [{ titulo: "X", impacto: "enorme", probabilidad: "alto" }] })).toMatchObject({
      patrimonio: null,
      cambio: null,
      riesgos: [],
    });
    expect(leerFoto(fotoTuDinero({ ctx, configurado: true, registroCompleto: [], aportesConfirmados: [] }))).toEqual(foto);
  });
});

describe("preferencias del Boletín", () => {
  it("lo no guardado vale «sí»; lo que no es booleano se ignora", () => {
    expect(normalizarPrefBoletin(null)).toEqual({ am: true, cierre: true, finde: true, tasas: true, tu_dinero: true });
    expect(normalizarPrefBoletin({ cierre: false, tu_dinero: "no" })).toEqual({ am: true, cierre: false, finde: true, tasas: true, tu_dinero: true });
  });

  it("dice cuándo sale cada edición en hora RD", () => {
    expect(cuandoSale("am")).toBe("Lunes a viernes, 7:35 AM hora RD (llega antes de las 8:00 AM)");
    expect(cuandoSale("cierre")).toBe("Lunes a viernes, 5:05 PM hora RD (llega antes de las 5:30 PM)");
    expect(cuandoSale("tasas")).toBe("Los lunes, 6:40 AM hora RD (llega antes de las 7:00 AM)");
  });
});
