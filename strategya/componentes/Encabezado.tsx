import Link from "next/link";
import { cerrarSesion } from "@/app/acciones";
import { fechaHoraRD, horaRD } from "@/lib/formato";

// Íconos de trazo (24×24), dibujados aquí para no cargar una librería entera.
const ICONOS: Record<string, React.ReactNode> = {
  terminal: <path d="M3 4h18v16H3zM3 9h18M8 9v11" />,
  mercado: <path d="M3 17l5-6 4 3 6-8 3 4M3 21h18" />,
  rd: <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  noticias: <path d="M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5" />,
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
 * en la bienvenida y en /ayuda). `principal` = visible en el menú; el resto va dentro de «Más».
 * `movil` = una de las 5 de la barra de abajo en el celular (la sexta es «Más»).
 */
export const SECCIONES = [
  { clave: "terminal", nombre: "Hoy", corto: "Hoy", href: "/", principal: true, movil: true,
    para: "El resumen del día: las cifras que más mueven tu dinero, alertas y noticias." },
  { clave: "mercado", nombre: "Mercados", corto: "Mercados", href: "/mercado", principal: true, movil: true,
    para: "Bolsas del mundo, oro y metales, petróleo, tasas de interés y monedas, con su porqué." },
  { clave: "rd", nombre: "República Dominicana", corto: "RD", href: "/rd", principal: true, movil: true,
    para: "Dólar del Banco Central, tasas de los bancos, combustibles, bonos del Gobierno y fondos de inversión." },
  { clave: "noticias", nombre: "Noticias", corto: "Noticias", href: "/noticias", principal: true, movil: false,
    para: "Titulares de WSJ, FT, CNBC y prensa dominicana, ordenados por tema, más la agenda de la semana." },
  { clave: "globo", nombre: "Mapa del mundo", corto: "Mapa", href: "/globo", principal: true, movil: false,
    para: "Un globo 3D con bolsas, conflictos, rutas de barcos, sismos y huracanes que pueden mover precios." },
  { clave: "capital", nombre: "Mis inversiones", corto: "Inversiones", href: "/capital", principal: true, movil: true,
    para: "Cuánto tienes invertido, cuánto ganaste en el mes y cómo está repartido tu dinero. Solo tú lo ves." },
  { clave: "caja", nombre: "Mi presupuesto", corto: "Presupuesto", href: "/caja", principal: true, movil: true,
    para: "Cuánto puedes gastar hoy sin pasarte, los pagos que vienen y el saldo de tus cuentas. Solo tú lo ves." },
  { clave: "carga", nombre: "Agregar un dato", corto: "Agregar dato", href: "/carga", principal: false, movil: false,
    para: "Para escribir a mano un dato oficial que Strategya no trae solo, siempre con su enlace." },
  { clave: "ajustes", nombre: "Ajustes y alertas", corto: "Ajustes", href: "/ajustes", principal: false, movil: false,
    para: "Cuándo quieres que te avisemos (por ejemplo, si el oro sube más de 2 %) y el historial de avisos." },
  { clave: "estado", nombre: "Estado de las fuentes", corto: "Estado", href: "/estado", principal: false, movil: false,
    para: "Si una cifra se ve vieja, aquí ves qué fuente falló y por qué." },
  { clave: "ayuda", nombre: "Ayuda", corto: "Ayuda", href: "/ayuda", principal: false, movil: false,
    para: "Cómo funciona Strategya, cómo leer cada cifra y respuestas a dudas comunes." },
] as const;

export type Seccion = (typeof SECCIONES)[number]["clave"];

function Icono({ clave }: { clave: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[clave]}
    </svg>
  );
}

export function Encabezado({ actual, ultimaActualizacion }: { actual: Seccion; ultimaActualizacion: string | null }) {
  const principales = SECCIONES.filter((s) => s.principal);
  const otras = SECCIONES.filter((s) => !s.principal);
  const actualEnMas = otras.some((s) => s.clave === actual);
  return (
    <header className="encabezado">
      <Link href="/" className="marca" aria-label="Strategya, ir a Hoy">
        <span className="marca-logo" aria-hidden="true">
          S
        </span>
        Strategya
      </Link>
      <nav className="nav" aria-label="Secciones">
        {principales.map((s) => (
          <Link
            key={s.clave}
            href={s.href}
            title={s.para}
            className={s.movil ? "nav-movil" : "nav-escritorio"}
            aria-current={actual === s.clave ? "page" : undefined}
          >
            <Icono clave={s.clave} />
            <span className="nav-largo">{s.nombre === "República Dominicana" ? "RD" : s.nombre}</span>
            <span className="nav-corto">{s.corto}</span>
          </Link>
        ))}
        <details className="nav-mas">
          <summary aria-current={actualEnMas ? "page" : undefined}>
            <Icono clave="mas" />
            <span>Más</span>
          </summary>
          <div className="nav-mas-menu">
            {SECCIONES.filter((s) => !s.movil).map((s) => (
              <Link
                key={s.clave}
                href={s.href}
                className={s.principal ? "solo-movil" : undefined}
                aria-current={actual === s.clave ? "page" : undefined}
              >
                <Icono clave={s.clave} />
                <span>
                  <strong>{s.nombre}</strong>
                  <small>{s.para}</small>
                </span>
              </Link>
            ))}
            <form action={cerrarSesion} className="solo-movil">
              <button type="submit" className="boton-texto">
                Salir
              </button>
            </form>
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
      <form action={cerrarSesion} className="solo-escritorio">
        <button type="submit" className="boton-texto">
          Salir
        </button>
      </form>
    </header>
  );
}
