#!/usr/bin/env python3
"""Gera data/locais/{uf}/{municipio}.json com as escolas (locais de votação) e suas seções.

Fonte: TSE, Portal de Dados Abertos — "eleitorado_local_votacao_2026" (CSV).
Seções agregadas ficam de fora: os votos delas saem no boletim da seção principal.
Uso: python3 tools/gerar_locais.py [arquivo.zip]
"""
import csv, io, json, os, sys, urllib.request, zipfile
from collections import defaultdict
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
SAIDA = RAIZ / "data" / "locais"
UA = {"User-Agent": "apuracao-2t (github pages)"}
DIRETOS = [
    "https://cdn.tse.jus.br/estatistica/sead/odsele/eleitorado_locais_votacao/eleitorado_local_votacao_2026.zip",
]
csv.field_size_limit(10_000_000)


def baixar(url, destino):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=300) as r, open(destino, "wb") as f:
        while True:
            bloco = r.read(1 << 20)
            if not bloco:
                break
            f.write(bloco)


def urls_candidatas():
    # 1) pergunta ao portal de dados abertos (CKAN) qual é o link atual
    for pacote in ("eleitorado-2026",):
        try:
            req = urllib.request.Request(
                f"https://dadosabertos.tse.jus.br/api/3/action/package_show?id={pacote}", headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                dados = json.load(r)
            for res in dados["result"]["resources"]:
                u = res.get("url") or ""
                if "local_votacao" in u and u.endswith(".zip"):
                    yield u
        except Exception as exc:
            print("CKAN indisponível:", exc)
    # 2) caminho conhecido do CDN
    yield from DIRETOS


def obter_zip():
    if len(sys.argv) > 1:
        return Path(sys.argv[1])
    destino = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "eleitorado_local_votacao_2026.zip"
    if destino.exists() and destino.stat().st_size > 1_000_000:
        print("usando zip em cache:", destino)
        return destino
    for u in urls_candidatas():
        try:
            print("baixando", u)
            baixar(u, destino)
            zipfile.ZipFile(destino).testzip()
            return destino
        except Exception as exc:
            print("falhou:", exc)
    sys.exit("Não foi possível baixar o arquivo de locais de votação do TSE.")


def main():
    zp = obter_zip()
    # (uf, turno) -> {(mun, zona, local): [nome, bairro, municipio, set(secoes)]}
    por = defaultdict(dict)
    turnos = defaultdict(set)
    with zipfile.ZipFile(zp) as z:
        nomes = [n for n in z.namelist() if n.lower().endswith(".csv")]
        print("arquivos:", nomes)
        for n in nomes:
            with z.open(n) as bruto:
                txt = io.TextIOWrapper(bruto, encoding="latin-1", newline="")
                for row in csv.DictReader(txt, delimiter=";"):
                    uf = (row.get("SG_UF") or "").strip().lower()
                    if len(uf) != 2:
                        continue
                    if (row.get("DS_TIPO_SECAO_AGREGADA") or "").strip().lower() == "agregada":
                        continue
                    turno = (row.get("NR_TURNO") or "1").strip()
                    turnos[uf].add(turno)
                    try:
                        mun = int(row["CD_MUNICIPIO"]); zona = int(row["NR_ZONA"])
                        sec = int(row["NR_SECAO"]); loc = int(row["NR_LOCAL_VOTACAO"])
                    except (KeyError, ValueError):
                        continue
                    k = (mun, zona, loc)
                    d = por[(uf, turno)]
                    item = d.get(k)
                    if item is None:
                        item = d[k] = [row.get("NM_LOCAL_VOTACAO", "").strip(), row.get("NM_BAIRRO", "").strip(),
                                       row.get("NM_MUNICIPIO", "").strip(), set()]
                    item[3].add(sec)
    total_arq = 0
    for uf, ts in sorted(turnos.items()):
        turno = "2" if "2" in ts else sorted(ts)[0]
        muns = defaultdict(list)
        nome_mun = {}
        for (mun, zona, loc), (nome, bairro, nmun, secs) in por[(uf, turno)].items():
            muns[mun].append([zona, loc, nome, bairro, sorted(secs)])
            nome_mun[mun] = nmun
        pasta = SAIDA / uf
        pasta.mkdir(parents=True, exist_ok=True)
        for mun, locais in muns.items():
            locais.sort(key=lambda x: (x[2], x[0], x[1]))
            with open(pasta / f"{mun:05d}.json", "w", encoding="utf-8") as f:
                json.dump({"m": nome_mun[mun], "turno": int(turno), "l": locais}, f, ensure_ascii=False, separators=(",", ":"))
            total_arq += 1
        print(f"{uf}: turno {turno}, {len(muns)} municípios, {sum(len(v) for v in muns.values())} locais")
    print("arquivos gerados:", total_arq)


if __name__ == "__main__":
    main()
