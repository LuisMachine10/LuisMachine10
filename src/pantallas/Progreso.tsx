import { useMemo, useState } from 'react'
import { Chispa } from '../componentes/Chispa'
import { GraficaPeso } from '../componentes/GraficaPeso'
import { INICIO_PLAN, db } from '../datos/db'
import {
  usarAjuste, usarAnaliticas, usarPerfil, usarPesos, usarSesiones, usarTodosLosEjercicios, usarTodosLosRegistros,
} from '../datos/hooks'
import { hoyISO, semanaDelPlan, sumarDias } from '../dominio/dias'
import { bitacoraCSV, pesosCSV, sesionesCSV } from '../dominio/exportar'
import { estadoDeResultados, mediaMovil, resumirPeriodo } from '../dominio/promedios'
import type { Analitica, Ejercicio } from '../dominio/tipos'

type Lente = 'crudo' | 'aplicable'
type Ventana = 7 | 30 | 0

const COLOR_DIAGNOSTICO: Record<string, string> = {
  'Sólido': 'text-dorado-400',
  'Aceptable': 'text-pergamino',
  'Aquí se está fugando el resultado': 'text-humo',
  'Renglón crítico': 'text-rojo',
}

const REFERENCIAS: { clave: keyof Analitica; etiqueta: string; referencia: string }[] = [
  { clave: 'colTotal', etiqueta: 'Col. total', referencia: '' },
  { clave: 'ldl', etiqueta: 'LDL', referencia: '< 100' },
  { clave: 'hdl', etiqueta: 'HDL', referencia: '> 40' },
  { clave: 'trigliceridos', etiqueta: 'Triglicéridos', referencia: '< 150' },
  { clave: 'alt', etiqueta: 'ALT (TGP)', referencia: 'rango lab' },
  { clave: 'ast', etiqueta: 'AST (TGO)', referencia: 'rango lab' },
]

function descargar(nombre: string, contenido: string, tipo = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

interface Props {
  onIr: (pantalla: 'ajustes' | 'peso') => void
}

export function Progreso({ onIr }: Props) {
  const [lente, setLente] = useState<Lente>('crudo')
  const [ventana, setVentana] = useState<Ventana>(30)
  const [nuevaAnalitica, setNuevaAnalitica] = useState<Partial<Analitica>>({ fecha: hoyISO() })

  const perfil = usarPerfil()
  const registros = usarTodosLosRegistros()
  const pesos = usarPesos()
  const sesiones = usarSesiones()
  const analiticas = usarAnaliticas()
  const ajusteInicio = usarAjuste('inicioPlan')
  const inicio = (ajusteInicio?.valor as string) ?? INICIO_PLAN

  const ejercicios = usarTodosLosEjercicios()
  const anclas = useMemo(() => ejercicios.filter((e) => e.esAncla), [ejercicios])

  const enVentana = useMemo(() => {
    if (ventana === 0) return registros
    const desde = sumarDias(hoyISO(), -(ventana - 1))
    return registros.filter((r) => r.fecha >= desde)
  }, [registros, ventana])

  const resumen = useMemo(() => resumirPeriodo(enVentana, perfil), [enVentana, perfil])
  const estado = useMemo(
    () => estadoDeResultados(enVentana, perfil, lente === 'aplicable'),
    [enVentana, perfil, lente],
  )
  const medias = useMemo(() => mediaMovil(pesos.map((p) => p.pesoLb), 4), [pesos])

  /** El mejor peso levantado por sesión, para ver la tendencia real y no el calentamiento. */
  function serieDeAncla(e: Ejercicio): (number | null)[] {
    return sesiones.map((s) => {
      const suyas = s.series.filter((x) => x.ejercicioId === e.id && x.completada && x.pesoLb)
      return suyas.length ? Math.max(...suyas.map((x) => x.pesoLb!)) : null
    })
  }

  async function guardarAnalitica() {
    if (!nuevaAnalitica.fecha) return
    await db.analiticas.put({
      fecha: nuevaAnalitica.fecha,
      colTotal: nuevaAnalitica.colTotal ?? null,
      ldl: nuevaAnalitica.ldl ?? null,
      hdl: nuevaAnalitica.hdl ?? null,
      trigliceridos: nuevaAnalitica.trigliceridos ?? null,
      alt: nuevaAnalitica.alt ?? null,
      ast: nuevaAnalitica.ast ?? null,
      notas: nuevaAnalitica.notas ?? '',
    })
    setNuevaAnalitica({ fecha: hoyISO() })
  }

  const semanaActual = semanaDelPlan(hoyISO(), inicio)

  return (
    <div className="space-y-4 pb-28">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-serif text-xl">Progreso</h1>
          <p className="text-[12px] text-humo">
            Estado de resultados de la disciplina
            {semanaActual ? ` · semana ${semanaActual} de 12` : ''}
          </p>
        </div>
        <button type="button" aria-label="Ajustes" className="boton px-3" onClick={() => onIr('ajustes')}>⚙</button>
      </header>

      <div className="grid grid-cols-3 gap-1.5">
        {([[7, '7 días'], [30, '30 días'], [0, 'Todo']] as const).map(([v, t]) => (
          <button
            key={v} type="button" onClick={() => setVentana(v)}
            className={`min-h-[44px] rounded border text-[12px] font-semibold ${
              ventana === v ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400' : 'border-marino-700 text-humo'
            }`}
          >{t}</button>
        ))}
      </div>

      <section className="tarjeta grid grid-cols-4 gap-2 text-center">
        <div>
          <p className="cifra text-xl text-dorado-400">
            {resumen.puntajePromedio === null ? '—' : Math.round(resumen.puntajePromedio)}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-humo">promedio</p>
        </div>
        <div>
          <p className="cifra text-xl">{resumen.diasRegistrados}</p>
          <p className="text-[10px] uppercase tracking-wider text-humo">días</p>
        </div>
        <div>
          <p className="cifra text-xl">{resumen.diasSobre80}</p>
          <p className="text-[10px] uppercase tracking-wider text-humo">80+</p>
        </div>
        <div>
          <p className="cifra text-xl">{resumen.diasBajo60}</p>
          <p className="text-[10px] uppercase tracking-wider text-humo">bajo 60</p>
        </div>
      </section>

      <section className="tarjeta">
        <div className="mb-3 grid grid-cols-2 gap-1.5">
          {([['crudo', 'Sobre 100'], ['aplicable', 'Sobre lo que pedía el plan']] as const).map(([v, t]) => (
            <button
              key={v} type="button" onClick={() => setLente(v)}
              className={`min-h-[40px] rounded border px-1 text-[11px] font-semibold ${
                lente === v ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400' : 'border-marino-700 text-humo'
              }`}
            >{t}</button>
          ))}
        </div>

        {estado.margen === null ? (
          <p className="py-4 text-center text-[12px] text-humo">Sin días registrados en esta ventana.</p>
        ) : (
          <>
            {estado.categorias.map((c) => (
              <div key={c.categoria} className="border-t border-marino-800 py-2.5 first:border-t-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-bold tracking-wide">{c.categoria}</span>
                  <span className="cifra shrink-0 text-[12px]">
                    <span className="text-humo">{c.logrados} / {c.posibles}</span>
                    <span className="ml-2 text-pergamino">
                      {c.adherencia === null ? '—' : `${Math.round(c.adherencia * 100)}%`}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-marino-800">
                  <div className="h-full rounded-full bg-dorado-600"
                    style={{ width: `${Math.round((c.adherencia ?? 0) * 100)}%` }} />
                </div>
                <p className={`mt-1 text-[11px] ${COLOR_DIAGNOSTICO[c.diagnostico ?? ''] ?? 'text-humo'}`}>
                  {c.diagnostico}
                </p>
                <ul className="mt-1.5 space-y-0.5">
                  {c.renglones.map((r) => (
                    <li key={r.etiqueta} className="flex justify-between text-[11px] text-humo">
                      <span>{r.etiqueta}</span>
                      <span className="cifra">
                        {r.logrados}/{r.posibles}
                        {r.adherencia !== null && ` · ${Math.round(r.adherencia * 100)}%`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="mt-2 border-t-2 border-marino-700 pt-3">
              <div className="flex items-baseline justify-between">
                <span className="font-serif text-base">MARGEN DE CUMPLIMIENTO</span>
                <span className="cifra text-xl text-dorado-400">{Math.round(estado.margen * 100)}%</span>
              </div>
              <p className="cifra text-[11px] text-humo">{estado.logrados} de {estado.posibles} puntos</p>
              <p className={`mt-1 text-[12px] ${COLOR_DIAGNOSTICO[estado.diagnostico ?? ''] ?? ''}`}>
                {estado.diagnostico}
              </p>
              <p className="mt-2 text-[11px] text-humo">
                El renglón con menor adherencia es el cuello de botella. Arregla ese durante dos semanas
                antes de tocar los demás.
              </p>
            </div>
          </>
        )}
      </section>

      <section className="tarjeta">
        <div className="flex items-baseline justify-between">
          <span className="rotulo">Peso</span>
          <button
            type="button" className="text-[11px] text-dorado-400 underline underline-offset-2"
            onClick={() => onIr('peso')}
          >
            Registrar pesaje
          </button>
        </div>
        <div className="mt-2">
          <GraficaPeso pesos={pesos} medias={medias} />
        </div>
      </section>

      <section className="tarjeta">
        <span className="rotulo">Levantamientos ancla</span>
        <p className="mt-1 text-[11px] text-humo">
          Cada uno en su propia escala: libras y series no comparten eje. El mejor peso completado por sesión.
        </p>
        {sesiones.length < 2 ? (
          <p className="py-4 text-center text-[12px] text-humo">
            Con dos sesiones registradas empieza la línea.
          </p>
        ) : (
          <div className="mt-1 divide-y divide-marino-800">
            {anclas.map((e) => (
              <Chispa key={e.id} valores={serieDeAncla(e)} etiqueta={e.nombre} unidad="lb" destacado />
            ))}
          </div>
        )}
      </section>

      <section className="tarjeta">
        <span className="rotulo">Analítica — el reto de la rosuvastatina</span>
        <p className="mt-1 text-[11px] text-humo">
          El CoQ10 no baja el LDL. Sin dato base no hay experimento, hay apuesta.
        </p>

        {analiticas.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-humo">
                  <th className="py-1 text-left font-normal">Fecha</th>
                  {REFERENCIAS.map((r) => (
                    <th key={r.clave} className="px-1.5 py-1 text-right font-normal">{r.etiqueta}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analiticas.map((a) => (
                  <tr key={a.fecha} className="border-t border-marino-800">
                    <td className="cifra py-1.5">{a.fecha}</td>
                    {REFERENCIAS.map((r) => (
                      <td key={r.clave} className="cifra px-1.5 py-1.5 text-right">
                        {(a[r.clave] as number | null) ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-marino-800 text-humo">
                  <td className="py-1.5">referencia</td>
                  {REFERENCIAS.map((r) => (
                    <td key={r.clave} className="cifra px-1.5 py-1.5 text-right">{r.referencia || '—'}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <input
            className="campo" type="date" value={nuevaAnalitica.fecha ?? ''}
            onChange={(e) => setNuevaAnalitica({ ...nuevaAnalitica, fecha: e.target.value })}
          />
          <div className="grid grid-cols-3 gap-2">
            {REFERENCIAS.map((r) => (
              <label key={r.clave} className="block">
                <span className="rotulo">{r.etiqueta}</span>
                <input
                  className="campo mt-1 py-2 text-base" type="number" inputMode="decimal"
                  value={(nuevaAnalitica[r.clave] as number | undefined) ?? ''}
                  onChange={(e) =>
                    setNuevaAnalitica({
                      ...nuevaAnalitica,
                      [r.clave]: e.target.value === '' ? undefined : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <input
            className="campo font-sans text-sm" placeholder="Notas / medicación"
            value={nuevaAnalitica.notas ?? ''}
            onChange={(e) => setNuevaAnalitica({ ...nuevaAnalitica, notas: e.target.value })}
          />
          <button type="button" className="boton w-full" onClick={guardarAnalitica}>
            Guardar analítica
          </button>
        </div>
      </section>

      <section className="tarjeta space-y-2">
        <span className="rotulo">Exportar</span>
        <button type="button" className="boton w-full"
          onClick={() => descargar(`bitacora-${hoyISO()}.csv`, bitacoraCSV(registros, perfil))}>
          Bitácora a CSV ({registros.length} días)
        </button>
        <button type="button" className="boton w-full"
          onClick={() => descargar(`peso-${hoyISO()}.csv`, pesosCSV(pesos))}>
          Peso a CSV ({pesos.length} pesajes)
        </button>
        <button type="button" className="boton w-full"
          onClick={() => descargar(
            `sesiones-${hoyISO()}.csv`,
            sesionesCSV(sesiones, new Map(ejercicios.map((e) => [e.id, e]))),
          )}>
          Sesiones a CSV ({sesiones.length} sesiones)
        </button>
        <p className="text-[11px] text-humo">
          El respaldo completo en JSON está en Ajustes. El CSV es para analizar; el JSON es para restaurar.
        </p>
      </section>
    </div>
  )
}
