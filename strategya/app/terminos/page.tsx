import "@/estilos/ayuda.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Encabezado } from "@/componentes/Encabezado";
import { fechaCorta } from "@/lib/formato";
import { personal } from "@/lib/supabase/servidor";
import { aceptoVigente, COOKIE_TERMINOS, leerAceptacion, rutaVolver, TEXTO_TERMINOS, VERSION_TERMINOS } from "@/lib/terminos";
import { aceptarTerminos, continuarTerminos } from "./acciones";

export const metadata: Metadata = { title: "Términos y privacidad · Strategya" };
export const dynamic = "force-dynamic";

export default async function Terminos({ searchParams }: { searchParams: Promise<{ volver?: string; error?: string }> }) {
  const q = await searchParams;
  const volver = rutaVolver(q.volver);
  let aceptacion = null;
  try {
    const r = await (await personal()).from("preferencias").select("valor").eq("clave", "terminos").limit(1);
    aceptacion = leerAceptacion(((r.data ?? [])[0] as { valor: unknown } | undefined)?.valor);
  } catch {
    aceptacion = null;
  }
  const vigente = aceptoVigente(aceptacion);
  const conCookie = (await cookies()).get(COOKIE_TERMINOS)?.value === VERSION_TERMINOS;
  return (
    <>
      <Encabezado actual="ayuda" ultimaActualizacion={null} />
      <main className="ayuda terminos">
        <header className="ayuda-cab">
          <h1>Términos y privacidad</h1>
          <p>En palabras simples: qué pasa con tu información y qué es (y qué no es) Strategya. Versión del {fechaCorta(VERSION_TERMINOS)}.</p>
        </header>
        {TEXTO_TERMINOS.map((s) => (
          <section key={s.titulo} className="ayuda-bloque" aria-label={s.titulo}>
            <h2>{s.titulo}</h2>
            {s.parrafos.map((p) => (
              <p key={p} style={{ margin: "0 0 8px", maxWidth: 760, lineHeight: 1.55 }}>
                {p}
              </p>
            ))}
          </section>
        ))}
        <section className="ayuda-bloque panel" aria-label="Aceptar" style={{ padding: 16 }}>
          {vigente ? (
            <>
              <p style={{ margin: 0 }}>
                Aceptaste esta versión el {fechaCorta(aceptacion!.aceptadoEn.slice(0, 10))}.
              </p>
              {!conCookie ? (
                <form action={continuarTerminos} style={{ marginTop: 12 }}>
                  <input type="hidden" name="volver" value={volver} />
                  <button type="submit" className="boton">
                    Continuar
                  </button>
                </form>
              ) : (
                <p style={{ margin: "8px 0 0" }}>
                  <Link href={volver}>Volver</Link>
                </p>
              )}
            </>
          ) : (
            <form action={aceptarTerminos} style={{ display: "grid", gap: 12 }}>
              <input type="hidden" name="volver" value={volver} />
              <label className="casilla" style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 16 }}>
                <input type="checkbox" name="acepto" value="si" required style={{ width: 22, height: 22, marginTop: 2 }} />
                <span>Acepto los términos y condiciones</span>
              </label>
              {q.error === "marca" ? (
                <p role="alert" className="caja-mensaje error" style={{ margin: 0 }}>
                  Marca la casilla para seguir.
                </p>
              ) : q.error === "guardar" ? (
                <p role="alert" className="caja-mensaje error" style={{ margin: 0 }}>
                  No se pudo guardar tu aceptación. Inténtalo de nuevo en un momento.
                </p>
              ) : null}
              <div>
                <button type="submit" className="boton boton-grande">
                  Aceptar y seguir
                </button>
              </div>
              <p className="tenue chico" style={{ margin: 0 }}>
                Se pide una sola vez. Guardamos la versión y la fecha en que aceptaste (solo tú la ves).
              </p>
            </form>
          )}
        </section>
      </main>
    </>
  );
}
