"use client";

import { useActionState, useState } from "react";
import { type EstadoLogin, iniciarSesion } from "../acciones";

export function FormularioLogin({ aviso }: { aviso: string | null }) {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, { error: aviso });
  const [ver, setVer] = useState(false);
  // Controlado: así el correo no se borra si la contraseña estaba mal.
  const [email, setEmail] = useState("");
  return (
    <form action={accion} className="acceso-tarjeta" aria-label="Entrar a Strategya" aria-describedby={estado.error ? "error-login" : undefined}>
      <div className="acceso-campo">
        <label htmlFor="login-email">Correo</label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="username"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          aria-invalid={estado.error ? true : undefined}
        />
      </div>
      <div className="acceso-campo">
        <label htmlFor="login-clave">Contraseña</label>
        <div className="acceso-clave">
          <input
            id="login-clave"
            name="clave"
            type={ver ? "text" : "password"}
            autoComplete="current-password"
            required
            aria-invalid={estado.error ? true : undefined}
          />
          <button type="button" className="acceso-ver" onClick={() => setVer((v) => !v)} aria-pressed={ver} aria-controls="login-clave">
            {ver ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      {estado.error ? (
        <p className="acceso-error" id="error-login" role="alert">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 8v5M12 16.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
          </svg>
          <span>
            {estado.error}
            {estado.error === "Correo o contraseña incorrectos." ? " Revisa que estén bien escritos y vuelve a intentar." : null}
          </span>
        </p>
      ) : null}
      <button type="submit" className="acceso-entrar" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
