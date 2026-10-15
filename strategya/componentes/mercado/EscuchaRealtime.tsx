"use client";

// Escucha los cambios de mercado.observaciones por Supabase Realtime y pide al servidor que vuelva a pintar.
// No usa las cifras del mensaje (Realtime las manda como números JSON): el servidor vuelve a leerlas como texto.
// Si Realtime falla, el Actualizador de 60 s sigue refrescando la página.

import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Estado = "conectando" | "en_vivo" | "respaldo";

const ESPERA_MS = 1500;

export function EscuchaRealtime({ url, clave }: { url: string; clave: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("conectando");

  useEffect(() => {
    let reloj: number | undefined;
    let cliente: SupabaseClient | null = null;
    let canal: RealtimeChannel | null = null;
    try {
      cliente = createBrowserClient(url, clave);
      canal = cliente
        .channel("strategya-observaciones")
        .on("postgres_changes", { event: "*", schema: "mercado", table: "observaciones" }, () => {
          window.clearTimeout(reloj);
          reloj = window.setTimeout(() => router.refresh(), ESPERA_MS);
        })
        .subscribe((s: string) => {
          if (s === "SUBSCRIBED") setEstado("en_vivo");
          else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setEstado("respaldo");
        });
    } catch {
      setEstado("respaldo");
    }
    return () => {
      window.clearTimeout(reloj);
      if (cliente && canal) void cliente.removeChannel(canal);
    };
  }, [url, clave, router]);

  const texto =
    estado === "en_vivo" ? "En vivo" : estado === "respaldo" ? "Sin conexión en vivo · se actualiza cada 60 s" : "Conectando…";
  return (
    <span className={`mv-vivo mv-vivo-${estado}`} role="status" aria-live="polite">
      <span className="mv-punto" aria-hidden="true" />
      {texto}
    </span>
  );
}
