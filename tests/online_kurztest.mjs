// Kurzer Test gegen eine Online-Adresse (z. B. die Testversion): Muster-Rapport öffnen, Textfeld mit Liste
// und moderner Schrift anlegen, speichern, gespeicherten Text prüfen. Nur im unsichtbaren Edge.
// Aufruf: node tests/online_kurztest.mjs https://pasidreamer.github.io/rapport-tool-test/
import { readFile } from "node:fs/promises";
import { withPage } from "./cdp.mjs";

const url = process.argv[2];
const b64 = (await readFile(new URL("./muster-rapport.pdf", import.meta.url))).toString("base64");
let ok = true;
await withPage(url, { width: 1280, height: 900 }, async ({ evaluate, errors }) => {
  // Übers Internet dauert das Laden länger: warten, bis die App-Teile da sind
  const t0 = Date.now();
  while (!(await evaluate("typeof satz !== 'undefined' && typeof loadDoc === 'function'"))) {
    if (Date.now() - t0 > 30000) throw new Error("App nach 30 s nicht geladen");
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`geladen nach ${((Date.now() - t0) / 1000 + 3).toFixed(1)} s`);
  const r = await evaluate(`(async () => {
    await satz.bereit;
    const bytes = Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0));
    await loadDoc(new File([bytes], 'muster-rapport.pdf', { type: 'application/pdf' }), null);
    const d = doc(); const p = d.pages[0];
    state.tool = 'text'; handleTap(d, p, 300, 520, 'mouse', null);
    textEinfuegen('Online-Test\\n• Punkt eins\\n  – Unterpunkt');
    befehl('selectAll'); befehl('fontName', SCHRIFTEN.inter.css); commitEdit();
    const bytesNeu = await buildPdf(d);
    const pdf = await pdfjsLib.getDocument({ data: bytesNeu.slice() }).promise;
    const t = (await (await pdf.getPage(1)).getTextContent()).items.map(i => i.str).join(' ');
    return { fehlt: [...satz.fehlt], felder: d.fields.length, text: t.includes('Online-Test') && t.includes('Unterpunkt'),
             inter: new TextDecoder('latin1').decode(bytesNeu).includes('Inter'), titel: document.title };
  })()`);
  console.log(r);
  ok = r.fehlt.length === 0 && r.felder > 3 && r.text && r.inter;
  const e = errors().filter((x) => !/favicon/i.test(x));
  if (e.length) { console.log("Konsolenfehler:", e); ok = false; }
});
console.log(ok ? "ONLINE OK" : "ONLINE FEHLER");
process.exit(ok ? 0 : 1);
