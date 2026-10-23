import Link from "next/link";
import { cerrarSesion } from "@/app/acciones";
import { Monograma } from "@/componentes/marca/Monograma";
import { SelectorTema } from "@/componentes/tema/SelectorTema";
import { fechaHoraRD, horaRD } from "@/lib/formato";

// Íconos de trazo (24×24), dibujados aquí para no cargar una librería entera.
const ICONOS: Record<string, React.ReactNode> = {
  dashboard: <path d="M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z" />,
  news: <path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" />,
  mercado: <path d="M3 17l5-6 4 3 6-8 3 4M3 21h18" />,
  rd: <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  noticias: <path d="M4 6h16M4 10h16M4 14h10M4 18h7" />,
  globo: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />,
  capital: <path d="M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z" />,
  caja: <path d="M3 7h18v13H3zM3 7l2-3h14l2 3M8 12h8M8 16h5" />,
  carga: <path d="M12 16V4M7 9l5-5 5 5M4 20h16" />,
  ajustes: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" />,
  estado: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  ayuda: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01" />,
  mas: <path d="M5 12h.01M12 12h.01M19 12h.01" />,
};

/**
 * Cada pantalla con un nombre de la calle y una línea que dice para qué sirve (se usa en el menú,
 * en la bienvenida, en /ayuda y bajo el título de la pantalla).
 *   menu: "principal" = visible en la barra; "mas" = dentro de «Más»; "oculto" = se llega desde otra
 *         pantalla (por ejemplo, Todos los titulares desde News) y en el menú se marca su `padre`.
 *   movil: posición en la barra de abajo del celular (1–5; la sexta es «Más»). Sin número, va en «Más».
 */
export const SECCIONES = [
  { clave: "dashboard", nombre: "Dashboard", corto: "Dashboard", href: "/", menu: "principal", movil: 1,
    para: "Aquí ves de un vistazo lo que tú elijas: cifras del mercado, tus noticias, tu presupuesto y tu portafolio." },
  { clave: "news", nombre: "News", corto: "News", href: "/news", menu: "principal", movil: 2,
    para: "Aquí ves cómo amaneció el día: el resumen en 30 segundos, las 6 cifras clave, mercados, RD, el mundo y tu dinero." },
  { clave: "mercado", nombre: "Mercados", corto: "Mercados", href: "/mercado", menu: "principal", movil: 3,
    para: "Aquí ves las bolsas del mundo, el oro, el petróleo, las tasas y las monedas, con el porqué de cada movimiento." },
  { clave: "rd", nombre: "República Dominicana", corto: "RD", href: "/rd", menu: "principal", movil: null,
    para: "Aquí ves el dólar del Banco Central, las tasas de los bancos, los combustibles, los bonos del Gobierno y los fondos." },
  { clave: "capital", nombre: "Portafolio Financiero", corto: "Portafolio", href: "/capital", menu: "principal", movil: 5,
    para: "Aquí anotas tus inversiones y ves cuánto tienes, cuánto ganaste en el mes y cómo está repartido. Solo tú lo ves." },
  { clave: "caja", nombre: "Presupuesto", corto: "Presupuesto", href: "/caja", menu: "principal", movil: 4,
    para: "Tus ingresos, costos y gastos del mes en un estado de resultados: lo presupuestado contra lo real, y cuánto te queda. Solo tú lo ves." },
  { clave: "globo", nombre: "Mapa", corto: "Mapa", href: "/globo", menu: "principal", movil: null,
    para: "Aquí ves en un globo 3D las bolsas, conflictos, rutas de barcos, sismos y huracanes que pueden mover precios." },
  { clave: "noticias", nombre: "Todos los titulares", corto: "Titulares", href: "/noticias", menu: "oculto", movil: null, padre: "news",
    para: "Aquí ves todos los titulares de WSJ, FT, CNBC y la prensa dominicana por tema, la agenda y los comunicados oficiales." },
  { clave: "carga", nombre: "Agregar un dato", corto: "Agregar dato", href: "/carga", menu: "mas", movil: null,
    para: "Aquí escribes a mano un dato oficial que Strategya no trae solo, siempre con el enlace de donde sale." },
  { clave: "ajustes", nombre: "Ajustes y alertas", corto: "Ajustes", href: "/ajustes", menu: "mas", movil: null,
    para: "Aquí decides cuándo te avisamos (por ejemplo, si el oro sube más de 2 %) y ves el historial de avisos." },
  { clave: "estado", nombre: "Estado de las fuentes", corto: "Estado", href: "/estado", menu: "mas", movil: null,
    para: "Aquí ves qué fuente falló y por qué, cuando una cifra se ve vieja." },
  { clave: "ayuda", nombre: "Ayuda", corto: "Ayuda", href: "/ayuda", menu: "mas", movil: null,
    para: "Aquí está la guía de uso: preguntas y respuestas sobre cada pantalla, con un buscador." },
] as const;

export type Seccion = (typeof SECCIONES)[number]["clave"];

function Icono({ clave }: { clave: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[clave]}
    </svg>
  );
}

/** La pantalla que se marca en el menú (una pantalla oculta marca a su «padre»). */
function marcada(actual: Seccion): Seccion {
  const s = SECCIONES.find((x) => x.clave === actual);
  return s && "padre" in s ? s.padre : actual;
}

export function Encabezado({ actual, ultimaActualizacion }: { actual: Seccion; ultimaActualizacion: string | null }) {
  const enMenu = marcada(actual);
  const principales = SECCIONES.filter((s) => s.menu === "principal");
  const deMas = SECCIONES.filter((s) => s.menu === "mas");
  // En el celular, «Más» también lleva las principales que no caben en la barra de abajo (RD, Mapa).
  const principalesSinBarra = principales.filter((s) => s.movil === null);
  const actualEnMas = deMas.some((s) => s.clave === enMenu);
  const actualEnMasMovil = actualEnMas || principalesSinBarra.some((s) => s.clave === enMenu);
  return (
    <header className="encabezado">
      <Link href="/" className="marca" aria-label="Strategya, ir al Dashboard">
        <Monograma tamano={30} />
        <span className="marca-nombre">Strategya</span>
      </Link>
      <nav className="nav" aria-label="Secciones">
        {principales.map((s) => (
          <Link
            key={s.clave}
            href={s.href}
            title={s.para}
            className={s.movil ? "nav-movil" : "nav-escritorio"}
            style={s.movil ? ({ "--orden-movil": s.movil } as React.CSSProperties) : undefined}
            aria-current={enMenu === s.clave ? "page" : undefined}
          >
            <Icono clave={s.clave} />
            <span className="nav-largo">{s.clave === "rd" ? "RD" : s.nombre}</span>
            <span className="nav-corto">{s.corto}</span>
          </Link>
        ))}
        <details className="nav-mas">
          <summary
            aria-current={actualEnMas ? "page" : undefined}
            data-actual-movil={actualEnMasMovil ? "si" : undefined}
          >
            <Icono clave="mas" />
            <span>Más</span>
          </summary>
          <div className="nav-mas-menu">
            {[...principalesSinBarra, ...deMas].map((s) => (
              <Link
                key={s.clave}
                href={s.href}
                className={s.menu === "principal" ? "solo-movil" : undefined}
                aria-current={enMenu === s.clave ? "page" : undefined}
              >
                <Icono clave={s.clave} />
                <span>
                  <strong>{s.nombre}</strong>
                  <small>{s.para}</small>
                </span>
              </Link>
            ))}
            <div className="solo-movil nav-mas-pie">
              <SelectorTema conTexto />
              <form action={cerrarSesion}>
                <button type="submit" className="boton-texto">
                  Salir
                </button>
              </form>
            </div>
          </div>
        </details>
      </nav>
      {ultimaActualizacion ? (
        <span className="actualizado" title={`Última lectura automática: ${fechaHoraRD(ultimaActualizacion)}`}>
          <span className="punto-vivo" aria-hidden="true" />
          {`Al día · ${horaRD(ultimaActualizacion)}`}
        </span>
      ) : (
        <span className="actualizado" aria-hidden="true" />
      )}
      <div className="acciones-escritorio solo-escritorio">
        <SelectorTema />
        <form action={cerrarSesion}>
          <button type="submit" className="boton-texto">
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
