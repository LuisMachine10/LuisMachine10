import type { Metadata } from "next";
import Link from "next/link";
import { BotonVerBienvenida, Bienvenida } from "@/componentes/ayuda/Bienvenida";
import { Encabezado, SECCIONES } from "@/componentes/Encabezado";

export const metadata: Metadata = { title: "Ayuda · Strategya" };

const PASOS_CIFRA = [
  { titulo: "Qué es", texto: "El nombre y, debajo, una línea en palabras simples que explica qué mide." },
  { titulo: "Cuánto vale", texto: "La cifra grande es el último valor que publicó la fuente." },
  { titulo: "Cómo se movió", texto: "La pastilla de color dice cuánto cambió contra el cierre anterior: verde sube, rojo baja, gris sin cambio." },
  { titulo: "De dónde sale", texto: "En pequeño: la fuente (con enlace), la fecha del dato y hace cuánto lo revisamos." },
  { titulo: "Por qué", texto: "Cuando algo se mueve fuerte, una línea explica la razón con titulares reales guardados." },
];

const ESTADOS = [
  { clase: "sube", nombre: "↑ Sube", texto: "Subió contra el cierre anterior." },
  { clase: "baja", nombre: "↓ Baja", texto: "Bajó contra el cierre anterior." },
  { clase: "viejo", nombre: "Dato viejo", texto: "La fuente no ha publicado en su horario normal. Ves la última cifra buena, con su fecha." },
  { clase: "cerrado", nombre: "Cierre del vie 16 oct", texto: "El mercado está cerrado: es el último cierre, no un error." },
  { clase: "sin", nombre: "Sin dato", texto: "No llegó la cifra. Strategya nunca la inventa ni la rellena." },
];

const PREGUNTAS = [
  {
    p: "¿De dónde salen las cifras?",
    r: "De fuentes oficiales y públicas: Banco Central, Hacienda, Tesoro de EE. UU., la Fed, el BCE, Cboe, FRED y las páginas de las administradoras de fondos. Cada cifra muestra su fuente con enlace. Ninguna cifra sale de una inteligencia artificial.",
  },
  {
    p: "¿Cada cuánto se actualiza?",
    r: "Los precios de mercado cada 5 minutos con la bolsa abierta; el dólar del Banco Central dos veces al día; las noticias cada media hora; los fondos de inversión dos veces al día. La página se refresca sola.",
  },
  {
    p: "Una cifra dice «dato viejo». ¿Qué hago?",
    r: "Nada: significa que la fuente todavía no publicó. Si quieres saber por qué, abre «Estado de las fuentes» en el menú «Más».",
  },
  {
    p: "¿Quién ve mis inversiones y mi presupuesto?",
    r: "Solo tú, con tu usuario y contraseña. Nunca se piden números de cuenta, de tarjeta ni de cédula: basta un nombre que reconozcas («Cuenta de ahorro Popular»).",
  },
  {
    p: "¿Strategya me dice qué comprar o vender?",
    r: "No. Es una herramienta de información, no asesoría de inversión. Te muestra los datos y su porqué para que tú decidas.",
  },
  {
    p: "Quiero agregar un dato que no aparece",
    r: "En «Más» → «Agregar un dato» puedes escribir cualquier cifra oficial a mano, siempre con el enlace de donde la sacaste.",
  },
];

export default function Ayuda() {
  return (
    <>
      <Encabezado actual="ayuda" ultimaActualizacion={null} />
      <main className="ayuda">
        <header className="ayuda-cab">
          <h1>Cómo funciona Strategya</h1>
          <p>
            Strategya junta en un solo lugar los mercados del mundo, la República Dominicana y tu dinero. Lo informativo se
            actualiza solo; tus finanzas las escribes tú.
          </p>
          <BotonVerBienvenida />
        </header>

        <section className="ayuda-bloque" aria-labelledby="ayuda-pantallas">
          <h2 id="ayuda-pantallas">Qué hay en cada pantalla</h2>
          <ul className="ayuda-pantallas">
            {SECCIONES.filter((s) => s.clave !== "ayuda").map((s) => (
              <li key={s.clave}>
                <Link href={s.href}>
                  <strong>{s.nombre}</strong>
                  <span>{s.para}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="ayuda-bloque" aria-labelledby="ayuda-cifra">
          <h2 id="ayuda-cifra">Cómo leer una cifra</h2>
          <ol className="ayuda-pasos">
            {PASOS_CIFRA.map((p) => (
              <li key={p.titulo}>
                <strong>{p.titulo}</strong>
                <span>{p.texto}</span>
              </li>
            ))}
          </ol>
          <ul className="ayuda-estados">
            {ESTADOS.map((e) => (
              <li key={e.clase}>
                <span className={`ayuda-estado ayuda-estado-${e.clase}`}>{e.nombre}</span>
                <span>{e.texto}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ayuda-bloque" aria-labelledby="ayuda-preguntas">
          <h2 id="ayuda-preguntas">Preguntas comunes</h2>
          <div className="ayuda-preguntas">
            {PREGUNTAS.map((q) => (
              <details key={q.p}>
                <summary>{q.p}</summary>
                <p>{q.r}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <Bienvenida />
    </>
  );
}
