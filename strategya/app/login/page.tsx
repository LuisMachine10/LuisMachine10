import type { Metadata } from "next";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "./login.css";
import { Monograma } from "@/componentes/marca/Monograma";
import { SelectorTema } from "@/componentes/tema/SelectorTema";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar · Strategya" };

// Cinta decorativa: los nombres de lo que se sigue dentro, con un trazo abstracto. Sin cifras ni direcciones:
// es adorno (aria-hidden), no un dato.
const CINTA = [
  "S&P 500",
  "Dólar BCRD",
  "Oro",
  "Bonos del Tesoro",
  "Petróleo WTI",
  "Tasa de política monetaria",
  "Nasdaq",
  "Combustibles RD",
  "Euro",
  "Certificados del Banco Central",
];
const TRAZOS = [
  "M0 9 L6 7 L11 8 L17 4 L22 6 L28 3 L34 5 L40 2",
  "M0 4 L5 6 L11 5 L16 8 L22 6 L28 7 L34 5 L40 6",
  "M0 7 L7 7 L12 4 L18 6 L24 3 L29 5 L35 4 L40 4",
  "M0 5 L6 3 L12 6 L17 5 L23 8 L29 6 L35 7 L40 5",
];

const PILARES = [
  {
    titulo: "Mercados del mundo",
    texto: "Bolsas, oro, petróleo, tasas y monedas, con el porqué de cada movimiento.",
    icono: <path d="M3 17l5-6 4 3 6-8 3 4M3 21h18" />,
  },
  {
    titulo: "República Dominicana",
    texto: "El dólar del Banco Central, las tasas de los bancos y los combustibles.",
    icono: <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" />,
  },
  {
    titulo: "Tu dinero",
    texto: "Tu portafolio y tu presupuesto, al lado del mercado. Solo tú los ves.",
    icono: <path d="M12 3a9 9 0 1 0 9 9h-9zM15 3.5A9 9 0 0 1 20.5 9H15z" />,
  },
];

function Cinta() {
  // Dos vueltas iguales seguidas: la cinta se desliza media longitud y vuelve a empezar sin salto.
  const vuelta = (n: number) =>
    CINTA.map((nombre, i) => (
      <li key={`${n}-${nombre}`}>
        <span>{nombre}</span>
        <svg viewBox="0 0 40 10" width="40" height="10" fill="none">
          <path d={TRAZOS[i % TRAZOS.length]} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </li>
    ));
  return (
    <div className="acceso-cinta" aria-hidden="true">
      <ul>
        {vuelta(1)}
        {vuelta(2)}
      </ul>
    </div>
  );
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const aviso = error === "no_autorizado" ? "Esa cuenta no tiene acceso a Strategya. Entra con el correo del dueño." : null;
  return (
    <main className="acceso">
      <div className="acceso-fondo" aria-hidden="true">
        <svg className="acceso-curva" viewBox="0 0 1200 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id="acceso-relleno" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--acento)" stopOpacity="0.16" />
              <stop offset="1" stopColor="var(--acento)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            className="acceso-curva-area"
            d="M0 528 C90 514 150 536 230 508 S360 490 430 498 S560 470 640 474 S740 430 800 404 S900 318 960 306 S1080 222 1140 196 L1200 168 L1200 600 L0 600 Z"
            fill="url(#acceso-relleno)"
          />
          <path
            className="acceso-curva-linea"
            d="M0 528 C90 514 150 536 230 508 S360 490 430 498 S560 470 640 474 S740 430 800 404 S900 318 960 306 S1080 222 1140 196 L1200 168"
            pathLength={1}
          />
          <path className="acceso-curva-eco" d="M0 568 C120 560 220 572 320 556 S480 540 580 546 S760 520 860 500 S1060 440 1200 420" />
        </svg>
      </div>

      <header className="acceso-barra">
        <span className="acceso-logo">
          <Monograma tamano={36} />
          <span className="marca-nombre">Strategya</span>
        </span>
        <SelectorTema />
      </header>

      <div className="acceso-rejilla">
        <section className="acceso-editorial" aria-labelledby="acceso-titulo">
          <p className="acceso-antetitulo">Terminal financiera personal</p>
          <h1 className="acceso-titulo" id="acceso-titulo">
            Los mercados, el país y tu dinero, <em>claros en 30&nbsp;segundos.</em>
          </h1>
          <p className="acceso-bajada">
            Cada mañana, Strategya reúne en una sola pantalla lo que mueve tu día financiero. Cada cifra lleva su fuente y su
            hora; si un dato no llegó, te lo dice en vez de inventarlo.
          </p>
          <ul className="acceso-pilares">
            {PILARES.map((p) => (
              <li key={p.titulo}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {p.icono}
                </svg>
                <span>
                  <strong>{p.titulo}</strong>
                  {p.texto}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="acceso-panel" aria-labelledby="acceso-entrar">
          <h2 id="acceso-entrar">Entrar</h2>
          <p className="acceso-panel-sub">Tu resumen del día te está esperando.</p>
          <FormularioLogin aviso={aviso} />
          <p className="acceso-privado">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
            </svg>
            Acceso privado: solo el dueño de la cuenta puede entrar.
          </p>
        </section>
      </div>

      <Cinta />
      <p className="acceso-pie">Uso personal. La información no es asesoría de inversión.</p>
    </main>
  );
}
