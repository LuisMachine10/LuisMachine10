// Variables de entorno del servidor (Vercel). Ninguna llega al navegador: no hay NEXT_PUBLIC_*.

export interface ConfigServidor {
  supabaseUrl: string;
  supabaseClave: string;
  emailDueno: string;
}

export function configServidor(): ConfigServidor {
  const faltan: string[] = [];
  const leer = (n: string) => {
    const v = process.env[n]?.trim();
    if (!v) faltan.push(n);
    return v ?? "";
  };
  const cfg = {
    supabaseUrl: leer("SUPABASE_URL"),
    supabaseClave: leer("SUPABASE_PUBLISHABLE_KEY"),
    emailDueno: leer("STRATEGYA_EMAIL_DUENO").toLowerCase(),
  };
  if (faltan.length) throw new Error(`Faltan variables de entorno: ${faltan.join(", ")} (ver .env.example)`);
  return cfg;
}
