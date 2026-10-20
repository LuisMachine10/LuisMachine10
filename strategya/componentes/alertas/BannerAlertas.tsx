// Alertas de hoy (hora RD), arriba de la terminal. Cada una con su dato, su umbral y su sello de fuente.

import "@/estilos/alertas-ia.css";
import Link from "next/link";
import { SelloFuente } from "@/componentes/SelloFuente";
import { type AlertaDisparada, alertasDeHoy } from "@/lib/datos-alertas-ia";
import { cifra, fechaHoraRD, horaRD } from "@/lib/formato";
import { frescura } from "@/lib/frescura";

function decimales(valor: string): number {
  return Math.min(Math.max((valor.split(".")[1] ?? "").length, 2), 4);
}

export function valorConUnidad(valor: string, unidad: string | undefined): string {
  const v = cifra(valor, decimales(valor));
  if (!unidad) return v;
  return unidad === "%" ? `${v} %` : `${v} ${unidad}`;
}

export function IconoCampana({ tam = 18 }: { tam?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={tam} height={tam} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
    </svg>
  );
}

function Alerta({ a, ahora }: { a: AlertaDisparada; ahora: Date }) {
  const obs = a.observaciones;
  const fechaDato = obs?.fecha_dato ?? a.fecha;
  const desactualizado = a.series
    ? frescura({ fecha_dato: fechaDato, hora_dato: obs?.hora_dato ?? null }, a.series.max_antiguedad_min, ahora).desactualizado
    : false;
  return (
    <li className="alerta-item">
      <div className="alerta-arriba">
        <strong className="alerta-activo">{a.series?.nombre_corto ?? a.serie_id}</strong>
        <span className="alerta-valor mono">{valorConUnidad(a.valor, a.series?.unidad)}</span>
      </div>
      <p className="alerta-umbral">{a.mensaje}</p>
      <div className="alerta-meta">
        <span className="tenue chico mono" title={fechaHoraRD(a.disparada_en)}>
          Sonó a las {horaRD(a.disparada_en)}
        </span>
        <span className={`etiqueta ${a.enviada_en ? "ok" : "neutra"}`}>{a.enviada_en ? "✓ Correo enviado" : "Solo en pantalla"}</span>
      </div>
      <SelloFuente
        ahora={ahora}
        d={{
          fuente: obs?.fuentes?.nombre ?? "fuente sin registrar",
          url: obs?.url_dato ?? obs?.fuentes?.url ?? null,
          fechaDato,
          verificadoEn: obs?.recogido_en ?? null,
          desactualizado,
          ultimaCorridaFallo: false,
        }}
      />
    </li>
  );
}

/** Banner de alertas del día. Sin alertas, una línea discreta; con error de lectura, el motivo. */
export async function BannerAlertas() {
  const ahora = new Date();
  let alertas: AlertaDisparada[];
  try {
    alertas = await alertasDeHoy(ahora);
  } catch (e) {
    return (
      <section className="banner-alertas sin-alertas con-error panel-ancho" aria-label="Alertas de hoy">
        <span className="banner-icono baja">
          <IconoCampana />
        </span>
        <span className="chico">
          <strong>No se pudieron leer las alertas de hoy.</strong> <span className="tenue">{(e as Error).message}</span>
        </span>
      </section>
    );
  }
  if (!alertas.length) {
    return (
      <section className="banner-alertas sin-alertas panel-ancho" aria-label="Alertas de hoy">
        <span className="banner-icono">
          <IconoCampana />
        </span>
        <span className="banner-texto">
          <strong>Sin alertas hoy.</strong> <span className="tenue">Ningún activo ha cruzado tus umbrales.</span>
        </span>
        <Link href="/ajustes#t-umbrales" className="banner-enlace">
          Configurar alertas
        </Link>
      </section>
    );
  }
  return (
    <section className="banner-alertas con-alertas panel-ancho" role="status" aria-labelledby="t-alertas-hoy">
      <div className="banner-cabecera">
        <span className="banner-icono ambar">
          <IconoCampana />
        </span>
        <h2 id="t-alertas-hoy" className="panel-titulo">
          Alertas de hoy <span className="etiqueta alerta">{alertas.length}</span>
        </h2>
        <span className="tenue chico banner-explica">Un activo cruzó uno de tus umbrales.</span>
        <Link href="/ajustes#t-umbrales" className="banner-enlace">
          Umbrales e historial
        </Link>
      </div>
      <ul className="lista-alertas">
        {alertas.map((a) => (
          <Alerta key={a.id} a={a} ahora={ahora} />
        ))}
      </ul>
    </section>
  );
}
