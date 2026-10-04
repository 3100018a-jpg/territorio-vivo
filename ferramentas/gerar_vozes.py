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

    # Vozes "Multilingual" mudam de idioma no meio da frase e criam sotaque estrangeiro
    # em palavras como "alternativa" e "mutirão". Só usamos vozes exclusivamente em português.
    disponiveis = {v["ShortName"] for v in await edge_tts.list_voices() if "Multilingual" not in v["ShortName"]}
    pronuncia = c.get("pronuncia", {})
    vozes = {}
    for p, per in c["personagens"].items():
        escolhida = next((v for v in per.get("edge", []) if v in disponiveis), None)
        if not escolhida:
            escolhida = next((v for v in sorted(disponiveis) if v.startswith("pt-BR")), None)
        vozes[p] = (escolhida, per.get("edgeRate", "+0%"), per.get("edgePitch", "+0Hz"))
        print(f"  {per['nome']}: {escolhida} ({vozes[p][1]}, {vozes[p][2]})")

    manifesto = {}
    sem = asyncio.Semaphore(SIMULTANEAS)
    falhas = 0

    async def gerar(p, t):
        nonlocal falhas
        voz, rate, pitch = vozes[p]
        arq = nome_arquivo(p, t, f"{voz}{rate}{pitch}")
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
