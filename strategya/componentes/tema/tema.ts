// Tema claro u oscuro. La preferencia («claro», «oscuro» o «sistema») se recuerda solo en este navegador.
// <html data-tema="claro|oscuro"> es lo que leen los estilos; data-tema-pref guarda lo que eligió la persona.

export type Tema = "claro" | "oscuro";
export type PreferenciaTema = Tema | "sistema";

export const CLAVE_TEMA = "strategya-tema";

/** Color de la barra del navegador en el celular, igual al fondo de cada tema. */
export const COLOR_BARRA: Record<Tema, string> = { oscuro: "#0a0e15", claro: "#f5f2ea" };

/**
 * Script en línea que corre antes de pintar (va en el <head> de app/layout.tsx): fija data-tema para que
 * no haya parpadeo y sigue al sistema mientras la preferencia sea «sistema». Sin dependencias.
 */
export const SCRIPT_TEMA = `(function(){try{var d=document.documentElement,p=null;try{p=localStorage.getItem(${JSON.stringify(CLAVE_TEMA)})}catch(e){}
if(p!=="claro"&&p!=="oscuro")p="sistema";d.setAttribute("data-tema-pref",p);
var m=window.matchMedia?window.matchMedia("(prefers-color-scheme: light)"):null,b=${JSON.stringify(COLOR_BARRA)};
function a(){var q=d.getAttribute("data-tema-pref")||"sistema",t=q==="sistema"?(m&&m.matches?"claro":"oscuro"):q;
d.setAttribute("data-tema",t);var x=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<x.length;i++)x[i].setAttribute("content",b[t]);}
a();window.__strategyaTema=a;document.addEventListener("DOMContentLoaded",a);window.addEventListener("load",a);if(m){if(m.addEventListener)m.addEventListener("change",a);else if(m.addListener)m.addListener(a);}}catch(e){}})();`;

declare global {
  interface Window {
    __strategyaTema?: () => void;
  }
}

export function leerPreferencia(): PreferenciaTema {
  if (typeof document === "undefined") return "sistema";
  const p = document.documentElement.getAttribute("data-tema-pref");
  return p === "claro" || p === "oscuro" ? p : "sistema";
}

export function temaActivo(): Tema {
  if (typeof document === "undefined") return "oscuro";
  return document.documentElement.getAttribute("data-tema") === "claro" ? "claro" : "oscuro";
}

/** Guarda la preferencia (si el navegador lo permite) y la aplica de inmediato. */
export function fijarPreferencia(p: PreferenciaTema) {
  try {
    if (p === "sistema") window.localStorage.removeItem(CLAVE_TEMA);
    else window.localStorage.setItem(CLAVE_TEMA, p);
  } catch {
    // modo privado o almacenamiento bloqueado: el tema cambia igual, solo no se recuerda
  }
  const d = document.documentElement;
  d.setAttribute("data-tema-pref", p);
  if (window.__strategyaTema) {
    window.__strategyaTema();
  } else {
    const claro = p === "claro" || (p === "sistema" && window.matchMedia?.("(prefers-color-scheme: light)").matches);
    d.setAttribute("data-tema", claro ? "claro" : "oscuro");
  }
}

/** Avisa cada vez que cambia data-tema o data-tema-pref en <html>. Devuelve la función para dejar de escuchar. */
export function alCambiarTema(cb: () => void): () => void {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-tema", "data-tema-pref"] });
  return () => obs.disconnect();
}
