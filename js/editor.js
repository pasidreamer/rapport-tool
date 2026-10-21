'use strict';
/* ================= Textfeld-Editor (wie Word) =================
   Ein Textfeld wird zum Bearbeiten als „contenteditable“-Fläche über die Seite gelegt. Absätze sind <div>,
   Formatierungen <span>. Beim Abschliessen liest editorLesen() alles zurück ins Datenmodell (siehe schrift.js).
   Die schwebende Leiste (#fmtBar) steht direkt über dem Textfeld. */

const SCHNELLSTILE = {
  titel:  { name: 'Titel',      list: null,     level: 0, b: 1, z: 13 },
  punkt:  { name: '• Punkt',    list: 'bullet', level: 0, b: 1, z: 11 },
  unter:  { name: '– Unterpunkt', list: 'bullet', level: 1, b: 0, z: 11 },
  normal: { name: 'Normal',     list: null,     level: 0, b: 0, z: 11 },
};
const ed = { groesseWartet: null };   // Schriftgrösse, die beim nächsten Tippen gelten soll

/* ---------- Öffnen ---------- */
function boxNeu(p, x, y, opts = {}) {
  const st = { ...STIL_VORGABE, ...(state.textStil || {}), ...(opts.stil || {}) };
  const w = opts.w || Math.min(280, Math.max(90, p.w - x - 20));
  return { id: uid(), type: 'box', page: p.i, x: x - SATZ.pad, y: y - st.z * 0.9 - SATZ.pad, w, paras: opts.paras || [absatzLeer(st)],
           rahmen: opts.rahmen || null, fuellung: opts.fuellung || null };
}
function boxBearbeiten(d, p, a, opts = {}) {
  commitEdit();
  const s = d.scale;
  const neu = !d.annots.includes(a);
  const el = document.createElement('div');
  el.className = 'rte'; el.contentEditable = 'true'; el.spellcheck = true;
  const st0 = { ...STIL_VORGABE, ...((a.paras[0] && a.paras[0].runs[0]) || {}) };
  stilAufElement(el, st0, s);
  el.style.setProperty('--s', s);
  Object.assign(el.style, { left: a.x * s + 'px', top: a.y * s + 'px', width: a.w * s + 'px', padding: SATZ.pad * s + 'px' });
  if (a.fuellung && FUELLUNGEN[a.fuellung]) el.style.background = FUELLUNGEN[a.fuellung].css;
  if (a.rahmen) el.style.boxShadow = `inset 0 0 0 ${Math.max(1, 0.8 * s)}px ${(TEXTFARBEN[a.rahmen] || TEXTFARBEN.black).css}`;
  // Erkanntes Formularfeld: Text bleibt beim Tippen auf einer Zeile, Enter springt ins nächste Feld
  const feld = a.field ? d.fields.find(f => f.id === a.field) || null : null;
  if (feld) { el.classList.add('feld'); el.style.width = 'auto'; el.style.minWidth = a.w * s + 'px'; el.enterKeyHint = 'next'; }
  if (a.upper) el.classList.add('upper');
  editorFuellen(el, a.paras, s);
  p.el.appendChild(el);
  state.editing = { kind: 'box', d, p, annot: a, input: el, feld, before: schnapp(d), isNew: neu, born: performance.now() };
  state.sel = null; drawSelection(d);
  drawOverlay(d, p);
  try { document.execCommand('defaultParagraphSeparator', false, 'div'); } catch (e) {}
  el.addEventListener('input', () => { groessenAngleichen(el); markenSetzen(el); leistePlatzieren(); });
  el.addEventListener('keydown', tasteImEditor);
  el.addEventListener('paste', e => { e.preventDefault(); textEinfuegen(e.clipboardData.getData('text/plain')); });
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('blur', () => {
    if (performance.now() - state.editing?.born < 700) { setTimeout(() => { if (state.editing && state.editing.input === el) el.focus(); }, 0); return; }
    setTimeout(() => {
      // Fokus in die Leiste oder ein Auswahlmenü: weiter bearbeiten
      if (!state.editing || state.editing.input !== el || el.contains(document.activeElement)) return;
      if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#fmtBar, .fmtPop')) return;
      commitEdit();
    }, 0);
  });
  markenSetzen(el);
  el.focus();
  // Schreibmarke: an die angetippte Stelle, sonst ans Ende
  const r = opts.punkt && document.caretRangeFromPoint ? document.caretRangeFromPoint(opts.punkt.x, opts.punkt.y) : null;
  const sel = getSelection(); sel.removeAllRanges();
  if (r && el.contains(r.startContainer)) sel.addRange(r);
  else { const ende = document.createRange(); ende.selectNodeContents(el); ende.collapse(false); sel.addRange(ende); }
  for (const ms of [0, 60, 200, 450]) setTimeout(() => { if (state.editing && state.editing.input === el && document.activeElement !== el) el.focus(); }, ms);
  leisteZeigen();
}

function stilAufElement(el, st, s) {
  const sp = SCHRIFTEN[st.f] || SCHRIFTEN.helv;
  el.style.fontFamily = sp.css; el.style.fontSize = st.z * s + 'px';
  el.style.fontWeight = st.b ? '700' : '400'; el.style.fontStyle = st.i ? 'italic' : 'normal';
  el.style.textDecoration = [st.u && 'underline', st.s && 'line-through'].filter(Boolean).join(' ') || 'none';
  el.style.color = (TEXTFARBEN[st.c] || TEXTFARBEN.black).css;
  el.style.backgroundColor = st.m ? markerCss(st.m) : '';
}
const markerCss = m => { const c = (MARKER_COLORS[m] || MARKER_COLORS.yellow).rgb.map(v => Math.round(v * 255)); return `rgba(${c[0]},${c[1]},${c[2]},0.45)`; };

function editorFuellen(el, paras, s) {
  el.innerHTML = '';
  for (const p of paras) {
    const div = document.createElement('div');
    if (p.list) { div.dataset.list = p.list; div.dataset.level = p.level ? '1' : '0'; }
    if (p.align && p.align !== 'left') div.style.textAlign = p.align;
    const runs = p.runs.filter(r => r.t);
    if (runs.length) for (const r of runs) {
      const sp = document.createElement('span'); stilAufElement(sp, { ...STIL_VORGABE, ...r }, s);
      sp.style.backgroundColor = r.m ? markerCss(r.m) : 'transparent';
      sp.textContent = r.t; div.appendChild(sp);
    } else {
      const st = { ...STIL_VORGABE, ...(p.runs[0] || {}) };
      div.style.fontSize = st.z * s + 'px'; div.style.fontWeight = st.b ? '700' : '400';
      div.appendChild(document.createElement('br'));
    }
    el.appendChild(div);
  }
}

/* ---------- Zurücklesen ---------- */
function farbeNaechste(css, palette) {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(css);
  if (!m) return null;
  if (m[4] !== undefined && +m[4] < 0.05) return null;   // durchsichtig
  let best = null, bd = Infinity;
  for (const [k, v] of Object.entries(palette)) {
    const r = v.rgb.map(x => x * 255);
    const dd = (r[0] - m[1]) ** 2 + (r[1] - m[2]) ** 2 + (r[2] - m[3]) ** 2;
    if (dd < bd) { bd = dd; best = k; }
  }
  return best;
}
function schriftSchluessel(family) {
  const f = family.toLowerCase();
  if (f.includes('rt inter')) return 'inter';
  if (f.includes('rt roboto')) return 'roboto';
  if (f.includes('times')) return 'times';
  if (f.includes('courier')) return 'cour';
  return 'helv';
}
function stilVon(elem, root, s) {
  const cs = getComputedStyle(elem);
  const st = { f: schriftSchluessel(cs.fontFamily), z: Math.round(parseFloat(cs.fontSize) / s * 2) / 2,
               b: parseInt(cs.fontWeight, 10) >= 600 ? 1 : 0, i: /italic|oblique/.test(cs.fontStyle) ? 1 : 0, u: 0, s: 0,
               c: farbeNaechste(cs.color, TEXTFARBEN) || 'black', m: null };
  for (let e = elem; e && root.contains(e); e = e.parentElement) {
    const dl = getComputedStyle(e).textDecorationLine;
    if (dl.includes('underline')) st.u = 1;
    if (dl.includes('line-through')) st.s = 1;
    if (!st.m && e !== root) { const bg = getComputedStyle(e).backgroundColor; const mk = farbeNaechste(bg, MARKER_COLORS); if (mk) st.m = mk; }
    if (e === root) break;
  }
  return st;
}
function editorLesen(el, s) {
  obersteOrdnen(el);
  const paras = [];
  for (const div of el.children) {
    const p = { list: div.dataset.list || null, level: div.dataset.list ? +div.dataset.level || 0 : 0, align: div.style.textAlign || 'left', runs: [] };
    if (p.align === 'start' || p.align === 'justify') p.align = 'left';
    const tw = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = n.data.replace(/[​﻿]/g, '').replace(/ /g, ' ');
      if (!t) continue;
      const st = stilVon(n.parentElement, el, s);
      const letzt = p.runs[p.runs.length - 1];
      if (letzt && ['f', 'z', 'b', 'i', 'u', 's', 'c', 'm'].every(k => letzt[k] === st[k])) letzt.t += t;
      else p.runs.push({ ...st, t });
    }
    if (!p.runs.length) p.runs.push({ ...stilVon(div, el, s), t: '' });
    paras.push(p);
  }
  while (paras.length > 1 && !paras[paras.length - 1].runs.some(r => r.t.trim())) paras.pop();   // leere Zeilen am Ende weg
  return paras.length ? paras : [absatzLeer()];
}
// Text direkt unter dem Editor (passiert nach „alles löschen“) in Absatz-<div> einpacken
function obersteOrdnen(el) {
  let lose = [];
  const packen = vor => {
    if (!lose.length) return;
    const div = document.createElement('div');
    el.insertBefore(div, vor); for (const n of lose) div.appendChild(n); lose = [];
  };
  for (const n of [...el.childNodes]) {
    if (n.nodeType === 1 && n.tagName === 'DIV') packen(n);
    else if (n.nodeType === 1 && n.tagName === 'BR' && !lose.length) n.remove();
    else lose.push(n);
  }
  packen(null);
  if (!el.children.length) el.appendChild(Object.assign(document.createElement('div'), { innerHTML: '<br>' }));
}

/* ---------- Abschliessen ---------- */
function boxAbschliessen(e) {
  state.editing = null;
  const { d, p, annot: a, input: el, before, isNew } = e;
  a.paras = editorLesen(el, d.scale);
  el.remove(); leisteVerstecken();
  if (a.upper) for (const pp of a.paras) for (const r of pp.runs) r.t = r.t.toUpperCase();
  if (a.field) feldEinpassen(a);
  const leer = boxLeer(a);
  if (leer && !isNew) d.annots.splice(d.annots.indexOf(a), 1);
  if (!leer && isNew) d.annots.push(a);
  if (!leer && !a.field) {   // Stil fürs nächste freie Textfeld merken
    const r = [...a.paras].reverse().flatMap(pp => [...pp.runs].reverse()).find(x => x.t.trim());
    if (r) { state.textStil = { f: r.f, z: r.z, b: 0, i: 0, u: 0, s: 0, c: r.c, m: null }; savePrefs(); }
  }
  if (schnapp(d) !== before) { d.undo.push(before); changed(d); } else drawOverlay(d, p);
}

// Formularfeld: Passt die längste Zeile nicht auf die Linie, alles gleichmässig verkleinern (bis 6 pt).
// Die gewählten Grössen bleiben gespeichert, a.k ist nur der Faktor fürs Anzeigen und Speichern.
function feldEinpassen(a) {
  delete a.k;
  const frei = a.w - 2 * SATZ.pad;
  let breitest = 0, zmax = 0;
  for (const p of a.paras) {
    const einzug = p.list ? SATZ.einzug * ((p.level ? 1 : 0) + 1) : 0;
    breitest = Math.max(breitest, einzug + p.runs.reduce((s, r) => s + breite({ ...STIL_VORGABE, ...r }, r.t), 0));
    for (const r of p.runs) zmax = Math.max(zmax, r.z || 11);
  }
  if (breitest > frei && zmax) a.k = Math.max(6 / zmax, frei / breitest * 0.995);
}

/* ---------- Tasten ---------- */
function aktuellerAbsatz(el) {
  const s = getSelection(); if (!s.rangeCount) return null;
  let n = s.getRangeAt(0).startContainer;
  while (n && n.parentNode !== el) n = n.parentNode;
  return n && n.nodeType === 1 && n.tagName === 'DIV' ? n : null;
}
function tasteImEditor(e) {
  const el = e.currentTarget;
  if (e.key === 'Escape') { e.preventDefault(); commitEdit(); return; }
  // Formularfeld: Enter/Tab = nächstes Feld, Shift+Tab = voriges, Shift+Enter = neue Zeile im Feld
  const feld = state.editing && state.editing.feld;
  if (feld && ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab')) {
    e.preventDefault();
    const d = state.editing.d; commitEdit(); gotoNextField(d, feld, e.key === 'Tab' && e.shiftKey ? -1 : 1);
    return;
  }
  if (e.key === 'Tab') { e.preventDefault(); einruecken(e.shiftKey ? -1 : 1); return; }
  if (e.key === 'Enter') {
    const div = aktuellerAbsatz(el);
    // Leerer Listenpunkt + Enter: Unterpunkt -> Punkt, Punkt -> normaler Absatz (wie in Word)
    if (div && div.dataset.list && !div.textContent.replace(/[​ \s]/g, '')) {
      e.preventDefault();
      if (div.dataset.level === '1') div.dataset.level = '0'; else { delete div.dataset.list; delete div.dataset.level; }
      markenSetzen(el); return;
    }
    if (e.shiftKey) { e.preventDefault(); document.execCommand('insertParagraph'); }
    setTimeout(() => { markenSetzen(el); leistePlatzieren(); }, 0);
  }
  if (e.ctrlKey && !e.altKey) {
    const k = e.key.toLowerCase();
    // Deutsche Tastenkürzel wie in Word: Strg+Shift+F fett, Strg+Shift+K kursiv
    if (e.shiftKey && k === 'f') { e.preventDefault(); befehl('bold'); }
    else if (e.shiftKey && k === 'k') { e.preventDefault(); befehl('italic'); }
    else if (['b', 'i', 'u'].includes(k)) setTimeout(leisteAktualisieren, 0);
  }
}

/* ---------- Formatieren ---------- */
function editorEl() { return state.editing && state.editing.kind === 'box' ? state.editing.input : null; }
function befehl(cmd, wert) {
  const el = editorEl(); if (!el) return;
  if (document.activeElement !== el) el.focus();
  try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
  document.execCommand(cmd, false, wert);
  nachFormat(el);
}
function nachFormat(el) { groessenAngleichen(el); markenSetzen(el); leisteAktualisieren(); leistePlatzieren(); }

function groesseSetzen(z) {
  const el = editorEl(); if (!el) return;
  z = Math.max(5, Math.min(48, z));
  ed.groesseWartet = { z, px: z * state.editing.d.scale };
  befehl('fontSize', '7');   // markiert die Auswahl mit „xxx-large“, groessenAngleichen() macht daraus die echte Grösse
}
function groessenAngleichen(el) {
  if (!ed.groesseWartet) return;
  let gefunden = false;
  for (const x of el.querySelectorAll('[style*="xxx-large"], font[size="7"]')) {
    gefunden = true;
    if (x.tagName === 'FONT') { const sp = document.createElement('span'); sp.style.fontSize = ed.groesseWartet.px + 'px'; while (x.firstChild) sp.appendChild(x.firstChild); x.replaceWith(sp); }
    else x.style.fontSize = ed.groesseWartet.px + 'px';
  }
  const s = getSelection();
  if (gefunden && s.rangeCount && !s.getRangeAt(0).collapsed) ed.groesseWartet = null;
}
function aktuelleGroesse() {
  const el = editorEl(); if (!el) return 11;
  return stilAnSchreibmarke(el).z;
}
function stilAnSchreibmarke(el) {
  const s = getSelection();
  let n = s.rangeCount ? s.getRangeAt(0).startContainer : el;
  if (!el.contains(n)) n = el;
  if (n.nodeType === 3) n = n.parentElement;
  return stilVon(n, el, state.editing.d.scale);
}

function auswahlAbsaetze(el) {
  obersteOrdnen(el);
  const s = getSelection(); if (!s.rangeCount) return [];
  const r = s.getRangeAt(0);
  const oben = n => { while (n && n.parentNode !== el) n = n.parentNode; return n; };
  let a = oben(r.startContainer), b = oben(r.endContainer);
  if (r.startContainer === el) a = el.children[Math.min(r.startOffset, el.children.length - 1)];
  if (r.endContainer === el) b = el.children[Math.max(0, Math.min(r.endOffset, el.children.length) - 1)];
  if (!a || !b) return [];
  const out = []; for (let n = a; n; n = n.nextElementSibling) { out.push(n); if (n === b) break; }
  return out;
}
function liste(art) {
  const el = editorEl(); if (!el) return;
  const ps = auswahlAbsaetze(el);
  const alle = ps.every(p => p.dataset.list === art);
  for (const p of ps) { if (alle) { delete p.dataset.list; delete p.dataset.level; } else { p.dataset.list = art; p.dataset.level = p.dataset.level || '0'; } }
  nachFormat(el);
}
function einruecken(r) {
  const el = editorEl(); if (!el) return;
  const ps = auswahlAbsaetze(el);
  for (const p of ps) {
    if (!p.dataset.list) { if (r > 0) { p.dataset.list = 'bullet'; p.dataset.level = '0'; } continue; }
    if (r > 0) p.dataset.level = '1';
    else if (p.dataset.level === '1') p.dataset.level = '0';
    else { delete p.dataset.list; delete p.dataset.level; }
  }
  nachFormat(el);
}
function ausrichten(al) {
  const el = editorEl(); if (!el) return;
  for (const p of auswahlAbsaetze(el)) p.style.textAlign = al === 'left' ? '' : al;
  nachFormat(el);
}
function schnellstil(k) {
  const el = editorEl(); if (!el) return;
  const def = SCHNELLSTILE[k]; const s = state.editing.d.scale;
  for (const p of auswahlAbsaetze(el)) {
    if (def.list) { p.dataset.list = def.list; p.dataset.level = String(def.level); } else { delete p.dataset.list; delete p.dataset.level; }
    // Dicke und Grösse am Absatz und allen Teilen darin setzen (Text direkt im Absatz erbt vom Absatz;
    // Knoten nicht umhängen, sonst springt die Schreibmarke weg)
    p.style.fontWeight = def.b ? '700' : '400'; p.style.fontSize = def.z * s + 'px';
    for (const sp of p.querySelectorAll('*')) { sp.style.fontWeight = def.b ? '700' : '400'; sp.style.fontSize = def.z * s + 'px'; }
  }
  nachFormat(el);
}
// Listenzeichen anzeigen (• – 1. a)) – zählt wie beim Speichern
function markenSetzen(el) {
  if (!el) return;
  obersteOrdnen(el);
  const divs = [...el.children];
  const marken = listenMarken(divs.map(d => ({ list: d.dataset.list || null, level: +d.dataset.level || 0 })));
  divs.forEach((d, k) => { if (marken[k]) d.dataset.mark = marken[k]; else delete d.dataset.mark; });
}

/* ---------- Einfügen / Kopieren ---------- */
// Mehrzeiliger Text: jede Zeile ein Absatz; „• “, „- “, „1. “ am Zeilenanfang werden zu Listen
function textEinfuegen(text) {
  const el = editorEl(); if (!el || !text) return;
  if (document.activeElement !== el) el.focus();
  const zeilen = text.replace(/\r\n?/g, '\n').split('\n');
  zeilen.forEach((z, k) => {
    if (k > 0) document.execCommand('insertParagraph');
    let m, art = null, ebene = 0;
    if ((m = /^(\s*)[•·▪◦\-–*]\s+/.exec(z))) { art = 'bullet'; ebene = m[1].length >= 2 || /^[\s]*[◦–]/.test(z) ? 1 : 0; z = z.slice(m[0].length); }
    else if ((m = /^(\s*)(\d+|[a-z])[.)]\s+/.exec(z))) { art = 'num'; ebene = /[a-z]/.test(m[2]) || m[1].length >= 2 ? 1 : 0; z = z.slice(m[0].length); }
    if (art) { const p = aktuellerAbsatz(el); if (p) { p.dataset.list = art; p.dataset.level = String(ebene); } }
    if (z) document.execCommand('insertText', false, z);
  });
  nachFormat(el);
}
async function ausAblageEinfuegen() {
  try { textEinfuegen(await navigator.clipboard.readText()); }
  catch (e) { toast('Einfügen ging nicht – bitte Strg+V oder lange drücken → Einfügen.'); }
}
async function auswahlKopieren() {
  const el = editorEl(); if (!el) return;
  let t = String(getSelection()).trim();
  if (!t || !el.contains(getSelection().anchorNode)) t = boxText({ paras: editorLesen(el, state.editing.d.scale) });
  try { await navigator.clipboard.writeText(t); } catch (e) { document.execCommand('copy'); }
  toast('Kopiert: ' + (t.length > 60 ? t.slice(0, 60) + ' …' : t));
}

/* ---------- Die schwebende Leiste ---------- */
function leisteBauen() {
  const bar = document.createElement('div'); bar.id = 'fmtBar';
  const farben = Object.entries(TEXTFARBEN).map(([k, v]) => `<button class="fb dot" data-farbe="${k}" title="${v.name}"><span style="background:${v.css}"></span></button>`).join('');
  bar.innerHTML = `
  <div class="reihe">
    ${Object.entries(SCHNELLSTILE).map(([k, v]) => `<button class="fb stil" data-schnell="${k}" title="Absatz als ${v.name.replace(/^[•–] /, '')}">${v.name}</button>`).join('')}
    <i class="trenn"></i>
    <button class="fb wahl" id="fmtFont" title="Schriftart">Schrift ▾</button>
    <button class="fb" data-cmd="kleiner" title="Kleiner">A−</button><span id="fmtSize">11</span><button class="fb" data-cmd="groesser" title="Grösser">A+</button>
    <i class="trenn"></i>
    <button class="fb" data-cmd="bold" title="Fett (Strg+B)"><b>F</b></button>
    <button class="fb" data-cmd="italic" title="Kursiv (Strg+I)"><i style="font-family:serif">K</i></button>
    <button class="fb" data-cmd="underline" title="Unterstrichen (Strg+U)"><u>U</u></button>
    <button class="fb" data-cmd="strikeThrough" title="Durchgestrichen"><s>ab</s></button>
  </div>
  <div class="reihe">
    ${farben}
    <button class="fb wahl" id="fmtMark" title="Textmarker hinter den markierten Wörtern"><span class="mk"></span>Marker ▾</button>
    <i class="trenn"></i>
    <button class="fb" data-align="left" title="Linksbündig">⟸</button><button class="fb" data-align="center" title="Zentriert">⇔</button><button class="fb" data-align="right" title="Rechtsbündig">⟹</button>
    <i class="trenn"></i>
    <button class="fb" data-cmd="bullet" title="Aufzählung mit Punkten">• Liste</button>
    <button class="fb" data-cmd="num" title="Nummerierte Liste">1. Liste</button>
    <button class="fb" data-cmd="aus" title="Ausrücken (Shift+Tab)">⇤</button><button class="fb" data-cmd="ein" title="Einrücken (Tab)">⇥</button>
    <i class="trenn"></i>
    <button class="fb" id="fmtRahmen" title="Rahmen um das Textfeld">▢ Rahmen</button>
    <button class="fb wahl" id="fmtFuell" title="Hintergrund des Textfelds">Hintergrund ▾</button>
    <i class="trenn"></i>
    <button class="fb" data-cmd="einfuegen" title="Text aus der Zwischenablage einfügen">Einfügen</button>
    <button class="fb" data-cmd="kopieren" title="Markierten Text kopieren (sonst alles)">Kopieren</button>
    <button class="fb" data-cmd="baustein" title="Dieses Textfeld als Baustein speichern">★ Baustein</button>
    <button class="fb ok" data-cmd="fertig" title="Fertig (Esc)">✓ Fertig</button>
  </div>`;
  document.body.appendChild(bar);
  // Fokus im Textfeld lassen: Knöpfe dürfen ihn nicht wegnehmen
  for (const t of ['pointerdown', 'mousedown']) bar.addEventListener(t, e => { if (!e.target.closest('input')) e.preventDefault(); });
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.schnell) schnellstil(b.dataset.schnell);
    else if (b.dataset.farbe) befehl('foreColor', TEXTFARBEN[b.dataset.farbe].css);
    else if (b.dataset.align) ausrichten(b.dataset.align);
    else if (b.id === 'fmtFont') popup(b, Object.entries(SCHRIFTEN).filter(([k]) => !satz.fehlt.has(k)).map(([k, v]) => ({ html: `<span style='font-family:${v.css}'>${v.name}</span>`, tun: () => befehl('fontName', v.css) })));
    else if (b.id === 'fmtMark') popup(b, [{ html: 'Kein Marker', tun: () => befehl('hiliteColor', 'transparent') },
      ...Object.entries(MARKER_COLORS).map(([k, v]) => ({ html: `<span class="mk" style="background:${v.css}"></span>${v.name}`, tun: () => befehl('hiliteColor', markerCss(k)) }))]);
    else if (b.id === 'fmtFuell') popup(b, [{ html: 'Kein Hintergrund', tun: () => boxEigenschaft('fuellung', null) },
      ...Object.entries(FUELLUNGEN).map(([k, v]) => ({ html: `<span class="mk" style="background:${v.css};border:1px solid #ccc"></span>${v.name}`, tun: () => boxEigenschaft('fuellung', k) }))]);
    else if (b.id === 'fmtRahmen') boxEigenschaft('rahmen', state.editing && state.editing.annot.rahmen ? null : (stilAnSchreibmarke(editorEl()).c || 'black'));
    else switch (b.dataset.cmd) {
      case 'bold': case 'italic': case 'underline': case 'strikeThrough': befehl(b.dataset.cmd); break;
      case 'kleiner': groesseSetzen(aktuelleGroesse() - 1); break;
      case 'groesser': groesseSetzen(aktuelleGroesse() + 1); break;
      case 'bullet': liste('bullet'); break;
      case 'num': liste('num'); break;
      case 'ein': einruecken(1); break;
      case 'aus': einruecken(-1); break;
      case 'einfuegen': ausAblageEinfuegen(); break;
      case 'kopieren': auswahlKopieren(); break;
      case 'baustein': bausteinAusEditor(); break;
      case 'fertig': commitEdit(); break;
    }
  });
  return bar;
}
function boxEigenschaft(k, v) {
  const e = state.editing; if (!e || e.kind !== 'box') return;
  e.annot[k] = v;
  const el = e.input, s = e.d.scale;
  el.style.background = e.annot.fuellung && FUELLUNGEN[e.annot.fuellung] ? FUELLUNGEN[e.annot.fuellung].css : '';
  el.style.boxShadow = e.annot.rahmen ? `inset 0 0 0 ${Math.max(1, 0.8 * s)}px ${(TEXTFARBEN[e.annot.rahmen] || TEXTFARBEN.black).css}` : '';
  leisteAktualisieren();
}
function leiste() { return $('#fmtBar') || leisteBauen(); }
function leisteZeigen() { leiste().classList.add('show'); leisteAktualisieren(); leistePlatzieren(); }
function leisteVerstecken() { const b = $('#fmtBar'); if (b) b.classList.remove('show'); popupZu(); }
function leistePlatzieren() {
  const el = editorEl(), bar = $('#fmtBar'); if (!el || !bar) return;
  const r = el.getBoundingClientRect(), bh = bar.offsetHeight, bw = bar.offsetWidth;
  const oben = $('#bar').getBoundingClientRect().bottom + 4;
  let top = r.top - bh - 8;
  if (top < oben) top = Math.min(r.bottom + 8, innerHeight - bh - 8);   // kein Platz oben: unter das Textfeld
  if (top < oben) top = oben;
  bar.style.top = top + 'px';
  bar.style.left = Math.max(8, Math.min(r.left, innerWidth - bw - 8)) + 'px';
}
function leisteAktualisieren() {
  const el = editorEl(), bar = $('#fmtBar'); if (!el || !bar) return;
  const st = stilAnSchreibmarke(el);
  const an = (sel, on) => { const b = bar.querySelector(sel); if (b) b.classList.toggle('an', !!on); };
  an('[data-cmd="bold"]', st.b); an('[data-cmd="italic"]', st.i); an('[data-cmd="underline"]', st.u); an('[data-cmd="strikeThrough"]', st.s);
  bar.querySelector('#fmtSize').textContent = String(st.z).replace('.', ',');
  bar.querySelector('#fmtFont').textContent = (SCHRIFTEN[st.f] || SCHRIFTEN.helv).name + ' ▾';
  bar.querySelectorAll('[data-farbe]').forEach(b => b.classList.toggle('an', b.dataset.farbe === st.c));
  bar.querySelector('#fmtMark .mk').style.background = st.m ? MARKER_COLORS[st.m].css : 'transparent';
  const p = aktuellerAbsatz(el);
  an('[data-cmd="bullet"]', p && p.dataset.list === 'bullet'); an('[data-cmd="num"]', p && p.dataset.list === 'num');
  const al = (p && p.style.textAlign) || 'left';
  bar.querySelectorAll('[data-align]').forEach(b => b.classList.toggle('an', b.dataset.align === al));
  an('#fmtRahmen', state.editing.annot.rahmen); an('#fmtFuell', state.editing.annot.fuellung);
}
document.addEventListener('selectionchange', () => { if (editorEl()) leisteAktualisieren(); });
document.getElementById('viewer').addEventListener('scroll', () => { if (editorEl()) leistePlatzieren(); popupZu(); });
window.addEventListener('resize', () => { if (editorEl()) leistePlatzieren(); });

/* ---------- Kleine Auswahlmenüs ---------- */
function popup(knopf, eintraege) {
  popupZu();
  const pop = document.createElement('div'); pop.className = 'fmtPop';
  for (const en of eintraege) {
    const b = document.createElement('button'); b.innerHTML = en.html;
    b.onclick = () => { popupZu(); en.tun(); };
    pop.appendChild(b);
  }
  for (const t of ['pointerdown', 'mousedown']) pop.addEventListener(t, e => e.preventDefault());
  document.body.appendChild(pop);
  const r = knopf.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(r.left, innerWidth - pop.offsetWidth - 8)) + 'px';
  pop.style.top = (r.bottom + pop.offsetHeight + 6 < innerHeight ? r.bottom + 4 : r.top - pop.offsetHeight - 4) + 'px';
  setTimeout(() => document.addEventListener('pointerdown', popupAussen, true), 0);
}
function popupAussen(e) { if (!e.target.closest('.fmtPop')) popupZu(); }
function popupZu() { document.querySelectorAll('.fmtPop').forEach(p => p.remove()); document.removeEventListener('pointerdown', popupAussen, true); }
