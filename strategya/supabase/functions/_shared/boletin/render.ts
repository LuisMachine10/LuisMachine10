// De la edición estructurada a lo que se envía: texto plano y HTML de correo con estilos en línea
// («Tinta y champán»: azul tinta, blanco, champán; verde y rojo solo para lo que sube y baja, siempre con
// flecha y signo). Una sola columna de hasta 600 px: se lee bien en el celular. Sin imágenes ni adjuntos.

import type { Edicion, Fila, Item, Seccion } from "./tipos.ts";

export const PIE_TEXTO = "Armado por reglas con datos guardados: ninguna cifra sale de una IA. Es información, no asesoría de inversión.";

const FLECHA = { sube: "↑", baja: "↓", igual: "→" } as const;

// ───────────────────────────── Texto plano ─────────────────────────────

function lineaFila(f: Fila, i?: number): string {
  const partes = [
    f.nivel ?? "no confirmado",
    f.cambio ? `${f.dir && f.dir !== "igual" ? `${FLECHA[f.dir]} ` : ""}${f.cambio}` : null,
    f.fecha,
    f.fuente?.nombre ?? null,
    f.estado === "viejo" ? "dato viejo" : null,
    f.nota ?? null,
  ].filter(Boolean);
  return `${i !== undefined ? `${i}. ` : "• "}${f.etiqueta}: ${partes.join(" · ")}`;
}

function lineaItem(it: Item): string {
  const extra = [it.meta, it.medio].filter(Boolean).join(" · ");
  return `• ${it.texto}${extra ? ` (${extra})` : ""}${it.url ? ` ${it.url}` : ""}`;
}

function textoSeccion(s: Seccion): string[] {
  const l: string[] = [s.titulo.toUpperCase()];
  if (s.intro) l.push(s.intro);
  let grupo: string | undefined;
  (s.filas ?? []).forEach((f, i) => {
    if (f.grupo && f.grupo !== grupo) {
      grupo = f.grupo;
      l.push(f.grupo);
    }
    if (s.id === "cinco") {
      l.push(lineaFila(f, i + 1));
      l.push(f.porque ? `   ¿Por qué? «${f.porque.titular}» (${f.porque.medio}) ${f.porque.url}` : "   ¿Por qué? Causa no confirmada.");
    } else l.push(lineaFila(f));
  });
  for (const it of s.items ?? []) l.push(lineaItem(it));
  if (s.vacio) l.push(s.vacio);
  return l;
}

export function textoPlano(e: Edicion): string {
  const l: string[] = [e.nombre.toUpperCase(), `${e.fechaTexto} · hora RD${e.prueba ? " · PRUEBA" : ""}`];
  if (e.datoDelDia) l.push(`Dato del día: ${e.datoDelDia}`);
  l.push("", "RESUMEN", ...e.resumen.map((r) => `• ${r}`));
  for (const s of e.secciones) l.push("", ...textoSeccion(s));
  l.push("", "Fuentes:", ...(e.fuentes.length ? e.fuentes.map((f) => `• ${f.nombre}${f.url ? ` ${f.url}` : ""}`) : ["• (ninguna)"]));
  l.push("", "No confirmado:", ...(e.noConfirmado.length ? e.noConfirmado.map((x) => `• ${x}`) : ["• Nada pendiente: todas las cifras tienen fuente y fecha."]));
  l.push("", PIE_TEXTO);
  return l.join("\n");
}

/** Palabras que se leen: no cuenta enlaces, viñetas ni separadores. */
export function contarPalabras(texto: string): number {
  let n = 0;
  for (const t of texto.split(/\s+/)) {
    if (!t || /^https?:\/\//.test(t)) continue;
    if (!/[\p{L}\p{N}]/u.test(t)) continue;
    if (/^\d+\.$/.test(t)) continue;
    n++;
  }
  return n;
}

// ───────────────────────────── HTML del correo ─────────────────────────────

const C = {
  tinta: "#0f1b2d",
  tinta2: "#1c2b44",
  fondo: "#f5f2ea",
  papel: "#ffffff",
  borde: "#e2dbcc",
  champan: "#c8ae7d",
  laton: "#7a5a1f",
  texto: "#101a2b",
  texto2: "#3e4757",
  texto3: "#5d6472",
  sube: "#12734c",
  baja: "#b1352e",
  ambar: "#935700",
  ambarFondo: "#fbf1df",
};
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Newsreader,Georgia,'Times New Roman',serif";

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const h = escaparHtml;

function enlace(texto: string, url: string | null | undefined): string {
  return url ? `<a href="${h(url)}" style="color:${C.laton};text-decoration:underline">${h(texto)}</a>` : h(texto);
}

function pildora(texto: string): string {
  return `<span style="display:inline-block;padding:1px 6px;border-radius:9px;background:${C.ambarFondo};color:${C.ambar};font-size:11px;font-weight:600">${h(texto)}</span>`;
}

function htmlFila(f: Fila, numero?: number): string {
  const color = f.dir === "sube" ? C.sube : f.dir === "baja" ? C.baja : C.texto3;
  const meta = [
    f.fecha ? h(f.fecha) : null,
    f.fuente ? enlace(f.fuente.nombre, f.fuente.url) : null,
    f.nota ? h(f.nota) : null,
    f.estado === "viejo" ? pildora("dato viejo") : null,
    f.estado === "no_confirmado" ? pildora("no confirmado") : null,
  ].filter(Boolean).join(" · ");
  const porque =
    f.porque === undefined
      ? ""
      : `<div style="margin-top:4px;font-size:13px;color:${C.texto2}"><strong style="color:${C.texto}">¿Por qué?</strong> ${
          f.porque ? `«${enlace(f.porque.titular, f.porque.url)}» <span style="color:${C.texto3}">${h(f.porque.medio)}</span>` : `<em>Causa no confirmada.</em>`
        }</div>`;
  return `<tr>
<td style="padding:8px 0;border-bottom:1px solid ${C.borde};vertical-align:top">
<div style="font-size:14px;color:${C.texto};font-weight:600">${numero !== undefined ? `<span style="color:${C.laton};font-family:${SERIF}">${numero}.</span> ` : ""}${h(f.etiqueta)}</div>
<div style="font-size:12px;color:${C.texto3};margin-top:2px">${meta}</div>${porque}
</td>
<td style="padding:8px 0 8px 10px;border-bottom:1px solid ${C.borde};vertical-align:top;text-align:right;white-space:nowrap">
<div style="font-size:14px;color:${C.texto};font-weight:600;font-variant-numeric:tabular-nums">${f.nivel ? h(f.nivel) : `<span style="color:${C.texto3};font-weight:400">no confirmado</span>`}</div>
${f.cambio ? `<div style="font-size:13px;color:${color};font-weight:600;font-variant-numeric:tabular-nums">${f.dir && f.dir !== "igual" ? FLECHA[f.dir] + " " : ""}${h(f.cambio)}</div>` : ""}
</td>
</tr>`;
}

function htmlItem(it: Item): string {
  const extra = [it.meta ? h(it.meta) : null, it.medio ? enlace(it.medio, it.url) : it.url ? enlace("enlace", it.url) : null].filter(Boolean).join(" · ");
  return `<tr><td style="padding:7px 0;border-bottom:1px solid ${C.borde};font-size:14px;color:${C.texto};line-height:1.45">${h(it.texto)}${
    extra ? `<div style="font-size:12px;color:${C.texto3};margin-top:2px">${extra}</div>` : ""
  }</td></tr>`;
}

function htmlSeccion(s: Seccion): string {
  const partes: string[] = [];
  let grupo: string | undefined;
  (s.filas ?? []).forEach((f, i) => {
    if (f.grupo && f.grupo !== grupo) {
      grupo = f.grupo;
      partes.push(`<tr><td colspan="2" style="padding:12px 0 2px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${C.laton};font-weight:600">${h(f.grupo)}</td></tr>`);
    }
    partes.push(htmlFila(f, s.id === "cinco" ? i + 1 : undefined));
  });
  for (const it of s.items ?? []) partes.push(htmlItem(it));
  const vacio = s.vacio ? `<p style="margin:8px 0 0;font-size:13px;color:${C.texto3}">${h(s.vacio)}</p>` : "";
  const marco = s.personal ? `border:1px solid ${C.champan};border-radius:8px;padding:12px 14px;background:#fdfbf7` : "";
  return `<tr><td style="padding:18px 22px 4px">
<div style="${marco}">
<h2 style="margin:0 0 4px;font-family:${SERIF};font-size:18px;font-weight:600;color:${C.tinta};border-bottom:1px solid ${C.champan};padding-bottom:5px">${h(s.titulo)}</h2>
${s.intro ? `<p style="margin:4px 0 2px;font-size:12px;color:${C.texto3}">${h(s.intro)}</p>` : ""}
${partes.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${partes.join("\n")}</table>` : ""}
${vacio}
</div>
</td></tr>`;
}

export interface OpcionesHtml {
  /** Enlace a la edición en la app (opcional). */
  urlEdicion?: string | null;
}

export function htmlCorreo(e: Edicion, op: OpcionesHtml = {}): string {
  const resumen = e.resumen.map((r) => `<li style="margin:0 0 6px">${h(r)}</li>`).join("");
  const fuentes = e.fuentes.length
    ? e.fuentes.map((f) => `<li style="margin:0 0 3px">${enlace(f.nombre, f.url)}</li>`).join("")
    : `<li>(ninguna)</li>`;
  const faltan = e.noConfirmado.length
    ? e.noConfirmado.map((x) => `<li style="margin:0 0 3px">${h(x)}</li>`).join("")
    : `<li>Nada pendiente: todas las cifras tienen fuente y fecha.</li>`;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${h(e.asunto)}</title>
</head>
<body style="margin:0;padding:0;background:${C.fondo};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${h(e.resumen[0] ?? e.nombre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.fondo}">
<tr><td align="center" style="padding:16px 8px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.papel};border:1px solid ${C.borde};border-radius:10px;border-collapse:separate;overflow:hidden;font-family:${SANS};color:${C.texto}">
<tr><td style="background:${C.tinta};padding:20px 22px 16px;border-bottom:3px solid ${C.champan}">
<div style="font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${C.champan};font-weight:600">Strategya${e.prueba ? " · prueba" : ""}</div>
<h1 style="margin:6px 0 4px;font-family:${SERIF};font-size:24px;line-height:1.2;font-weight:600;color:#fdfbf7">${h(e.nombre)}</h1>
<div style="font-size:13px;color:#c9cdd5">${h(e.fechaTexto)} · hora RD</div>
${e.datoDelDia ? `<div style="margin-top:10px;font-size:13px;color:#fdfbf7"><span style="color:${C.champan}">Dato del día:</span> <strong>${h(e.datoDelDia)}</strong></div>` : ""}
</td></tr>
<tr><td style="padding:16px 22px 4px">
<ul style="margin:0;padding:0 0 0 18px;font-size:15px;line-height:1.5;color:${C.texto}">${resumen}</ul>
</td></tr>
${e.secciones.map(htmlSeccion).join("\n")}
<tr><td style="padding:18px 22px 8px;font-size:12px;color:${C.texto2}">
<div style="font-weight:600;color:${C.tinta};margin-bottom:4px">Fuentes:</div>
<ul style="margin:0;padding:0 0 0 18px">${fuentes}</ul>
<div style="font-weight:600;color:${C.tinta};margin:12px 0 4px">No confirmado:</div>
<ul style="margin:0;padding:0 0 0 18px">${faltan}</ul>
</td></tr>
<tr><td style="padding:12px 22px 20px;font-size:11px;line-height:1.5;color:${C.texto3};border-top:1px solid ${C.borde}">
${h(PIE_TEXTO)}${op.urlEdicion ? ` ${enlace("Ver esta edición en Strategya", op.urlEdicion)}.` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
