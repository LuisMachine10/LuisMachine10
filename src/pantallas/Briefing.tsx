import { useEffect, useState } from 'react'
import { briefingVigente, type ResultadoBriefing } from '../datos/briefing'
import { usarRegistro } from '../datos/hooks'
import { alternarToggle } from '../datos/registros'
import { frescura, fuenteDe, idBriefing, totalPuntos } from '../dominio/briefing/briefing'
import type { Briefing as TBriefing, Punto } from '../dominio/briefing/tipos'
import { hoyISO } from '../dominio/dias'

/**
 * El briefing de las 6:00 y las 17:00.
 *
 * Regla de la pantalla: la hora del briefing SIEMPRE está a la vista. Un dato
 * sin sello de tiempo es un rumor, y aquí se decide con estos datos.
 */
export function Briefing() {
  const fecha = hoyISO()
  const hora = new Date().getHours()
  const [estado, setEstado] = useState<ResultadoBriefing | null>(null)
  const [cargando, setCargando] = useState(true)
  const registro = usarRegistro(fecha)

  useEffect(() => {
    let vivo = true
    briefingVigente(fecha, hora)
      .then((r) => vivo && setEstado(r))
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [fecha, hora])

  if (cargando) {
    return <p className="pt-8 text-center text-sm text-humo">Buscando el briefing…</p>
  }

  const b = estado?.briefing
  const esperado = estado?.esperado

  if (!b) {
    return (
      <div className="space-y-4 pb-24">
        <h1 className="font-serif text-2xl">Briefing</h1>
        <div className="tarjeta space-y-2 text-sm text-humo">
          <p>
            Todavía no hay briefing de{' '}
            {esperado ? `${esperado.fecha} (${esperado.sesion === 'AM' ? '6:00' : '5:00 p.m.'})` : 'hoy'}.
          </p>
          <p>
            El briefing lo genera un agente que sale a buscar las noticias y lo deja
            servido junto a la app. Si nunca has abierto la app con señal, no hay
            ninguno guardado todavía.
          </p>
        </div>
      </div>
    )
  }

  const f = frescura(b.generadoEn, Date.now())
  const leido = !!registro?.briefing

  return (
    <div className="space-y-4 pb-24">
      <header className="space-y-1">
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-serif text-2xl">Briefing</h1>
          <span className="rotulo">{b.sesion === 'AM' ? '6:00 a.m.' : '5:00 p.m.'}</span>
        </div>
        {/* La hora, siempre. Con señal y sin ella. */}
        <p className={`text-xs ${f.vencido ? 'text-dorado-400' : 'text-humo'}`}>
          {b.fecha} · {f.texto}
          {estado?.deLaMemoria && ' · guardado en el teléfono'}
          {f.vencido && ' · ya no describe el mercado de hoy'}
        </p>
      </header>

      {b.mercados.length > 0 && (
        <section className="tarjeta">
          <div className="rotulo">Mercados</div>
          <div className="mt-2 space-y-1">
            {b.mercados.map((c) => (
              <div key={c.nombre} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{c.nombre}</span>
                <span className="flex shrink-0 items-baseline gap-3">
                  <span className="cifra">{c.valor}</span>
                  <span
                    className={`cifra max-w-[8rem] text-right text-xs leading-tight ${
                      c.direccion === 'sube' ? 'text-verde' : c.direccion === 'baja' ? 'text-rojo' : 'text-humo'
                    }`}
                  >
                    {c.cambio}
                  </span>
                </span>
              </div>
            ))}
          </div>
          {b.mercados[0] && <p className="rotulo mt-2">{b.mercados[0].comoDe}</p>}
        </section>
      )}

      {b.bloques.map((bloque) => (
        <section key={bloque.titulo} className="space-y-2">
          <h2 className="rotulo">{bloque.titulo}</h2>
          {bloque.puntos.map((p, i) => (
            <PuntoTarjeta key={i} punto={p} briefing={b} />
          ))}
        </section>
      ))}

      {b.lectura.length > 0 && (
        <section className="tarjeta">
          <div className="rotulo">La lectura</div>
          <div className="mt-2 space-y-2 font-serif text-[15px] leading-relaxed">
            {b.lectura.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </section>
      )}

      {/* El único acento dorado de la pantalla: lo que pide que hagas algo. */}
      <section
        className={`rounded-lg border p-4 ${
          b.decisiones.length > 0 ? 'border-dorado-600 bg-dorado-600/10' : 'border-marino-800 bg-marino-900/60'
        }`}
      >
        <div className="rotulo">Qué pide decisión hoy</div>
        {b.decisiones.length === 0 ? (
          <p className="mt-2 text-sm text-humo">Nada pide acción hoy. Eso también es información.</p>
        ) : (
          <ol className="mt-2 space-y-3">
            {b.decisiones.map((d, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold text-dorado-400">{d.texto}</span>
                <span className="mt-1 block text-humo">{d.porQue}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {b.faltantes.length > 0 && (
        <section className="tarjeta">
          <div className="rotulo">Lo que no se pudo traer</div>
          <ul className="mt-2 space-y-1 text-xs text-humo">
            {b.faltantes.map((x, i) => <li key={i}>· {x}</li>)}
          </ul>
        </section>
      )}

      <section className="tarjeta">
        <div className="rotulo">Fuentes ({b.fuentes.length})</div>
        <ol className="mt-2 space-y-2 text-xs">
          {b.fuentes.map((s) => (
            <li key={s.id}>
              <span className="cifra text-humo">[{s.id}]</span>{' '}
              <a href={s.url} target="_blank" rel="noreferrer" className="text-dorado-400 underline">
                {s.medio}
              </a>
              <span className="block text-humo">{s.titulo} · {s.fecha}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Se marca por leerlo, no por abrir la pantalla. */}
      <button
        type="button"
        onClick={() => alternarToggle(fecha, 'briefing')}
        className={leido ? 'boton w-full' : 'boton-dorado w-full'}
      >
        {leido ? 'Briefing leído hoy ✓' : 'Marcar como leído'}
      </button>

      <p className="rotulo text-center">
        {totalPuntos(b)} puntos · generado {b.generadoEn}
      </p>
    </div>
  )
}

function PuntoTarjeta({ punto, briefing }: { punto: Punto; briefing: TBriefing }) {
  const fuente = fuenteDe(briefing, punto.fuenteId)
  return (
    <article className="tarjeta">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold">{punto.titulo}</h3>
        {/* Un hecho y un pronóstico no se leen igual, así que no se ven igual. */}
        {punto.tipo === 'PRONOSTICO' && (
          <span className="rotulo shrink-0 rounded border border-marino-700 px-1.5 py-0.5">
            Pronóstico
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-humo">{punto.detalle}</p>
      <p className="mt-2 border-t border-marino-800 pt-2 text-sm">
        <span className="rotulo">Qué pide: </span>
        {punto.quePide}
      </p>
      {fuente && (
        <a
          href={fuente.url}
          target="_blank"
          rel="noreferrer"
          className="rotulo mt-2 inline-block text-dorado-400"
        >
          [{fuente.id}] {fuente.medio}
        </a>
      )}
    </article>
  )
}

export { idBriefing }
