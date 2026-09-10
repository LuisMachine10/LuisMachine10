import { useEffect, useState } from 'react'
import { Ajustes } from './pantallas/Ajustes'
import { Briefing } from './pantallas/Briefing'
import { Capital } from './pantallas/Capital'
import { Comer } from './pantallas/Comer'
import { Entrenar } from './pantallas/Entrenar'
import { Hoy } from './pantallas/Hoy'
import { Inicio } from './pantallas/Inicio'
import { Logros } from './pantallas/Logros'
import { Metas } from './pantallas/Metas'
import { PesoPantalla } from './pantallas/PesoPantalla'
import { Plan } from './pantallas/Plan'
import { Progreso } from './pantallas/Progreso'
import { usarPerfil } from './datos/hooks'
import { cerrarMetasCumplidas } from './datos/metas'
import { perfilUsable } from './dominio/perfil'

export type Pantalla =
  | 'hoy' | 'comer' | 'entrenar' | 'metas' | 'progreso'
  | 'plan' | 'peso' | 'ajustes' | 'logros' | 'capital' | 'briefing'

const PESTANAS: { clave: Pantalla; etiqueta: string }[] = [
  { clave: 'hoy', etiqueta: 'Hoy' },
  { clave: 'briefing', etiqueta: 'Briefing' },
  { clave: 'comer', etiqueta: 'Comer' },
  { clave: 'entrenar', etiqueta: 'Entrenar' },
  { clave: 'metas', etiqueta: 'Metas' },
  { clave: 'progreso', etiqueta: 'Progreso' },
  { clave: 'capital', etiqueta: 'Capital' },
  { clave: 'plan', etiqueta: 'Plan' },
]

export default function App() {
  const [pantalla, setPantalla] = useState<Pantalla>('hoy')
  const perfil = usarPerfil()

  // Las metas cumplidas se cierran solas: no dependen de que te acuerdes.
  useEffect(() => {
    cerrarMetasCumplidas().catch(() => {})
  }, [pantalla])

  // Sin tu información no hay nada que calcular. La app pide, no supone.
  if (!perfil.completado || !perfilUsable(perfil)) {
    return (
      <div className="mx-auto min-h-full max-w-md px-4 pt-6">
        <Inicio onListo={() => setPantalla('metas')} />
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-full max-w-md">
      <main className="px-4 pt-4">
        {pantalla === 'hoy' && <Hoy onIr={setPantalla} />}
        {pantalla === 'comer' && <Comer />}
        {pantalla === 'entrenar' && <Entrenar />}
        {pantalla === 'metas' && <Metas onIr={setPantalla} />}
        {pantalla === 'logros' && <Logros onVolver={() => setPantalla('metas')} />}
        {pantalla === 'progreso' && <Progreso onIr={setPantalla} />}
        {pantalla === 'capital' && <Capital />}
        {pantalla === 'briefing' && <Briefing />}
        {pantalla === 'plan' && <Plan onIr={setPantalla} />}
        {pantalla === 'peso' && <PesoPantalla onVolver={() => setPantalla('progreso')} />}
        {pantalla === 'ajustes' && <Ajustes onVolver={() => setPantalla('hoy')} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-marino-800 bg-marino-950/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-8">
          {PESTANAS.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => setPantalla(p.clave)}
              className={`min-h-[56px] pb-[env(safe-area-inset-bottom)] text-[10px] font-semibold tracking-tight transition ${
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
