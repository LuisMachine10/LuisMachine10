// Ajustes del Portafolio: límites de la matriz de riesgo (con los de fábrica), tipo de cambio manual,
// volver a revisar «Unir cuentas repetidas» y tus datos (descargar / importar).

import Link from "next/link";
import { decidirUnion, guardarParametros } from "@/app/capital/acciones";
import { aPct } from "@/lib/capital/formulario";
import { umbralesPorDefecto } from "@/lib/capital/tipos";
import type { DatosCapital } from "@/lib/datos-capital";
import { Panel } from "./Piezas";

type Props = { datos: DatosCapital; mes: string };

function Comun({ seccion, mes }: { seccion: string; mes: string }) {
  return (
    <>
      <input type="hidden" name="seccion" value={seccion} />
      <input type="hidden" name="volver" value="/capital/ajustes" />
      <input type="hidden" name="mes" value={mes} />
    </>
  );
}

export function VistaAjustes({ datos, mes }: Props) {
  const { p } = datos.ctx;
  const u = p.umbrales;
  const f = umbralesPorDefecto();
  const campos: { k: keyof typeof u; nom: string; ayuda: string; pct: boolean }[] = [
    { k: "colchonMeses", nom: "Colchón mínimo (meses de gastos)", ayuda: `De fábrica: ${f.colchonMeses}`, pct: false },
    { k: "maxInstrumento", nom: "Máximo en un solo instrumento %", ayuda: `De fábrica: ${aPct(f.maxInstrumento)}`, pct: true },
    { k: "maxEmisor", nom: "Máximo en una sola SAFI o emisor %", ayuda: `De fábrica: ${aPct(f.maxEmisor)}`, pct: true },
    { k: "dolarMin", nom: "Dólares: mínimo % del patrimonio", ayuda: `De fábrica: ${aPct(f.dolarMin)}`, pct: true },
    { k: "dolarMax", nom: "Dólares: máximo % del patrimonio", ayuda: `De fábrica: ${aPct(f.dolarMax)}`, pct: true },
    { k: "sobreGasto", nom: "Gastar más de lo presupuestado: alto desde %", ayuda: `De fábrica: ${aPct(f.sobreGasto)}`, pct: true },
    { k: "deudaTarjetas", nom: "Deuda de tarjetas: alto desde % del ingreso mensual", ayuda: `De fábrica: ${aPct(f.deudaTarjetas)}`, pct: true },
  ];
  return (
    <>
      <Panel titulo="Límites de tus riesgos" id="cap-t-umbrales" ancho extra={<span className="tenue chico">los usa la matriz de Riesgos</span>}>
        <form action={guardarParametros} className="cap-form" key={JSON.stringify(u)}>
          <Comun seccion="umbrales" mes={mes} />
          <div className="reg-campos">
            {campos.map((c) => (
              <label className="cap-campo" key={c.k}>
                {c.nom}
                <input name={`u.${c.k}`} inputMode="decimal" defaultValue={c.pct ? aPct(u[c.k]) : u[c.k]} placeholder={`Ej.: ${c.pct ? aPct(f[c.k]) : f[c.k]}`} />
                <span className="ayuda">{c.ayuda}</span>
              </label>
            ))}
          </div>
          <details className="cap-mas">
            <summary>¿Qué es esto?</summary>
            <p className="cap-nota">
              Son las rayas que separan «bajo», «medio» y «alto» en tu matriz de riesgos. Por ejemplo, con un colchón mínimo de 6 meses, tener 4 meses de gastos guardados se marca
              como riesgo. Son tus reglas, no una recomendación.
            </p>
          </details>
          <div className="cap-botones">
            <button className="boton boton-grande" type="submit">
              Guardar límites
            </button>
          </div>
        </form>
      </Panel>

      <Panel titulo="Tipo de cambio manual" id="cap-t-fx-manual">
        <form action={guardarParametros} className="cap-form" key={JSON.stringify([p.fx, p.fxUpdated])}>
          <Comun seccion="fx" mes={mes} />
          <p className="tenue chico" style={{ margin: 0 }}>
            Para US$ se usa el dólar de venta del BCRD cuando está guardado; este queda de respaldo. Para € siempre se usa este.
          </p>
          <div className="cap-campos">
            <label className="cap-campo">
              US$ → RD$
              <input name="fx.USD" defaultValue={p.fx.USD ?? ""} inputMode="decimal" placeholder="Ej.: 60.25" />
            </label>
            <label className="cap-campo">
              € → RD$
              <input name="fx.EUR" defaultValue={p.fx.EUR ?? ""} inputMode="decimal" placeholder="Ej.: 66.10" />
            </label>
            <label className="cap-campo">
              Actualizado el
              <input type="date" name="fxUpdated" defaultValue={p.fxUpdated ?? ""} />
            </label>
          </div>
          <div className="cap-botones">
            <button className="boton secundario" type="submit">
              Guardar tipo de cambio
            </button>
          </div>
        </form>
      </Panel>

      <Panel titulo="Tus datos" id="cap-t-datos">
        <ul className="reg-enlaces">
          <li>
            <a href="/capital/exportar" download>
              Descargar una copia de tus datos (JSON)
            </a>
          </li>
          <li>
            <Link href={`/capital/importar?mes=${mes}`}>Importar el archivo de tu artefacto</Link>
          </li>
          <li>
            <form action={decidirUnion}>
              <input type="hidden" name="revisado" value="no" />
              <input type="hidden" name="mes" value={mes} />
              <button type="submit" className="boton secundario chico">
                Volver a revisar cuentas repetidas
              </button>
            </form>
          </li>
        </ul>
      </Panel>
    </>
  );
}
