# Rapport-Tool

Web-App zum Abhaken, Ausfüllen und Unterschreiben von Rapport- und Checklisten-PDFs auf dem
Windows-Tablet mit Stift. Läuft komplett im Browser: Die PDFs verlassen den PC nie, es wird nichts
hochgeladen.

## Was die App kann

- **Kreise und Kästchen** (Word-Aufzählung „o“, ☐) werden automatisch erkannt. Antippen setzt ein X
  (oder ✓), nochmals antippen entfernt es. „Alle abhaken“ hakt alle Kreise ab (nicht die Kästchen).
- **Textfelder** („Arbeitszeit:“, „Datum:____“, „Name Abnehmer“ …) werden erkannt. Antippen, per
  Tastatur schreiben, Enter springt ins nächste Feld. „Datum“ wird mit heute vorbelegt,
  „Blockschrift“ automatisch in Grossbuchstaben.
- **Unterschrift**: Gelbes Feld über der Linie antippen → grosses Unterschriftsfeld → „Übernehmen“
  setzt sie auf die Linie. Verschieben durch Ziehen, ✕ löscht.
- **Handballen-Schutz**: Nur der Stift schreibt. Solange der Stift in der Nähe ist, werden
  Berührungen ignoriert. Mit dem Finger scrollen geht, wenn der Stift weg ist.
- Freier Stift, freier Text, Frei-X, Radierer, Rückgängig, Zwischenspeicher bei Absturz.
- **Speichern** erzeugt „… - ausgefüllt.pdf“.

## Online-Adresse

**https://pasidreamer.github.io/rapport-tool/** (GitHub Pages, gratis)

- Suchmaschinen sollen die App nicht aufnehmen (`noindex` in `index.html`).
- `.gitignore` schliesst alle `*.pdf` aus – Kunden-PDFs kommen nie ins Repository.
- **Neue Fassung veröffentlichen:** In `sw.js` die `VERSION` hochzählen, committen, `git push`.
  GitHub stellt sie nach 1–2 Minuten bereit, die App holt sie beim nächsten Start mit Internet.

## Auf dem PC installieren (Edge)

1. Die Adresse in **Microsoft Edge** öffnen.
2. Oben in der Adressleiste auf das Symbol „App verfügbar – Installieren“ klicken
   (oder Menü ··· → Apps → „Diese Website als App installieren“).
3. Beim Nachfragen „An Taskleiste anheften“ ankreuzen.

## PDFs direkt aus Outlook öffnen

Die installierte App meldet sich bei Windows als Programm für PDF-Dateien an. Drei Wege:

- **Als Standard-App (bequemster Weg):** Windows-Einstellungen → Apps → Standard-Apps → „.pdf“ →
  „Rapport-Tool“ wählen. Dann öffnet ein Doppelklick auf den PDF-Anhang in Outlook direkt die App.
  Nachteil: Auch alle anderen PDFs öffnen sich dann im Rapport-Tool (es zeigt aber jede PDF an).
- **Öffnen mit:** PDF im Explorer rechts anklicken → „Öffnen mit“ → „Rapport-Tool“.
- **Ziehen:** Den Anhang direkt aus Outlook ins offene App-Fenster ziehen.

Beim ersten Öffnen fragt Edge einmal, ob die App PDF-Dateien öffnen darf → „Zulassen“.

Aus Outlook geöffnete Anhänge liegen in einem versteckten Temp-Ordner. Beim Speichern schlägt die
App deshalb nicht diesen Ordner vor, sondern den zuletzt benutzten Speicherort.

## Technik

- `index.html` – die ganze App (HTML, CSS, JavaScript)
- `lib/` – PDF.js 3.11.174 (Anzeigen, Text-Erkennung) und pdf-lib 1.17.1 (Schreiben)
- `sw.js` – Offline-Kopie · `manifest.webmanifest` – Installation + PDF-Dateizuordnung
- Lokal testen: `python -m http.server 8766 --bind 127.0.0.1`, dann `http://localhost:8766`
