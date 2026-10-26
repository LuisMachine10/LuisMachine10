import type { Metadata } from "next";
import Link from "next/link";
import { BotonVerBienvenida, Bienvenida } from "@/componentes/ayuda/Bienvenida";
import { GUIA } from "@/componentes/ayuda/guia";
import { GuiaPreguntas } from "@/componentes/ayuda/GuiaPreguntas";
import { Encabezado, SECCIONES } from "@/componentes/Encabezado";

export const metadata: Metadata = { title: "Guía de uso · Strategya" };

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

export default function Ayuda() {
  return (
    <>
      <Encabezado actual="ayuda" ultimaActualizacion={null} />
      <main className="ayuda">
        <header className="ayuda-cab">
          <h1>Guía de uso</h1>
          <p>Aquí encuentras, por pantalla, las respuestas a las dudas más comunes. Escribe tu duda en el buscador o toca una pregunta.</p>
          <BotonVerBienvenida />
          <p className="chico" style={{ marginTop: 12 }}>
            <Link href="/terminos">Términos y privacidad</Link> · <a href="https://github.com/LuisMachine10/LuisMachine10/blob/main/strategya/docs/manual-financiero.md">Manual de lógica financiera</a>
          </p>
        </header>

        <GuiaPreguntas grupos={GUIA} />

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

      </main>
      <Bienvenida />
    </>
  );
}
