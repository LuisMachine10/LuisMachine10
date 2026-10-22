"use client";

import { useSyncExternalStore } from "react";
import { alCambiarTema, leerPreferencia, type PreferenciaTema, type Tema, temaActivo } from "./tema";

/** Tema que se ve ahora («claro» u «oscuro»). En el servidor responde «oscuro»; al hidratar se corrige. */
export function useTemaActivo(): Tema {
  return useSyncExternalStore(alCambiarTema, temaActivo, () => "oscuro");
}

/** Lo que eligió la persona: «claro», «oscuro» o «sistema». */
export function usePreferenciaTema(): PreferenciaTema {
  return useSyncExternalStore(alCambiarTema, leerPreferencia, () => "sistema");
}
