import type { Metadata } from "next";
import { FormularioLogin } from "./FormularioLogin";

export const metadata: Metadata = { title: "Entrar · Strategya" };

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const aviso = error === "no_autorizado" ? "Esa cuenta no tiene acceso a Strategya." : null;
  return (
    <main className="login">
      <h1 className="sr-solo">Entrar a Strategya</h1>
      <FormularioLogin aviso={aviso} />
    </main>
  );
}
