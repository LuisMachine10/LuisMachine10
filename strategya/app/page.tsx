import "@/estilos/dashboard.css";
import { Actualizador } from "@/componentes/Actualizador";
import { Bienvenida } from "@/componentes/ayuda/Bienvenida";
import { RENDER } from "@/componentes/dashboard/Widgets";
import { Rejilla } from "@/componentes/dashboard/Rejilla";
import { Encabezado, SECCIONES } from "@/componentes/Encabezado";
import { CintaPrecios } from "@/componentes/mercado";
import { fechaLargaRD } from "@/componentes/terminal/BloqueHoy";
import { leerPreferencia } from "@/lib/dashboard/datos";
import { normalizar, visibles } from "@/lib/dashboard/disposicion";
import { WIDGETS } from "@/lib/dashboard/widgets";
import { estadoTareas } from "@/lib/datos";
import { fechaHoraRD } from "@/lib/formato";

export const dynamic = "force-dynamic";

// Dashboard: la portada que Mena arma a su gusto. Cada widget lee sus propios datos (con su sello);
// solo se piden los widgets visibles. La disposición vive en personal.preferencias («dashboard»).
export default async function Dashboard() {
  const ahora = new Date();
  const [estado, pref] = await Promise.all([estadoTareas().catch(() => null), leerPreferencia("dashboard")]);
  const ultima =
    estado?.tareas
      .map((t) => t.ultima_ok)
      .filter((v): v is string => Boolean(v))
      .sort()
      .at(-1) ?? null;
  const disposicion = normalizar(pref.valor);
  const fichas = new Map(WIDGETS.map((w) => [w.id, w]));
  const nodos: Record<string, React.ReactNode> = {};
  for (const w of visibles(disposicion)) {
    const ficha = fichas.get(w.id);
    const Render = RENDER[w.id];
    if (ficha && Render) nodos[w.id] = <Render ficha={ficha} tamano={w.tamano} ahora={ahora} />;
  }
  const s = SECCIONES.find((x) => x.clave === "dashboard")!;
  const dia = fechaLargaRD(ahora);

  return (
    <>
      <Encabezado actual="dashboard" ultimaActualizacion={ultima} />
      <main className="dash">
        <div className="dash-cinta">
          <CintaPrecios />
        </div>
        <Rejilla
          inicial={disposicion}
          fichas={[...WIDGETS]}
          nodos={nodos}
          aviso={pref.error}
          intro={
            <header className="dash-intro">
              <p className="dash-dia">{dia.charAt(0).toUpperCase() + dia.slice(1)}</p>
              <h1>{s.nombre}</h1>
              <p>
                {s.para} Muévelo a tu gusto con <strong>Editar mi dashboard</strong>.
              </p>
            </header>
          }
        />
      </main>
      <footer className="pie dash-pie">
        <p>
          Strategya no es asesoría de inversión. Cada cifra viene de una fuente oficial con su enlace y su fecha; ninguna sale de un modelo de
          lenguaje. Página generada {fechaHoraRD(ahora.toISOString())} (hora RD).
        </p>
      </footer>
      <Actualizador />
      <Bienvenida />
    </>
  );
}
