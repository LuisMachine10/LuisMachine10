// Despliegue de Strategya desde GitHub Actions. Mena no corre nada: solo guarda sus secretos en GitHub.
//
//   node despliegue/desplegar.mjs supabase   proyecto, migraciones, API, registro cerrado, usuario, secretos
//   node despliegue/desplegar.mjs tareas     Vault + primera lectura de cada fuente (prueba de humo)
//   node despliegue/desplegar.mjs vercel     proyecto y variables en Vercel (el deploy lo hace la CLI)
//   node despliegue/desplegar.mjs final      URL de producción y redirección de Auth
//
// Reglas: nunca imprime una clave (las que no son secretos de GitHub se enmascaran con ::add-mask::),
// y si faltan secretos no falla: avisa y termina.

import { createHmac, randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_SUPABASE = "https://api.supabase.com/v1";
const API_VERCEL = "https://api.vercel.com";
const NOMBRE = "strategya";
const REGION = "us-east-1";

// ───────────────────────────── utilidades puras (con pruebas) ─────────────────────────────

/** Elige el proyecto de Supabase: el ref indicado, el que se llame «strategya» o el único que exista. */
export function elegirProyecto(proyectos, refPedido) {
  if (refPedido) return proyectos.find((p) => (p.ref ?? p.id) === refPedido) ?? null;
  const porNombre = proyectos.find((p) => String(p.name).toLowerCase() === NOMBRE);
  if (porNombre) return porNombre;
  return proyectos.length === 1 ? proyectos[0] : null;
}

/** Secreto estable para pg_cron → Edge Function, derivado del token (no hay que guardarlo aparte). */
export function secretoTareas(tokenSupabase, ref) {
  return createHmac("sha256", tokenSupabase).update(`strategya-secreto-tareas:${ref}`).digest("hex");
}

/** Claves del proyecto: la publicable (o anon) y la de servidor (secret o service_role). */
export function clavesDe(apiKeys) {
  const por = (f) => apiKeys.find(f)?.api_key ?? null;
  return {
    publica: por((k) => k.type === "publishable") ?? por((k) => k.name === "anon"),
    servidor: por((k) => k.name === "service_role") ?? por((k) => k.type === "secret"),
  };
}

/** Lista de migraciones locales en orden: {version, nombre, archivo}. */
export function migracionesLocales(carpeta = join(RAIZ, "supabase", "migrations")) {
  return readdirSync(carpeta)
    .filter((a) => /^\d{14}_.+\.sql$/.test(a))
    .sort()
    .map((a) => ({ version: a.slice(0, 14), nombre: a.slice(15, -4), archivo: join(carpeta, a) }));
}

/** SQL de una migración dentro de una transacción, registrada como lo hace la CLI de Supabase. */
export function sqlMigracion(version, nombre, sql) {
  const literal = (t) => `'${String(t).replaceAll("'", "''")}'`;
  return [
    "begin;",
    sql,
    `insert into supabase_migrations.schema_migrations (version, name, statements) values (${literal(version)}, ${literal(nombre)}, array[]::text[]);`,
    "commit;",
  ].join("\n");
}

/** Variables para la Edge Function a partir de los secretos de GitHub presentes. */
export function secretosFuncion(env, secreto) {
  const s = [{ name: "STRATEGYA_SECRETO_TAREAS", value: secreto }];
  const copiar = (origen, destino = origen) => {
    if (env[origen]) s.push({ name: destino, value: env[origen] });
  };
  copiar("FMP_API_KEY");
  copiar("FINNHUB_API_KEY");
  copiar("RESEND_API_KEY");
  copiar("ANTHROPIC_API_KEY");
  copiar("STRATEGYA_EMAIL", "ALERTAS_EMAIL_DESTINO");
  // La SEC exige un correo de contacto en el User-Agent; solo se usa con sec.gov.
  copiar("STRATEGYA_EMAIL", "STRATEGYA_CONTACTO");
  s.push({ name: "IA_TOPE_MENSUAL_USD", value: env.IA_TOPE_MENSUAL_USD || "10" });
  s.push({ name: "FMP_LLAMADAS_DIA", value: env.FMP_LLAMADAS_DIA || "240" });
  return s;
}

// ───────────────────────────── acciones (red) ─────────────────────────────

const env = process.env;
const enmascarar = (v) => v && console.log(`::add-mask::${v}`);
const salida = (k, v) => env.GITHUB_OUTPUT && appendFileSync(env.GITHUB_OUTPUT, `${k}=${v}\n`);
const aviso = (m) => console.log(`::notice::${m}`);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(url, { metodo = "GET", token, cuerpo, encabezados = {}, aceptar = [] } = {}) {
  const r = await fetch(url, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
      ...encabezados,
    },
    body: cuerpo !== undefined ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  if (!r.ok && !aceptar.includes(r.status)) {
    const detalle = typeof datos === "string" ? datos.slice(0, 400) : JSON.stringify(datos)?.slice(0, 400);
    throw new Error(`${metodo} ${url.replace(/\?.*/, "")} → HTTP ${r.status}: ${detalle}`);
  }
  return { status: r.status, datos };
}

const supa = (ruta, op = {}) => pedir(`${API_SUPABASE}${ruta}`, { token: env.SUPABASE_ACCESS_TOKEN, ...op });
const sql = (ref, query) => supa(`/projects/${ref}/database/query`, { metodo: "POST", cuerpo: { query } }).then((r) => r.datos);

function faltan(...nombres) {
  const f = nombres.filter((n) => !env[n]);
  if (f.length) aviso(`Despliegue omitido: faltan los secretos ${f.join(", ")} (ver strategya/README.md · Desplegar).`);
  return f.length > 0;
}

async function proyectoSupabase() {
  const { datos: proyectos } = await supa("/projects");
  let p = elegirProyecto(proyectos, env.SUPABASE_PROJECT_REF);
  if (!p && env.SUPABASE_PROJECT_REF) throw new Error(`No existe el proyecto ${env.SUPABASE_PROJECT_REF}`);
  if (!p) {
    const { datos: orgs } = await supa("/organizations");
    if (!orgs?.length) throw new Error("La cuenta de Supabase no tiene organización");
    aviso(`Creando el proyecto «${NOMBRE}» en Supabase (${REGION}).`);
    const clave = randomBytes(24).toString("base64url");
    enmascarar(clave);
    ({ datos: p } = await supa("/projects", {
      metodo: "POST",
      cuerpo: { name: NOMBRE, organization_id: orgs[0].slug ?? orgs[0].id, region: REGION, db_pass: clave },
    }));
  } else if (String(p.name).toLowerCase() !== NOMBRE) {
    aviso(`Se usa el proyecto existente «${p.name}» (es el único de la cuenta).`);
  }
  const ref = p.ref ?? p.id;
  for (let i = 0; i < 60; i++) {
    const { datos } = await supa(`/projects/${ref}`);
    if (datos.status === "ACTIVE_HEALTHY") return ref;
    if (i === 0) console.log(`Esperando a que el proyecto esté listo (estado: ${datos.status})…`);
    await dormir(10_000);
  }
  throw new Error("El proyecto de Supabase no quedó listo en 10 minutos");
}

async function aplicarMigraciones(ref) {
  await sql(
    ref,
    `create schema if not exists supabase_migrations;
     create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`,
  );
  const hechas = new Set((await sql(ref, "select version from supabase_migrations.schema_migrations")).map((f) => f.version));
  let n = 0;
  for (const m of migracionesLocales()) {
    if (hechas.has(m.version)) continue;
    console.log(`Migración ${m.version}_${m.nombre}…`);
    await sql(ref, sqlMigracion(m.version, m.nombre, readFileSync(m.archivo, "utf8")));
    n++;
  }
  console.log(n ? `${n} migraciones aplicadas.` : "Base al día (sin migraciones nuevas).");
}

async function usuarioDueno(ref, claveServidor) {
  const base = `https://${ref}.supabase.co/auth/v1/admin/users`;
  const enc = { apikey: claveServidor, Authorization: `Bearer ${claveServidor}` };
  const email = env.STRATEGYA_EMAIL.trim().toLowerCase();
  let id = null;
  for (let pagina = 1; pagina <= 10 && !id; pagina++) {
    const { datos } = await pedir(`${base}?page=${pagina}&per_page=100`, { encabezados: enc });
    const usuarios = datos?.users ?? [];
    id = usuarios.find((u) => String(u.email).toLowerCase() === email)?.id ?? null;
    if (usuarios.length < 100) break;
  }
  if (id) {
    await pedir(`${base}/${id}`, { metodo: "PUT", encabezados: enc, cuerpo: { password: env.STRATEGYA_CLAVE } });
    console.log("Usuario de Mena: ya existía (contraseña sincronizada con STRATEGYA_CLAVE).");
  } else {
    const { datos } = await pedir(base, {
      metodo: "POST",
      encabezados: enc,
      cuerpo: { email, password: env.STRATEGYA_CLAVE, email_confirm: true },
    });
    id = datos.id;
    console.log("Usuario de Mena: creado.");
  }
  await sql(ref, `insert into mercado.usuarios_autorizados (user_id) values ('${id}') on conflict do nothing;`);
}

async function pasoSupabase() {
  if (faltan("SUPABASE_ACCESS_TOKEN", "STRATEGYA_EMAIL", "STRATEGYA_CLAVE")) return salida("listo", "no");
  if (env.STRATEGYA_CLAVE.length < 12) throw new Error("STRATEGYA_CLAVE debe tener al menos 12 caracteres");

  const ref = await proyectoSupabase();
  const { datos: apiKeys } = await supa(`/projects/${ref}/api-keys?reveal=true`);
  const claves = clavesDe(apiKeys);
  if (!claves.publica || !claves.servidor) throw new Error("No se encontraron las claves del proyecto");
  enmascarar(claves.publica);
  enmascarar(claves.servidor);
  const secreto = secretoTareas(env.SUPABASE_ACCESS_TOKEN, ref);
  enmascarar(secreto);

  await aplicarMigraciones(ref);
  await supa(`/projects/${ref}/postgrest`, {
    metodo: "PATCH",
    cuerpo: { db_schema: "public,graphql_public,mercado,personal" },
  });
  await supa(`/projects/${ref}/config/auth`, { metodo: "PATCH", cuerpo: { disable_signup: true } });
  await usuarioDueno(ref, claves.servidor);
  await supa(`/projects/${ref}/secrets`, { metodo: "POST", cuerpo: secretosFuncion(env, secreto) });

  console.log(`Supabase listo: https://${ref}.supabase.co`);
  salida("listo", "si");
  salida("ref", ref);
}

async function pasoTareas() {
  const ref = env.PROJECT_REF;
  const secreto = secretoTareas(env.SUPABASE_ACCESS_TOKEN, ref);
  enmascarar(secreto);
  await sql(ref, `select mercado.configurar_tareas('https://${ref}.supabase.co', '${secreto}');`);
  console.log("Vault configurado: pg_cron ya puede llamar a la ingesta.");

  // Prueba de humo: cada tarea registrada corre una vez. Un error no detiene el despliegue: queda en /estado.
  const url = `https://${ref}.supabase.co/functions/v1/ingesta`;
  const { datos: lista } = await pedir(url, {
    metodo: "POST",
    encabezados: { "x-strategya-secreto": secreto },
    cuerpo: { tarea: "__lista__" },
    aceptar: [400],
  });
  const tareas = (lista?.disponibles ?? []).filter((t) => !String(t).startsWith("ia-") && t !== "alertas");
  for (const tarea of tareas) {
    try {
      const { status, datos } = await pedir(url, {
        metodo: "POST",
        encabezados: { "x-strategya-secreto": secreto },
        cuerpo: { tarea },
        aceptar: [502],
      });
      const r = datos ?? {};
      console.log(`· ${tarea}: ${r.estado ?? status} · ${r.filas ?? 0} filas${r.error ? ` · ${String(r.error).slice(0, 200)}` : ""}`);
    } catch (e) {
      console.log(`· ${tarea}: no respondió (${e.message.slice(0, 200)})`);
    }
  }
}

async function proyectoVercel() {
  const { status, datos } = await pedir(`${API_VERCEL}/v9/projects/${NOMBRE}`, { token: env.VERCEL_TOKEN, aceptar: [404] });
  if (status !== 404) return datos;
  aviso(`Creando el proyecto «${NOMBRE}» en Vercel.`);
  const r = await pedir(`${API_VERCEL}/v11/projects`, {
    metodo: "POST",
    token: env.VERCEL_TOKEN,
    cuerpo: { name: NOMBRE, framework: "nextjs" },
  });
  return r.datos;
}

async function pasoVercel() {
  if (faltan("VERCEL_TOKEN")) return salida("listo", "no");
  const ref = env.PROJECT_REF;
  // La clave publicable se vuelve a pedir aquí: los valores enmascarados no viajan entre pasos.
  const { datos: apiKeys } = await supa(`/projects/${ref}/api-keys?reveal=true`);
  const { publica } = clavesDe(apiKeys);
  enmascarar(publica);
  const p = await proyectoVercel();
  const variables = {
    SUPABASE_URL: `https://${ref}.supabase.co`,
    SUPABASE_PUBLISHABLE_KEY: publica,
    STRATEGYA_EMAIL_DUENO: env.STRATEGYA_EMAIL.trim().toLowerCase(),
  };
  for (const [key, value] of Object.entries(variables)) {
    await pedir(`${API_VERCEL}/v10/projects/${p.id}/env?upsert=true`, {
      metodo: "POST",
      token: env.VERCEL_TOKEN,
      cuerpo: { key, value, type: "encrypted", target: ["production", "preview"] },
    });
  }
  mkdirSync(join(RAIZ, ".vercel"), { recursive: true });
  writeFileSync(join(RAIZ, ".vercel", "project.json"), JSON.stringify({ projectId: p.id, orgId: p.accountId }));
  console.log("Vercel: proyecto y variables listos.");
  salida("listo", "si");
}

async function pasoFinal() {
  const { datos } = await pedir(`${API_VERCEL}/v9/projects/${NOMBRE}/domains`, { token: env.VERCEL_TOKEN });
  const dominio = (datos?.domains ?? []).map((d) => d.name).sort((a, b) => a.length - b.length)[0];
  if (!dominio) return aviso("Desplegado, pero no se encontró el dominio de producción.");
  const url = `https://${dominio}`;
  await supa(`/projects/${env.PROJECT_REF}/config/auth`, {
    metodo: "PATCH",
    cuerpo: { site_url: url, uri_allow_list: `${url}/**` },
  });
  aviso(`Strategya está en ${url}`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `## Strategya desplegada\n\n**${url}**\n\nEntra con tu correo y la contraseña de STRATEGYA_CLAVE.\n`);
  }
}

const PASOS = { supabase: pasoSupabase, tareas: pasoTareas, vercel: pasoVercel, final: pasoFinal };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paso = PASOS[process.argv[2]];
  if (!paso) {
    console.error(`Uso: node desplegar.mjs ${Object.keys(PASOS).join("|")}`);
    process.exit(2);
  }
  paso().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
