// «Mi lista»: las acciones y ETF de EE. UU. que Mena sigue, con precio, cambio del día, rango y sello.
import { agregarEjemplo, moverEnLista, quitarDeLista } from "@/app/mercado/acciones";
import { PanelError } from "@/componentes/PanelError";
import { datosMiLista } from "@/lib/datos-mercado";
import { armarLista, contextoLista, MAXIMO_LISTA, ultimaPorSimbolo } from "@/lib/mercado-vista";
import { FormularioLista } from "./FormularioLista";
import { Icono, ICONO, MontoConSigno, PastillaCambio, QueEs, RangoDia, SelloCotizacion } from "./piezas-lista";
import { vistaMercado } from "./vista";

const EJEMPLOS = [
  { simbolo: "AAPL", que: "Apple" },
  { simbolo: "MSFT", que: "Microsoft" },
  { simbolo: "NVDA", que: "Nvidia" },
  { simbolo: "VOO", que: "ETF del S&P 500" },
];

export const CUANDO_LLEGA =
  "Cada 5 minutos con la bolsa de EE. UU. abierta (9:30 a. m. a 4:00 p. m. de Nueva York) y una vez tras el cierre.";

export async function PanelMiLista() {
  let v: Awaited<ReturnType<typeof vistaMercado>>;
  let d: Awaited<ReturnType<typeof datosMiLista>>;
  try {
    [v, d] = await Promise.all([vistaMercado(), datosMiLista()]);
  } catch (e) {
    return <PanelError titulo="Mi lista" mensaje={(e as Error).message} />;
  }
  const filas = armarLista(d.lista, ultimaPorSimbolo(d.cotizaciones), d.marcas, contextoLista(v.ctx, d.tarea?.estado));
  const lleno = filas.length >= MAXIMO_LISTA;
  const fallo = d.tarea?.estado === "error" ? d.tarea.error : null;

  return (
    <section className="panel panel-ancho ml-panel" aria-labelledby="t-mi-lista" id="mi-lista">
      <div className="panel-cabecera ml-cabecera">
        <div className="ml-cabecera-texto">
          <h2 className="panel-titulo" id="t-mi-lista">
            Mi lista
            {filas.length ? <span className="ml-cuenta">{filas.length}</span> : null}
          </h2>
          <p className="ml-para">Las acciones que quieres seguir de cerca: precio, cuánto se movieron hoy y entre qué precios.</p>
        </div>
        <span className="ml-fuente-cab">
          Cboe · diferido 15 min
          <QueEs tema="diferido 15 min">
            <p>
              Cboe, una de las bolsas de EE. UU., publica gratis el precio con 15 minutos de retraso. Sirve para seguir el
              día; para comprar o vender, mira el precio en tu corredor.
            </p>
          </QueEs>
        </span>
      </div>
      <div className="panel-cuerpo">
        <FormularioLista lleno={lleno} />

        {filas.length === 0 ? (
          <div className="ml-vacio">
            <span className="ml-vacio-icono" aria-hidden="true">
              <Icono d={ICONO.lista} tam={22} />
            </span>
            <div className="ml-vacio-texto">
              <h3>Tu lista está vacía</h3>
              <p>
                Escribe arriba el símbolo de una acción o ETF (el código corto con que se negocia en la bolsa) y verás aquí su
                precio y cómo va en el día. Prueba con uno de estos:
              </p>
              <ul className="ml-ejemplos" aria-label="Ejemplos para agregar con un toque">
                {EJEMPLOS.map((e) => (
                  <li key={e.simbolo}>
                    <form action={agregarEjemplo}>
                      <input type="hidden" name="simbolo" value={e.simbolo} />
                      <button type="submit" className="boton secundario ml-ejemplo" aria-label={`Agregar ${e.simbolo} (${e.que}) a mi lista`}>
                        <strong className="mono">{e.simbolo}</strong>
                        <span className="tenue">{e.que}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <>
            <div className="ml-tabla" role="table" aria-label="Mi lista: precio y cambio del día">
              <div className="ml-fila ml-encabezados" role="row">
                <span role="columnheader">Acción</span>
                <span role="columnheader" className="ml-der">
                  Precio US$
                </span>
                <span role="columnheader" className="ml-der">
                  Hoy
                </span>
                <span role="columnheader" className="ml-col-rango">
                  Mínimo y máximo de hoy
                </span>
                <span role="columnheader">Dato</span>
                <span role="columnheader" className="sr-solo">
                  Ordenar o quitar
                </span>
              </div>
              {filas.map((f, i) => {
                const c = f.cotizacion;
                return (
                  <div className="ml-fila" role="row" key={f.simbolo}>
                    <span role="cell" className="ml-c-simbolo">
                      <strong className="ml-simbolo">{f.simbolo}</strong>
                      {f.nota ? <span className="ml-nota">{f.nota}</span> : null}
                    </span>
                    {c ? (
                      <>
                        <span role="cell" className="ml-c-precio ml-der">
                          <span className="mono ml-precio">{c.precio}</span>
                        </span>
                        <span role="cell" className="ml-c-cambio ml-der">
                          <PastillaCambio pct={c.cambioPct} dir={c.direccion} />
                          <MontoConSigno monto={c.cambio} dir={c.direccion} />
                        </span>
                        <span role="cell" className="ml-c-rango">
                          <RangoDia c={c} />
                        </span>
                        <span role="cell" className="ml-c-sello">
                          <SelloCotizacion c={c} ahora={v.ahora} />
                        </span>
                      </>
                    ) : (
                      <span role="cell" className="ml-c-espera">
                        {f.sinCotizacion ? (
                          <span className="ml-aviso">
                            <span className="etiqueta alerta">{f.sinCotizacion}</span>
                            <span className="tenue chico">Revisa que el símbolo esté bien escrito; se vuelve a intentar en 24 h.</span>
                          </span>
                        ) : (
                          <span className="ml-aviso">
                            <span className="ml-sin">sin precio todavía</span>
                            <span className="tenue chico" title={CUANDO_LLEGA}>
                              Llega en la próxima lectura (cada 5 min con la bolsa de EE. UU. abierta).
                            </span>
                          </span>
                        )}
                      </span>
                    )}
                    <span role="cell" className="ml-c-acciones">
                      <form action={moverEnLista}>
                        <input type="hidden" name="simbolo" value={f.simbolo} />
                        <input type="hidden" name="hacia" value="arriba" />
                        <button type="submit" className="ml-icono" disabled={i === 0} aria-label={`Subir ${f.simbolo} en la lista`} title="Subir">
                          <Icono d={ICONO.arriba} />
                        </button>
                      </form>
                      <form action={moverEnLista}>
                        <input type="hidden" name="simbolo" value={f.simbolo} />
                        <input type="hidden" name="hacia" value="abajo" />
                        <button
                          type="submit"
                          className="ml-icono"
                          disabled={i === filas.length - 1}
                          aria-label={`Bajar ${f.simbolo} en la lista`}
                          title="Bajar"
                        >
                          <Icono d={ICONO.abajo} />
                        </button>
                      </form>
                      <form action={quitarDeLista}>
                        <input type="hidden" name="simbolo" value={f.simbolo} />
                        <button type="submit" className="ml-icono ml-icono-quitar" aria-label={`Quitar ${f.simbolo} de mi lista`} title="Quitar">
                          <Icono d={ICONO.quitar} />
                        </button>
                      </form>
                    </span>
                  </div>
                );
              })}
            </div>
            {fallo ? <p className="ml-fallo">La última lectura automática falló: {fallo}</p> : null}
            <details className="mv-detalles">
              <summary>¿Cómo leo esta lista?</summary>
              <p>
                <strong>Hoy</strong> es cuánto subió (verde ↑) o bajó (rojo ↓) desde el cierre de ayer, en % y en US$ por acción.
                La barra muestra el precio más bajo y el más alto del día, y el punto dónde está ahora. «Dato viejo» quiere decir
                que la fuente no ha publicado a tiempo. {CUANDO_LLEGA}
              </p>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
