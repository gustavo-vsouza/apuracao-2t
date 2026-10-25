/* Apuração 2º turno 2026 — dados oficiais do TSE lidos direto no navegador. */
(() => {
  "use strict";
  const C = window.CFG;
  const SIM = /[?&]sim=1/.test(location.search);
  const UFS = ["ac","al","am","ap","ba","ce","df","es","go","ma","mg","ms","mt","pa","pb","pe","pi","pr","rj","rn","ro","rr","rs","sc","se","sp","to"];
  const NOMES = { ac:"Acre", al:"Alagoas", am:"Amazonas", ap:"Amapá", ba:"Bahia", ce:"Ceará", df:"Distrito Federal", es:"Espírito Santo", go:"Goiás", ma:"Maranhão", mg:"Minas Gerais", ms:"Mato Grosso do Sul", mt:"Mato Grosso", pa:"Pará", pb:"Paraíba", pe:"Pernambuco", pi:"Piauí", pr:"Paraná", rj:"Rio de Janeiro", rn:"Rio Grande do Norte", ro:"Rondônia", rr:"Roraima", rs:"Rio Grande do Sul", sc:"Santa Catarina", se:"Sergipe", sp:"São Paulo", to:"Tocantins", zz:"Exterior" };
  const NA = "22", NB = "13"; // azul = Flávio, vermelho = Lula
  const $ = (id) => document.getElementById(id);
  const pad = (x, n) => String(x).padStart(n, "0");
  const E6 = pad(C.eleicao, 6), P6 = pad(C.pleito, 6);
  const fi = (n) => (n == null || isNaN(n) ? "—" : Math.round(n).toLocaleString("pt-BR"));
  const fp = (n, d = 2) => (n == null || isNaN(n) ? "—" : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%");
  const num = (v) => (v == null || v === "" ? 0 : typeof v === "number" ? v : parseFloat(String(v).replace(",", ".")) || 0);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const urlU = (abr) => `${C.base}/${C.ciclo}/${C.eleicao}/dados/${abr.slice(0, 2)}/${abr}-c${pad(C.cargo, 4)}-e${E6}-u.json`;
  const urlCM = () => `${C.base}/${C.ciclo}/${C.eleicao}/config/mun-e${E6}-cm.json`;
  const urlCS = (uf) => `${C.base}/${C.ciclo}/arquivo-urna/${C.pleito}/config/${uf}/${uf}-p${P6}-cs.json`;
  const pastaSec = (uf, m, z, s) => `${C.base}/${C.ciclo}/arquivo-urna/${C.pleito}/dados/${uf}/${m}/${z}/${s}`;

  // ---------- estado ----------
  const S = {
    br: null, ufs: {}, muns: {}, // dados parseados por abrangência
    sel: { uf: "", mun: "" },
    cm: null,          // config de municípios
    locais: {},        // cache por município
    escola: null,      // escola aberta
    ord: "nome",
    ultimoOk: 0, timer: null, timerEsc: null,
  };
  try { Object.assign(S.sel, JSON.parse(localStorage.getItem("ap2t.sel") || "{}")); } catch (e) {}
  const salvaSel = () => { try { localStorage.setItem("ap2t.sel", JSON.stringify(S.sel)); } catch (e) {} };

  // ---------- rede ----------
  async function getJSON(url, opt = {}) {
    const r = await fetch(url, { cache: "no-cache", ...opt });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  async function getBin(url) {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }
  async function pool(itens, n, fn) {
    const out = new Array(itens.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (i < itens.length) { const k = i++; try { out[k] = await fn(itens[k], k); } catch (e) { out[k] = { erro: e }; } }
    }));
    return out;
  }

  // ---------- parse do -u.json (EA20) ----------
  function parseU(d) {
    if (!d) return null;
    const carg = (d.carg || []).find((c) => num(c.cd) === C.cargo) || (d.carg || [])[0] || {};
    const cands = {};
    (carg.agr || []).forEach((a) => (a.par || []).forEach((p) => (p.cand || []).forEach((c) => {
      cands[String(c.n)] = { vap: num(c.vap), nome: c.nmu || c.nm };
    })));
    const s = d.s || {}, v = d.v || {}, e = d.e || {};
    const ts = num(s.ts), st = num(s.st);
    return {
      dg: d.dg, hg: d.hg, and: d.and,
      ts, st, pst: ts ? (st / ts) * 100 : num(s.pst),
      te: num(e.te), c: num(e.c), a: num(e.a),
      vv: num(v.vv), vb: num(v.vb), tvn: num(v.tvn),
      cands,
    };
  }
  const va = (x) => (x && x.cands[NA] ? x.cands[NA].vap : 0);
  const vb = (x) => (x && x.cands[NB] ? x.cands[NB].vap : 0);
  function pcts(x) {
    const a = va(x), b = vb(x), t = (x && x.vv) || a + b;
    return t ? [(a / t) * 100, (b / t) * 100] : [null, null];
  }

  // ---------- simulação (?sim=1) para testar fora do horário ----------
  const t0 = Date.now();
  function rnd(seed) { let h = 2166136261; for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return ((h >>> 0) % 10000) / 10000; }
  function simU(abr) {
    const prog = Math.min(1, (Date.now() - t0) / 240000 + 0.05);
    const base = rnd(abr) * 0.5 + 0.25 + (["sp","sc","pr","ro","mt","df","go","ac","rr"].includes(abr.slice(0, 2)) ? 0.12 : -0.05);
    const ele = Math.round((rnd(abr + "e") * 9 + 0.4) * (abr.length > 2 ? 30000 : 1500000));
    const ts = Math.max(8, Math.round(ele / 350)), st = Math.round(ts * Math.min(1, prog * (0.8 + rnd(abr + "p") * 0.4)));
    const vv = Math.round(ele * 0.78 * st / ts), a = Math.round(vv * Math.min(.9, Math.max(.1, base + (rnd(abr + Math.floor(prog * 20)) - .5) * .02)));
    const d = new Date();
    return { dg: d.toLocaleDateString("pt-BR"), hg: d.toLocaleTimeString("pt-BR"), ts, st, pst: (st / ts) * 100, te: ele, c: Math.round(ele * .8 * st / ts), a: Math.round(ele * .2 * st / ts), vv, vb: Math.round(vv * .02), tvn: Math.round(vv * .03), cands: { [NA]: { vap: a }, [NB]: { vap: vv - a } } };
  }
  async function lerU(abr) { return SIM ? simU(abr) : parseU(await getJSON(urlU(abr))); }

  // ---------- ciclo de atualização ----------
  async function atualizar() {
    const alvos = ["br", ...UFS, "zz"];
    if (S.sel.uf && S.sel.mun) alvos.push(S.sel.uf + S.sel.mun);
    const res = await pool(alvos, 12, lerU);
    let ok = 0;
    alvos.forEach((abr, i) => {
      const r = res[i];
      if (r && !r.erro) {
        ok++;
        if (abr === "br") S.br = r; else if (abr.length === 2) S.ufs[abr] = r; else S.muns[abr] = r;
      }
    });
    $("live-dot").className = "dot " + (ok ? "on" : "err");
    if (ok) {
      S.ultimoOk = Date.now();
      try { localStorage.setItem("ap2t.cache", JSON.stringify({ br: S.br, ufs: S.ufs, t: S.ultimoOk })); } catch (e) {}
    } else if (!S.br) {
      toast("Sem resposta do TSE agora — tentando de novo em instantes.");
    }
    render();
    agendar();
  }
  function agendar() {
    clearTimeout(S.timer);
    const fim = S.br && S.br.pst >= 100 && S.br.and === "f";
    S.timer = setTimeout(atualizar, (fim ? C.intervaloFinalSeg : C.intervaloSeg) * 1000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && Date.now() - S.ultimoOk > 15000) atualizar(); });

  // ---------- render ----------
  function render() {
    renderProgresso();
    renderPlacar();
    renderMapa();
    renderLista();
    renderCrumbs();
  }
  function escopo() {
    if (S.sel.uf && S.sel.mun) return { t: (munNome(S.sel.mun) || "Cidade") + " · " + S.sel.uf.toUpperCase(), x: S.muns[S.sel.uf + S.sel.mun] };
    if (S.sel.uf) return { t: NOMES[S.sel.uf], x: S.ufs[S.sel.uf] };
    return { t: "Brasil", x: S.br };
  }
  function renderProgresso() {
    const x = S.br;
    $("pst").textContent = x ? fp(x.pst) : "—";
    $("pbar").style.width = (x ? x.pst : 0) + "%";
    $("secoes").textContent = x ? `${fi(x.st)} de ${fi(x.ts)} seções` : "—";
    $("hora").textContent = x && x.hg ? `TSE ${x.dg || ""} ${x.hg}` : "aguardando TSE (17h)";
  }
  function setSplit(ida, idb, pa, pb) {
    $(ida).style.width = (pa || 0) + "%";
    $(idb).style.width = (pb || 0) + "%";
  }
  function renderPlacar() {
    const { t, x } = escopo();
    $("score-t").textContent = t.toUpperCase();
    $("score-pst").textContent = x ? fp(x.pst) + " apurado" : "";
    const [pa, pb] = pcts(x);
    const a = va(x), b = vb(x);
    $("pa").textContent = fp(pa); $("pb").textContent = fp(pb);
    $("va").textContent = x ? fi(a) + " votos" : "—"; $("vb").textContent = x ? fi(b) + " votos" : "—";
    $("c-a").classList.toggle("lead", a > b); $("c-b").classList.toggle("lead", b > a);
    setSplit("sa", "sb", pa, pb);
    $("diff").textContent = x && a + b > 0 ? `${a > b ? "Flávio" : "Lula"} à frente por ${fi(Math.abs(a - b))} votos (${fp(Math.abs(pa - pb))} p.p.)` : x ? "Sem votos apurados ainda" : "Carregando…";
    const ap = (v, base) => (base ? fp((v / base) * 100, 1) : "");
    const tv = x ? x.vv + x.vb + x.tvn : 0;
    $("stats").innerHTML = x ? [
      ["Válidos", fi(x.vv), ap(x.vv, tv)],
      ["Brancos", fi(x.vb), ap(x.vb, tv)],
      ["Nulos", fi(x.tvn), ap(x.tvn, tv)],
      ["Abstenção", fi(x.a), ap(x.a, x.a + x.c)],
    ].map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}<small>${s || "&nbsp;"}</small></dd></div>`).join("") : "";
  }

  function cor(x) {
    const [pa, pb] = pcts(x);
    if (!x || pa == null || !x.st) return { f: "var(--cinza)", o: 1 };
    const m = Math.abs(pa - pb);
    const o = m < 2 ? 0.35 : m < 5 ? 0.5 : m < 10 ? 0.68 : m < 20 ? 0.85 : 1;
    return { f: pa >= pb ? "var(--azul)" : "var(--verm)", o };
  }
  let mapaPronto = false;
  function montarMapa() {
    const M = window.MAPA_BR, svg = $("mapa");
    svg.setAttribute("viewBox", `0 0 ${M.w} ${M.h}`);
    const NS = "http://www.w3.org/2000/svg";
    UFS.forEach((uf) => {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", M.uf[uf].d); p.id = "m-" + uf; p.setAttribute("tabindex", "0");
      p.setAttribute("aria-label", NOMES[uf]);
      p.addEventListener("click", () => escolherUF(S.sel.uf === uf ? "" : uf));
      svg.appendChild(p);
    });
    const peq = { df: [0, 4], se: [26, 8], al: [30, 0], pe: [40, -4], pb: [44, -6], rn: [34, -12], es: [28, 6], rj: [24, 14] };
    UFS.forEach((uf) => {
      const [cx, cy] = M.uf[uf].c, d = peq[uf] || [0, 0];
      const t = document.createElementNS(NS, "text");
      t.setAttribute("x", cx + d[0]); t.setAttribute("y", cy + d[1]); t.textContent = uf.toUpperCase();
      svg.appendChild(t);
      if (!peq[uf]) {
        const tp = document.createElementNS(NS, "text");
        tp.setAttribute("class", "p"); tp.setAttribute("x", cx); tp.setAttribute("y", cy + 15); tp.id = "mp-" + uf;
        svg.appendChild(tp);
      }
    });
    mapaPronto = true;
  }
  function renderMapa() {
    if (!mapaPronto) montarMapa();
    $("mapa").classList.toggle("focus", !!S.sel.uf);
    UFS.forEach((uf) => {
      const x = S.ufs[uf], p = $("m-" + uf), c = cor(x);
      p.style.fill = c.f; p.style.fillOpacity = c.o;
      p.classList.toggle("sel", S.sel.uf === uf);
      const [pa, pb] = pcts(x);
      p.innerHTML = `<title>${NOMES[uf]} — Flávio ${fp(pa)} · Lula ${fp(pb)} · ${x ? fp(x.pst, 1) : "—"} apurado</title>`;
      const tp = $("mp-" + uf);
      if (tp) tp.textContent = x && x.st && pa != null ? Math.round(Math.max(pa, pb)) + "%" : "";
    });
  }
  function renderLista() {
    const rows = [...UFS, "zz"].map((uf) => {
      const x = S.ufs[uf], [pa, pb] = pcts(x);
      return { uf, x, pa, pb };
    });
    const k = S.ord;
    rows.sort((r, s) => k === "nome" ? NOMES[r.uf].localeCompare(NOMES[s.uf]) :
      k === "a" ? (s.pa || 0) - (r.pa || 0) : k === "b" ? (s.pb || 0) - (r.pb || 0) :
      k === "pst" ? ((s.x && s.x.pst) || 0) - ((r.x && r.x.pst) || 0) : ((s.x && s.x.te) || 0) - ((r.x && r.x.te) || 0));
    $("uf-list").innerHTML = rows.map(({ uf, x, pa, pb }) => `
      <li data-uf="${uf}" class="${S.sel.uf === uf ? "sel" : ""}" title="${NOMES[uf]}">
        <span class="uf-sg">${uf === "zz" ? "EXT" : uf.toUpperCase()}</span>
        <div class="uf-bar">
          <div class="uf-nums"><span class="a">${fp(pa)} <small class="muted">${x ? fi(va(x)) : ""}</small></span><span class="b"><small class="muted">${x ? fi(vb(x)) : ""}</small> ${fp(pb)}</span></div>
          <div class="split"><i class="sa" style="width:${pa || 0}%"></i><i class="sb" style="width:${pb || 0}%"></i><b class="mid"></b></div>
        </div>
        <span class="uf-pst">${x ? fp(x.pst, 1) : "—"}<small>apurado</small></span>
      </li>`).join("");
  }
  $("uf-list").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-uf]"); if (!li) return;
    const uf = li.dataset.uf;
    if (uf === "zz") { escolherUF("zz"); } else escolherUF(uf);
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("ord").addEventListener("change", (e) => { S.ord = e.target.value; renderLista(); });

  function renderCrumbs() {
    const c = [`<a data-n="br">Brasil</a>`];
    if (S.sel.uf) c.push(`<span class="s">/</span><a data-n="uf">${esc(NOMES[S.sel.uf])}</a>`);
    if (S.sel.mun) c.push(`<span class="s">/</span><a data-n="mun">${esc(munNome(S.sel.mun) || S.sel.mun)}</a>`);
    if (S.escola) c.push(`<span class="s">/</span><span>${esc(S.escola.nome)}</span>`);
    $("crumbs").innerHTML = c.join("");
  }
  $("crumbs").addEventListener("click", (e) => {
    const n = e.target.dataset && e.target.dataset.n;
    if (n === "br") escolherUF("");
    else if (n === "uf") escolherMun("");
    else if (n === "mun") fecharEscola();
  });

  // ---------- seleção ----------
  function preencherUFs() {
    $("sel-uf").innerHTML = `<option value="">Brasil (todos)</option>` +
      [...UFS].sort((a, b) => NOMES[a].localeCompare(NOMES[b])).map((u) => `<option value="${u}">${NOMES[u]}</option>`).join("") +
      `<option value="zz">Exterior</option>`;
    $("sel-uf").value = S.sel.uf || "";
  }
  $("sel-uf").addEventListener("change", (e) => escolherUF(e.target.value));
  $("sel-mun").addEventListener("change", (e) => escolherMun(e.target.value));

  async function carregarCM() {
    if (S.cm) return S.cm;
    if (SIM) {
      S.cm = {};
      UFS.concat("zz").forEach((u) => (S.cm[u] = Array.from({ length: 12 }, (_, i) => ({ cd: pad(10000 + i * 17 + u.charCodeAt(0), 5), nm: `Cidade ${i + 1} (${u.toUpperCase()})`, z: ["0001", "0002"] }))));
      return S.cm;
    }
    const d = await getJSON(urlCM(), { cache: "force-cache" });
    S.cm = {};
    ((d && d.abr) || []).forEach((a) => {
      S.cm[String(a.cd).toLowerCase()] = (a.mu || []).map((m) => ({ cd: pad(m.cd, 5), nm: m.nm, z: m.z || [] }))
        .sort((x, y) => x.nm.localeCompare(y.nm, "pt-BR"));
    });
    return S.cm;
  }
  function munNome(cd) {
    const l = S.cm && S.cm[S.sel.uf];
    const m = l && l.find((x) => x.cd === cd);
    return m ? m.nm : "";
  }
  async function escolherUF(uf) {
    S.sel.uf = uf || ""; S.sel.mun = ""; fecharEscola(true); salvaSel();
    $("sel-uf").value = S.sel.uf;
    const sm = $("sel-mun");
    $("escolas").hidden = true;
    if (!uf) { sm.innerHTML = `<option value="">—</option>`; sm.disabled = true; render(); return; }
    sm.disabled = true; sm.innerHTML = `<option value="">carregando…</option>`;
    render();
    try {
      const cm = await carregarCM();
      const l = cm[uf] || [];
      sm.innerHTML = `<option value="">Todas (${l.length})</option>` + l.map((m) => `<option value="${m.cd}">${esc(m.nm)}</option>`).join("");
      sm.disabled = !l.length;
    } catch (e) {
      sm.innerHTML = `<option value="">indisponível</option>`;
      toast("Não consegui carregar a lista de cidades do TSE.");
    }
  }
  async function escolherMun(cd) {
    S.sel.mun = cd || ""; fecharEscola(true); salvaSel();
    $("sel-mun").value = S.sel.mun;
    if (!cd) { $("escolas").hidden = true; render(); return; }
    render();
    try { const r = await lerU(S.sel.uf + cd); if (r) S.muns[S.sel.uf + cd] = r; } catch (e) {}
    render();
    carregarEscolas();
  }

  // ---------- escolas ----------
  async function carregarLocais(uf, mun) {
    const k = uf + mun;
    if (S.locais[k] !== undefined) return S.locais[k];
    if (SIM) {
      return (S.locais[k] = { l: Array.from({ length: 9 }, (_, i) => [1 + (i % 2), 1000 + i * 8, `E. E. Escola Simulada ${i + 1}`, `Bairro ${String.fromCharCode(65 + i)}`, Array.from({ length: 4 + (i % 5) }, (_, j) => 10 + i * 10 + j)]) });
    }
    try {
      const r = await fetch(`data/locais/${uf}/${mun}.json`, { cache: "no-cache" });
      S.locais[k] = r.ok ? await r.json() : null;
    } catch (e) { S.locais[k] = null; }
    return S.locais[k];
  }
  async function carregarEscolas() {
    const uf = S.sel.uf, mun = S.sel.mun;
    $("escolas").hidden = false;
    $("esc-list").innerHTML = `<li><span class="muted small">carregando escolas…</span></li>`;
    $("esc-aviso").hidden = true;
    const d = await carregarLocais(uf, mun);
    if (uf !== S.sel.uf || mun !== S.sel.mun) return;
    if (!d || !d.l) {
      $("esc-n").textContent = "";
      $("esc-list").innerHTML = "";
      const av = $("esc-aviso");
      av.hidden = false;
      av.innerHTML = `A lista com o <b>nome das escolas</b> ainda não foi gerada neste site (rode de novo a ação <b>Publicar app</b> na aba Actions do GitHub).<br>
        Enquanto isso dá para ver os locais por <b>zona eleitoral</b>, identificados pelo número:<br>
        <select id="sel-zona"></select>`;
      const m = (S.cm[uf] || []).find((x) => x.cd === mun);
      const zs = (m && m.z) || [];
      $("sel-zona").innerHTML = `<option value="">Escolha a zona…</option>` + zs.map((z) => `<option value="${z}">Zona ${num(z)}</option>`).join("");
      $("sel-zona").addEventListener("change", (e) => e.target.value && explorarZona(uf, mun, pad(e.target.value, 4)));
      return;
    }
    S.listaEsc = d.l.map(([z, loc, nome, bairro, secs]) => ({ z, loc, nome, bairro, secs }));
    filtrarEscolas();
  }
  function filtrarEscolas() {
    const q = ($("esc-busca").value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const all = S.listaEsc || [];
    const l = q ? all.filter((e) => (e.nome + " " + e.bairro).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q)) : all;
    $("esc-n").textContent = `${l.length} de ${all.length}`;
    const MAX = 150;
    $("esc-list").innerHTML = l.slice(0, MAX).map((e, i) => `
      <li data-i="${all.indexOf(e)}"><div><div class="esc-n">${esc(e.nome)}</div><div class="esc-b">${esc(e.bairro || "")} · zona ${e.z}</div></div>
      <span class="esc-s">${e.secs.length} seç.</span></li>`).join("") +
      (l.length > MAX ? `<li><span class="mais">+${l.length - MAX} — refine a busca</span></li>` : "");
  }
  $("esc-busca").addEventListener("input", filtrarEscolas);
  $("esc-list").addEventListener("click", (e) => {
    const li = e.target.closest("li[data-i]"); if (!li) return;
    const x = S.listaEsc[+li.dataset.i];
    abrirEscola({ uf: S.sel.uf, mun: S.sel.mun, z: x.z, loc: x.loc, nome: x.nome, bairro: x.bairro, secs: x.secs.map((s) => ({ s, z: x.z })) });
  });

  // lê um boletim de urna
  async function lerSecao(uf, mun, z, s) {
    if (SIM) {
      const a = Math.round(rnd(`${mun}${z}${s}`) * 180 + 40), b = Math.round(rnd(`${s}${z}${mun}`) * 180 + 40);
      return (Date.now() - t0) / 60000 > rnd("t" + s) * 2 ? { st: "ok", a, b, br: 5, nu: 8, loc: 1000 } : { st: "aguardando" };
    }
    const m = pad(mun, 5), zz = pad(z, 4), ss = pad(s, 4), pasta = pastaSec(uf, m, zz, ss);
    const aux = await getJSON(`${pasta}/p${P6}-${uf}-m${m}-z${zz}-s${ss}-aux.json`);
    if (!aux) return { st: "aguardando" };
    let melhor = null;
    (aux.hashes || []).forEach((h) => {
      let nomes = [];
      if (Array.isArray(h.arq)) nomes = h.arq.filter((a) => a.tp === "bu" || a.tp === "busa").map((a) => a.nm);
      else if (Array.isArray(h.nmarq)) nomes = h.nmarq.filter((n) => /\.(bu|busa)$/.test(n));
      nomes.sort((x, y) => (y.includes("busa") ? 1 : 0) - (x.includes("busa") ? 1 : 0));
      if (nomes.length) melhor = [h.hash, nomes[0]];
    });
    if (!melhor) return { st: "aguardando" };
    const bu = window.BU.parseBU(await getBin(`${pasta}/${melhor[0]}/${melhor[1]}`), C.cargo);
    return { st: "ok", a: bu.nominais[22] || 0, b: bu.nominais[13] || 0, br: bu.tipos[2] || 0, nu: bu.tipos[3] || 0, loc: bu.ident.local };
  }

  function abrirEscola(e) {
    S.escola = { ...e, res: {} };
    $("escola").hidden = false;
    $("esc-nome").textContent = e.nome;
    $("esc-sub").textContent = `${e.bairro ? e.bairro + " · " : ""}zona ${e.z} · local ${e.loc} · ${e.secs.length} seções`;
    renderEscola(); renderCrumbs();
    $("escola").scrollIntoView({ behavior: "smooth", block: "start" });
    atualizarEscola();
  }
  function fecharEscola(silencioso) {
    S.escola = null; clearTimeout(S.timerEsc);
    $("escola").hidden = true;
    if (!silencioso) renderCrumbs();
  }
  $("esc-fechar").addEventListener("click", () => fecharEscola());
  async function atualizarEscola() {
    const E = S.escola; if (!E) return;
    clearTimeout(S.timerEsc);
    const pend = E.secs.filter((x) => !E.res[x.z + "-" + x.s] || E.res[x.z + "-" + x.s].st !== "ok");
    E.lendo = pend.length;
    renderEscola();
    await pool(pend, C.concorrenciaBU, async (x) => {
      try { E.res[x.z + "-" + x.s] = await lerSecao(E.uf, E.mun, x.z, x.s); }
      catch (err) { E.res[x.z + "-" + x.s] = { st: "erro" }; }
      if (S.escola === E) renderEscola();
    });
    if (S.escola !== E) return;
    E.lendo = 0;
    renderEscola();
    const faltam = E.secs.some((x) => (E.res[x.z + "-" + x.s] || {}).st !== "ok");
    if (faltam) S.timerEsc = setTimeout(atualizarEscola, C.intervaloEscolaSeg * 1000);
  }
  function renderEscola() {
    const E = S.escola; if (!E) return;
    let a = 0, b = 0, br = 0, nu = 0, ok = 0;
    const linhas = E.secs.map((x) => {
      const r = E.res[x.z + "-" + x.s];
      if (r && r.st === "ok") { a += r.a; b += r.b; br += r.br; nu += r.nu; ok++; }
      const lab = (E.multiZona ? `${x.z}/` : "") + x.s;
      if (!r) return `<tr><td>${lab}</td><td class="w" colspan="4">…</td></tr>`;
      if (r.st !== "ok") return `<tr><td>${lab}</td><td class="w" colspan="4">${r.st === "erro" ? "erro ao ler" : "aguardando boletim"}</td></tr>`;
      return `<tr><td>${lab}</td><td class="a">${fi(r.a)}</td><td class="b">${fi(r.b)}</td><td>${fi(r.br)}</td><td>${fi(r.nu)}</td></tr>`;
    });
    const t = a + b, pa = t ? (a / t) * 100 : null, pb = t ? (b / t) * 100 : null;
    $("e-pa").textContent = fp(pa); $("e-pb").textContent = fp(pb);
    $("e-va").textContent = fi(a) + " votos"; $("e-vb").textContent = fi(b) + " votos";
    setSplit("e-sa", "e-sb", pa, pb);
    $("e-status").textContent = `${ok} de ${E.secs.length} boletins lidos` + (E.lendo ? " · lendo…" : ok < E.secs.length ? ` · nova leitura em ${C.intervaloEscolaSeg}s` : " · escola completa");
    $("e-tab").innerHTML = `<thead><tr><th>SEÇÃO</th><th>FLÁVIO</th><th>LULA</th><th>BRANCO</th><th>NULO</th></tr></thead>
      <tbody>${linhas.join("")}</tbody>
      <tfoot><tr><td>TOTAL</td><td class="a">${fi(a)}</td><td class="b">${fi(b)}</td><td>${fi(br)}</td><td>${fi(nu)}</td></tr></tfoot>`;
  }

  // modo sem lista de nomes: lê a zona inteira e agrupa por número do local
  async function explorarZona(uf, mun, z) {
    const av = $("esc-list");
    av.innerHTML = `<li><span class="muted small">lendo configuração de seções do TSE…</span></li>`;
    let secs = [];
    try {
      if (SIM) secs = Array.from({ length: 30 }, (_, i) => i + 1);
      else {
        S.cs = S.cs || {};
        if (!S.cs[uf]) S.cs[uf] = await getJSON(urlCS(uf), { cache: "force-cache" });
        const cfg = S.cs[uf];
        const mu = ((cfg && cfg.abr && cfg.abr[0] && cfg.abr[0].mu) || []).find((m) => pad(m.cd, 5) === mun);
        const zo = mu && (mu.zon || []).find((x) => pad(x.cd, 4) === z);
        secs = ((zo && zo.sec) || []).map((s) => num(s.ns));
      }
    } catch (e) { av.innerHTML = `<li><span class="muted small">não consegui ler as seções desta zona</span></li>`; return; }
    if (!secs.length) { av.innerHTML = `<li><span class="muted small">nenhuma seção encontrada</span></li>`; return; }
    const grupos = {}; let feitos = 0;
    await pool(secs, C.concorrenciaBU, async (s) => {
      let r; try { r = await lerSecao(uf, mun, z, s); } catch (e) { r = { st: "erro" }; }
      feitos++;
      if (r.st === "ok") { const g = (grupos[r.loc] = grupos[r.loc] || { loc: r.loc, secs: [], res: {} }); g.secs.push(s); g.res[num(z) + "-" + s] = r; }
      if (feitos % 10 === 0 || feitos === secs.length) {
        const l = Object.values(grupos).sort((x, y) => x.loc - y.loc);
        av.innerHTML = `<li><span class="muted small">${feitos}/${secs.length} seções lidas · ${l.length} locais</span><span></span></li>` +
          l.map((g) => `<li data-loc="${g.loc}"><div><div class="esc-n">Local nº ${g.loc}</div><div class="esc-b">zona ${num(z)}</div></div><span class="esc-s">${g.secs.length} seç.</span></li>`).join("");
      }
    });
    av.onclick = (e) => {
      const li = e.target.closest("li[data-loc]"); if (!li) return;
      const g = grupos[li.dataset.loc];
      abrirEscola({ uf, mun, z: num(z), loc: g.loc, nome: `Local de votação nº ${g.loc}`, bairro: "", secs: g.secs.map((s) => ({ s, z: num(z) })) });
      Object.assign(S.escola.res, g.res); renderEscola();
    };
  }

  // ---------- util ----------
  let toastT;
  function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 4000); }

  // instalação
  let promptInstall = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); promptInstall = e; $("btn-install").hidden = false; });
  $("btn-install").addEventListener("click", async () => { if (!promptInstall) return; promptInstall.prompt(); await promptInstall.userChoice; promptInstall = null; $("btn-install").hidden = true; });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});

  // ---------- início ----------
  $("f-ele").textContent = C.eleicao;
  if (SIM) $("modo").textContent = " · MODO SIMULAÇÃO (?sim=1): números fictícios.";
  try {
    const c = JSON.parse(localStorage.getItem("ap2t.cache") || "null");
    if (c && !SIM) { S.br = c.br; S.ufs = c.ufs || {}; }
  } catch (e) {}
  preencherUFs();
  render();
  const selIni = { ...S.sel };
  atualizar();
  if (selIni.uf) escolherUF(selIni.uf).then(() => { if (selIni.mun) escolherMun(selIni.mun); });
})();
