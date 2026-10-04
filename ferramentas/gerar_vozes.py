#!/usr/bin/env python3
"""
Gera as narrações do jogo em MP3 com vozes neurais, uma voz própria para cada apresentador.

Uso (com internet):
    pip install edge-tts
    python ferramentas/gerar_vozes.py

O script lê data/conteudo.json, cria um arquivo MP3 para cada fala (personagem + texto)
e grava audio/manifest.json. O jogo usa os MP3 automaticamente; qualquer fala que não
tiver arquivo é lida pelas vozes do navegador.

No GitHub, o workflow .github/workflows/pages.yml roda este script a cada publicação.
"""
import asyncio
import hashlib
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CONTEUDO = RAIZ / "data" / "conteudo.json"
PASTA = RAIZ / "audio"
SIMULTANEAS = 6
TENTATIVAS = 4


def carregar():
    return json.loads(CONTEUDO.read_text(encoding="utf-8"))


def listar_falas(c):
    """Reúne todas as falas narradas no jogo, sem repetição."""
    vistas, falas = set(), []

    def add(p, t):
        if (p, t) not in vistas:
            vistas.add((p, t))
            falas.append((p, t))

    def percorrer(o):
        if isinstance(o, dict):
            if isinstance(o.get("p"), str) and isinstance(o.get("t"), str):
                add(o["p"], o["t"])
            for v in o.values():
                percorrer(v)
        elif isinstance(o, list):
            for v in o:
                percorrer(v)

    percorrer(c)
    sistema = c["sistema"]
    perguntas = [q for m in c["missoes"] for q in m["perguntas"]] + c.get("extras", [])
    for q in perguntas:
        n = q["n"]
        add(n, q["q"])
        add(n, q["e"])
        for a in q["alt"]:
            add(n, a["t"])
        for letra in sistema["letras"]:
            add(n, letra)
        for r in sistema["reacoes"]["acerto"] + sistema["reacoes"]["erro"]:
            add(n, r)
    for m in c["missoes"]:
        add("lia", m["ficha"]["texto"])
    return falas


def nome_arquivo(p, t, voz):
    # a voz entra no nome: se a voz de um apresentador mudar, as falas dele são regravadas
    return hashlib.sha1(f"{p}|{t}|{voz}".encode("utf-8")).hexdigest()[:16] + ".mp3"


def aplicar_pronuncia(texto, mapa):
    """Troca siglas, números e palavras estrangeiras pela forma falada em português."""
    for original in sorted((k for k in mapa if not k.startswith("_")), key=len, reverse=True):
        texto = re.sub(r"(?<![\wÀ-ú])" + re.escape(original) + r"(?![\wÀ-ú])", mapa[original], texto)
    return texto


# ---------------------------------------------------------------------------
# Português travado nas vozes multilíngues
# ---------------------------------------------------------------------------
# As vozes "Multilingual" (Thalita e Macerio) tentam adivinhar o idioma de cada palavra
# e, sem aviso, pronunciam palavras como "alternativa" ou "mutirão" com sotaque estrangeiro.
# Aqui o SSML enviado ao serviço passa a declarar pt-BR e envolve todo o texto em
# <lang xml:lang="pt-BR">, que obriga a voz a falar apenas em português do Brasil.
MODO_IDIOMA = {"lang": True}


def travar_portugues(edge_tts):
    import edge_tts.communicate as com

    if not hasattr(com, "mkssml"):
        return False
    original = com.mkssml

    def mkssml(*args, **kwargs):
        ssml = original(*args, **kwargs)
        ssml = re.sub(r"xml:lang='[^']*'", "xml:lang='pt-BR'", ssml, count=1)
        if MODO_IDIOMA["lang"]:
            # formato da documentação do Azure: <voice><lang xml:lang="pt-BR">…</lang></voice>
            ssml = re.sub(r"(<prosody[^>]*>)", r"<lang xml:lang='pt-BR'>\1", ssml, count=1)
            ssml = ssml.replace("</prosody>", "</prosody></lang>", 1)
        return ssml

    com.mkssml = mkssml
    return True


async def testar_voz(edge_tts, voz, rate, pitch):
    """Gera uma frase curta para confirmar que o serviço aceita a voz com o português travado."""
    tmp = PASTA / "_teste_voz.tmp"
    try:
        await edge_tts.Communicate("Alternativa A. Mutirão na praça.", voz, rate=rate, pitch=pitch).save(str(tmp))
        ok = tmp.exists() and tmp.stat().st_size > 1000
    except Exception:  # noqa: BLE001
        ok = False
    tmp.unlink(missing_ok=True)
    return ok


async def main():
    try:
        import edge_tts
    except ImportError:
        print("Instale a dependência: pip install edge-tts")
        return 1

    c = carregar()
    PASTA.mkdir(exist_ok=True)
    falas = listar_falas(c)
    print(f"{len(falas)} falas para narrar.")

    disponiveis = {v["ShortName"] for v in await edge_tts.list_voices()}
    pronuncia = c.get("pronuncia", {})
    travado = travar_portugues(edge_tts)
    if travado:
        # confirma se o serviço aceita a marcação <lang>; se não, mantém só o idioma pt-BR no SSML
        multi = next((v for per in c["personagens"].values() for v in per.get("edge", []) if "Multilingual" in v and v in disponiveis), None)
        if multi and not await testar_voz(edge_tts, multi, "+0%", "+0Hz"):
            MODO_IDIOMA["lang"] = False
            if not await testar_voz(edge_tts, multi, "+0%", "+0Hz"):
                travado = False
    print(f"Português travado nas vozes multilíngues: {'sim' if travado else 'não'}"
          f"{' (com <lang>)' if travado and MODO_IDIOMA['lang'] else ''}")
    marca = "ptBR-lang" if travado and MODO_IDIOMA["lang"] else ("ptBR" if travado else "livre")

    vozes = {}
    for p, per in c["personagens"].items():
        candidatas = [v for v in per.get("edge", []) if v in disponiveis]
        # sem a trava de idioma, uma voz multilíngue poderia falar com sotaque: usa a próxima opção
        if not travado:
            candidatas = [v for v in candidatas if "Multilingual" not in v] or candidatas
        escolhida = candidatas[0] if candidatas else next((v for v in sorted(disponiveis) if v.startswith("pt-BR") and "Multilingual" not in v), None)
        vozes[p] = (escolhida, per.get("edgeRate", "+0%"), per.get("edgePitch", "+0Hz"))
        print(f"  {per['nome']}: {escolhida} ({vozes[p][1]}, {vozes[p][2]})")

    manifesto = {}
    sem = asyncio.Semaphore(SIMULTANEAS)
    falhas = 0

    async def gerar(p, t):
        nonlocal falhas
        voz, rate, pitch = vozes[p]
        arq = nome_arquivo(p, t, f"{voz}{rate}{pitch}{marca}")
        destino = PASTA / arq
        if destino.exists() and destino.stat().st_size > 1000:
            manifesto[f"{p}|{t}"] = arq
            return
        falado = aplicar_pronuncia(t, pronuncia)
        async with sem:
            for tentativa in range(TENTATIVAS):
                try:
                    tmp = destino.with_suffix(".tmp")
                    await edge_tts.Communicate(falado, voz, rate=rate, pitch=pitch).save(str(tmp))
                    tmp.replace(destino)
                    manifesto[f"{p}|{t}"] = arq
                    return
                except Exception as e:  # noqa: BLE001
                    if tentativa == TENTATIVAS - 1:
                        falhas += 1
                        print(f"  falhou: {p}: {t[:50]}… ({e})")
                    await asyncio.sleep(1.5 * (tentativa + 1))

    await asyncio.gather(*(gerar(p, t) for p, t in falas))

    # remove áudios que não pertencem mais ao conteúdo
    validos = set(manifesto.values())
    for f in PASTA.glob("*.mp3"):
        if f.name not in validos:
            f.unlink()

    (PASTA / "manifest.json").write_text(json.dumps(manifesto, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"Pronto: {len(manifesto)} áudios gerados, {falhas} falhas.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
