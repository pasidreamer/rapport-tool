// Baut eine Testversion des Rapport-Tools in einen eigenen Ordner (für das Repository rapport-tool-test).
// Unterschiede zur echten App: Name/Kennung „TEST“, oranger Hinweis, eigene Speicherbereiche
// (Bausteine, Absturz-Sicherung) und eigener Offline-Speicher – damit nichts mit der echten App vermischt wird.
// Aufruf: node tests/testversion.mjs <zielordner>
import { cp, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const QUELLE = fileURLToPath(new URL("..", import.meta.url));
const ZIEL = process.argv[2];
if (!ZIEL) { console.error("Zielordner fehlt"); process.exit(1); }
await mkdir(ZIEL, { recursive: true });
for (const t of ["lib", "js", "fonts", "icons"]) await cp(join(QUELLE, t), join(ZIEL, t), { recursive: true });

const ersetze = (text, alt, neu) => { if (!text.includes(alt)) throw new Error("nicht gefunden: " + alt); return text.split(alt).join(neu); };

let html = await readFile(join(QUELLE, "index.html"), "utf8");
html = ersetze(html, "<title>Rapport-Tool</title>", "<title>Rapport-Tool TEST</title>");
html = ersetze(html, '<meta name="theme-color" content="#1d4ed8">', '<meta name="theme-color" content="#d96a00">');
html = ersetze(html, "const LS_PREFIX = 'rapport-tool:';", "const LS_PREFIX = 'rapport-tool-test:';");
html = ersetze(html, "<body>", '<body>\n<div style="position:fixed;right:10px;bottom:10px;z-index:40;background:#d96a00;color:#fff;font:600 12px Segoe UI,sans-serif;padding:5px 10px;border-radius:8px;pointer-events:none">TESTVERSION</div>');
await writeFile(join(ZIEL, "index.html"), html);

let speicher = await readFile(join(QUELLE, "js", "speicher.js"), "utf8");
speicher = ersetze(speicher, "indexedDB.open('rapport-tool', 1)", "indexedDB.open('rapport-tool-test', 1)");
await writeFile(join(ZIEL, "js", "speicher.js"), speicher);

const manifest = JSON.parse(await readFile(join(QUELLE, "manifest.webmanifest"), "utf8"));
Object.assign(manifest, { name: "Rapport-Tool TEST", short_name: "Rapport TEST", id: "/rapport-tool-test/", theme_color: "#d96a00" });
await writeFile(join(ZIEL, "manifest.webmanifest"), JSON.stringify(manifest, null, 2));

let sw = await readFile(join(QUELLE, "sw.js"), "utf8");
sw = sw.replace(/const VERSION = 'rapport-(v\d+)';/, "const VERSION = 'rapport-test-$1';");
// Nur eigene Offline-Speicher aufräumen – nie den der echten App (gleiche Adresse pasidreamer.github.io)
sw = ersetze(sw, "namen.filter((n) => n !== VERSION)", "namen.filter((n) => n.startsWith('rapport-test-') && n !== VERSION)");
await writeFile(join(ZIEL, "sw.js"), sw);

await writeFile(join(ZIEL, ".gitignore"), "# Kunden-PDFs niemals hochladen\n*.pdf\n");
await writeFile(join(ZIEL, "README.md"), `# Rapport-Tool – TESTVERSION

Testfassung des Rapport-Tools zum Ausprobieren neuer Funktionen auf dem Tablet.
Die echte App liegt unter https://pasidreamer.github.io/rapport-tool/ und wird hiervon nicht berührt.

Gebaut mit \`node tests/testversion.mjs\` aus dem Repository rapport-tool. Hier nichts von Hand ändern.
`);
console.log("Testversion gebaut in", ZIEL);
