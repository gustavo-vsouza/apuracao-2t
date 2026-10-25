// Leitor mínimo de boletim de urna (BU) do TSE — formato ASN.1 BER.
// Devolve identificação (município, zona, local, seção), votos nominais
// do cargo Presidente (código 1) e totais por tipo de voto (2 = branco, 3 = nulo).
(function () {
  function tlv(b, p) {
    const t = b[p]; p += 1;
    let l = b[p]; p += 1;
    if (l === 0x80) { // comprimento indefinido
      const s = p; let q = p;
      while (!(b[q] === 0 && b[q + 1] === 0)) q = tlv(b, q)[3];
      return [t, s, q, q + 2];
    }
    if (l & 0x80) {
      const n = l & 0x7f; l = 0;
      for (let i = 0; i < n; i++) l = l * 256 + b[p + i];
      p += n;
    }
    return [t, p, p + l, p + l];
  }
  function kids(b, s, e) {
    const out = [];
    while (s < e) { const r = tlv(b, s); out.push(r); s = r[3]; }
    return out;
  }
  // inteiro com sinal em complemento de dois
  function sint(b, a, z) {
    let v = 0;
    for (let i = a; i < z; i++) v = v * 256 + b[i];
    const bits = (z - a) * 8;
    if (z > a && (b[a] & 0x80)) v -= Math.pow(2, bits);
    return v;
  }

  function parseBU(buf, cargoAlvo) {
    cargoAlvo = cargoAlvo || 1;
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const [, a0, z0] = tlv(b, 0);
    const ch = kids(b, a0, z0);
    const oc = ch.find((c) => c[0] === 0x04);
    const idc = ch.find((c) => c[0] === 0xa0);
    if (!oc || !idc) throw new Error("BU em formato inesperado");
    const bu = b.subarray(oc[1], oc[2]);
    const k = kids(b, idc[1], idc[2]);
    const mz = kids(b, k[0][1], k[0][2]);
    const ident = {
      mun: sint(b, mz[0][1], mz[0][2]),
      zona: sint(b, mz[1][1], mz[1][2]),
      local: sint(b, k[1][1], k[1][2]),
      secao: sint(b, k[2][1], k[2][2]),
    };
    const nominais = {};
    const tipos = {};
    let cargo = null;
    function walk(s, e) {
      for (const [tag, aa, zz] of kids(bu, s, e)) {
        if (tag === 0x30) {
          const c = kids(bu, aa, zz);
          if (c.length >= 3 && c[0][0] === 0x81 && c[1][0] === 0x82 && c[2][0] === 0xa3 && cargo === cargoAlvo) {
            const qtd = sint(bu, c[1][1], c[1][2]);
            const idv = kids(bu, c[2][1], c[2][2]);
            const cod = idv.find((x) => x[0] === 0x81) || idv[0];
            const num = sint(bu, cod[1], cod[2]);
            nominais[num] = (nominais[num] || 0) + qtd;
          } else if (c.length >= 3 && c[0][0] === 0x81 && c[1][0] === 0x82 && c[2][0] === 0x02) {
            const tv = sint(bu, c[0][1], c[0][2]);
            const qtd = sint(bu, c[1][1], c[1][2]);
            if (cargo === cargoAlvo) tipos[tv] = (tipos[tv] || 0) + qtd;
          } else if (c.length >= 2 && c[0][0] === 0x81 && c[1][0] === 0x02) {
            const anterior = cargo;
            cargo = sint(bu, c[0][1], c[0][2]);
            walk(aa, zz);
            cargo = anterior;
          } else {
            walk(aa, zz);
          }
        } else if (tag & 0x20) {
          walk(aa, zz);
        }
      }
    }
    const [, a1, z1] = tlv(bu, 0);
    walk(a1, z1);
    return { ident, nominais, tipos };
  }

  if (typeof window !== "undefined") window.BU = { parseBU };
  if (typeof module !== "undefined") module.exports = { parseBU };
})();
