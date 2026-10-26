// Boletín por reglas: armado de las 4 ediciones con datos de ejemplo, sin IA.
import Big from "big.js";
import { describe, expect, it } from "vitest";
import { AHORA_AM, datosEjemplo, semanaEjemplo, seriesEjemplo, seriesViernes } from "../../../../pruebas/apoyo/boletin-ejemplo.ts";
import { armarEdicion, CONSTANTES_PLANTILLA, ETIQUETAS, estadoCifra } from "./armar.ts";
import { mencionaSerie, titularQueMenciona } from "./diccionario.ts";
import { diaRD, enlaceSeguro, fechaConDia, fechaCorta, fechaLarga, horaRD, mesCorto } from "./formato.ts";
import { contarPalabras, htmlCorreo, textoPlano } from "./render.ts";
import type { DatosBoletin, Edicion, Fila } from "./tipos.ts";
import { digitosDeCuenta, numerosAjenos, numerosPermitidos } from "./verificar.ts";

const FECHA = /^\d{4}-\d{2}-\d{2}/;

/** Todo texto con fecha del JSON de entrada, escrito como lo escribe el Boletín (los días no son cifras). */
function fechasEscritas(d: DatosBoletin): string[] {
  const salida: string[] = [];
  const visitar = (v: unknown) => {
    if (typeof v === "string" && FECHA.test(v)) {
      const dia = v.length > 10 ? diaRD(v) : v;
      salida.push(fechaCorta(v.slice(0, 10), true), fechaCorta(dia, true), fechaConDia(dia), fechaLarga(dia), mesCorto(dia));
      if (v.length > 10) salida.push(horaRD(v));
    } else if (Array.isArray(v)) v.forEach(visitar);
    else if (v && typeof v === "object") Object.values(v).forEach(visitar);
  };
  visitar(d);
  return salida;
}

/** Números que puede citar la edición: los del JSON de entrada, las fechas, las constantes de la plantilla y los cálculos que se dan. */
function permitidos(d: DatosBoletin, calculos: string[] = []): Set<string> {
  // Los cambios de tasas se dicen en puntos básicos (cambio × 100): se recalculan aquí, aparte del armado.
  const pb = d.series.filter((s) => s.cambio !== null).map((s) => new Big(s.cambio!).times(100).toString());
  // Los nombres fijos de los índices («FTSE 100», «S&P 500») son nombres, no cifras: se permiten aparte.
  return numerosPermitidos([JSON.stringify(d), ...fechasEscritas(d), ...CONSTANTES_PLANTILLA, ...Object.values(ETIQUETAS), ...pb, ...calculos]);
}

function filasDe(e: Edicion): Fila[] {
  return e.secciones.flatMap((s) => s.filas ?? []);
}

function revisarComun(e: Edicion, d: DatosBoletin, calculos: string[] = []) {
  const texto = textoPlano(e);
  // Ningún número fuera de los datos (los enlaces no cuentan).
  expect(numerosAjenos(texto, permitidos(d, calculos))).toEqual([]);
  expect(numerosAjenos(e.asunto, permitidos(d, calculos))).toEqual([]);
  // Ninguna secuencia que parezca una cuenta o una cédula.
  expect(digitosDeCuenta(texto)).toEqual([]);
  // Cada cifra con nivel lleva fuente con enlace y fecha.
  for (const f of filasDe(e).filter((x) => x.nivel)) {
    expect(f.fuente?.nombre, f.etiqueta).toBeTruthy();
    expect(f.fuente?.url, f.etiqueta).toMatch(/^https:\/\//);
    expect(f.fecha, f.etiqueta).toBeTruthy();
  }
  // Fuentes y «No confirmado» al final; el largo cabe.
  expect(texto).toContain("\nFuentes:\n");
  expect(texto).toContain("\nNo confirmado:\n");
  expect(e.palabras).toBe(contarPalabras(texto));
  // «~650» / «~500»: el armado recorta hasta caber; solo deja hasta un 5 % de más para no quitar el glosario.
  expect(e.palabras).toBeLessThanOrEqual(Math.round(e.limitePalabras * 1.05));
  // No es asesoría: ninguna recomendación de compra o venta.
  expect(texto).not.toMatch(/\b(te recomendamos|recomendamos|deberías (comprar|vender)|compra ahora|vende ahora|es buen momento para)\b/i);
  expect(texto).toContain("no asesoría de inversión");
  return texto;
}

describe("Bitácora · AM", () => {
  const d = datosEjemplo("am");
  const e = armarEdicion(d);
  const texto = textoPlano(e);

  it("el asunto lleva el dato del día: el mayor movimiento en % entre las cifras clave", () => {
    // Plata −3.1 % es el |cambio %| más grande del ejemplo (Brent +2.9, Oro −2.4…).
    expect(e.datoDelDia).toBe("Plata −3.10 %");
    expect(e.asunto).toBe("Bitácora Financiera · AM · 26 oct · Plata −3.10 %");
  });

  it("cada cifra con fuente, enlace y fecha; nada inventado; cabe en ~650 palabras", () => {
    revisarComun(e, d);
    expect(e.limitePalabras).toBe(650);
  });

  it("dato viejo con su fecha según la frescura de la app", () => {
    const rut = filasDe(e).find((f) => f.etiqueta === "Russell 2000")!;
    expect(rut.estado).toBe("viejo");
    expect(texto).toContain("Russell 2000: 2,402.10 · ↑ +0.21 % · 16 oct · FMP · dato viejo");
    expect(e.noConfirmado).toContain("Dato viejo (va la última cifra buena, con su fecha): Russell 2000, Euro Stoxx 50.");
    // El S&P del viernes, con la bolsa cerrada el lunes antes de abrir, no es viejo: es el último cierre.
    expect(filasDe(e).find((f) => f.etiqueta === "S&P 500")!.estado).toBe("ok");
  });

  it("lo que no está en la base dice «no confirmado» (y el DXY se reemplaza por UUP, rotulado)", () => {
    expect(e.noConfirmado[0]).toMatch(/^Sin dato guardado: .*DAX \(Alemania\)/);
    expect(texto).toContain("Dólar (ETF UUP, sustituto del DXY): US$27.15");
    const sinDato = armarEdicion(datosEjemplo("am", AHORA_AM, { series: seriesEjemplo().filter((s) => s.serie_id !== "WTI") }));
    const wti = filasDe(sinDato).find((f) => f.etiqueta === "WTI")!;
    expect(wti).toMatchObject({ nivel: null, estado: "no_confirmado", fuente: null });
    expect(textoPlano(sinDato)).toContain("• WTI: no confirmado");
  });

  it("Las 5 del día: ordenadas frente a su umbral habitual; ¿Por qué? = titular guardado de 24 h o «causa no confirmada»", () => {
    const cinco = e.secciones.find((s) => s.id === "cinco")!.filas!;
    expect(cinco).toHaveLength(5);
    // Nasdaq +1.8 % con umbral 1 % pesa más que Brent +2.9 % con umbral 2 %; la plata (umbral 4 %) no entra.
    expect(cinco.map((f) => f.etiqueta)).toEqual(["Nasdaq", "Brent", "WTI", "Oro", "Nikkei 225 (Japón)"]);
    expect(cinco[1].porque).toEqual({ titular: "Oil jumps as supply worries & Gulf tensions rise", url: "https://www.reuters.com/oil-jumps", medio: "Reuters" });
    expect(cinco[0].porque).toBeNull();
    expect(texto).toContain("¿Por qué? Causa no confirmada.");
  });

  it("un titular de más de 24 h no explica nada", () => {
    const viejo = { id: 1, titular: "Silver hits a two-month low", url: "https://x.org/a", medio: "X", fecha: "2026-10-24T09:00:00+00:00", categoria: "mercado", fuente_id: null };
    expect(mencionaSerie("PLATA", viejo.titular)).toBe(true);
    expect(titularQueMenciona("PLATA", [viejo], new Date(AHORA_AM), 24)).toBeNull();
    expect(mencionaSerie("ORO", "Golden State wins")).toBe(false);
  });

  it("alertas, RD (dólar con compra/venta, TPM, inflación, combustibles, subasta, SIMV nueva), guerras, agenda y glosario", () => {
    expect(texto).toContain("Plata: 48.62 US$/oz, por debajo del umbral de 52 US$/oz");
    expect(texto).toContain("Dólar BCRD · compra: RD$62.9845 · 23 oct · BCRD");
    expect(texto).toContain("TPM del Banco Central: 5.25 % · sin cambio · rige desde oct 2026 · BCRD");
    expect(texto).toContain("Gasoil óptimo: RD$241.10 · ↓ −3.00 · semana del 24 oct · MICM");
    expect(texto).toContain("Subasta del 21 oct: Bonos de Hacienda 2031 · monto RD$5,000,000,000 · tasa de corte 9.85 %");
    // Solo la resolución recogida después de la edición anterior (23 oct).
    expect(texto).toContain("Resolución R-SIMV-2026-41-EV");
    expect(texto).toContain("Ceasefire talks stall as shelling resumes");
    expect(texto).toContain("Fed: Decisión de tasas (FOMC) (mié 28 oct, 2:00 PM · sin confirmar)");
    const glos = e.secciones.find((s) => s.id === "glosario")!;
    expect(glos.items!.length).toBeGreaterThanOrEqual(1);
    expect(glos.items!.length).toBeLessThanOrEqual(3);
  });

  it("sin alertas lo dice", () => {
    const sin = armarEdicion(datosEjemplo("am", AHORA_AM, { alertas: [] }));
    expect(textoPlano(sin)).toContain("Sin alertas: ningún activo cruzó tus umbrales.");
  });

  it("«Tu dinero» solo cuando se pide; sin cuentas, solo totales; la foto vieja se marca", () => {
    expect(e.conTuDinero).toBe(true);
    const td = e.secciones.find((s) => s.id === "tu-dinero")!;
    expect(td.personal).toBe(true);
    expect(texto).toContain("Utilidad neta de octubre: RD$38,251 real contra RD$45,000 presupuestado.");
    expect(texto).toContain("Patrimonio neto: RD$2,350,401 (+RD$35,200, +1.5 % frente a septiembre).");
    expect(texto).toContain("Lo que planeaste ahorrar este mes: 2 de 3 líneas por hacer; faltan RD$20,000");
    expect(texto).toContain("Riesgos en nivel alto: Liquidez y colchón (impacto alto, probabilidad media).");
    const sin = armarEdicion(datosEjemplo("am", AHORA_AM, { tu_dinero: null }));
    expect(sin.conTuDinero).toBe(false);
    expect(textoPlano(sin)).not.toContain("TU DINERO");
    const vieja = armarEdicion(datosEjemplo("am", AHORA_AM, { tu_dinero: { ...datosEjemplo().tu_dinero!, foto_en: "2026-10-20T01:00:00+00:00" } }));
    expect(textoPlano(vieja)).toContain("dato viejo");
  });

  it("es determinista: mismos datos, misma edición", () => {
    expect(armarEdicion(datosEjemplo("am"))).toEqual(armarEdicion(datosEjemplo("am")));
  });

  it("guarda los niveles de las cifras clave para el Cierre", () => {
    expect(e.niveles.IDX_SPX).toEqual({ valor: "6834.72", fecha_dato: "2026-10-23", hora_dato: "2026-10-23T20:00:00+00:00" });
    expect(e.niveles.USDDOP_VENTA.valor).toBe("63.127");
  });

  it("recorta lo menos importante para no pasar de ~650 palabras", () => {
    const muchos = Array.from({ length: 40 }, (_, i) => ({
      id: 500 + i,
      titular: `Conflict update number ${i} as talks continue in the region`,
      url: `https://www.aljazeera.com/news/n${i}`,
      medio: "Al Jazeera",
      fecha: new Date(new Date(AHORA_AM).getTime() - (i + 1) * 60_000).toISOString(),
      categoria: "guerra",
      fuente_id: "aljazeera_rss",
    }));
    const agenda = Array.from({ length: 12 }, (_, i) => ({ ...datosEjemplo().agenda[0], evento: `Evento ${i}`, fecha_hora: `2026-10-${String(27 + (i % 3)).padStart(2, "0")}T1${i % 10}:00:00+00:00` }));
    const d2 = datosEjemplo("am", AHORA_AM, { titulares: [...datosEjemplo().titulares, ...muchos], agenda });
    const e2 = armarEdicion(d2);
    expect(e2.palabras).toBeLessThanOrEqual(650);
    expect(e2.recortes.length).toBeGreaterThan(0);
    revisarComun(e2, d2);
  });

  it("un enlace con clave de API nunca va en el correo", () => {
    expect(enlaceSeguro("https://api.x.com/q?apikey=SECRETO")).toBeNull();
    const conClave = seriesEjemplo().map((s) => (s.serie_id === "IDX_SPX" ? { ...s, url_dato: "https://financialmodelingprep.com/api/v3/quote?apikey=SECRETO" } : s));
    const t = textoPlano(armarEdicion(datosEjemplo("am", AHORA_AM, { series: conClave })));
    expect(t).not.toContain("SECRETO");
  });
});

describe("Bitácora · Cierre", () => {
  const ahora = "2026-10-26T21:05:00+00:00"; // lunes 5:05 PM RD
  // Al cierre: la bolsa del lunes ya cerró (16:00 Nueva York) y el resto tiene su última cotización.
  const cierre = seriesEjemplo().map((s) => {
    if (s.serie_id === "IDX_SPX") return { ...s, valor: "6851.1", cambio: "16.38", cambio_pct: "0.2397", fecha_dato: "2026-10-26", hora_dato: "2026-10-26T20:00:00+00:00" };
    if (s.hora_dato === "2026-10-26T11:30:00+00:00") return { ...s, hora_dato: "2026-10-26T21:00:00+00:00" };
    return s;
  });
  const am = armarEdicion(datosEjemplo("am"));
  const d = datosEjemplo("cierre", ahora, {
    series: cierre,
    tu_dinero: null,
    am_hoy: { id: 9, creado_en: "2026-10-26T11:35:20+00:00", niveles: am.niveles },
  });
  const e = armarEdicion(d);
  const texto = textoPlano(e);

  it("dice qué cambió frente a la AM de hoy (diferencia de nivel) y no repite lo que no se movió", () => {
    const desde = e.secciones.find((s) => s.id === "desde-am")!;
    expect(desde.filas!.map((f) => f.etiqueta)).toEqual(["S&P 500"]);
    // 6851.10 − 6834.72 = +16.38, calculado con big.js.
    expect(desde.filas![0]).toMatchObject({ nivel: "6,851.10", cambio: "+16.38", dir: "sube", nota: "AM: 6,834.72" });
    expect(e.secciones.find((s) => s.id === "mercados")).toBeUndefined();
    expect(texto).not.toContain("TU DINERO");
  });

  it("sin la AM de hoy lo dice y pone los niveles al cierre", () => {
    const sin = armarEdicion({ ...d, am_hoy: null });
    expect(textoPlano(sin)).toContain("No hay edición AM de hoy para comparar");
    expect(sin.secciones.find((s) => s.id === "mercados")).toBeDefined();
  });

  it("«Fuentes:» lista solo las fuentes de lo que quedó a la vista", () => {
    const am2 = armarEdicion(datosEjemplo("am"));
    const nombres = am2.fuentes.map((f) => f.nombre);
    expect(nombres).toContain("Financial Modeling Prep");
    expect(nombres).toContain("Reuters");
    expect(nombres).toContain("Tus registros en Strategya");
    // Sin la sección de guerras, Al Jazeera no aparece.
    const sinGuerras = armarEdicion(datosEjemplo("am", AHORA_AM, { titulares: datosEjemplo().titulares.filter((t) => t.categoria !== "guerra" && t.fuente_id === null) }));
    expect(sinGuerras.fuentes.map((f) => f.nombre)).not.toContain("Al Jazeera");
  });

  it("cifras con fuente y fecha, sin números ajenos, asunto con el dato del día", () => {
    revisarComun(e, d, [new Big("6851.1").minus("6834.72").toString()]);
    expect(e.asunto).toMatch(/^Bitácora Financiera · Cierre · 26 oct · /);
  });
});

describe("Bitácora · Fin de semana · Materias primas", () => {
  const semana = semanaEjemplo();
  const calculos = semana.filter((w) => w.valor_ini).map((w) => new Big(w.valor_fin).minus(w.valor_ini!).div(w.valor_ini!).times(100).toString());

  it("sábado: cierre semanal (viernes contra viernes) de energía y metales, con S&P y dólar de contexto", () => {
    const d = datosEjemplo("finde", "2026-10-24T11:35:00+00:00", { semana, series: seriesViernes() });
    const e = armarEdicion(d);
    const texto = revisarComun(e, d, calculos);
    expect(e.nombre).toBe("Bitácora Financiera · Fin de semana · Materias primas · sábado");
    // (64.22 − 61.05) / 61.05 = +5.19 %
    expect(texto).toContain("Brent: US$64.22 · ↑ +5.19 % · vie 23 oct · FMP · vs US$61.05 del vie 16 oct");
    expect(texto).toContain("S&P 500: 6,834.72 · ↑ +2.78 %");
    expect(e.datoDelDia).toBe("Gas natural −5.28 % en la semana");
    expect(e.noConfirmado.some((x) => x.startsWith("Agrícolas"))).toBe(true);
    expect(e.noConfirmado).toContain("Cobre (ETF CPER): sin cierre del viernes anterior para comparar.");
    expect(texto).toContain("COMBUSTIBLES DE LA SEMANA (MICM)");
  });

  it("domingo: mira a la semana que viene (agenda primero)", () => {
    const d = datosEjemplo("finde", "2026-10-25T11:35:00+00:00", { semana, series: seriesViernes() });
    const e = armarEdicion(d);
    revisarComun(e, d, calculos);
    expect(e.nombre).toMatch(/domingo$/);
    expect(e.secciones[0].id).toBe("agenda");
    expect(e.resumen[0]).toMatch(/^La semana que viene trae 2 eventos/);
  });
});

describe("Boletín de Tasas RD", () => {
  const d = datosEjemplo("tasas", "2026-10-26T10:40:00+00:00", { tu_dinero: null });
  const e = armarEdicion(d);
  const texto = textoPlano(e);

  it("cabe en ~500 palabras, sin números ajenos ni «Tu dinero»", () => {
    expect(e.limitePalabras).toBe(500);
    revisarComun(e, d);
    expect(e.conTuDinero).toBe(false);
  });

  it("TPM, tasas de los bancos con su mes, subastas con monto y tasa de corte, SIMV de la semana", () => {
    expect(texto).toContain("TPM del Banco Central: 5.25 %");
    expect(texto).toContain("Activa promedio RD$: 13.40 % · ↓ −12 pb · sep 2026 · BCRD");
    expect(texto).toContain("Pasiva promedio RD$: 7.12 % · ↑ +5 pb · ago 2026 · BCRD · dato viejo");
    expect(texto).toContain("Bonos de Hacienda 2031 · RD$5,000,000,000 · tasa de corte 9.85 %");
    expect(texto).toContain("SIMV publica nuevo reglamento de fondos");
  });

  it("fondos por SAFI separados (pesos abiertos, dólares abiertos, cerrados), siempre con período y fecha de corte", () => {
    const fondos = e.secciones.find((s) => s.id === "fondos")!.filas!;
    expect([...new Set(fondos.map((f) => f.grupo))]).toEqual(["Abiertos en pesos (RD$)", "Abiertos en dólares (US$)", "Cerrados"]);
    for (const f of fondos) {
      expect(f.nivel).toMatch(/30 días/);
      expect(f.nota).toMatch(/(360|365) días|no publicado/);
      expect(f.fecha).toMatch(/^corte /);
    }
    expect(fondos.find((f) => f.etiqueta === "Fondo Cerrado Inmobiliario")!.estado).toBe("viejo");
  });

  it("comparador corto sin recomendar y «Pendiente» con lo que falta y por qué", () => {
    expect(texto).toContain("Bono de Hacienda más reciente: tasa de corte 9.85 %");
    expect(texto).toContain("Fondos abiertos en pesos con mayor rendimiento a 30 días: Fondo Mira (8.12 %");
    expect(texto).toContain("No es una recomendación.");
    expect(texto).toContain("PENDIENTE");
    expect(texto).toContain("Facilidades permanentes del BCRD");
  });

  it("el asunto lleva el dato del día (el mayor cambio de tasa)", () => {
    expect(e.asunto).toBe("Boletín de Tasas RD · 26 oct · Activa promedio RD$ −12 pb");
  });
});

describe("HTML del correo", () => {
  const e = armarEdicion(datosEjemplo("am"));
  const html = htmlCorreo(e, { urlEdicion: "https://strategya.example/boletin/5" });

  it("estilos en línea, una columna de 600 px, sin scripts ni imágenes ni adjuntos", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("max-width:600px");
    expect(html).not.toMatch(/<script|<img|<link|<style/i);
    expect(html).toContain('name="viewport"');
  });

  it("tinta, champán y blanco; verde y rojo solo con flecha", () => {
    expect(html).toContain("#0f1b2d");
    expect(html).toContain("#c8ae7d");
    expect(html).toMatch(/color:#12734c[^"]*">↑ \+/);
    expect(html).toMatch(/color:#b1352e[^"]*">↓ −/);
  });

  it("escapa el texto de los titulares y lleva los mismos números que el texto plano", () => {
    expect(html).toContain("Oil jumps as supply worries &amp; Gulf tensions rise");
    const visible = html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
    expect(numerosAjenos(visible, permitidos(datosEjemplo("am"), ["5"]))).toEqual([]);
    expect(html).toContain("Fuentes:");
    expect(html).toContain("No confirmado:");
  });
});

describe("frescura (misma lógica que la app)", () => {
  it("un dato diario se vence por su antigüedad máxima; uno intradía solo con el mercado abierto", () => {
    const [spx] = seriesEjemplo();
    // Domingo: la bolsa cerrada desde el viernes, el cierre sigue al día.
    expect(estadoCifra(spx, new Date("2026-10-25T15:00:00Z"))).toBe("ok");
    // Lunes 3 PM Nueva York: más de 2 h de mercado abierto sin dato nuevo.
    expect(estadoCifra(spx, new Date("2026-10-26T19:00:00Z"))).toBe("viejo");
    const marcado = { ...spx, estado: "no_confirmado" };
    expect(estadoCifra(marcado, new Date("2026-10-25T15:00:00Z"))).toBe("no_confirmado");
  });
});
