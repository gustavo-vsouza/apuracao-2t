# Apuração 2º Turno 2026 — PWA

App minimalista (dark, hi-tech) para acompanhar em tempo real a apuração do 2º turno presidencial
de 25/10/2026 — **Flávio Bolsonaro (22) em azul × Lula (13) em vermelho** — com dados oficiais do TSE.

- **Brasil inteiro**: placar, % de urnas apuradas, brancos, nulos, abstenção.
- **Mapa por estado** colorido pelo líder (intensidade = vantagem) + lista dos 27 estados e Exterior.
- **Estado → cidade → escola**: escolha o estado, a cidade e toque numa escola para ver os votos dela,
  seção por seção (soma dos boletins de urna publicados pelo TSE).
- Atualiza sozinho a cada 30 s. Funciona instalado como app (PWA).

## Publicar no GitHub (uma vez, ~3 min)

1. Crie um repositório **público** no GitHub (ex.: `apuracao-2t`).
2. Envie todos os arquivos desta pasta (inclusive a pasta oculta `.github`).
   Pelo site: *Add file → Upload files* e arraste o conteúdo do zip descompactado.
3. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Aba **Actions → Publicar app → Run workflow** (ou faça qualquer commit).
   A ação baixa a lista oficial de locais de votação do TSE e publica o site.
5. O link fica em `https://SEU-USUARIO.github.io/apuracao-2t/`.

## Instalar como app

- **Android (Chrome)**: abra o link → botão *Instalar app* no topo, ou menu ⋮ → *Instalar app*.
- **iPhone (Safari)**: Compartilhar → *Adicionar à Tela de Início*.

## Testar fora do horário

Abra com `?sim=1` no final do link (números fictícios, marcados como simulação).

## Como funciona

| Dado | Arquivo do TSE |
|---|---|
| Brasil / estado / cidade | `resultados.tse.jus.br/oficial/ele2026/6258/dados/{uf}/{uf}[{mun}]-c0001-e006258-u.json` |
| Lista de cidades | `…/6258/config/mun-e006258-cm.json` |
| Votos por escola | boletins de urna do pleito 3221: `…/arquivo-urna/3221/dados/{uf}/{mun}/{zona}/{seção}/…` |
| Nome das escolas | dados abertos `eleitorado_local_votacao_2026` → `data/locais/{uf}/{mun}.json` (gerado pela Action) |

O navegador lê os JSON do TSE direto (o TSE libera CORS). Se a lista de escolas não puder ser gerada,
o app ainda mostra os locais por zona eleitoral, identificados pelo número do local.

Códigos ficam em `js/config.js`. App independente, sem vínculo com o TSE.
