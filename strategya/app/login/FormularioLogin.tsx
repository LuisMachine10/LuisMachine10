"use client";

import { useActionState } from "react";
import { type EstadoLogin, iniciarSesion } from "../acciones";

export function FormularioLogin({ aviso }: { aviso: string | null }) {
  const [estado, accion, enviando] = useActionState<EstadoLogin, FormData>(iniciarSesion, { error: aviso });
  return (
    <form action={accion} aria-describedby={estado.error ? "error-login" : undefined}>
      <div className="marca" aria-hidden="true">
        STRATEGYA
      </div>
      <label>
        Correo
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Contraseña
        <input name="clave" type="password" autoComplete="current-password" required />
      </label>
      {estado.error ? (
        <p className="error" id="error-login" role="alert">
          {estado.error}
        </p>
      ) : null}
      <button type="submit" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
