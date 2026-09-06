import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../datos/db'
import { PLAN_SIN_PESAS, TITULOS_SPLIT, diaSemana, hoyISO } from '../dominio/dias'
import { REGLA_CONFLICTO } from '../datos/seed/liturgico'
import { avisoDePesaje } from '../dominio/macros'
import { PROHIBIDOS } from '../dominio/restricciones'

const NOMBRES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
type Vista = 'horario' | 'liturgico' | 'alimentos' | 'gym'

interface Props {
  onIr: (pantalla: 'ajustes') => void
}

export function Plan({ onIr }: Props) {
  const [vista, setVista] = useState<Vista>('horario')
  const [dia, setDia] = useState(diaSemana(hoyISO()) as number)

  const bloques = useLiveQuery(() => db.horario.where('dia').equals(dia).sortBy('hora'), [dia], [])
  const liturgico = useLiveQuery(() => db.liturgico.toArray(), [], [])
  const alimentos = useLiveQuery(() => db.alimentos.toArray(), [], [])
  const ejercicios = useLiveQuery(() => db.ejercicios.where('dia').equals(Math.min(dia, 4)).sortBy('orden'), [dia], [])

  return (
    <div className="space-y-4 pb-28">
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-serif text-xl">El plan</h1>
          <p className="text-[12px] text-humo">Solo lectura. Esto es lo que dice el Excel.</p>
        </div>
        <button type="button" aria-label="Ajustes" className="boton px-3" onClick={() => onIr('ajustes')}>⚙</button>
      </header>

      <div className="grid grid-cols-4 gap-1.5">
        {([['horario', 'Horario'], ['gym', 'Gym'], ['alimentos', 'Alimentos'], ['liturgico', 'Litúrgico']] as const).map(
          ([v, t]) => (
            <button key={v} type="button" onClick={() => setVista(v)}
              className={`min-h-[44px] rounded border text-[12px] font-semibold ${
                vista === v ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400' : 'border-marino-700 text-humo'
              }`}>
              {t}
            </button>
          ),
        )}
      </div>

      {(vista === 'horario' || vista === 'gym') && (
        <div className="grid grid-cols-7 gap-1">
          {NOMBRES.map((n, i) => (
            <button key={n} type="button" onClick={() => setDia(i + 1)}
              className={`min-h-[44px] rounded border text-[11px] font-bold ${
                dia === i + 1 ? 'border-dorado-600 bg-dorado-600/15 text-dorado-400' : 'border-marino-700 text-humo'
              }`}>
              {n.slice(0, 2)}
            </button>
          ))}
        </div>
      )}

      {vista === 'horario' && (
        <section className="tarjeta">
          <span className="rotulo">{NOMBRES[dia - 1]}</span>
          <ul className="mt-2 divide-y divide-marino-800">
            {bloques.map((b) => (
              <li key={b.id} className="flex gap-3 py-2.5">
                <span className="cifra w-12 shrink-0 text-sm text-dorado-400">{b.hora}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{b.actividad}</span>
                  {b.detalle && <span className="block text-[11px] text-humo">{b.detalle}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vista === 'gym' && (
        <section className="tarjeta">
          <span className="rotulo">
            {dia <= 4 ? TITULOS_SPLIT[dia as 1 | 2 | 3 | 4] : PLAN_SIN_PESAS[dia as 5 | 6 | 7]}
          </span>
          {dia > 4 && (
            <p className="mt-2 text-[12px] text-humo">
              Sin pesas por diseño. Toca Lu-Ju para ver el split.
            </p>
          )}
          <ul className="mt-2 divide-y divide-marino-800">
            {(dia <= 4 ? ejercicios : []).map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`text-sm ${e.esAncla ? 'font-bold text-dorado-400' : ''}`}>
                    {e.esAncla && '★ '}
                    {e.nombre}
                  </span>
                  <span className="cifra shrink-0 text-[12px] text-humo">
                    {e.seriesPlan ? `${e.seriesPlan}×${e.repsPlan}` : e.repsPlan}
                    {e.rpePlan ? ` · RPE ${e.rpePlan}` : ''}
                  </span>
                </div>
                {e.restriccion && <p className="mt-0.5 text-[11px] text-rojo">{e.restriccion}</p>}
                {e.notaTecnica && <p className="mt-0.5 text-[11px] text-humo">{e.notaTecnica}</p>}
              </li>
            ))}
          </ul>
          <div className="mt-4 rounded border border-rojo/50 bg-rojo/10 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-rojo">Bloqueo por restricción médica</p>
            <p className="mt-1 text-[11px] text-humo">
              Hernias discales y meniscos deteriorados. Estos movimientos no entran nunca:
            </p>
            <ul className="mt-2 space-y-1.5">
              {PROHIBIDOS.map((p) => (
                <li key={p.patron} className="text-[11px]">
                  <span className="font-semibold">{p.nombre}</span>
                  <span className="block text-humo">{p.motivo} → {p.alternativa}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {vista === 'alimentos' && (
        <section className="tarjeta">
          <span className="rotulo">Tabla de alimentos — por 100 g</span>
          <p className="mt-1 text-[11px] text-dorado-400">
            La carne y el pescado se pesan CRUDOS. El arroz, la pasta y la avena, SECOS.
          </p>
          <ul className="mt-2 divide-y divide-marino-800">
            {alimentos.map((a) => (
              <li key={a.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm">
                    {a.favorito && <span className="text-dorado-400">★ </span>}
                    {a.nombre}
                  </span>
                  <span className="cifra shrink-0 text-[12px] text-humo">
                    {a.kcal100g} kcal · {a.prot100g} P
                  </span>
                </div>
                <p className="text-[11px] text-humo">
                  {a.medidaComun} = {a.gramosPorMedida} g
                  {avisoDePesaje(a) ? ` · ${avisoDePesaje(a)}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {vista === 'liturgico' && (
        <section className="tarjeta">
          <span className="rotulo">Calendario litúrgico</span>
          <ul className="mt-2 divide-y divide-marino-800">
            {liturgico.map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold">{e.frecuencia}</span>
                  <span className="cifra shrink-0 text-[12px] text-dorado-400">{e.diaHora}</span>
                </div>
                <p className="text-[11px] text-humo">
                  {e.lugar !== '—' && `${e.lugar} · `}
                  {e.nota}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-marino-800 pt-3">
            <p className="rotulo">Regla de conflicto</p>
            {REGLA_CONFLICTO.map((r) => (
              <p key={r} className="mt-1.5 text-[11px] text-humo">{r}</p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
