'use strict';
/* ================= Sicherung und „später weiter bearbeiten“ =================
   1. Sicherung bei Absturz: im Browser-Speicher IndexedDB (localStorage ist für Fotos zu klein).
   2. Beim Speichern legt das Tool seine Einträge und die unveränderte Original-PDF versteckt in die
      neue PDF (eigener Eintrag im Katalog, andere Programme ignorieren ihn). Öffnet man sie wieder im
      Rapport-Tool, ist alles weiter bearbeitbar. */

const DATEN_SCHLUESSEL = 'RapportToolDaten';
let sicherungDbVersprechen = null;
function sicherungDb() {
  if (!sicherungDbVersprechen) sicherungDbVersprechen = new Promise((ok, fehler) => {
    const r = indexedDB.open('rapport-tool', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sicherung');
    r.onsuccess = () => ok(r.result); r.onerror = () => fehler(r.error);
  });
  return sicherungDbVersprechen;
}
async function sicherungAktion(modus, fn) {
  const db = await sicherungDb();
  return new Promise((ok, fehler) => {
    const t = db.transaction('sicherung', modus); const req = fn(t.objectStore('sicherung'));
    t.oncomplete = () => ok(req && req.result); t.onerror = () => fehler(t.error);
  });
}
const sicherungSchreiben = (key, wert) => sicherungAktion('readwrite', s => s.put(wert, key)).catch(e => console.warn('Sicherung', e));
async function sicherungLesen(key) {
  try { const w = await sicherungAktion('readonly', s => s.get(key)); if (w) return w; } catch (e) { console.warn(e); }
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }   // ältere Fassung der App
}
function sicherungLoeschen(key) {
  try { localStorage.removeItem(key); } catch (e) {}
  return sicherungAktion('readwrite', s => s.delete(key)).catch(() => {});
}

function seitenDaten(d) { return d.pages.map(p => ({ src: p.src ?? null, rot: p.rot || 0, weg: !!p.weg, bw: p.bw || null, bh: p.bh || null })); }
function sicherungsDaten(d) { return { t: Date.now(), annots: d.annots, seiten: seitenDaten(d), reihe: d.reihe }; }
// Gesicherte oder eingebettete Seitenlage wiederherstellen (leere Seiten neu anlegen, Drehung, gelöscht)
function seitenHerstellen(d, seiten, reihe) {
  if (!Array.isArray(seiten)) return;
  seiten.forEach((s, k) => {
    let p = d.pages[k];
    if (!p) { if (s.src !== null) return; p = leereSeiteAnlegen(d, s.bw || 595.28, s.bh || 841.89); }
    p.rot = s.rot || 0; p.weg = !!s.weg;
  });
  if (Array.isArray(reihe)) d.reihe = reihe.filter(i => d.pages[i]).concat(d.pages.map(p => p.i).filter(i => !reihe.includes(i)));
  seitenAnwenden(d);
}

/* ---------- Eingebettete Daten ---------- */
function datenEinbetten(pdf, d) {
  const { PDFName } = PDFLib;
  const json = new TextEncoder().encode(JSON.stringify({ v: 1, annots: d.annots, seiten: seitenDaten(d), reihe: d.reihe }));
  const strom = b => pdf.context.register(pdf.context.flateStream(b));
  pdf.catalog.set(PDFName.of(DATEN_SCHLUESSEL), pdf.context.obj({ Version: 1, Daten: strom(json), Original: strom(d.bytes) }));
}
// null = keine Rapport-Tool-Daten; sonst { daten, original, veraendert }
async function datenAuslesen(bytes) {
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.includes('/' + DATEN_SCHLUESSEL)) return null;
  // Hat ein anderes Programm (z. B. Adobe) die Datei danach verändert, hängt es einen Nachtrag an (zweites %%EOF).
  // Dann gilt die fertige Datei, nicht unsere alten Einträge.
  const veraendert = (text.match(/%%EOF/g) || []).length > 1;
  const { PDFDocument, PDFName, PDFDict, decodePDFRawStream } = PDFLib;
  const lib = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const dict = lib.catalog.lookupMaybe(PDFName.of(DATEN_SCHLUESSEL), PDFDict);
  if (!dict) return null;
  const lesen = n => decodePDFRawStream(lib.context.lookup(dict.get(PDFName.of(n)))).decode();
  return { daten: JSON.parse(new TextDecoder().decode(lesen('Daten'))), original: lesen('Original'), veraendert };
}
