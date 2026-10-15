"""Sonda de fuentes de Strategya.

Corre en GitHub Actions (que sí tiene salida a internet) para confirmar, antes de
programar una integración, que el endpoint existe, qué formato devuelve y qué dice
su robots.txt. No guarda nada en la base: imprime en el log y deja copia como artefacto.

Formato de urls.txt (una línea por sonda, # para comentarios):
    robots   <url-base>          imprime el robots.txt del sitio
    fetch    <url> [max_bytes]   verifica robots.txt y, si lo permite, descarga la URL
    fetchb64 <url> [max_bytes]   igual, pero imprime el cuerpo en base64 (archivos binarios como .xlsx)

Solo biblioteca estándar.
"""

from __future__ import annotations

import pathlib
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser

AGENTE = "Strategya-sonda/0.1 (uso personal; verificacion de formato de datos publicos)"
DOMINIOS_PROHIBIDOS = ("calculadora.apislab.bvrd.com.do", "bhdfondos.com.do")
SALIDA = pathlib.Path("salida-sonda")


def descargar(url: str, limite: int) -> tuple[int, str, bytes]:
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(pedido, timeout=30) as resp:
            return resp.status, resp.headers.get("Content-Type", ""), resp.read(limite + 1)
    except urllib.error.HTTPError as err:
        return err.code, err.headers.get("Content-Type", "") if err.headers else "", err.read(4000)


def nombre_archivo(url: str) -> str:
    partes = urllib.parse.urlsplit(url)
    base = (partes.netloc + partes.path + ("_" + partes.query if partes.query else "")).strip("/")
    return "".join(c if c.isalnum() or c in "-_." else "_" for c in base)[:150]


def robots_de(url: str) -> tuple[int, str]:
    partes = urllib.parse.urlsplit(url)
    status, _, cuerpo = descargar(f"{partes.scheme}://{partes.netloc}/robots.txt", 200_000)
    return status, cuerpo.decode("utf-8", errors="replace")


def permitido(url: str, status: int, texto: str) -> bool:
    # RFC 9309: 4xx = sin restricciones; 5xx o error de red = asumir prohibido.
    if 400 <= status < 500:
        return True
    if status >= 500 or status == 0:
        return False
    rp = urllib.robotparser.RobotFileParser()
    rp.parse(texto.splitlines())
    return rp.can_fetch(AGENTE, url)


def main() -> int:
    SALIDA.mkdir(exist_ok=True)
    lineas = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8").splitlines()
    for linea in lineas:
        linea = linea.strip()
        if not linea or linea.startswith("#"):
            continue
        partes = linea.split()
        modo, url = partes[0], partes[1]
        limite = int(partes[2]) if len(partes) > 2 else 300_000
        host = urllib.parse.urlsplit(url).netloc
        if any(host == d or host.endswith("." + d) for d in DOMINIOS_PROHIBIDOS):
            print(f"===== OMITIDA {url}: dominio prohibido por regla de Strategya =====")
            continue
        try:
            status_r, texto_r = robots_de(url)
        except Exception as exc:  # noqa: BLE001 - la sonda informa cualquier fallo
            status_r, texto_r = 0, f"error: {exc}"
        if modo == "robots":
            print(f"===== INICIO robots {host} (HTTP {status_r}) =====")
            print(texto_r[:20_000])
            print(f"===== FIN robots {host} =====")
            continue
        if not permitido(url, status_r, texto_r):
            print(f"===== BLOQUEADA {url}: robots.txt no lo permite (HTTP robots {status_r}) =====")
            continue
        inicio = time.monotonic()
        try:
            status, tipo, cuerpo = descargar(url, limite)
        except Exception as exc:  # noqa: BLE001
            print(f"===== ERROR {url}: {exc} =====")
            continue
        ms = int((time.monotonic() - inicio) * 1000)
        truncado = len(cuerpo) > limite
        cuerpo = cuerpo[:limite]
        (SALIDA / nombre_archivo(url)).write_bytes(cuerpo)
        print(f"===== INICIO fetch {url} =====")
        print(f"HTTP {status} · {tipo} · {len(cuerpo)} bytes{' (truncado)' if truncado else ''} · {ms} ms")
        if modo == "fetchb64":
            import base64
            texto = base64.b64encode(cuerpo).decode("ascii")
            print("BASE64-INICIO")
            for i in range(0, len(texto), 4000):
                print(texto[i:i + 4000])
            print("BASE64-FIN")
        elif "text" in tipo or "xml" in tipo or "json" in tipo or "html" in tipo or "rss" in tipo:
            print(cuerpo.decode("utf-8", errors="replace"))
        else:
            print(f"(binario; primeros bytes: {cuerpo[:16].hex()})")
        print(f"===== FIN fetch {url} =====")
        time.sleep(1)  # cortesía entre llamadas
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
