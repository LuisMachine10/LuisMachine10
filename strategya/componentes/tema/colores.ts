// Colores del tema activo para lo que no puede usar CSS directamente (los gráficos de lightweight-charts
// pintan en <canvas>). Se leen de las variables de app/globals.css en el momento de dibujar.

/** Valor de una variable CSS del tema activo; acepta "--x" o "var(--x)". Si no es variable, la devuelve igual. */
export function colorTema(valor: string, respaldo = "#8a909c"): string {
  const m = valor.match(/^(?:var\()?\s*(--[\w-]+)\s*\)?$/);
  if (!m || typeof document === "undefined") return valor;
  return getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() || respaldo;
}

/** Mismo color con transparencia (acepta #rgb, #rrggbb y rgb()/rgba()). */
export function conAlfa(color: string, alfa: number): string {
  const c = color.trim();
  let rgb: number[] | null = null;
  if (c.startsWith("#")) {
    let h = c.slice(1);
    if (h.length === 3) h = [...h].map((x) => x + x).join("");
    if (h.length >= 6) rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  } else {
    const m = c.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/);
    if (m) rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alfa})` : c;
}

/** Colores comunes de los ejes, la rejilla y la cruz de los gráficos. */
export function coloresGrafico() {
  return {
    texto: colorTema("--texto-3"),
    rejilla: colorTema("--rejilla"),
    cruz: colorTema("--borde-fuerte"),
    etiqueta: colorTema("--panel-alto"),
    fuente: getComputedStyle(document.body).fontFamily || "system-ui, sans-serif",
  };
}
