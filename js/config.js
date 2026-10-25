// Configuração — edite aqui se o TSE mudar algum código.
// Códigos oficiais (tse.jus.br › Informações técnicas sobre a divulgação de resultados 2026):
//   25/10/2026 · Pleito 3221 (2º turno) · Eleição 6258 (Eleição Geral Federal) · cargo Presidente = 1
window.CFG = {
  base: "https://resultados.tse.jus.br/oficial",
  ciclo: "ele2026",
  eleicao: "6258",
  pleito: "3221",
  cargo: 1,

  // Número de urna → nome e lado de cor
  cands: {
    "22": { nome: "Flávio Bolsonaro", curto: "Flávio", partido: "PL", lado: "azul" },
    "13": { nome: "Lula", curto: "Lula", partido: "PT", lado: "vermelho" },
  },

  intervaloSeg: 30,        // atualização durante a apuração
  intervaloFinalSeg: 300,  // depois de 100% apurado
  intervaloEscolaSeg: 120, // boletins de urna da escola aberta
  concorrenciaBU: 6,       // downloads simultâneos de boletins (limite do TSE: 100 req/s por IP)
};
