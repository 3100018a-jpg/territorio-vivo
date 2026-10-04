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
import os
import random
import re
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CONTEUDO = RAIZ / "data" / "conteudo.json"
PASTA = RAIZ / "audio"
SIMULTANEAS = 3
TENTATIVAS = 6
VOZES_RESERVA = {"pt-BR-FranciscaNeural", "pt-BR-AntonioNeural", "pt-BR-ThalitaNeural"}


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
    inicio = time.time()
    status = {"total": len(falas), "comAudio": 0, "gerados": 0, "reaproveitados": 0, "falhas": 0, "erros": [], "vozes": {}}
    manifesto = {}
    print(f"{len(falas)} falas para narrar.")

    try:
        # Vozes "Multilingual" nunca são usadas: mesmo com o idioma marcado, elas podem
        # pronunciar palavras como "alternativa" e "mutirão" com sotaque estrangeiro.
        disponiveis = None
        for tentativa in range(4):
            try:
                disponiveis = {v["ShortName"] for v in await edge_tts.list_voices()
                               if v["ShortName"].startswith("pt-BR") and "Multilingual" not in v["ShortName"]}
                break
            except Exception as e:  # noqa: BLE001
                status["erros"].append(f"lista de vozes: {e!r}"[:300])
                await asyncio.sleep(3 * (tentativa + 1))
        if not disponiveis:
            disponiveis = set(VOZES_RESERVA)
            print("Não foi possível consultar a lista de vozes; usando as vozes de reserva.")
        print("Vozes pt-BR disponíveis:", ", ".join(sorted(disponiveis)))

        pronuncia = c.get("pronuncia", {})
        travado = travar_portugues(edge_tts)  # marca todo o texto como pt-BR (o padrão da ferramenta é en-US)
        if travado and not await testar_voz(edge_tts, "pt-BR-FranciscaNeural", "+0%", "+0Hz"):
            MODO_IDIOMA["lang"] = False
        marca = "ptBR-mono-lang" if travado and MODO_IDIOMA["lang"] else ("ptBR-mono" if travado else "mono")
        status["modo"] = marca

        vozes = {}
        for p, per in c["personagens"].items():
            opcoes = []
            for v in per.get("edge", []):
                if isinstance(v, str):
                    opcoes.append((v, per.get("edgeRate", "+0%"), per.get("edgePitch", "+0Hz")))
                else:
                    opcoes.append((v["voz"], v.get("rate", "+0%"), v.get("pitch", "+0Hz")))
            escolha = next((o for o in opcoes if o[0] in disponiveis and "Multilingual" not in o[0]), None)
            if not escolha:
                reserva = "pt-BR-FranciscaNeural" if per.get("genero") == "feminino" else "pt-BR-AntonioNeural"
                escolha = (reserva, per.get("edgeRate", "+0%"), per.get("edgePitch", "+0Hz"))
            vozes[p] = escolha
            status["vozes"][p] = " ".join(escolha)
            print(f"  {per['nome']}: {escolha[0]} ({escolha[1]}, {escolha[2]})")

        sem = asyncio.Semaphore(SIMULTANEAS)
        pendentes = []

        async def gerar(p, t, tentativas):
            voz, rate, pitch = vozes[p]
            arq = nome_arquivo(p, t, f"{voz}{rate}{pitch}{marca}")
            destino = PASTA / arq
            if destino.exists() and destino.stat().st_size > 1000:
                manifesto[f"{p}|{t}"] = arq
                status["reaproveitados"] += 1
                return True
            falado = aplicar_pronuncia(t, pronuncia)
            async with sem:
                for tentativa in range(tentativas):
                    tmp = destino.with_suffix(".tmp")
                    try:
                        await asyncio.wait_for(edge_tts.Communicate(falado, voz, rate=rate, pitch=pitch).save(str(tmp)), timeout=60)
                        if tmp.exists() and tmp.stat().st_size > 1000:
                            tmp.replace(destino)
                            manifesto[f"{p}|{t}"] = arq
                            status["gerados"] += 1
                            await asyncio.sleep(0.15)
                            return True
                        raise RuntimeError("áudio vazio")
                    except (Exception, asyncio.CancelledError) as e:  # noqa: BLE001
                        tmp.unlink(missing_ok=True)
                        if tentativa == tentativas - 1:
                            if len(status["erros"]) < 15:
                                status["erros"].append(f"{p}: {t[:40]}… → {e!r}"[:300])
                        await asyncio.sleep(min(30, 1.5 * 2 ** tentativa) + random.random())
            return False

        resultados = await asyncio.gather(*(gerar(p, t, TENTATIVAS) for p, t in falas))
        pendentes = [f for f, ok in zip(falas, resultados) if not ok]
        if pendentes:
            # segunda passada, mais lenta, para as falas que falharam (o serviço às vezes limita pedidos)
            print(f"Repetindo {len(pendentes)} falas que falharam…")
            await asyncio.sleep(20)
            for p, t in pendentes:
                await gerar(p, t, 4)
    finally:
        # o manifesto é sempre regravado, com todas as falas que têm áudio válido
        validos = set(manifesto.values())
        for f in PASTA.glob("*.mp3"):
            if f.name not in validos:
                f.unlink()
        (PASTA / "manifest.json").write_text(json.dumps(manifesto, ensure_ascii=False, indent=0), encoding="utf-8")
        status["comAudio"] = len(manifesto)
        status["falhas"] = status["total"] - len(manifesto)
        status["segundos"] = round(time.time() - inicio)
        status["geradoEm"] = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
        (PASTA / "status.json").write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")
        resumo = (f"### Vozes neurais\n\n- Falas com áudio: **{status['comAudio']} de {status['total']}**\n"
                  f"- Gravadas agora: {status['gerados']} · reaproveitadas: {status['reaproveitados']} · sem áudio: {status['falhas']}\n"
                  + "".join(f"- {k}: `{v}`\n" for k, v in status["vozes"].items())
                  + ("\n**Erros:**\n" + "".join(f"- {e}\n" for e in status["erros"]) if status["erros"] else ""))
        print(resumo)
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as f:
                f.write(resumo)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
