// Vista de la política de inversión (IPS): 8 secciones que escribe Mena. Sin texto sugerido:
// la política es suya, la pantalla solo la guarda y marca cuándo la revisó.

import { guardarIps } from "@/app/capital/acciones";
import { SECCIONES_IPS, ipsVacia } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { fechaCorta } from "@/lib/formato";
import { Panel } from "./Piezas";

export function VistaIps({ datos, mes }: { datos: DatosCapital; mes: string }) {
  const ips = datos.ips ?? ipsVacia();
  const vacia = SECCIONES_IPS.every(([k]) => !ips[k]);
  return (
    <Panel
      titulo="Política de inversión (IPS)"
      id="cap-t-ips"
      ancho
      extra={
        <span className={`etiqueta ${ips.editadoPor === "mena" ? "ok" : "alerta"}`}>
          {ips.editadoPor === "mena" ? `✓ revisada${ips.revisadoEl ? ` el ${fechaCorta(ips.revisadoEl)}` : ""}` : "! borrador"}
        </span>
      }
    >
      <p className="cap-nota" style={{ marginTop: 0 }}>
        Sin política escrita, el rebalanceo es aritmética sin criterio. Esto decide qué haces cuando el mercado se mueve, decidido antes de que se
        mueva. {vacia ? "Todavía está vacía: escríbela o impórtala." : ""}
      </p>
      <form action={guardarIps} className="cap-form" key={JSON.stringify(ips)} style={{ marginTop: 10 }}>
        <input type="hidden" name="mes" value={mes} />
        <input type="hidden" name="editadoPor" value={ips.editadoPor} />
        <input type="hidden" name="revisadoEl" value={ips.revisadoEl ?? ""} />
        {SECCIONES_IPS.map(([k, l]) => (
          <label className="cap-campo" key={k}>
            <span className="cap-rotulo">{l}</span>
            <textarea name={k} defaultValue={ips[k]} rows={3} maxLength={5000} />
          </label>
        ))}
        <div className="cap-botones">
          <button className="cap-boton" type="submit" name="modo" value="guardar">
            Guardar
          </button>
          <button className="cap-boton primario" type="submit" name="modo" value="revisada">
            Guardar y marcar como revisada
          </button>
        </div>
      </form>
    </Panel>
  );
}
