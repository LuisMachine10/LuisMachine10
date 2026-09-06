import { useState } from 'react'
import { Ajustes } from './pantallas/Ajustes'
import { Comer } from './pantallas/Comer'
import { Entrenar } from './pantallas/Entrenar'
import { Hoy } from './pantallas/Hoy'
import { PesoPantalla } from './pantallas/PesoPantalla'
import { Plan } from './pantallas/Plan'
import { Progreso } from './pantallas/Progreso'

export type Pantalla = 'hoy' | 'comer' | 'entrenar' | 'progreso' | 'plan' | 'peso' | 'ajustes'

const PESTANAS: { clave: Pantalla; etiqueta: string }[] = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'comer', etiqueta: 'Comer' },
  { clave: 'entrenar', etiqueta: 'Entrenar' },
  { clave: 'progreso', etiqueta: 'Progreso' },
  { clave: 'plan', etiqueta: 'Plan' },
]

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('hoy')

  return (
    <div className="mx-auto min-h-full max-w-md">
      <main className="px-4 pt-4">
        {pantalla === 'hoy' && <Hoy onIr={setPantalla} />}
        {pantalla === 'comer' && <Comer />}
        {pantalla === 'entrenar' && <Entrenar />}
        {pantalla === 'progreso' && <Progreso onIr={setPantalla} />}
        {pantalla === 'plan' && <Plan onIr={setPantalla} />}
        {pantalla === 'peso' && <PesoPantalla onVolver={() => setPantalla('progreso')} />}
        {pantalla === 'ajustes' && <Ajustes onVolver={() => setPantalla('hoy')} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-marino-800 bg-marino-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {PESTANAS.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setPantalla(p.clave)}
              className={`min-h-[56px] pb-[env(safe-area-inset-bottom)] text-[11px] font-semibold tracking-tight transition ${
                pantalla === p.clave ? 'text-dorado-400' : 'text-humo'
              }`}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
