import { useState } from 'react'
import { db } from '../datos/db'
import { usarPerfil } from '../datos/hooks'
import { guardarCondicion } from '../datos/metas'
import { CONDICIONES_SUGERIDAS } from '../datos/seed/sugerencias'
import { hoyISO } from '../dominio/dias'
import { PERFIL_SUGERIDO } from '../dominio/metas'
import { camposFaltantes, edadDe } from '../dominio/perfil'
import type { Perfil } from '../dominio/tipos'

interface Props {
  onListo: () => void
}

type Paso = 1 | 2 | 3

/**
 * Empezar de cero. Nada se da por sabido: los valores del Excel aparecen
 * como sugerencia con su origen, y no se guardan hasta que los confirmas.
 */
export function Inicio({ onListo }: Props) {
  const perfil = usarPerfil()
  const [paso, setPaso] = useState<Paso>(1)
  const [borrador, setBorrador] = useState<Perfil | null>(null)
  const [condiciones, setCondiciones] = useState<Set<number>>(new Set())

  const p = borrador ?? perfil
  const set = (parche: Partial<Perfil>) => setBorrador({ ...p, ...parche })
  const faltan = camposFaltantes(p)

  function usarSugerencia() {
    setBorrador({
      ...p,
      edad: PERFIL_SUGERIDO.edad,
      ciudad: PERFIL_SUGERIDO.ciudad,
      ocupacion: PERFIL_SUGERIDO.ocupacion,
      pesoLb: PERFIL_SUGERIDO.pesoLb,
      estaturaCm: PERFIL_SUGERIDO.estaturaCm,
      pctGrasaEstimado: PERFIL_SUGERIDO.pctGrasaEstimado,
    })
  }

  async function terminar() {
    await db.perfil.put({ ...p, completado: true, creadoEn: p.creadoEn || Date.now() })
    for (const i of condiciones) {
      const c = CONDICIONES_SUGERIDAS[i]
      await guardarCondicion({ nombre: c.nombre, detalle: c.detalle, activa: true, desde: null })
    }
    onListo()
  }

  const campo = (
    etiqueta: string, valor: string | number, unidad: string,
    onCambio: (v: string) => void, tipo = 'text', paso_ = 1,
  ) => (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-sm">{etiqueta}</span>
        <span className="text-[11px] text-humo">{unidad}</span>
      </span>
      <input
        className={`campo mt-1 ${tipo === 'text' ? 'font-sans text-base' : ''}`}
        type={tipo} step={paso_} inputMode={tipo === 'number' ? 'decimal' : undefined}
        value={valor === 0 && tipo === 'number' ? '' : valor}
        onChange={(e) => onCambio(e.target.value)}
      />
    </label>
  )

  return (
    <div className="space-y-4 pb-28">
      <header>
        <h1 className="font-serif text-2xl">Sistema Mena</h1>
        <p className="mt-1 text-[13px] text-humo">
          Antes de medir nada, la app necesita saber de quién está hablando.
          Nada de esto viene puesto: lo llenas tú.
        </p>
      </header>

      <div className="flex gap-1.5">
        {([1, 2, 3] as Paso[]).map((n) => (
          <div key={n} className={`h-1 flex-1 rounded-full ${n <= paso ? 'bg-dorado-600' : 'bg-marino-800'}`} />
        ))}
      </div>
      <p className="rotulo">
        Paso {paso} de 3 · {paso === 1 ? 'Quién eres' : paso === 2 ? 'Tu cuerpo hoy' : 'Tu salud'}
      </p>

      {paso === 1 && (
        <section className="tarjeta space-y-3">
          {campo('Nombre', p.nombre, '', (v) => set({ nombre: v }))}
          <label className="block">
            <span className="flex items-baseline justify-between">
              <span className="text-sm">Fecha de nacimiento</span>
              <span className="text-[11px] text-humo">
                {p.fechaNacimiento ? `${edadDe(p)} años` : 'la edad se calcula sola'}
              </span>
            </span>
            <input
              className="campo mt-1" type="date" max={hoyISO()}
              value={p.fechaNacimiento ?? ''}
              onChange={(e) => set({ fechaNacimiento: e.target.value || null })}
            />
          </label>
          {campo('Ciudad', p.ciudad, '', (v) => set({ ciudad: v }))}
          {campo('A qué te dedicas', p.ocupacion, '', (v) => set({ ocupacion: v }))}
        </section>
      )}

      {paso === 2 && (
        <>
          <section className="tarjeta space-y-3">
            {campo('Peso', p.pesoLb || '', 'lb', (v) => set({ pesoLb: Number(v) || 0 }), 'number', 0.1)}
            {campo('Estatura', p.estaturaCm || '', 'cm', (v) => set({ estaturaCm: Number(v) || 0 }), 'number', 1)}
            {campo(
              '% de grasa corporal', p.pctGrasaEstimado ? p.pctGrasaEstimado * 100 : '', '%',
              (v) => set({ pctGrasaEstimado: Number(v) / 100 || 0 }), 'number', 0.1,
            )}
            <p className="text-[11px] text-humo">
              El % de grasa puede ser una estimación. Determina la meta de proteína, así que conviene
              medirlo bien en cuanto puedas.
            </p>
          </section>
          <button type="button" className="boton w-full" onClick={usarSugerencia}>
            Usar los datos de mi Excel de septiembre 2026
          </button>
          <p className="text-center text-[11px] text-humo">
            220 lb · 180 cm · 21% · 22 años. Confírmalos o córrigelos: pueden estar viejos.
          </p>
        </>
      )}

      {paso === 3 && (
        <section className="tarjeta">
          <span className="rotulo">Condiciones de salud</span>
          <p className="mt-1 text-[12px] text-humo">
            De aquí salen los bloqueos de movimiento del gimnasio. Marca las que apliquen;
            puedes agregar y quitar después.
          </p>
          <ul className="mt-3 space-y-2">
            {CONDICIONES_SUGERIDAS.map((c, i) => (
              <li key={c.nombre}>
                <button
                  type="button"
                  onClick={() => {
                    const s = new Set(condiciones)
                    s.has(i) ? s.delete(i) : s.add(i)
                    setCondiciones(s)
                  }}
                  className={`w-full rounded border p-3 text-left transition ${
                    condiciones.has(i) ? 'border-dorado-600 bg-dorado-600/15' : 'border-marino-800'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{c.nombre}</span>
                    <span className="shrink-0 text-[11px] text-dorado-400">
                      {condiciones.has(i) ? 'la tengo' : 'tocar'}
                    </span>
                  </span>
                  <span className="mt-1 block text-[11px] text-humo">{c.detalle}</span>
                  <span className="mt-1 block text-[11px] text-marino-600">{c.porque}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {faltan.length > 0 && paso === 3 && (
        <p className="rounded border border-marino-700 px-3 py-2 text-[12px] text-humo">
          Todavía falta: {faltan.map((f) => f.etiqueta).join(', ')}. Sin eso no se puede calcular
          ninguna meta.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button" className="boton disabled:opacity-30" disabled={paso === 1}
          onClick={() => setPaso((paso - 1) as Paso)}
        >
          Atrás
        </button>
        {paso < 3 ? (
          <button type="button" className="boton-dorado" onClick={() => setPaso((paso + 1) as Paso)}>
            Seguir
          </button>
        ) : (
          <button
            type="button" className="boton-dorado disabled:opacity-40"
            disabled={faltan.length > 0} onClick={terminar}
          >
            Guardar y seguir
          </button>
        )}
      </div>
    </div>
  )
}
