// Prüft das Rapport-Tool in einem unsichtbaren Edge: eigener kleiner Webserver, Muster-Rapport laden,
// alle neuen Funktionen durchspielen, die gespeicherte PDF kontrollieren und Bilder ablegen.
// Tastendrücke gehen nur an dieses unsichtbare Edge, nie an den echten Bildschirm.
// Aufruf: node tests/pruefen.mjs [ausgabeordner]
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage, sleep } from "./cdp.mjs";

// RAPPORT_WURZEL: anderen Ordner prüfen (z. B. die gebaute Testversion)
const WURZEL = process.env.RAPPORT_WURZEL ? normalize(process.env.RAPPORT_WURZEL + "/") : fileURLToPath(new URL("..", import.meta.url));
const AUS = process.argv[2] || join(WURZEL, "tests", "_ergebnis");
await mkdir(AUS, { recursive: true });
const TYPEN = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".pdf": "application/pdf", ".ttf": "font/ttf", ".svg": "image/svg+xml", ".png": "image/png" };
const server = createServer(async (req, res) => {
  try {
    const pfad = normalize(join(WURZEL, decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!pfad.startsWith(normalize(WURZEL))) throw new Error("ausserhalb");
    const datei = pfad.endsWith("\\") || pfad.endsWith("/") ? join(pfad, "index.html") : pfad;
    const inhalt = await readFile(datei);
    res.writeHead(200, { "Content-Type": TYPEN[extname(datei)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(inhalt);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL_APP = `http://127.0.0.1:${server.address().port}/`;

let fehler = 0;
const pruefe = (name, ok, info = "") => { fehler += !ok; console.log((ok ? "OK     " : "FEHLER ") + name + (ok ? "" : "  -> " + JSON.stringify(info).slice(0, 400))); };

try {
  await withPage(URL_APP, { width: 1400, height: 1000 }, async ({ send, evaluate, key, shot, errors }) => {
    const tippe = async (text) => send("Input.insertText", { text });
    const taste = (name, code, kc, shift = false) => key(name, code, kc, shift);

    // ---------- Laden ----------
    const geladen = await evaluate(`(async () => {
      const b = await (await fetch('tests/muster-rapport.pdf')).blob();
      await loadDoc(new File([b], 'muster-rapport.pdf', { type: 'application/pdf' }), null);
      const d = doc(); const p = d.pages[0];
      return { seiten: d.pages.length, kreise: p.targets.length, felder: d.fields.map(f => f.label), unterschriften: p.sigTargets.length,
               schriften: Object.keys(satz.fonts), fehlt: [...satz.fehlt] };
    })()`);
    pruefe("Muster-Rapport geladen, Felder/Kreise/Unterschriften erkannt", geladen.seiten === 1 && geladen.kreise >= 6 && geladen.unterschriften === 2 && geladen.felder.length >= 4, geladen);
    pruefe("Alle 5 Schriften geladen (auch Inter/Roboto)", geladen.schriften.length === 5 && geladen.fehlt.length === 0, geladen);

    // ---------- Textfeld mit Titel, Punkten, Unterpunkten (echtes Tippen mit Tastatur) ----------
    await evaluate(`(() => { const d = doc(); state.tool = 'text'; updateUI(); handleTap(d, d.pages[0], 300, 520, 'mouse', null); return !!editorEl(); })()`);
    await tippe("Wartungsbericht"); await evaluate("schnellstil('titel')");
    await taste("Enter", "Enter", 13); await evaluate("schnellstil('punkt')"); await tippe("Filter ersetzt");
    await taste("Enter", "Enter", 13); await taste("Tab", "Tab", 9); await evaluate("schnellstil('unter')"); await tippe("Typ F7, beide Seiten");
    await taste("Enter", "Enter", 13); await tippe("Dichtung geprüft");
    await taste("Enter", "Enter", 13); await taste("Tab", "Tab", 9, true); await tippe("Kanal gereinigt");
    await taste("Enter", "Enter", 13); await taste("Enter", "Enter", 13);   // leerer Punkt + Enter = Liste beenden
    await tippe("Alles in Ordnung, nächster Termin im Frühling.");
    await shot(join(AUS, "1_editor_offen.png"));
    const box = await evaluate(`(() => { commitEdit(); const a = doc().annots.find(a => a.type === 'box'); return a && a.paras.map(p => ({ l: p.list, e: p.level, t: p.runs.map(r => r.t).join(''), b: p.runs[0].b, z: p.runs[0].z })); })()`);
    pruefe("Titel fett und grösser", box && box[0].t === "Wartungsbericht" && box[0].b === 1 && box[0].z === 13 && !box[0].l, box);
    pruefe("Punkt fett, Ebene 1", box && box[1].l === "bullet" && box[1].e === 0 && box[1].b === 1 && box[1].t === "Filter ersetzt", box && box[1]);
    pruefe("Unterpunkte nicht fett, Ebene 2 (Enter behält Ebene)", box && box[2].e === 1 && box[2].b === 0 && box[3].e === 1 && box[3].t === "Dichtung geprüft", box && box.slice(2, 4));
    pruefe("Shift+Tab zurück auf Ebene 1", box && box[4].e === 0 && box[4].l === "bullet" && box[4].t === "Kanal gereinigt", box && box[4]);
    pruefe("Leerer Punkt + Enter beendet die Liste", box && box[5].l === null && box[5].t.startsWith("Alles in Ordnung"), box && box[5]);

    // ---------- Formatieren einzelner Wörter ----------
    const fmt = await evaluate(`(async () => {
      const d = doc(); const a = d.annots.find(a => a.type === 'box');
      boxBearbeiten(d, d.pages[0], a);
      const el = editorEl(); const last = el.lastElementChild;
      const tw = document.createTreeWalker(last, NodeFilter.SHOW_TEXT); const n = tw.nextNode();
      const i = n.data.indexOf('nächster');
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 'nächster Termin'.length);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      befehl('bold'); befehl('foreColor', TEXTFARBEN.red.css); groesseSetzen(14); befehl('underline'); befehl('hiliteColor', markerCss('yellow'));
      commitEdit();
      const runs = doc().annots.find(a => a.type === 'box').paras[5].runs;
      return runs.map(r => ({ t: r.t, b: r.b, c: r.c, z: r.z, u: r.u, m: r.m }));
    })()`);
    const fett = fmt.find((r) => r.t.includes("nächster"));
    pruefe("Wörter markieren: fett, rot, 14 pt, unterstrichen, gelber Marker", fett && fett.b && fett.c === "red" && fett.z === 14 && fett.u && fett.m === "yellow" && fmt[0].b === 0, fmt);

    // ---------- Einfügen aus anderem Programm (Listen erkennen) ----------
    const eingef = await evaluate(`(() => {
      const d = doc(); state.tool = 'text';
      handleTap(d, d.pages[0], 300, 660, 'mouse', null);
      textEinfuegen('Material:\\n• Filter F7\\n• Dichtband\\n  – 3 Rollen\\n1. Erster Schritt\\n2. Zweiter Schritt');
      commitEdit();
      const a = d.annots.filter(a => a.type === 'box').pop();
      return a.paras.map(p => [p.list, p.level, p.runs.map(r => r.t).join('')]);
    })()`);
    pruefe("Eingefügter Text: Zeilen + Punkte + Unterpunkt + Nummern", eingef.length === 6 && eingef[1][0] === "bullet" && eingef[3][1] === 1 && eingef[3][2] === "3 Rollen" && eingef[4][0] === "num", eingef);

    // ---------- Abdecken + darüber schreiben (Zeile 1 der Checkliste), nur abdecken (Zeile 2) ----------
    const deck = await evaluate(`(() => {
      const d = doc(); const p = d.pages[0]; state.tool = 'cover';
      rechteckFertig(d, p, { rahmen: 'cover', x0: 84, y0: 176, x1: 260, y1: 190 });
      const offen = !!editorEl();
      document.execCommand('insertText', false, 'Filter geprüft (F7)');
      commitEdit();
      rechteckFertig(d, p, { rahmen: 'cover', x0: 84, y0: 195, x1: 200, y1: 209 });
      commitEdit();   // nichts darüber geschrieben: nur die Abdeckung bleibt
      return { offen, cover: d.annots.filter(a => a.type === 'cover').length, text: boxText(d.annots.filter(a => a.type === 'box').pop()) };
    })()`);
    pruefe("Abdecken öffnet gleich ein Textfeld darüber", deck.offen && deck.cover === 2 && deck.text === "Filter geprüft (F7)", deck);

    // ---------- Bisherige Funktionen: Kreis abhaken, Datumsfeld, Unterschrift ----------
    const alt = await evaluate(`(() => {
      const d = doc(); const p = d.pages[0]; state.tool = 'tap';
      toggleMark(d, p, p.targets[2]);
      editText(d, p, { field: d.fields.find(f => f.date) }); commitEdit();
      placeSig(d, p, { strokes: [[[0, 0.6], [0.3, 0], [0.6, 1], [1, 0.4]]], bw: 120, bh: 40, baseFrac: 0.9 }, null, p.sigTargets[0]);
      state.sel = null;
      const typen = {}; for (const a of d.annots) typen[a.type] = (typen[a.type] || 0) + 1;
      return { typen, datum: (d.annots.find(a => a.type === 'text') || {}).text };
    })()`);
    pruefe("Bisherige Funktionen: Kreis, Datum (heute), Unterschrift", alt.typen.mark === 1 && alt.typen.sig === 1 && /^\d\d\.\d\d\.\d{4}$/.test(alt.datum || ""), alt);

    // ---------- Formen, Foto, Baustein ----------
    const ext = await evaluate(`(async () => {
      const d = doc(); const p = d.pages[0]; state.tool = 'form';
      for (const [art, y] of [['rect', 600], ['ellipse', 640], ['arrow', 690], ['line', 720]]) { state.form.art = art; rechteckFertig(d, p, { rahmen: 'form', x0: 420, y0: y, x1: 520, y1: y + 30 }); }
      const c = document.createElement('canvas'); c.width = 400; c.height = 300; const g = c.getContext('2d');
      g.fillStyle = '#3a7bd5'; g.fillRect(0, 0, 400, 300); g.fillStyle = '#fff'; g.font = 'bold 60px Arial'; g.fillText('FOTO', 110, 170);
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      await fotoGewaehlt(new File([blob], 'test.jpg', { type: 'image/jpeg' }));
      bausteinSetzen(d, p, BAUSTEINE_VORGABE[0], 470, 120);
      bausteinSetzen(d, p, BAUSTEINE_VORGABE[4], 470, 160);
      const typen = {}; for (const a of d.annots) typen[a.type] = (typen[a.type] || 0) + 1;
      return { typen, datum: boxText(d.annots.filter(a => a.type === 'box').pop()) };
    })()`);
    pruefe("4 Formen, 1 Foto, 2 Bausteine angelegt", ext.typen.shape === 4 && ext.typen.img === 1 && ext.typen.box >= 5, ext);
    pruefe("Baustein „Datum heute“ setzt das heutige Datum", /^\d\d\.\d\d\.\d{4}$/.test(ext.datum), ext.datum);

    // ---------- Verschieben, Breite, Verdoppeln, Kopieren/Einfügen ----------
    const obj = await evaluate(`(() => {
      const d = doc(); const a = d.annots.find(a => a.type === 'box'); const vorher = { x: a.x, w: a.w };
      objVerschieben(a, 10, 5, JSON.parse(JSON.stringify(a))); objGroesse(a, 'breite', 40, 0, { ...a });
      const n0 = d.annots.length; objVerdoppeln(d, a); const kopie = d.annots[d.annots.length - 1];
      return { verschoben: a.x === vorher.x + 10, breiter: Math.abs(a.w - (vorher.w + 40)) < 0.01, verdoppelt: d.annots.length === n0 + 1 && kopie.type === 'box' && kopie.id !== a.id && kopie.x === a.x + 14 };
    })()`);
    pruefe("Textfeld verschieben, Breite ändern, verdoppeln", obj.verschoben && obj.breiter && obj.verdoppelt, obj);

    // ---------- Seiten ----------
    const seiten = await evaluate(`(() => {
      const d = doc(); const p0 = d.pages[0];
      leereSeite(d, p0); const blank = d.pages[1];
      seiteDrehen(d, blank);
      return { anzahl: d.pages.filter(p => !p.weg).length, rot: blank.rot, quer: blank.w > blank.h, label: blank.num.textContent };
    })()`);
    pruefe("Leere Seite eingefügt und gedreht", seiten.anzahl === 2 && seiten.rot === 90 && seiten.quer && seiten.label === "Seite 2 / 2", seiten);
    const textAufGedreht = await evaluate(`(() => { const d = doc(); const p = d.pages[1]; state.tool = 'text'; handleTap(d, p, 60, 80, 'mouse', null);
      document.execCommand('insertText', false, 'Notiz auf Querseite'); commitEdit(); return d.annots.filter(a => a.page === 1).length; })()`);
    pruefe("Text auf gedrehter leerer Seite", textAufGedreht === 1, textAufGedreht);

    // ---------- Rückgängig ----------
    const rueck = await evaluate(`(() => { const d = doc(); const n = d.annots.length; const s = d.undo.length; undo(); const n1 = d.annots.length; return { vorher: n, nachher: n1, stapel: s }; })()`);
    pruefe("Rückgängig nimmt den letzten Schritt zurück", rueck.nachher === rueck.vorher - 1, rueck);
    await evaluate(`(() => { const d = doc(); const p = d.pages[1]; handleTap(d, p, 60, 80, 'mouse', null); document.execCommand('insertText', false, 'Notiz auf Querseite'); commitEdit(); })()`);

    // ---------- Moderne Schriften ----------
    await evaluate(`(() => { const d = doc(); pushUndo(d);
      d.annots.push({ id: uid(), type: 'box', page: 1, x: 60, y: 200, w: 300, rahmen: null, fuellung: null, paras: [
        { list: null, level: 0, align: 'left', runs: [{ ...STIL_VORGABE, f: 'inter', b: 1, t: 'Inter fett ' }, { ...STIL_VORGABE, f: 'roboto', i: 1, t: 'Roboto kursiv' }] }] });
      changed(d); })()`);

    await evaluate(`(() => { state.tool = 'tap'; const d = doc(); state.sel = d.annots.find(a => a.type === 'img').id; redrawAll(d); viewer.scrollTop = 0; })()`);
    await sleep(400); await shot(join(AUS, "2_seite_mit_allem.png"));

    // ---------- Speichern und gespeicherte PDF prüfen ----------
    const pdfInfo = await evaluate(`(async () => {
      const d = doc(); const bytes = await buildPdf(d);
      window.__gespeichert = bytes;
      const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      const s1 = await pdf.getPage(1), s2 = await pdf.getPage(2);
      const t1 = (await s1.getTextContent()).items.map(i => i.str).join(' ');
      const t2 = (await s2.getTextContent()).items.map(i => i.str).join(' ');
      const ops = await s1.getOperatorList();
      // Bild der gespeicherten Seite 1 für die Sichtprüfung
      const vp = s1.getViewport({ scale: 2 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
      await s1.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      const vp2 = s2.getViewport({ scale: 1.5 }); const c2 = document.createElement('canvas'); c2.width = vp2.width; c2.height = vp2.height;
      await s2.render({ canvasContext: c2.getContext('2d'), viewport: vp2 }).promise;
      const fonts = new Set(); for (let k = 0; k < ops.fnArray.length; k++) if (ops.fnArray[k] === pdfjsLib.OPS.setFont) fonts.add(ops.argsArray[k][0]);
      const eing = await datenAuslesen(bytes);
      // Abgedeckte Zeile 2 („Kanal gereinigt“, x 84–200, y 195–209): in der fertigen PDF muss dort alles weiss sein
      const px = c.getContext('2d').getImageData(86 * 2, 196 * 2, 90 * 2, 12 * 2).data;   // links vom Test-Foto
      let dunkel = 0; for (let k = 0; k < px.length; k += 4) if (px[k] + px[k + 1] + px[k + 2] < 600) dunkel++;
      // Zum Vergleich: Zeile 3 („Fotos vorher/nachher“) ist nicht abgedeckt
      const px3 = c.getContext('2d').getImageData(86 * 2, 215 * 2, 90 * 2, 12 * 2).data;
      let dunkel3 = 0; for (let k = 0; k < px3.length; k += 4) if (px3[k] + px3[k + 1] + px3[k + 2] < 600) dunkel3++;
      const roh = new TextDecoder('latin1').decode(bytes);
      return { inter: /Inter-Bold/.test(roh), roboto: /Roboto-Italic/.test(roh), abgedeckt: dunkel, offen: dunkel3, seiten: pdf.numPages, rot2: s2.rotate, t1, t2, bild: c.toDataURL('image/png'), bild2: c2.toDataURL('image/png'), groesse: bytes.length,
               fontAnzahl: fonts.size, eingebettet: eing && { annots: eing.daten.annots.length, original: eing.original.length, veraendert: eing.veraendert },
               originalLaenge: d.bytes.length, annots: d.annots.length };
    })()`);
    await writeFile(join(AUS, "3_gespeichert_seite1.png"), Buffer.from(pdfInfo.bild.split(",")[1], "base64"));
    await writeFile(join(AUS, "4_gespeichert_seite2.png"), Buffer.from(pdfInfo.bild2.split(",")[1], "base64"));
    pruefe("Gespeicherte PDF: 2 Seiten, Seite 2 gedreht", pdfInfo.seiten === 2 && pdfInfo.rot2 === 90, { s: pdfInfo.seiten, r: pdfInfo.rot2 });
    for (const w of ["Wartungsbericht", "Filter ersetzt", "Typ F7, beide Seiten", "Filter geprüft (F7)", "ERLEDIGT", "Material:", "3 Rollen"])
      pruefe(`Text als echter Text in der PDF: „${w}“`, pdfInfo.t1.replace(/\s+/g, " ").includes(w), pdfInfo.t1.slice(0, 300));
    pruefe("Listenzeichen • und – in der PDF", pdfInfo.t1.includes("•") && pdfInfo.t1.includes("–"), "");
    pruefe("Text auf der Querseite (am Stück kopierbar)", pdfInfo.t2.includes("Notiz auf Querseite"), pdfInfo.t2);
    pruefe("Abgedeckter gedruckter Text ist in der PDF unsichtbar", pdfInfo.abgedeckt === 0 && pdfInfo.offen > 50, { abgedeckt: pdfInfo.abgedeckt, nichtAbgedeckt: pdfInfo.offen });
    pruefe("Mehrere Schriften eingebettet (normal, fett …)", pdfInfo.fontAnzahl >= 3, pdfInfo.fontAnzahl);
    pruefe("Inter fett und Roboto kursiv in die PDF eingebettet", pdfInfo.inter && pdfInfo.roboto, { inter: pdfInfo.inter, roboto: pdfInfo.roboto });
    pruefe("Text in modernen Schriften lesbar", pdfInfo.t2.includes("Inter fett") && pdfInfo.t2.includes("Roboto kursiv"), pdfInfo.t2);
    pruefe("Bearbeitungsdaten + Original versteckt eingebettet", pdfInfo.eingebettet && pdfInfo.eingebettet.annots === pdfInfo.annots && pdfInfo.eingebettet.original === pdfInfo.originalLaenge && !pdfInfo.eingebettet.veraendert, pdfInfo.eingebettet);
    console.log(`       Grösse der gespeicherten PDF: ${(pdfInfo.groesse / 1024).toFixed(0)} KB`);

    // ---------- Wieder öffnen: alles bearbeitbar ----------
    const wieder = await evaluate(`(async () => {
      const n = doc().annots.length;
      await loadDoc(new File([window.__gespeichert], 'muster-rapport - ausgefüllt.pdf', { type: 'application/pdf' }), null);
      const d = doc();
      const typen = {}; for (const a of d.annots) typen[a.type] = (typen[a.type] || 0) + 1;
      return { name: d.name, n, n2: d.annots.length, typen, seiten: d.pages.filter(p => !p.weg).length, rot: d.pages[1] && d.pages[1].rot, leer: d.pages[1] && d.pages[1].src };
    })()`);
    pruefe("Wieder geöffnet: alle Einträge bearbeitbar zurück", wieder.n === wieder.n2 && wieder.typen.box >= 5, wieder);
    pruefe("Wieder geöffnet: leere gedrehte Seite zurück", wieder.seiten === 2 && wieder.rot === 90 && wieder.leer === null, wieder);
    const name = await evaluate(`(() => { const b = doc().name.replace(/\\.pdf$/i, ''); return /- ausgefüllt$/i.test(b) ? b + '.pdf' : b + ' - ausgefüllt.pdf'; })()`);
    pruefe("Dateiname bekommt kein doppeltes „ausgefüllt“", name === "muster-rapport - ausgefüllt.pdf", name);

    // ---------- In anderem Programm verändert: nicht mehr zurückholen ----------
    const fremd = await evaluate(`(async () => { const b = window.__gespeichert; const x = new Uint8Array(b.length + 30); x.set(b); x.set(new TextEncoder().encode('\\n% Nachtrag\\n%%EOF\\n'), b.length);
      const e = await datenAuslesen(x); return e && e.veraendert; })()`);
    pruefe("Von anderem Programm verändert → Einträge bleiben fest", fremd === true, fremd);

    // ---------- Absturz-Sicherung ----------
    const sich = await evaluate(`(async () => { const d = doc(); await sicherungSchreiben(d.key, sicherungsDaten(d)); const z = await sicherungLesen(d.key); await sicherungLoeschen(d.key); return z && z.annots.length === d.annots.length && Array.isArray(z.seiten); })()`);
    pruefe("Absturz-Sicherung in IndexedDB (mit Foto)", sich === true, sich);

    // ---------- Formatierleiste anzeigen (Bild) ----------
    await evaluate(`(() => { const d = doc(); activate(d); const a = d.annots.find(a => a.type === 'box'); viewer.scrollTop = 0; boxBearbeiten(d, d.pages[a.page], a); })()`);
    await sleep(500); await shot(join(AUS, "5_formatierleiste.png"));
    await evaluate("commitEdit()");

    const err = errors().filter((e) => !/favicon|manifest|serviceWorker|Service Worker/i.test(e));
    pruefe("Keine JavaScript-Fehler in der Konsole", err.length === 0, err);
  });
} finally {
  server.close();
}
console.log(fehler ? `\n${fehler} FEHLER` : "\nALLES OK");
process.exit(fehler ? 1 : 0);
