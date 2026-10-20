// Título de una pantalla con la línea «para qué sirve» en palabras simples (la misma del menú y de /ayuda).
import { SECCIONES, type Seccion } from "@/componentes/Encabezado";

export function IntroPantalla({ clave, children }: { clave: Seccion; children?: React.ReactNode }) {
  const s = SECCIONES.find((x) => x.clave === clave)!;
  return (
    <header className="intro-pantalla panel-ancho">
      <h1>{s.nombre}</h1>
      <p>{s.para}</p>
      {children}
    </header>
  );
}
