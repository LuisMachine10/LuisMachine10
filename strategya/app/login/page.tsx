import type { Metadata } from "next";
import "./login.css";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar · Strategya" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const aviso = error === "no_autorizado" ? "Esa cuenta no tiene acceso a Strategya. Entra con el correo del dueño." : null;
  return (
    <main className="acceso">
      <div className="acceso-fondo" aria-hidden="true" />
      <div className="acceso-columna">
        <div className="acceso-marca">
          <span className="acceso-logo" aria-hidden="true">
            S
          </span>
          <h1 className="acceso-titulo">Strategya</h1>
          <p className="acceso-subtitulo">Tu terminal financiera: mercados, República Dominicana y tu dinero, en una sola pantalla.</p>
        </div>
        <FormularioLogin aviso={aviso} />
        <ul className="acceso-puntos" aria-label="Qué encuentras dentro">
          <li>
            <span className="acceso-punto sube" aria-hidden="true" />
            Cifras con su fuente y su fecha
          </li>
          <li>
            <span className="acceso-punto rd" aria-hidden="true" />
            Dólar, tasas y combustibles de RD
          </li>
          <li>
            <span className="acceso-punto ambar" aria-hidden="true" />
            Alertas cuando algo se mueve
          </li>
        </ul>
        <p className="acceso-pie">Uso personal. La información no es asesoría de inversión.</p>
      </div>
    </main>
  );
}
