import { useState } from 'react'
import { Ajustes } from './pantallas/Ajustes'
import { Hoy } from './pantallas/Hoy'
import { PesoPantalla } from './pantallas/PesoPantalla'
import { Plan } from './pantallas/Plan'

type Pestana = 'hoy' | 'peso' | 'plan' | 'ajustes'

const PESTANAS: { clave: Pestana; etiqueta: string }[] = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'peso', etiqueta: 'Peso' },
  { clave: 'plan', etiqueta: 'Plan' },
  { clave: 'ajustes', etiqueta: 'Ajustes' },
]

export default function App() {
  const [pestana, setPestana] = useState<Pestana>('hoy')

  return (
    <div className="mx-auto min-h-full max-w-md">
      <main className="px-4 pt-4">
        {pestana === 'hoy' && <Hoy />}
        {pestana === 'peso' && <PesoPantalla />}
        {pestana === 'plan' && <Plan />}
        {pestana === 'ajustes' && <Ajustes />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-marino-800 bg-marino-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-4">
          {PESTANAS.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setPestana(p.clave)}
              className={`min-h-[56px] pb-[env(safe-area-inset-bottom)] text-[12px] font-semibold tracking-wide transition ${
                pestana === p.clave ? 'text-dorado-400' : 'text-humo'
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
