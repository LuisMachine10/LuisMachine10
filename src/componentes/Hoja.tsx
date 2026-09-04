import type { ReactNode } from 'react'

interface Props {
  abierta: boolean
  titulo: string
  onCerrar: () => void
  children: ReactNode
}

/** Hoja inferior: todo queda al alcance del pulgar. */
export function Hoja({ abierta, titulo, onCerrar, children }: Props) {
  if (!abierta) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" aria-label="Cerrar" className="absolute inset-0 bg-black/60" onClick={onCerrar} />
      <div className="relative max-h-[85vh] w-full overflow-y-auto rounded-t-2xl border-t border-marino-700 bg-marino-950 p-4 pb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg text-pergamino">{titulo}</h2>
          <button type="button" className="boton px-3" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
