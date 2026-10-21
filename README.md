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
- Freier Stift (6 Farben über den Farbknopf), Frei-X, Radierer, Rückgängig, Zwischenspeicher bei Absturz.
- **Marker**: Markierstift in Gelb, Grün, Rot, Orange oder Hellblau (Farbknopf). Fast waagrechte Striche werden begradigt, der Text bleibt lesbar.
- **Kopieren**: Text in der PDF mit Stift oder Maus markieren → „Text kopieren“ (oder Strg+C) oder
  „Als Textfeld einfügen“ und dann antippen, wo er hin soll.
- **Speichern** erzeugt „… - ausgefüllt.pdf“ (ein schon ausgefülltes PDF behält seinen Namen).

### PDF-Editor (seit Oktober 2026)

- **Textfelder wie in Word** (Werkzeug „Text“): Antippen → Textfeld. Enter = neue Zeile, Text bricht
  automatisch um. Fertiges Textfeld antippen = bearbeiten, ziehen = verschieben; Griffe zum Löschen (✕),
  Verdoppeln (⧉) und für die Breite.
- **Schwebende Formatierleiste** über dem Textfeld:
  - Schnellknöpfe **Titel / • Punkt / – Unterpunkt / Normal**
  - Schriftart (Arial-ähnlich, Times, Schreibmaschine, Inter, Roboto), Grösse A−/A+
  - **F**ett, *K*ursiv, Unterstrichen, Durchgestrichen, 6 Farben, Textmarker, Ausrichtung
  - Listen mit Punkten oder Nummern auf 2 Ebenen (Tab / Shift+Tab). Ein leerer Listenpunkt + Enter beendet die Liste (wie in Word).
  - Rahmen und Hintergrund, Einfügen, Kopieren, „★ Baustein“
- **Einfügen** von Text aus Outlook/Word: Zeilen werden Absätze, „• “, „- “, „1. “ werden zu Listen.
  Lange drücken im Textfeld zeigt wieder das Menü mit „Einfügen“ (vorher unterdrückt).
- **Abdecken**: Feld über gedruckten Text ziehen → weisse Abdeckung, gleich darauf öffnet sich ein
  Textfeld zum Neu-Schreiben. Achtung: Das ist **kein Schwärzen** – der alte Text steckt unsichtbar noch in der Datei.
- **Formen**: Rechteck, Kreis, Pfeil, Linie (3 Strichstärken, Farbe über den Farbknopf).
- **Foto**: Bild einfügen, verschieben, an der Ecke vergrössern. Grosse Fotos werden auf 1600 px verkleinert.
- **Bausteine**: Stempel „ERLEDIGT“, „GEPRÜFT“, „IN ORDNUNG“, „NACHKONTROLLE NÖTIG“, „Datum heute“ und eigene
  (Textfeld bearbeiten → „★ Baustein“). Gespeichert im Browser dieses Geräts.
- **Seiten**: Über jeder Seite gibt es drei Knöpfe:
  - ↻ drehen (nur solange darauf noch nichts eingetragen ist)
  - ＋ leere Seite danach
  - 🗑 löschen

  Rückgängig geht für alles.
- **Objekte kopieren**: Objekt antippen → Strg+C, Strg+V fügt es (auch auf einer anderen Seite) ein.
  Liegt inzwischen anderer Text in der Windows-Ablage, wird dieser als neues Textfeld eingefügt.
- **Später weiter bearbeiten**: Die gespeicherte PDF enthält die Einträge und die Original-PDF unsichtbar
  (eigener Katalog-Eintrag `RapportToolDaten`, gespeichert ohne Objekt-Ströme).
  - Öffnet man sie wieder im Rapport-Tool, ist alles bearbeitbar.
  - Andere Programme zeigen ganz normal den fertigen Rapport.
  - Hat ein anderes Programm die Datei danach verändert (zweites `%%EOF`), gilt die fertige Datei, und die Einträge bleiben fest.
- Text in der PDF ist echter Text (durchsuchbar, kopierbar). Inter/Roboto werden als Teilmenge eingebettet.
- Die Sicherung bei Absturz liegt jetzt in IndexedDB (passt auch mit Fotos). Alte Sicherungen aus localStorage werden noch gelesen.

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

- `index.html` – Grundgerüst, Werkzeuge, Seitenanalyse, Speichern
- `js/schrift.js` – Schriften und Textsatz (Zeilenumbruch, Listen), gleich für Bildschirm und PDF
- `js/editor.js` – Textfeld-Editor und schwebende Formatierleiste
- `js/objekte.js` – Abdecken, Formen, Fotos, Bausteine, Seiten, Auswahl/Verschieben, Rückgängig-Schnappschuss
- `js/speicher.js` – Absturz-Sicherung (IndexedDB) und eingebettete Bearbeitungsdaten
- `lib/` – PDF.js 3.11.174 (Anzeigen, Text-Erkennung), pdf-lib 1.17.1 (Schreiben), @pdf-lib/fontkit 1.1.1 (Schriften einbetten)
- `fonts/` – Inter 4.1 (SIL Open Font License) und Roboto 2.138 (Apache 2.0), je normal/fett/kursiv/fett-kursiv, Lizenzen daneben
- `sw.js` – Offline-Kopie · `manifest.webmanifest` – Installation + PDF-Dateizuordnung
- Lokal testen: `python -m http.server 8766 --bind 127.0.0.1`, dann `http://localhost:8766`.
  Als Datei (`file://`) geöffnet fehlen Inter/Roboto, dann gibt es nur die 3 Grundschriften.

## Automatischer Test

`node tests/pruefen.mjs` startet ein unsichtbares Edge mit eigenem kleinen Webserver und lädt den
Muster-Rapport. `node tests/muster_rapport.js` erzeugt ihn, mit erfundenen Daten. Geprüft werden 38 Punkte:
- Textfelder, Listen, Formatieren, Einfügen
- Abdecken (pixelgenau), Formen, Foto, Bausteine, Seiten, Rückgängig
- die bisherigen Funktionen (Kreis, Datum, Unterschrift)
- die gespeicherte PDF (echter Text, Schriften, Drehung) und das Wiederöffnen

Bilder landen in `tests/_ergebnis/` (nicht im Repository). Kein Tastendruck geht an den echten Bildschirm.
