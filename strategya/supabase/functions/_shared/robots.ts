// Lectura de robots.txt según RFC 9309: grupos por user-agent, la regla más larga gana,
// Allow gana empates, comodines * y $. Crawl-delay (no estándar) se respeta si aparece.

interface Regla {
  permitir: boolean;
  patron: string;
  regex: RegExp;
}

interface Grupo {
  agentes: string[];
  reglas: Regla[];
  crawlDelay?: number;
}

export interface ReglasRobots {
  grupos: Grupo[];
  crawlDelay(producto: string): number | undefined;
}

function aRegex(patron: string): RegExp {
  const ancla = patron.endsWith("$");
  const cuerpo = (ancla ? patron.slice(0, -1) : patron)
    .split("*")
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${cuerpo}${ancla ? "$" : ""}`);
}

export function parsearRobots(texto: string): ReglasRobots {
  const grupos: Grupo[] = [];
  let actual: Grupo | null = null;
  let ultimaFueAgente = false;

  for (const cruda of texto.split(/\r?\n/)) {
    const linea = cruda.replace(/#.*$/, "").trim();
    const sep = linea.indexOf(":");
    if (sep <= 0) continue;
    const clave = linea.slice(0, sep).trim().toLowerCase();
    const valor = linea.slice(sep + 1).trim();

    if (clave === "user-agent") {
      if (!actual || !ultimaFueAgente) {
        actual = { agentes: [], reglas: [] };
        grupos.push(actual);
      }
      actual.agentes.push(valor.toLowerCase());
      ultimaFueAgente = true;
      continue;
    }
    ultimaFueAgente = false;
    if (!actual) continue; // reglas antes de cualquier user-agent: se ignoran
    if (clave === "allow" || clave === "disallow") {
      if (valor === "") continue; // «Disallow:» vacío no prohíbe nada
      actual.reglas.push({ permitir: clave === "allow", patron: valor, regex: aRegex(valor) });
    } else if (clave === "crawl-delay") {
      const n = Number(valor);
      if (Number.isFinite(n) && n >= 0) actual.crawlDelay = n;
    }
  }

  return {
    grupos,
    crawlDelay(producto) {
      const valores = gruposAplicables(grupos, producto)
        .map((g) => g.crawlDelay)
        .filter((v): v is number => v !== undefined);
      return valores.length ? Math.max(...valores) : undefined;
    },
  };
}

/** Los grupos con el nombre del producto; si no hay, los de «*». */
function gruposAplicables(grupos: Grupo[], producto: string): Grupo[] {
  const token = producto.toLowerCase();
  const propios = grupos.filter((g) => g.agentes.includes(token));
  return propios.length > 0 ? propios : grupos.filter((g) => g.agentes.includes("*"));
}

/** ¿Puede `producto` leer `ruta` (path + query)? */
export function evaluarRobots(reglas: ReglasRobots, producto: string, ruta: string): boolean {
  if (ruta === "/robots.txt") return true;
  let mejor: Regla | null = null;
  for (const g of gruposAplicables(reglas.grupos, producto)) {
    for (const r of g.reglas) {
      if (!r.regex.test(ruta)) continue;
      if (
        !mejor ||
        r.patron.length > mejor.patron.length ||
        (r.patron.length === mejor.patron.length && r.permitir && !mejor.permitir)
      ) {
        mejor = r;
      }
    }
  }
  return mejor ? mejor.permitir : true;
}
