import { describe, expect, it } from "vitest";
import { categorizar, clasificar, LUGAR_RD, NOMENCLATOR, normalizar, paisesMencionados, ubicar } from "./geo.ts";

describe("normalizar", () => {
  it("quita tildes, signos y mayúsculas", () => {
    expect(normalizar("¿Irán, EE. UU.?")).toBe("iran ee uu");
    expect(normalizar("Líbano y el Mar Rojo")).toBe("libano y el mar rojo");
  });
});

describe("ubicar · nomenclátor en inglés y español", () => {
  const casos: [string, string, string][] = [
    ["Russian drones hit Kyiv overnight", "Kyiv", "Ucrania"],
    ["Ucrania denuncia ataques en Járkov", "Járkov", "Ucrania"],
    ["Israel strikes Gaza as talks stall", "Gaza", "Palestina"],
    ["Hezbollah fires rockets from Lebanon", "Líbano", "Líbano"],
    ["Irán amenaza con cerrar el estrecho de Ormuz", "Estrecho de Ormuz", "Golfo Pérsico"],
    ["Tanker attacked in the Strait of Hormuz", "Estrecho de Ormuz", "Golfo Pérsico"],
    ["Houthis target ships in the Red Sea", "Mar Rojo", "Mar Rojo"],
    ["Ataque hutí en el Mar Rojo", "Mar Rojo", "Mar Rojo"],
    ["Grain corridor in the Black Sea reopens", "Mar Negro", "Mar Negro"],
    ["Fighting resumes in Sudan", "Sudán", "Sudán"],
    ["Elecciones en Sudán del Sur", "Sudán del Sur", "Sudán del Sur"],
    ["Ethiopia and Eritrea trade accusations", "Etiopía", "Etiopía"],
    ["China holds drills near Taiwan", "China", "China"],
    ["Corea del Norte lanza un misil", "Corea del Norte", "Corea del Norte"],
    ["North Korea test-fires missile", "Corea del Norte", "Corea del Norte"],
    ["Venezuela y Haití en la agenda regional", "Venezuela", "Venezuela"],
    ["Haiti gangs expand control of Port-au-Prince", "Haití", "Haití"],
    ["Turismo récord en la República Dominicana", "República Dominicana", "República Dominicana"],
    ["Dominican Republic signs energy deal", "República Dominicana", "República Dominicana"],
    ["Lluvias en Santo Domingo", "Santo Domingo", "República Dominicana"],
  ];
  for (const [titular, lugar, pais] of casos) {
    it(`«${titular}» → ${lugar}`, () => {
      const l = ubicar(titular);
      expect(l?.nombre).toBe(lugar);
      expect(l?.pais).toBe(pais);
    });
  }

  it("un lugar (ciudad, mar, estrecho) gana a un país aunque aparezca después", () => {
    expect(ubicar("Iran says Israel struck near Beirut and Gaza")?.nombre).toBe("Gaza");
  });

  it("una coincidencia dentro de otra más larga no cuenta («sudan» en «south sudan»)", () => {
    expect(paisesMencionados("South Sudan peace deal")).toEqual(["Sudán del Sur"]);
  });

  it("respeta límites de palabra: «Irani» no es «Iran» dentro de otra palabra, «Malibu» no es Malí", () => {
    expect(ubicar("Fires near Malibu")).toBeNull();
    expect(ubicar("Spaniards celebrate")).toBeNull();
  });

  it("términos ambiguos en español no ubican: «lagos» (de agua), «tigre», «San Juan»", () => {
    expect(ubicar("Los lagos del sur crecen")).toBeNull();
    expect(ubicar("Rescatan un tigre en el zoológico")).toBeNull();
    expect(ubicar("Fiestas patronales en San Juan")).toBeNull();
  });

  it("sin lugar conocido → null (no se inventa un pin)", () => {
    expect(ubicar("Tech company unveils new phone")).toBeNull();
  });

  it("paisesMencionados en orden de aparición y sin repetir", () => {
    expect(paisesMencionados("Iran warns Israel; Israel answers Iran")).toEqual(["Irán", "Israel"]);
  });

  it("todas las coordenadas son texto decimal dentro de rango y cada lugar tiene país", () => {
    for (const l of NOMENCLATOR) {
      expect(l.lat).toMatch(/^-?\d{1,2}\.\d{2}$/);
      expect(l.lon).toMatch(/^-?\d{1,3}\.\d{2}$/);
      expect(Math.abs(Number(l.lat))).toBeLessThanOrEqual(90);
      expect(Math.abs(Number(l.lon))).toBeLessThanOrEqual(180);
      expect(l.pais).toBeTruthy();
    }
  });
});

describe("categorizar · reglas explícitas en orden", () => {
  it("1. guerra: palabras de guerra en inglés y español", () => {
    expect(categorizar("Missile strike kills dozens")).toBe("guerra");
    expect(categorizar("Acuerdan alto el fuego en Gaza")).toBe("guerra");
    expect(categorizar("Tropas rusas avanzan en el Donbás")).toBe("guerra");
  });

  it("una «guerra comercial» es mercado, no guerra", () => {
    expect(categorizar("Stocks slip as trade war fears return")).toBe("mercado");
    expect(categorizar("China y EE. UU. reavivan la guerra comercial")).toBe("mercado");
    expect(categorizar("Price war among airlines")).toBe("mercado");
  });

  it("guerra comercial más una guerra de verdad sigue siendo guerra", () => {
    expect(categorizar("Trade war deepens as missile strikes continue")).toBe("guerra");
  });

  it("2. rd: menciona RD o el medio es dominicano", () => {
    expect(categorizar("El BCRD mantiene su tasa de política")).toBe("rd");
    expect(categorizar("Dominican Republic tourism hits record")).toBe("rd");
    expect(categorizar("Apagón en el Gran Santo Domingo")).toBe("rd");
    expect(categorizar("Inauguran nuevo hospital", { medioRD: true })).toBe("rd");
  });

  it("una guerra en un medio dominicano es guerra (la necesita el panel de guerras)", () => {
    expect(categorizar("Bombardeos en Gaza dejan decenas de víctimas", { medioRD: true })).toBe("guerra");
  });

  it("«muertos» o «killed» solos no son guerra (sucesos locales)", () => {
    expect(categorizar("Accidente deja tres muertos en la autopista", { medioRD: true })).toBe("rd");
    expect(categorizar("Two killed in highway crash")).toBeNull();
  });

  it("3. instituciones: bancos centrales, FMI, Tesoro; siglas solo en mayúsculas", () => {
    expect(categorizar("Federal Reserve officials signal patience")).toBe("instituciones");
    expect(categorizar("Lagarde speaks in Frankfurt")).toBe("instituciones");
    expect(categorizar("FMI revisa sus proyecciones")).toBe("instituciones");
    expect(categorizar("Fed holds the line")).toBe("instituciones");
    expect(categorizar("Company makes a bid for rival")).toBeNull(); // «bid» no es el BID
  });

  it("4. mercado: bolsa, petróleo, bonos, dólar, inflación, tasas, aranceles", () => {
    expect(categorizar("Oil prices jump on supply fears")).toBe("mercado");
    expect(categorizar("Bond yields climb to multi-year highs")).toBe("mercado");
    expect(categorizar("El petróleo sube por tercer día")).toBe("mercado");
  });

  it("5. si nada aplica, la pista de la consulta; 6. sin pista → null", () => {
    expect(categorizar("Leaders meet in Geneva", { pista: "guerra" })).toBe("guerra");
    expect(categorizar("Leaders meet in Geneva")).toBeNull();
  });
});

describe("clasificar", () => {
  it("categoría y lugar juntos", () => {
    expect(clasificar("Israeli airstrikes on Rafah")).toMatchObject({ categoria: "guerra", lugar: { nombre: "Gaza" } });
  });

  it("un titular de RD sin lugar va a Santo Domingo", () => {
    expect(clasificar("Aumentan las remesas", { medioRD: true })).toEqual({ categoria: "rd", lugar: LUGAR_RD });
  });

  it("un titular de mercado sin lugar queda sin pin", () => {
    expect(clasificar("Gold rallies as dollar weakens")).toEqual({ categoria: "mercado", lugar: null });
  });

  it("sin categoría → null (no se guarda)", () => {
    expect(clasificar("Celebrity wedding photos")).toBeNull();
  });
});
