import { useRef, useState } from 'react'
import { INICIO_PLAN, db, exportarRespaldo, importarRespaldo } from '../datos/db'
import { usarAjuste, usarCondiciones, usarPerfil } from '../datos/hooks'
import { borrarCondicion, guardarCondicion } from '../datos/metas'
import { edadDe } from '../dominio/perfil'
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

interface Props {
  onVolver: () => void
}

export function Ajustes({ onVolver }: Props) {
  const perfil = usarPerfil()
  const condiciones = usarCondiciones()
  const ajusteInicio = usarAjuste('inicioPlan')
  const inicio = (ajusteInicio?.valor as string) ?? INICIO_PLAN
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
      <header className="flex items-start justify-between gap-2">
        <div>
          <h1 className="font-serif text-xl">Ajustes</h1>
          <p className="text-[12px] text-humo">Las celdas azules de la hoja NUTRICION. Todo lo demás se calcula.</p>
        </div>
        <button type="button" className="boton px-3" onClick={onVolver}>Volver</button>
      </header>

      <section className="tarjeta space-y-3">
        <span className="rotulo">Tu información</span>
        <label className="block">
          <span className="text-sm">Nombre</span>
          <input className="campo mt-1 font-sans text-base" defaultValue={perfil.nombre}
            onBlur={(e) => db.perfil.put({ ...perfil, nombre: e.target.value })} />
        </label>
        <label className="block">
          <span className="flex items-baseline justify-between">
            <span className="text-sm">Fecha de nacimiento</span>
            <span className="text-[11px] text-humo">
              {perfil.fechaNacimiento ? `${edadDe(perfil)} años` : 'sin fecha'}
            </span>
          </span>
          <input className="campo mt-1" type="date" defaultValue={perfil.fechaNacimiento ?? ''}
            onBlur={(e) => db.perfil.put({ ...perfil, fechaNacimiento: e.target.value || null })} />
        </label>
        <label className="block">
          <span className="text-sm">Ciudad</span>
          <input className="campo mt-1 font-sans text-base" defaultValue={perfil.ciudad}
            onBlur={(e) => db.perfil.put({ ...perfil, ciudad: e.target.value })} />
        </label>
        <label className="block">
          <span className="text-sm">A qué te dedicas</span>
          <input className="campo mt-1 font-sans text-base" defaultValue={perfil.ocupacion}
            onBlur={(e) => db.perfil.put({ ...perfil, ocupacion: e.target.value })} />
        </label>
      </section>

      <section className="tarjeta">
        <span className="rotulo">Condiciones de salud</span>
        <p className="mt-1 text-[11px] text-humo">
          De aquí sale por qué el gimnasio bloquea ciertos movimientos.
        </p>
        <ul className="mt-2 divide-y divide-marino-800">
          {condiciones.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-2 py-2.5">
              <span className="min-w-0">
                <span className="block text-sm">{c.nombre}</span>
                <span className="block text-[11px] text-humo">{c.detalle}</span>
              </span>
              <button type="button" className="shrink-0 text-[11px] text-humo underline"
                onClick={() => borrarCondicion(c.id!)}>
                quitar
              </button>
            </li>
          ))}
          {condiciones.length === 0 && (
            <li className="py-2 text-[12px] text-humo">Ninguna registrada.</li>
          )}
        </ul>
        <input
          className="campo mt-2 font-sans text-sm"
          placeholder="Agregar una condición y presionar Enter"
          onKeyDown={(e) => {
            const v = (e.target as HTMLInputElement).value.trim()
            if (e.key === 'Enter' && v) {
              guardarCondicion({ nombre: v, detalle: '', activa: true, desde: null })
              ;(e.target as HTMLInputElement).value = ''
            }
          }}
        />
      </section>

      <section className="tarjeta">
        <label className="block">
          <span className="rotulo">Primer día del plan de 12 semanas</span>
          <input
            className="campo mt-1.5" type="date" value={inicio}
            onChange={(e) => e.target.value && db.ajustes.put({ clave: 'inicioPlan', valor: e.target.value })}
          />
        </label>
        <p className="mt-1.5 text-[11px] text-humo">
          De aquí sale la semana que la pantalla Entrenar usa para precargar las cargas de PROGRESION.
        </p>
      </section>

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
