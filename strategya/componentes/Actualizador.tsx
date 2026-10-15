"use client";

// Respaldo de actualización: vuelve a pedir los datos al servidor cada 60 s y al volver a la pestaña.
// (Supabase Realtime empuja los cambios a partir de la Fase 2; esto queda como red de seguridad.)

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function Actualizador({ cadaSegundos = 60 }: { cadaSegundos?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refrescar = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(refrescar, cadaSegundos * 1000);
    document.addEventListener("visibilitychange", refrescar);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", refrescar);
    };
  }, [router, cadaSegundos]);
  return null;
}
