'use strict';
/* ================= Objekte: Abdecken, Formen, Fotos, Bausteine, Seiten =================
   Alle Koordinaten sind PDF-Punkte der angezeigten Seite (oben links = 0/0), wie im Rest der App. */

const FORMEN = { rect: '▭ Rechteck', ellipse: '◯ Kreis', arrow: '→ Pfeil', line: '— Linie' };
const STRICHE = { 1: 'dünn', 2: 'mittel', 3.5: 'dick' };
const BEWEGBAR = new Set(['box', 'cover', 'img', 'shape', 'sig']);

/* ---------- Rückgängig: Einträge UND Seiten (gedreht, gelöscht, leere Seiten) ---------- */
function schnapp(d) {
  return JSON.stringify({ a: d.annots, s: d.pages.map(p => [p.rot || 0, p.weg ? 1 : 0]), r: d.reihe });
}
function zurueck(d, json) {
  const z = JSON.parse(json);
  if (Array.isArray(z)) { d.annots = z; return; }   // alte Form (nur Einträge)
  d.annots = z.a;
  d.pages.forEach((p, k) => { const s = z.s[k] || [0, 1]; p.rot = s[0]; p.weg = !!s[1]; });
  if (z.r) d.reihe = z.r.concat(d.pages.map(p => p.i).filter(i => !z.r.includes(i)));
  seitenAnwenden(d);
}

/* ---------- Umriss, Treffer, Auswahl ---------- */
function objRahmen(a) {
  if (a.type === 'box') return { x: a.x, y: a.y, w: a.w, h: a._h || satzBox(a).h };
  if (a.type === 'shape') return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
  return { x: a.x, y: a.y, w: a.w, h: a.h };
}
function objTreffer(a, x, y, tol) {
  if (a.type === 'shape' && (a.art === 'line' || a.art === 'arrow')) return distSeg(x, y, [a.x1, a.y1], [a.x2, a.y2]) < tol + a.sw;
  if (a.type === 'shape' && a.art !== 'rect' && a.art !== 'ellipse') return false;
  const r = objRahmen(a);
  const innen = x > r.x - tol && x < r.x + r.w + tol && y > r.y - tol && y < r.y + r.h + tol;
  if (!innen) return false;
  if (a.type === 'shape') {   // Rechteck/Kreis nur am Rand treffen, damit man durch sie hindurch tippen kann
    const rand = Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y);
    if (a.art === 'rect') return rand < tol + a.sw;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, q = ((x - cx) / (r.w / 2 || 1)) ** 2 + ((y - cy) / (r.h / 2 || 1)) ** 2;
    return Math.abs(Math.sqrt(q) - 1) * Math.min(r.w, r.h) / 2 < tol + a.sw;
  }
  return true;
}
function zeichneAuswahl(d) {
  document.querySelectorAll('.selbox').forEach(e => e.remove());
  const a = state.sel && d.annots.find(x => x.id === state.sel);
  if (!a || !BEWEGBAR.has(a.type)) return;
  const p = d.pages[a.page], s = d.scale, r = objRahmen(a);
  const b = document.createElement('div'); b.className = 'selbox';
  Object.assign(b.style, { left: (r.x - 3) * s + 'px', top: (r.y - 3) * s + 'px', width: (r.w + 6) * s + 'px', height: (r.h + 6) * s + 'px' });
  const griffe = ['<div class="h del" title="Löschen">✕</div>'];
  if (a.type === 'box') griffe.push('<div class="h breite" title="Breite ändern"></div>');
  else griffe.push('<div class="h rs" title="Grösse ändern"></div>');
  if (a.type !== 'sig') griffe.push('<div class="h dup" title="Verdoppeln">⧉</div>');
  b.innerHTML = griffe.join('');
  p.el.appendChild(b);
}
function objVerschieben(a, dx, dy, start) {
  if (a.type === 'shape') { a.x1 = start.x1 + dx; a.y1 = start.y1 + dy; a.x2 = start.x2 + dx; a.y2 = start.y2 + dy; }
  else { a.x = start.x + dx; a.y = start.y + dy; }
}
function objGroesse(a, griff, dx, dy, start) {
  if (griff === 'breite') { a.w = Math.max(30, start.w + dx); delete a._h; return; }
  if (a.type === 'sig' || a.type === 'img') {   // Seitenverhältnis behalten
    const k = Math.max(0.15, (start.w + dx) / start.w); a.w = start.w * k; a.h = start.h * k; return;
  }
  if (a.type === 'cover') { a.w = Math.max(6, start.w + dx); a.h = Math.max(4, start.h + dy); return; }
  if (a.type === 'shape') {   // Punkte vom oberen linken Eck aus strecken
    const x0 = Math.min(start.x1, start.x2), y0 = Math.min(start.y1, start.y2);
    const w0 = Math.abs(start.x2 - start.x1), h0 = Math.abs(start.y2 - start.y1);
    const kx = w0 > 1 ? Math.max(0.05, (w0 + dx) / w0) : 1, ky = h0 > 1 ? Math.max(0.05, (h0 + dy) / h0) : 1;
    const ox = w0 > 1 ? 0 : dx, oy = h0 > 1 ? 0 : dy;
    a.x1 = x0 + (start.x1 - x0) * kx + (start.x1 >= start.x2 ? ox : 0); a.x2 = x0 + (start.x2 - x0) * kx + (start.x2 > start.x1 ? ox : 0);
    a.y1 = y0 + (start.y1 - y0) * ky + (start.y1 >= start.y2 ? oy : 0); a.y2 = y0 + (start.y2 - y0) * ky + (start.y2 > start.y1 ? oy : 0);
  }
}
function objVerdoppeln(d, a, dx = 14, dy = 14, seite) {
  const n = JSON.parse(JSON.stringify(a)); n.id = uid(); delete n.target; delete n._h;
  if (seite !== undefined) n.page = seite;
  objVerschieben(n, dx, dy, JSON.parse(JSON.stringify(n)));
  pushUndo(d); d.annots.push(n); state.sel = n.id; changed(d);
  return n;
}

/* ---------- Zeichnen am Bildschirm ---------- */
function objSvg(a, ausgewaehlt) {
  if (a.type === 'cover') {
    const sicht = state.tool === 'cover' || ausgewaehlt;
    return `<rect x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" fill="${a.farbe || '#ffffff'}"${sicht ? ' stroke="rgba(29,78,216,.55)" stroke-width=".6" stroke-dasharray="2 1.5"' : ''}/>`;
  }
  if (a.type === 'img') return `<image href="${a.src}" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}" preserveAspectRatio="none"/>`;
  if (a.type === 'shape') {
    const col = COLORS[a.color || 'blue'].css, gemeinsam = `stroke="${col}" stroke-width="${a.sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    const r = objRahmen(a);
    if (a.art === 'rect') return `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" ${gemeinsam}/>`;
    if (a.art === 'ellipse') return `<ellipse cx="${r.x + r.w / 2}" cy="${r.y + r.h / 2}" rx="${r.w / 2}" ry="${r.h / 2}" ${gemeinsam}/>`;
    let s = `<line x1="${a.x1}" y1="${a.y1}" x2="${a.x2}" y2="${a.y2}" ${gemeinsam}/>`;
    if (a.art === 'arrow') { const [p1, p2] = pfeilSpitze(a); s += `<path d="M${p1[0]},${p1[1]} L${a.x2},${a.y2} L${p2[0]},${p2[1]}" ${gemeinsam}/>`; }
    return s;
  }
  return '';
}
function pfeilSpitze(a) {
  const w = Math.atan2(a.y2 - a.y1, a.x2 - a.x1), L = Math.max(7, a.sw * 4.5);
  return [[a.x2 - L * Math.cos(w - 0.45), a.y2 - L * Math.sin(w - 0.45)], [a.x2 - L * Math.cos(w + 0.45), a.y2 - L * Math.sin(w + 0.45)]];
}
function ellipsePunkte(r, n = 56) {
  const out = []; for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; out.push([r.x + r.w / 2 + Math.cos(t) * r.w / 2, r.y + r.h / 2 + Math.sin(t) * r.h / 2]); }
  return out;
}

/* ---------- Zeichnen in die PDF ---------- */
async function objPdf(pdf, pg, raum, a, bilder) {
  const { rgb, degrees, LineCapStyle } = PDFLib;
  if (a.type === 'cover') {
    const c = (a.farbe || '#ffffff').match(/\w\w/g).map(h => parseInt(h, 16) / 255);
    raum.poly([[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]].map(q => raum.P(...q)), { color: rgb(...c) });
  } else if (a.type === 'img') {
    if (!bilder[a.src]) {
      const daten = Uint8Array.from(atob(a.src.split(',')[1]), c => c.charCodeAt(0));
      bilder[a.src] = /^data:image\/png/.test(a.src) ? await pdf.embedPng(daten) : await pdf.embedJpg(daten);
    }
    const o = raum.P(a.x, a.y + a.h);
    pg.drawImage(bilder[a.src], { x: o.x, y: o.y, width: a.w, height: a.h, rotate: degrees(raum.winkel) });
  } else if (a.type === 'shape') {
    const color = rgb(...COLORS[a.color || 'blue'].rgb);
    const linie = (p1, p2) => pg.drawLine({ start: raum.P(...p1), end: raum.P(...p2), thickness: a.sw, color, lineCap: LineCapStyle.Round });
    const r = objRahmen(a);
    if (a.art === 'rect') raum.poly([[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.h], [r.x, r.y + r.h]].map(q => raum.P(...q)), { borderColor: color, borderWidth: a.sw, borderLineCap: LineCapStyle.Round });
    else if (a.art === 'ellipse') raum.poly(ellipsePunkte(r).map(q => raum.P(...q)), { borderColor: color, borderWidth: a.sw });
    else {
      linie([a.x1, a.y1], [a.x2, a.y2]);
      if (a.art === 'arrow') { const [p1, p2] = pfeilSpitze(a); linie(p1, [a.x2, a.y2]); linie(p2, [a.x2, a.y2]); }
    }
  }
}

/* ---------- Werkzeuge Abdecken und Formen (Ziehen) ---------- */
function rechteckLive(p) {
  const L = p.live; if (!L || !L.rahmen) return '';
  const x = Math.min(L.x0, L.x1), y = Math.min(L.y0, L.y1), w = Math.abs(L.x1 - L.x0), h = Math.abs(L.y1 - L.y0);
  if (L.rahmen === 'cover') return `<rect id="live" x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff" stroke="rgba(29,78,216,.7)" stroke-width=".8" stroke-dasharray="3 2"/>`;
  return objSvg({ type: 'shape', art: state.form.art, x1: L.x0, y1: L.y0, x2: L.x1, y2: L.y1, sw: state.form.sw, color: state.color });
}
function rechteckFertig(d, p, L) {
  const x = Math.min(L.x0, L.x1), y = Math.min(L.y0, L.y1), w = Math.abs(L.x1 - L.x0), h = Math.abs(L.y1 - L.y0);
  if (L.rahmen === 'cover') {
    const c = w > 4 && h > 3 ? { x, y, w, h } : { x: L.x0 - 4, y: L.y0 - 8, w: 110, h: 14 };
    pushUndo(d);
    d.annots.push({ id: uid(), type: 'cover', page: p.i, ...c, farbe: '#ffffff' });
    changed(d);
    // Gleich darüber neu schreiben: Textfeld in Grösse der Abdeckung öffnen
    const z = Math.max(6, Math.min(14, c.h * 0.72));
    const box = boxNeu(p, c.x + SATZ.pad, c.y + z * 0.9 + SATZ.pad + Math.max(0, (c.h - z * SATZ.zeile - 2 * SATZ.pad) / 2), { w: Math.max(40, c.w), stil: { z } });
    boxBearbeiten(d, p, box);
    return;
  }
  if (Math.hypot(w, h) < 4) { drawOverlay(d, p); return; }
  pushUndo(d);
  d.annots.push({ id: uid(), type: 'shape', page: p.i, art: state.form.art, x1: L.x0, y1: L.y0, x2: L.x1, y2: L.y1, sw: state.form.sw, color: state.color });
  changed(d);
}
// Leiste mit der Formauswahl (nur im Werkzeug „Formen“ sichtbar)
function formWahlZeigen(an) {
  let w = $('#formWahl');
  if (!w) {
    w = document.createElement('div'); w.id = 'formWahl';
    w.innerHTML = Object.entries(FORMEN).map(([k, v]) => `<button data-art="${k}">${v}</button>`).join('') + '<i class="trenn"></i>' +
      Object.entries(STRICHE).map(([k, v]) => `<button data-sw="${k}">${v}</button>`).join('');
    w.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.art) state.form.art = b.dataset.art; else state.form.sw = +b.dataset.sw;
      savePrefs(); formWahlZeigen(true);
    };
    document.body.appendChild(w);
  }
  w.classList.toggle('show', an);
  w.style.top = ($('#bar').offsetHeight + ($('#tabs').offsetHeight || 0) + 8) + 'px';
  w.querySelectorAll('[data-art]').forEach(b => b.classList.toggle('an', b.dataset.art === state.form.art));
  w.querySelectorAll('[data-sw]').forEach(b => b.classList.toggle('an', +b.dataset.sw === state.form.sw));
}

/* ---------- Fotos ---------- */
async function fotoGewaehlt(datei) {
  const d = doc(); if (!d || !datei) return;
  const bild = await new Promise((ok, fehler) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fehler; i.src = URL.createObjectURL(datei); });
  // Grosse Handyfotos verkleinern, sonst wird die PDF riesig
  const max = 1600, k = Math.min(1, max / Math.max(bild.naturalWidth, bild.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.round(bild.naturalWidth * k); c.height = Math.round(bild.naturalHeight * k);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bild, 0, 0, c.width, c.height);
  URL.revokeObjectURL(bild.src);
  const png = /png/i.test(datei.type) && datei.size < 400000;
  const src = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
  const p = sichtbareSeite(d);
  const w = Math.min(p.w * 0.5, 220), h = w * c.height / c.width;
  const mitte = sichtbareMitte(d, p);
  pushUndo(d);
  const a = { id: uid(), type: 'img', page: p.i, x: mitte.x - w / 2, y: mitte.y - h / 2, w, h, src };
  d.annots.push(a); state.sel = a.id; changed(d);
  toast('Foto eingefügt – ziehen zum Verschieben, Ecke ziehen für die Grösse.');
}
function sichtbareSeite(d) {
  const vr = viewer.getBoundingClientRect(); let best = d.pages[0], bd = Infinity;
  for (const p of d.pages) {
    if (p.weg) continue;
    const r = p.el.getBoundingClientRect(); const mitte = (r.top + r.bottom) / 2;
    const dd = Math.abs(mitte - (vr.top + vr.height / 2)); if (dd < bd) { bd = dd; best = p; }
  }
  return best;
}
function sichtbareMitte(d, p) {
  const vr = viewer.getBoundingClientRect(), r = p.el.getBoundingClientRect();
  const y = Math.max(r.top, Math.min(r.bottom, vr.top + vr.height / 2));
  return { x: p.w / 2, y: Math.max(40, Math.min(p.h - 40, (y - r.top) / d.scale)) };
}

/* ---------- Textbausteine / Stempel ---------- */
const BAUSTEINE_VORGABE = [
  { name: 'Erledigt', w: 96, rahmen: 'red', paras: [{ list: null, level: 0, align: 'center', runs: [{ ...STIL_VORGABE, t: 'ERLEDIGT', b: 1, z: 14, c: 'red' }] }] },
  { name: 'Geprüft', w: 96, rahmen: 'green', paras: [{ list: null, level: 0, align: 'center', runs: [{ ...STIL_VORGABE, t: 'GEPRÜFT', b: 1, z: 14, c: 'green' }] }] },
  { name: 'In Ordnung', w: 110, rahmen: 'green', paras: [{ list: null, level: 0, align: 'center', runs: [{ ...STIL_VORGABE, t: 'IN ORDNUNG', b: 1, z: 12, c: 'green' }] }] },
  { name: 'Nachkontrolle nötig', w: 170, rahmen: 'orange', paras: [{ list: null, level: 0, align: 'center', runs: [{ ...STIL_VORGABE, t: 'NACHKONTROLLE NÖTIG', b: 1, z: 12, c: 'orange' }] }] },
  { name: 'Datum heute', w: 80, paras: [{ list: null, level: 0, align: 'left', runs: [{ ...STIL_VORGABE, t: '{datum}' }] }] },
];
function bausteine() {
  try { const b = JSON.parse(localStorage.getItem(LS_PREFIX + 'bausteine') || 'null'); if (Array.isArray(b)) return b; } catch (e) {}
  return JSON.parse(JSON.stringify(BAUSTEINE_VORGABE));
}
function bausteineSpeichern(liste) { try { localStorage.setItem(LS_PREFIX + 'bausteine', JSON.stringify(liste)); } catch (e) { toast('Bausteine konnten nicht gespeichert werden.'); } }
function bausteineOeffnen(knopf) {
  const liste = bausteine();
  popup(knopf, [
    ...liste.map((b, k) => ({ html: `<span class="bsName">${esc(b.name)}</span><span class="bsDel" data-k="${k}" title="Baustein löschen">✕</span>`,
      tun: () => { state.pendingBaustein = b; updateUI(); } })),
    { html: '<span class="leise">Eigene Bausteine: Textfeld bearbeiten → „★ Baustein“</span>', tun: () => {} },
  ]);
  const pop = $('.fmtPop');
  pop.addEventListener('click', e => {
    const x = e.target.closest('.bsDel'); if (!x) return;
    e.stopPropagation();
    const l = bausteine(), k = +x.dataset.k;
    if (!confirm(`Baustein „${l[k].name}“ löschen?`)) return;
    l.splice(k, 1); bausteineSpeichern(l); popupZu(); bausteineOeffnen(knopf);
  }, true);
}
function bausteinSetzen(d, p, b, x, y) {
  const paras = JSON.parse(JSON.stringify(b.paras).replace(/\{datum\}/g, today()));
  const box = boxNeu(p, x, y, { w: b.w || 160, paras, rahmen: b.rahmen || null, fuellung: b.fuellung || null });
  const r = { w: box.w, h: satzBox(box).h };
  box.x = Math.max(4, Math.min(p.w - r.w - 4, x - r.w / 2)); box.y = Math.max(4, Math.min(p.h - r.h - 4, y - r.h / 2));
  pushUndo(d); d.annots.push(box); state.sel = box.id; changed(d);
}
function bausteinAusEditor() {
  const e = state.editing; if (!e || e.kind !== 'box') return;
  const paras = editorLesen(e.input, e.d.scale);
  if (boxLeer({ paras })) { toast('Das Textfeld ist leer.'); return; }
  const vorschlag = paras[0].runs.map(r => r.t).join('').slice(0, 30);
  const name = prompt('Name für den Baustein:', vorschlag);
  if (!name) { e.input.focus(); return; }
  const l = bausteine(); l.push({ name, w: e.annot.w, rahmen: e.annot.rahmen || null, fuellung: e.annot.fuellung || null, paras });
  bausteineSpeichern(l); toast(`Baustein „${name}“ gespeichert.`); e.input.focus();
}

/* ---------- Seiten: drehen, löschen, leere Seite ---------- */
function seitenViewport(p, scale) {
  if (p.page) return p.page.getViewport({ scale, rotation: ((p.page.rotate || 0) + (p.rot || 0)) % 360 });
  return leerViewport(p.bw, p.bh, scale, p.rot || 0);
}
// Für leere Seiten (ohne pdf.js-Seite): gleiche Umrechnung wie pdf.js' PageViewport
function leerViewport(w, h, scale, rotation) {
  const cx = w / 2, cy = h / 2;
  const [A, B, C, D] = { 0: [1, 0, 0, -1], 90: [0, 1, 1, 0], 180: [-1, 0, 0, 1], 270: [0, -1, -1, 0] }[rotation];
  const quer = A === 0;
  const ox = (quer ? cy : cx) * scale, oy = (quer ? cx : cy) * scale;
  const transform = [A * scale, B * scale, C * scale, D * scale, ox - A * scale * cx - C * scale * cy, oy - B * scale * cx - D * scale * cy];
  return {
    width: (quer ? h : w) * scale, height: (quer ? w : h) * scale, scale, rotation, transform,
    convertToViewportPoint: (x, y) => pdfjsLib.Util.applyTransform([x, y], transform),
    convertToPdfPoint: (x, y) => pdfjsLib.Util.applyInverseTransform([x, y], transform),
  };
}
function seiteEinrichten(d, p) {   // Grösse/Ausrichtung übernehmen (nach Drehen)
  p.vp1 = seitenViewport(p, 1); p.w = p.vp1.width; p.h = p.vp1.height; p.drehAkt = p.rot || 0;
  p.svg.setAttribute('viewBox', `0 0 ${p.w} ${p.h}`);
  p.renderedAt = null; p.tlScale = null; p.tc = null;
}
function seitenWerkzeuge(d, p) {
  const w = document.createElement('div'); w.className = 'seitenwz';
  w.innerHTML = '<button data-s="drehen" title="Seite drehen">↻</button><button data-s="leer" title="Leere Seite danach einfügen">＋</button><button data-s="weg" title="Seite löschen">🗑</button>';
  w.addEventListener('pointerdown', e => e.stopPropagation());
  w.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.s === 'drehen') seiteDrehen(d, p); else if (b.dataset.s === 'leer') leereSeite(d, p); else seiteLoeschen(d, p);
  };
  p.el.appendChild(w);
}
function seiteDrehen(d, p) {
  commitEdit();
  if (d.annots.some(a => a.page === p.i)) { toast('Auf dieser Seite ist schon etwas eingetragen. Bitte zuerst drehen, dann ausfüllen.', 4000); return; }
  pushUndo(d); p.rot = ((p.rot || 0) + 90) % 360; seitenAnwenden(d); changed(d);
}
function seiteLoeschen(d, p) {
  commitEdit();
  if (d.pages.filter(q => !q.weg).length < 2) { toast('Die letzte Seite kann nicht gelöscht werden.'); return; }
  const n = d.reihe.filter(i => !d.pages[i].weg).indexOf(p.i) + 1;
  if (!confirm(`Seite ${n} löschen? Einträge auf dieser Seite werden mitgelöscht.\n(Rückgängig ist möglich.)`)) return;
  pushUndo(d);
  d.annots = d.annots.filter(a => a.page !== p.i); p.weg = true;
  seitenAnwenden(d); changed(d);
}
function leereSeite(d, nach) {
  commitEdit();
  pushUndo(d);
  const p = leereSeiteAnlegen(d, nach.w, nach.h);
  d.reihe.splice(d.reihe.indexOf(nach.i) + 1, 0, p.i);
  seitenAnwenden(d); changed(d);
  toast('Leere Seite eingefügt.');
}
function leereSeiteAnlegen(d, bw, bh) {
  const p = { i: d.pages.length, page: null, src: null, rot: 0, weg: false, bw, bh, targets: [], fields: [], sigTargets: [] };
  p.el = document.createElement('div'); p.el.className = 'page';
  p.canvas = document.createElement('canvas');
  p.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); p.svg.setAttribute('class', 'ov'); p.svg.setAttribute('preserveAspectRatio', 'none');
  p.tl = document.createElement('div'); p.tl.className = 'textLayer';
  p.num = document.createElement('div'); p.num.className = 'pnum';
  p.el.append(p.canvas, p.svg, p.tl, p.num);
  d.el.appendChild(p.el);
  seiteEinrichten(d, p);
  seitenWerkzeuge(d, p);
  d.pages.push(p);
  return p;
}
// Reihenfolge, Sichtbarkeit, Drehung und Seitennummern auf die Anzeige übertragen
function seitenAnwenden(d) {
  for (const i of d.reihe) d.el.appendChild(d.pages[i].el);
  const sichtbar = d.reihe.filter(i => !d.pages[i].weg);
  for (const p of d.pages) {
    p.el.style.display = p.weg ? 'none' : '';
    if ((p.rot || 0) !== (p.drehAkt || 0)) {
      seiteEinrichten(d, p);
      if (p.page) analyzePage(d, p).catch(e => console.warn(e)).then(() => { d.fields = d.pages.flatMap(q => q.weg ? [] : q.fields); drawOverlay(d, p); });
      else { p.targets = []; p.fields = []; p.sigTargets = []; }
    }
    const k = sichtbar.indexOf(p.i);
    if (p.num) p.num.textContent = k >= 0 ? `Seite ${k + 1} / ${sichtbar.length}` : '';
  }
  d.fields = d.pages.flatMap(q => q.weg ? [] : q.fields);
  if (state.active === d) renderAll(d);
}
