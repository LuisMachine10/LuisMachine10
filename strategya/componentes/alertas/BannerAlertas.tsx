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

function Alerta({ a, ahora }: { a: AlertaDisparada; ahora: Date }) {
  const obs = a.observaciones;
  const fechaDato = obs?.fecha_dato ?? a.fecha;
  const desactualizado = a.series
    ? frescura({ fecha_dato: fechaDato, hora_dato: obs?.hora_dato ?? null }, a.series.max_antiguedad_min, ahora).desactualizado
    : false;
  return (
    <li className="alerta-item">
      <div className="alerta-linea">
        <strong className="alerta-activo">{a.series?.nombre_corto ?? a.serie_id}</strong>
        <span className="mono">{valorConUnidad(a.valor, a.series?.unidad)}</span>
        <span className="alerta-umbral">{a.mensaje}</span>
        <span className="tenue chico" title={fechaHoraRD(a.disparada_en)}>
          disparada {horaRD(a.disparada_en)}
        </span>
        <span className={`etiqueta ${a.enviada_en ? "ok" : "neutra"}`}>{a.enviada_en ? "✓ correo enviado" : "solo en pantalla"}</span>
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
      <section className="banner-alertas sin-alertas panel-ancho" aria-label="Alertas de hoy">
        <span className="etiqueta error">✕ alertas</span>
        <span className="chico baja">{(e as Error).message}</span>
      </section>
    );
  }
  if (!alertas.length) {
    return (
      <section className="banner-alertas sin-alertas panel-ancho" aria-label="Alertas de hoy">
        <span className="etiqueta neutra">Alertas</span>
        <span className="chico tenue">Ninguna alerta hoy.</span>
        <Link href="/ajustes" className="chico">
          Umbrales
        </Link>
      </section>
    );
  }
  return (
    <section className="banner-alertas con-alertas panel-ancho" role="status" aria-labelledby="t-alertas-hoy">
      <div className="banner-cabecera">
        <h2 id="t-alertas-hoy" className="panel-titulo">
          ⚠ Alertas de hoy ({alertas.length})
        </h2>
        <Link href="/ajustes" className="chico">
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
