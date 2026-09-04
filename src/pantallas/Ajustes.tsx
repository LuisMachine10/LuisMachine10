import { useRef, useState } from 'react'
import { db, exportarRespaldo, importarRespaldo } from '../datos/db'
import { usarPerfil } from '../datos/hooks'
import { calcularMetas, trazabilidadMetas } from '../dominio/metas'
import type { Perfil } from '../dominio/tipos'

interface CampoDef {
  clave: keyof Perfil
  etiqueta: string
  unidad: string
  paso: number
  factor?: number
  nota?: string
}

const CAMPOS: CampoDef[] = [
  { clave: 'pesoLb', etiqueta: 'Peso', unidad: 'lb', paso: 0.1 },
  { clave: 'estaturaCm', etiqueta: 'Estatura', unidad: 'cm', paso: 1 },
  { clave: 'edad', etiqueta: 'Edad', unidad: 'años', paso: 1 },
  { clave: 'pctGrasaEstimado', etiqueta: '% grasa', unidad: '%', paso: 0.1, factor: 100 },
  { clave: 'factorActividad', etiqueta: 'Factor de actividad', unidad: '×', paso: 0.05,
    nota: 'Si bajas más de 1 kg/semana dos semanas seguidas, súbelo a 1.65.' },
  { clave: 'deficitEntreno', etiqueta: 'Déficit día entreno', unidad: 'kcal', paso: 25 },
  { clave: 'deficitLigero', etiqueta: 'Déficit día ligero', unidad: 'kcal', paso: 25 },
  { clave: 'aguaMetaL', etiqueta: 'Meta de agua', unidad: 'L', paso: 0.5 },
  { clave: 'estudioMetaMin', etiqueta: 'Meta de estudio', unidad: 'min', paso: 15 },
  { clave: 'suenoMetaH', etiqueta: 'Meta de sueño', unidad: 'h', paso: 0.5 },
  { clave: 'toleranciaKcal', etiqueta: 'Tolerancia de calorías', unidad: '± kcal', paso: 25 },
  { clave: 'techoKcalAyuno', etiqueta: 'Techo del día de ayuno', unidad: 'kcal', paso: 50,
    nota: 'Con 200 kcal, la cena de ruptura del propio menú (≈717 kcal) hace fallar proteína y calorías del viernes.' },
]

export function Ajustes() {
  const perfil = usarPerfil()
  const metas = calcularMetas(perfil)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const archivo = useRef<HTMLInputElement>(null)

  function actualizar(clave: keyof Perfil, texto: string, factor = 1) {
    const n = Number(texto)
    if (texto === '' || Number.isNaN(n)) return
    db.perfil.put({ ...perfil, [clave]: n / factor })
  }

  async function exportar() {
    const datos = await exportarRespaldo()
    const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `sistema-mena-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setMensaje(`Respaldo con ${datos.registros.length} días y ${datos.pesos.length} pesajes.`)
  }

  async function importar(f: File) {
    try {
      const r = await importarRespaldo(JSON.parse(await f.text()))
      setMensaje(`Importados ${r.registros} días y ${r.pesos} pesajes.`)
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
    }
  }

  return (
    <div className="space-y-4 pb-28">
      <header>
        <h1 className="font-serif text-xl">Ajustes</h1>
        <p className="text-[12px] text-humo">Las celdas azules de la hoja NUTRICION. Todo lo demás se calcula.</p>
      </header>

      <section className="tarjeta space-y-3">
        <span className="rotulo">Datos del panel</span>
        {CAMPOS.map((c) => (
          <label key={c.clave} className="block">
            <span className="flex items-baseline justify-between">
              <span className="text-sm">{c.etiqueta}</span>
              <span className="text-[11px] text-humo">{c.unidad}</span>
            </span>
            <input
              className="campo mt-1"
              type="number"
              inputMode="decimal"
              step={c.paso}
              defaultValue={(perfil[c.clave] as number) * (c.factor ?? 1)}
              onBlur={(e) => actualizar(c.clave, e.target.value, c.factor ?? 1)}
            />
            {c.nota && <span className="mt-1 block text-[11px] text-humo">{c.nota}</span>}
          </label>
        ))}
      </section>

      <section className="tarjeta">
        <span className="rotulo">Metas que salen de ahí</span>
        <ul className="mt-2 divide-y divide-marino-800">
          {trazabilidadMetas(perfil).map((t) => (
            <li key={t.paso} className="py-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm">{t.paso}</span>
                <span className="cifra shrink-0 text-sm text-dorado-400">{t.valor}</span>
              </div>
              <p className="cifra text-[11px] text-humo">{t.formula}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-humo">
          Ingesta semanal: {(metas.kcalEntreno * 4 + metas.kcalLigero * 2).toLocaleString('es-DO')} kcal ·
          déficit promedio {Math.round(metas.tdee - (metas.kcalEntreno * 4 + metas.kcalLigero * 2) / 7).toLocaleString('es-DO')} kcal/día
        </p>
      </section>

      <section className="tarjeta space-y-2">
        <span className="rotulo">Respaldo</span>
        <p className="text-[11px] text-humo">
          Todo vive en este teléfono. Sin backend en la Fase 1: el respaldo es tu única copia.
        </p>
        <button type="button" className="boton w-full" onClick={exportar}>
          Exportar a JSON
        </button>
        <button type="button" className="boton w-full" onClick={() => archivo.current?.click()}>
          Importar respaldo
        </button>
        <input
          ref={archivo} type="file" accept="application/json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importar(f); e.target.value = '' }}
        />
        {mensaje && <p className="text-[12px] text-dorado-400">{mensaje}</p>}
      </section>

      <section className="tarjeta">
        <span className="rotulo">Nota médica</span>
        <p className="mt-1.5 text-[12px] text-humo">
          El CoQ10 no baja el LDL: sirve para los síntomas musculares de la estatina, no la sustituye. Haz el perfil
          lipídico + ALT/AST antes de cambiar nada, y avísale al médico que la prescribió. El seguimiento de la
          analítica entra en la Fase 4.
        </p>
      </section>
    </div>
  )
}
