'use strict';
/* ================= Schriften und Textsatz =================
   Ein Textfeld („box“) besteht aus Absätzen, ein Absatz aus Stücken („runs“) mit eigener Schrift.
   Zeilenumbruch und Positionen werden hier EINMAL berechnet – mit den Schriftmassen von pdf-lib –
   und gleich für Bildschirm (SVG) und PDF benutzt. So sieht die gespeicherte PDF genau aus wie am Schirm.

   Absatz:  { list: null|'bullet'|'num', level: 0|1, align: 'left'|'center'|'right', runs: [Stück] }
   Stück:   { t: Text, f: Schrift, z: Grösse pt, b: fett, i: kursiv, u: unterstrichen, s: durchgestrichen,
              c: Farbe, m: Textmarker-Farbe oder null } */

const SCHRIFTEN = {
  helv:   { name: 'Arial-ähnlich', css: 'Arial, Helvetica, sans-serif',
            std: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'] },
  times:  { name: 'Times', css: '"Times New Roman", Times, serif',
            std: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'] },
  cour:   { name: 'Schreibmaschine', css: '"Courier New", Courier, monospace',
            std: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] },
  inter:  { name: 'Inter', css: '"RT Inter", Arial, sans-serif',
            ttf: ['Inter-Regular', 'Inter-Bold', 'Inter-Italic', 'Inter-BoldItalic'] },
  roboto: { name: 'Roboto', css: '"RT Roboto", Arial, sans-serif',
            ttf: ['Roboto-Regular', 'Roboto-Bold', 'Roboto-Italic', 'Roboto-BoldItalic'] },
};
const TEXTFARBEN = {
  black:  { css: '#111111', rgb: [0.07, 0.07, 0.07], name: 'Schwarz' },
  blue:   { css: '#14338c', rgb: [0.078, 0.2, 0.55], name: 'Blau' },
  red:    { css: '#c81e1e', rgb: [0.784, 0.118, 0.118], name: 'Rot' },
  green:  { css: '#1b7f3b', rgb: [0.106, 0.498, 0.231], name: 'Grün' },
  orange: { css: '#d96a00', rgb: [0.851, 0.416, 0], name: 'Orange' },
  gray:   { css: '#6b7280', rgb: [0.42, 0.447, 0.502], name: 'Grau' },
};
const FUELLUNGEN = {   // Hintergrund eines ganzen Textfelds
  white:  { css: '#ffffff', rgb: [1, 1, 1], name: 'Weiss' },
  gray:   { css: '#eef0f3', rgb: [0.933, 0.941, 0.953], name: 'Hellgrau' },
  yellow: { css: '#fff6c2', rgb: [1, 0.965, 0.761], name: 'Hellgelb' },
};
const STIL_VORGABE = { f: 'helv', z: 11, b: 0, i: 0, u: 0, s: 0, c: 'black', m: null };
const SATZ = { pad: 3, zeile: 1.28, grund: 0.95, einzug: 13 };   // Innenabstand, Zeilenhöhe, Grundlinie, Einzug je Ebene (pt)

const satz = { doc: null, fonts: {}, bytes: {}, fehlt: new Set(), bereit: null };

// Einmal beim Start: Schriften für das Ausmessen laden und für den Bildschirm anmelden
satz.bereit = (async () => {
  satz.doc = await PDFLib.PDFDocument.create();
  if (window.fontkit) satz.doc.registerFontkit(fontkit);
  for (const [key, s] of Object.entries(SCHRIFTEN)) {
    satz.fonts[key] = [];
    for (let v = 0; v < 4; v++) {
      if (s.std) { satz.fonts[key][v] = await satz.doc.embedFont(PDFLib.StandardFonts[s.std[v]]); continue; }
      try {
        const name = s.ttf[v];
        const r = await fetch('fonts/' + name + '.ttf');
        if (!r.ok) throw new Error(r.status);
        const bytes = new Uint8Array(await r.arrayBuffer());
        satz.bytes[name] = bytes;
        satz.fonts[key][v] = await satz.doc.embedFont(bytes, { subset: true });
        const ff = new FontFace(s.css.split(',')[0].replace(/"/g, ''), bytes, { weight: v & 1 ? '700' : '400', style: v & 2 ? 'italic' : 'normal' });
        document.fonts.add(await ff.load());
      } catch (e) {
        // z. B. als Datei (file://) geöffnet: dann gibt es nur die Grundschriften
        satz.fehlt.add(key); satz.fonts[key] = satz.fonts.helv; break;
      }
    }
  }
})().catch(e => console.warn('Schriften', e));

const variante = st => (st.b ? 1 : 0) + (st.i ? 2 : 0);
function schriftVon(st) { const f = satz.fonts[st.f] || satz.fonts.helv; return f && f[variante(st)]; }

// Zeichen, die eine Schrift nicht kennt (z. B. Emojis in Helvetica), werden zu „?“ statt die PDF zu zerstören
const zeichenOk = new Map();
function sicher(font, text) {
  let m = zeichenOk.get(font); if (!m) { m = new Map(); zeichenOk.set(font, m); }
  let out = '';
  for (const ch of text) {
    let ok = m.get(ch);
    if (ok === undefined) { try { font.encodeText(ch); ok = true; } catch (e) { ok = false; } m.set(ch, ok); }
    out += ok ? ch : '?';
  }
  return out;
}
function breite(st, text) {
  const f = schriftVon(st);
  if (!f) { mctx.font = `${st.b ? 'bold ' : ''}${st.i ? 'italic ' : ''}${st.z}px Arial`; return mctx.measureText(text).width; }
  return f.widthOfTextAtSize(sicher(f, text), st.z);
}

/* ---------- Absatz-Hilfen ---------- */
function absatzLeer(stil) { return { list: null, level: 0, align: 'left', runs: [{ ...STIL_VORGABE, ...(stil || {}), t: '' }] }; }
function boxText(a) {   // reiner Text (für Kopieren), mit Listenzeichen
  const marken = listenMarken(a.paras);
  return a.paras.map((p, k) => (marken[k] ? (p.level ? '    ' : '') + marken[k] + ' ' : '') + p.runs.map(r => r.t).join('')).join('\n');
}
function boxLeer(a) { return !a.paras || a.paras.every(p => !p.runs.some(r => r.t.trim())); }
// Listenzeichen je Absatz: • und – für Punkte, 1. 2. und a) b) für Nummern (zählt fortlaufend je Ebene)
function listenMarken(paras) {
  const out = []; const zaehler = [0, 0];
  for (const p of paras) {
    if (!p.list) { out.push(null); zaehler[0] = zaehler[1] = 0; continue; }
    const L = p.level ? 1 : 0;
    if (L === 0) zaehler[1] = 0;
    if (p.list === 'bullet') { out.push(L ? '–' : '•'); continue; }
    zaehler[L]++;
    out.push(L ? String.fromCharCode(96 + Math.min(zaehler[L], 26)) + ')' : zaehler[L] + '.');
  }
  return out;
}

/* ---------- Zeilenumbruch ---------- */
// Ergebnis: { h, zeilen: [{ base, items: [{ t, st, x, w }], marke: { t, st, x } }] } – alles relativ zur Box-Oberkante
function satzBox(a) {
  const W = Math.max(20, a.w - 2 * SATZ.pad);
  const zeilen = []; let y = SATZ.pad;
  const marken = listenMarken(a.paras);
  a.paras.forEach((p, k) => {
    const erster = p.runs.find(r => r.t) || p.runs[0] || STIL_VORGABE;
    const zBasis = erster.z || 11;
    const einzug = p.list ? SATZ.einzug * (zBasis / 11) * ((p.level ? 1 : 0) + 1) : 0;
    const markeX = p.list ? einzug - SATZ.einzug * (zBasis / 11) : 0;
    const frei = Math.max(10, W - einzug);
    // Wörter bilden: ein Wort darf aus mehreren Stücken bestehen (z. B. halb fett), Leerzeichen trennen
    const woerter = []; let wort = null;
    for (const r of p.runs) {
      const st = { ...STIL_VORGABE, ...r };
      for (const teil of r.t.match(/\s+|[^\s]+/g) || []) {
        if (/^\s+$/.test(teil)) { wort = null; woerter.push({ leer: true, stuecke: [{ t: teil.replace(/\s/g, ' '), st, w: breite(st, teil.replace(/\s/g, ' ')) }] }); }
        else { if (!wort) { wort = { leer: false, stuecke: [] }; woerter.push(wort); } wort.stuecke.push({ t: teil, st, w: breite(st, teil) }); }
      }
    }
    const zeilenDesAbsatzes = []; let akt = { items: [], w: 0 };
    const neueZeile = () => { zeilenDesAbsatzes.push(akt); akt = { items: [], w: 0 }; };
    for (const wd of woerter) {
      const ww = wd.stuecke.reduce((s, x) => s + x.w, 0);
      if (wd.leer) { if (akt.items.length) { akt.items.push(...wd.stuecke.map(x => ({ ...x, leer: true }))); akt.w += ww; } continue; }
      const ohneLeer = akt.w - endLeer(akt.items);
      if (akt.items.length && ohneLeer + ww > frei + 0.01) { trimmen(akt); neueZeile(); }
      if (ww <= frei || akt.items.length) { akt.items.push(...wd.stuecke.map(x => ({ ...x }))); akt.w += ww; continue; }
      // Wort länger als die ganze Zeile: zeichenweise umbrechen
      for (const s of wd.stuecke) for (const ch of s.t) {
        const cw = breite(s.st, ch);
        if (akt.items.length && akt.w + cw > frei + 0.01) neueZeile();
        const letzt = akt.items[akt.items.length - 1];
        if (letzt && letzt.st === s.st && !letzt.leer) { letzt.t += ch; letzt.w += cw; } else akt.items.push({ t: ch, st: s.st, w: cw });
        akt.w += cw;
      }
    }
    trimmen(akt); neueZeile();
    zeilenDesAbsatzes.forEach((z, zi) => {
      const zmax = Math.max(zBasis, ...z.items.map(i => i.st.z));
      const base = y + zmax * SATZ.grund;
      let x = einzug + (p.align === 'right' ? frei - z.w : p.align === 'center' ? (frei - z.w) / 2 : 0);
      x = Math.max(einzug, x);
      // Nebeneinanderliegende Stücke mit gleicher Schrift zusammenfassen (inkl. Leerzeichen): ein Text-Befehl
      // je Abschnitt – so lässt sich der Text auch aus der fertigen PDF sauber kopieren
      const items = [];
      for (const it of z.items) {
        const letzt = items[items.length - 1];
        if (letzt && letzt.st === it.st) { letzt.t += it.t; letzt.w += it.w; letzt.leer = letzt.leer && it.leer; }
        else items.push({ t: it.t, st: it.st, x: SATZ.pad + x, w: it.w, leer: !!it.leer });
        x += it.w;
      }
      const zeile = { base, items, h: zmax * SATZ.zeile };
      if (zi === 0 && marken[k]) {
        const mst = { ...STIL_VORGABE, ...erster, u: 0, s: 0, m: null, b: erster.b, i: 0 };
        zeile.marke = { t: marken[k], st: mst, x: SATZ.pad + markeX + (p.list === 'num' ? 0 : SATZ.einzug * (zBasis / 11) * 0.15) };
      }
      zeilen.push(zeile);
      y += zmax * SATZ.zeile;
    });
  });
  return { h: Math.max(y + SATZ.pad, 12), zeilen };
}
function endLeer(items) { let w = 0; for (let k = items.length - 1; k >= 0 && items[k].leer; k--) w += items[k].w; return w; }
function trimmen(z) { while (z.items.length && z.items[z.items.length - 1].leer) z.w -= z.items.pop().w; }

/* ---------- Zeichnen am Bildschirm (SVG im Overlay) ---------- */
function boxSvg(a) {
  const L = satzBox(a); a._h = L.h;
  const out = [`<g transform="translate(${a.x},${a.y})">`];
  if (a.fuellung && FUELLUNGEN[a.fuellung]) out.push(`<rect x="0" y="0" width="${a.w}" height="${L.h}" fill="${FUELLUNGEN[a.fuellung].css}"/>`);
  if (a.rahmen) out.push(`<rect x="0.4" y="0.4" width="${a.w - 0.8}" height="${L.h - 0.8}" fill="none" stroke="${(TEXTFARBEN[a.rahmen] || TEXTFARBEN.black).css}" stroke-width="0.8"/>`);
  for (const z of L.zeilen) for (const it of z.items) if (it.st.m && it.t.trim()) {
    const mc = MARKER_COLORS[it.st.m] || MARKER_COLORS.yellow;
    out.push(`<rect x="${it.x}" y="${z.base - it.st.z * 0.82}" width="${it.w}" height="${it.st.z * 1.05}" fill="${mc.css}" fill-opacity="${MARKER.opacity}" style="mix-blend-mode:multiply"/>`);
  }
  const svgText = (t, st, x, base, w) => {
    const sp = SCHRIFTEN[st.f] || SCHRIFTEN.helv;
    const breit = w && t.length > 1 ? ` textLength="${w.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${x}" y="${base}" font-size="${st.z}" font-family='${sp.css}' font-weight="${st.b ? 700 : 400}" font-style="${st.i ? 'italic' : 'normal'}" fill="${(TEXTFARBEN[st.c] || TEXTFARBEN.black).css}" xml:space="preserve"${breit}>${esc(t)}</text>`;
  };
  for (const z of L.zeilen) {
    if (z.marke) out.push(svgText(z.marke.t, z.marke.st, z.marke.x, z.base));
    for (const it of z.items) {
      if (it.leer && !it.st.u && !it.st.s) continue;
      if (!it.leer) out.push(svgText(it.t, it.st, it.x, z.base, it.w));
      const col = (TEXTFARBEN[it.st.c] || TEXTFARBEN.black).css, dicke = Math.max(0.5, it.st.z * 0.06);
      if (it.st.u) out.push(`<line x1="${it.x}" x2="${it.x + it.w}" y1="${z.base + it.st.z * 0.12}" y2="${z.base + it.st.z * 0.12}" stroke="${col}" stroke-width="${dicke}"/>`);
      if (it.st.s) out.push(`<line x1="${it.x}" x2="${it.x + it.w}" y1="${z.base - it.st.z * 0.3}" y2="${z.base - it.st.z * 0.3}" stroke="${col}" stroke-width="${dicke}"/>`);
    }
  }
  out.push('</g>');
  return out.join('');
}

/* ---------- Zeichnen in die PDF ---------- */
// raum: { P(x,y) -> PDF-Punkt, winkel: Grad der Textrichtung im PDF, poly(punkte, optionen) }
async function boxPdf(pdf, pg, raum, a, fontCache) {
  const L = satzBox(a);
  const { rgb, degrees, BlendMode } = PDFLib;
  const ecke = (x, y) => raum.P(a.x + x, a.y + y);
  const rechteck = (x, y, w, h) => [ecke(x, y), ecke(x + w, y), ecke(x + w, y + h), ecke(x, y + h)];
  if (a.fuellung && FUELLUNGEN[a.fuellung]) raum.poly(rechteck(0, 0, a.w, L.h), { color: rgb(...FUELLUNGEN[a.fuellung].rgb) });
  if (a.rahmen) raum.poly(rechteck(0.4, 0.4, a.w - 0.8, L.h - 0.8), { borderColor: rgb(...(TEXTFARBEN[a.rahmen] || TEXTFARBEN.black).rgb), borderWidth: 0.8 });
  for (const z of L.zeilen) for (const it of z.items) if (it.st.m && it.t.trim()) {
    const mc = MARKER_COLORS[it.st.m] || MARKER_COLORS.yellow;
    raum.poly(rechteck(it.x, z.base - it.st.z * 0.82, it.w, it.st.z * 1.05), { color: rgb(...mc.rgb), opacity: MARKER.opacity, blendMode: BlendMode.Multiply });
  }
  const zeichne = async (t, st, x, base) => {
    const font = await pdfSchrift(pdf, st, fontCache);
    const o = ecke(x, base);
    pg.drawText(sicher(font, t), { x: o.x, y: o.y, size: st.z, font, color: rgb(...(TEXTFARBEN[st.c] || TEXTFARBEN.black).rgb), rotate: degrees(raum.winkel) });
  };
  for (const z of L.zeilen) {
    if (z.marke) await zeichne(z.marke.t, z.marke.st, z.marke.x, z.base);
    for (const it of z.items) {
      if (!it.leer) await zeichne(it.t, it.st, it.x, z.base);
      const col = rgb(...(TEXTFARBEN[it.st.c] || TEXTFARBEN.black).rgb), dicke = Math.max(0.5, it.st.z * 0.06);
      if (it.st.u) pg.drawLine({ start: ecke(it.x, z.base + it.st.z * 0.12), end: ecke(it.x + it.w, z.base + it.st.z * 0.12), thickness: dicke, color: col });
      if (it.st.s) pg.drawLine({ start: ecke(it.x, z.base - it.st.z * 0.3), end: ecke(it.x + it.w, z.base - it.st.z * 0.3), thickness: dicke, color: col });
    }
  }
}
async function pdfSchrift(pdf, st, cache) {
  const sp = SCHRIFTEN[st.f] && !satz.fehlt.has(st.f) ? SCHRIFTEN[st.f] : SCHRIFTEN.helv;
  const v = variante(st);
  const name = sp.std ? sp.std[v] : sp.ttf[v];
  if (!cache[name]) cache[name] = sp.std ? await pdf.embedFont(PDFLib.StandardFonts[name]) : await pdf.embedFont(satz.bytes[name], { subset: true });
  return cache[name];
}
