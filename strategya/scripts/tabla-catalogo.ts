// Imprime la tabla de verdad del catálogo (lib/finanzas/catalogo.ts) como filas VALUES de SQL, para pegarla en
// personal.tipo_aparece (migración 20261029000100_nucleo_v2.sql). La prueba lib/finanzas/catalogo.test.ts
// compara la migración con esta tabla: si alguien cambia una regla en un lado y no en el otro, falla.
// Uso: node --experimental-strip-types scripts/tabla-catalogo.ts
import { tablaDeVerdad } from "../lib/finanzas/catalogo.ts";

console.log(tablaDeVerdad().map((x) => `    ('${x.tipo}', ${x.debito}, '${x.formulario}', '${x.rol}')`).join(",\n"));
