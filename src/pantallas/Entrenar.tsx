import { useMemo, useState } from 'react'
import { Temporizador } from '../componentes/Temporizador'
import { usarAjuste, usarEjercicios, usarProgresion, usarSesion } from '../datos/hooks'
import { INICIO_PLAN } from '../datos/db'
import { guardarDuracion, guardarSerie } from '../datos/sesiones'
import { cargaObjetivo, librosDeDiscos } from '../dominio/cargas'
import { PLAN_SIN_PESAS, TITULOS_SPLIT, diaSemana, fechaLarga, hoyISO, semanaDeReferencia, sumarDias } from '../dominio/dias'
import { revisarRestriccion } from '../dominio/restricciones'
import type { Ejercicio, SerieRegistrada } from '../dominio/tipos'

const RPES = [6, 7, 8, 9, 10]

/** Reps sugeridas a partir del rango del plan: "8-10" → 8, 9, 10. */
function repsSugeridas(rango: string): number[] {
  const m = rango.match(/(\d+)\s*-\s*(\d+)/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    return Array.from({ length: Math.min(6, b - a + 1) }, (_, i) => a + i)
  }
  const n = Number(rango.match(/^(\d+)/)?.[1])
  return Number.isFinite(n) && n > 0 ? [n - 2, n - 1, n, n + 1].filter((x) => x > 0) : []
}

export function Entrenar() {
  const [fecha, setFecha] = useState(hoyISO())
  const [diaElegido, setDiaElegido] = useState<1 | 2 | 3 | 4 | null>(null)
  const [descanso, setDescanso] = useState<number | null>(null)
  const [libre, setLibre] = useState('')

  const ajusteInicio = usarAjuste('inicioPlan')
  const inicio = (ajusteInicio?.valor as string) ?? INICIO_PLAN
  const ds = diaSemana(fecha)
  const diaSplit = diaElegido ?? (ds <= 4 ? ((ds as 1 | 2 | 3 | 4)) : null)

  const ejercicios = usarEjercicios(diaSplit ?? 0)
  const progresion = usarProgresion()
  const sesion = usarSesion(fecha)

  const { semana: semanaNum, dentroDelCiclo } = semanaDeReferencia(fecha, inicio)
  const semana = useMemo(
    () => progresion.find((p) => p.semana === semanaNum),
    [progresion, semanaNum],
  )
  const aviso = revisarRestriccion(libre)

  function seriesDe(e: Ejercicio): SerieRegistrada[] {
    const total = e.seriesPlan ?? 3
    const guardadas = sesion?.series.filter((s) => s.ejercicioId === e.id) ?? []
    const carga = cargaObjetivo(e, semana)
    return Array.from({ length: total }, (_, i) => {
      const existente = guardadas.find((s) => s.setNum === i + 1)
      if (existente) return existente
      return {
        ejercicioId: e.id,
        setNum: i + 1,
        pesoLb: carga?.pesoLb ?? null,
        reps: null,
        rpe: null,
        completada: false,
      }
    })
  }

  async function actualizar(e: Ejercicio, serie: SerieRegistrada, parche: Partial<SerieRegistrada>) {
    if (!diaSplit) return
    const nueva = { ...serie, ...parche }
    nueva.completada = nueva.reps !== null && nueva.rpe !== null
    await guardarSerie(fecha, diaSplit, nueva)
    if (nueva.completada && !serie.completada) setDescanso(e.descansoSeg ?? 90)
  }

  const totalSeries = ejercicios.reduce((n, e) => n + (e.seriesPlan ?? 3), 0)
  const hechas = sesion?.series.filter((s) => s.completada).length ?? 0

  return (
    <div className="space-y-4 pb-32">
      <header className="flex items-center justify-between gap-2">
        <button type="button" className="boton px-3" onClick={() => setFecha(sumarDias(fecha, -1))}>‹</button>
        <div className="text-center">
          <h1 className="font-serif text-lg leading-tight">Entrenar</h1>
          <p className="text-[11px] text-humo">
            {fechaLarga(fecha)} · semana {semanaNum} de 12
            {!dentroDelCiclo && ' (referencia)'}
          </p>
        </div>
        <button
          type="button" className="boton px-3 disabled:opacity-30"
          disabled={fecha === hoyISO()} onClick={() => setFecha(sumarDias(fecha, 1))}
        >›</button>
      </header>

      {!diaSplit ? (
        <section className="tarjeta">
          <span className="rotulo">Hoy el plan no pide pesas</span>
          <p className="mt-1 text-[13px]">{PLAN_SIN_PESAS[ds as 5 | 6 | 7]}</p>
          <p className="mt-3 text-[11px] text-humo">Si vas a entrenar igual, elige el día del split:</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {([1, 2, 3, 4] as const).map((d) => (
              <button key={d} type="button" className="boton" onClick={() => setDiaElegido(d)}>
                Día {d}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="tarjeta">
            <div className="flex items-baseline justify-between gap-2">
              <span className="rotulo">{TITULOS_SPLIT[diaSplit]}</span>
              <span className="cifra shrink-0 text-[12px] text-dorado-400">{hechas}/{totalSeries}</span>
            </div>
            {semana && <p className="mt-1.5 text-[12px] text-humo">{semana.enfoque}</p>}
          </section>

          {ejercicios.map((e) => {
            const carga = cargaObjetivo(e, semana)
            const sugeridas = repsSugeridas(e.repsPlan)
            return (
              <section key={e.id} className={`tarjeta ${e.esAncla ? 'border-dorado-600/70' : ''}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className={`text-sm leading-tight ${e.esAncla ? 'font-bold text-dorado-400' : 'font-semibold'}`}>
                    {e.esAncla && '★ '}{e.nombre}
                  </h2>
                  <span className="cifra shrink-0 text-[11px] text-humo">
                    {e.seriesPlan ? `${e.seriesPlan}×${e.repsPlan}` : e.repsPlan}
                    {e.rpePlan ? ` · RPE ${e.rpePlan}` : ''}
                  </span>
                </div>

                {e.restriccion && (
                  <p className="mt-1 rounded border border-rojo/50 bg-rojo/10 px-2 py-1 text-[11px] text-rojo">
                    {e.restriccion}
                  </p>
                )}
                {e.notaTecnica && <p className="mt-1 text-[11px] text-humo">{e.notaTecnica}</p>}
                {carga && carga.texto && (
                  <p className="cifra mt-1.5 text-[11px] text-dorado-400">
                    Plan semana {semanaNum}: {carga.texto}
                    {carga.discosPorLado ? ` (≈${librosDeDiscos(carga.discosPorLado)} lb en discos)` : ''}
                  </p>
                )}

                {e.seriesPlan && (
                  <ul className="mt-3 space-y-1.5">
                    {seriesDe(e).map((s) => (
                      s.completada ? (
                        <li key={s.setNum}>
                          <button
                            type="button"
                            onClick={() => actualizar(e, s, { reps: null, rpe: null })}
                            className="flex min-h-[44px] w-full items-center justify-between rounded border border-dorado-600/60 bg-dorado-600/10 px-3 text-left"
                          >
                            <span className="cifra text-[13px] text-dorado-400">
                              {s.setNum} · {s.pesoLb ?? '—'} lb × {s.reps} @ RPE {s.rpe}
                            </span>
                            <span className="text-[11px] text-humo">tocar para corregir</span>
                          </button>
                        </li>
                      ) : (
                        <li key={s.setNum} className="rounded border border-marino-800 p-2">
                          <div className="flex items-center gap-1.5">
                            <span className="cifra w-4 shrink-0 text-[12px] text-humo">{s.setNum}</span>
                            <input
                              className="campo w-[74px] shrink-0 px-2 py-1.5 text-base"
                              type="number" inputMode="decimal" step={5} placeholder="lb"
                              value={s.pesoLb ?? ''}
                              onChange={(ev) =>
                                actualizar(e, s, { pesoLb: ev.target.value === '' ? null : Number(ev.target.value) })
                              }
                            />
                            <span className="shrink-0 text-[11px] text-humo">lb ×</span>
                            <span className="flex flex-1 justify-end gap-1">
                              {sugeridas.slice(0, 4).map((r) => (
                                <button
                                  key={r} type="button"
                                  onClick={() => actualizar(e, s, { reps: s.reps === r ? null : r })}
                                  className={`min-h-[40px] flex-1 rounded border text-[13px] font-semibold ${
                                    s.reps === r
                                      ? 'border-dorado-600 bg-dorado-600/25 text-dorado-400'
                                      : 'border-marino-700 text-humo'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-1">
                            <span className="w-4 shrink-0" />
                            <span className="shrink-0 text-[11px] text-marino-600">RPE</span>
                            {RPES.map((r) => (
                              <button
                                key={r} type="button"
                                onClick={() => actualizar(e, s, { rpe: s.rpe === r ? null : r })}
                                className={`min-h-[40px] flex-1 rounded border text-[13px] ${
                                  s.rpe === r
                                    ? 'border-pergamino bg-pergamino/15 text-pergamino'
                                    : 'border-marino-700 text-humo'
                                }`}
                              >
                                {r}
                              </button>
                            ))}
                          </div>
                        </li>
                      )
                    ))}
                  </ul>
                )}
              </section>
            )
          })}

          <section className="tarjeta">
            <span className="rotulo">Ejercicio libre</span>
            <input
              className="campo mt-1.5 font-sans text-sm"
              placeholder="Algo que hiciste fuera del plan"
              value={libre}
              onChange={(ev) => setLibre(ev.target.value)}
            />
            {aviso && (
              <div className="mt-2 rounded border border-rojo/60 bg-rojo/10 p-3">
                <p className="text-[12px] font-bold text-rojo">{aviso.nombre} — fuera por restricción médica</p>
                <p className="mt-1 text-[11px] text-humo">{aviso.motivo}</p>
                <p className="mt-1 text-[11px] text-dorado-400">En su lugar: {aviso.alternativa}</p>
              </div>
            )}
          </section>

          <section className="tarjeta">
            <label className="block">
              <span className="rotulo">Duración de la sesión</span>
              <span className="mt-1.5 flex items-center gap-2">
                <input
                  className="campo" type="number" inputMode="numeric" step={5} placeholder="min"
                  value={sesion?.duracionMin ?? ''}
                  onChange={(ev) =>
                    guardarDuracion(fecha, diaSplit, ev.target.value === '' ? null : Number(ev.target.value))
                  }
                />
                <span className="w-8 shrink-0 text-sm text-humo">min</span>
              </span>
            </label>
          </section>
        </>
      )}

      <Temporizador segundos={descanso} onCerrar={() => setDescanso(null)} />
    </div>
  )
}
