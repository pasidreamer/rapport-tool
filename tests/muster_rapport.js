// Erzeugt tests/muster-rapport.pdf: ein erfundener Rapport mit den gleichen Elementen wie die echten
// (Kreise „o“, Kästchen, „Datum: ____“, „Arbeitszeit:“, Unterschriftslinien). Keine echten Daten.
// Aufruf: node tests/muster_rapport.js
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('../lib/pdf-lib.min.js');

(async () => {
  const pdf = await PDFDocument.create();
  const h = await pdf.embedFont(StandardFonts.Helvetica);
  const hb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const zd = await pdf.embedFont(StandardFonts.ZapfDingbats);
  const seite = pdf.addPage([595.28, 841.89]);
  let y = 790;
  const t = (s, x, f = h, g = 10.5) => seite.drawText(s, { x, y, size: g, font: f, color: rgb(0.1, 0.1, 0.1) });

  t('Muster AG – Service-Rapport', 56, hb, 16); y -= 30;
  t('Auftrag Nr.: ________________', 56); t('Datum: ________________', 330); y -= 24;
  t('Kunde: ______________________________________', 56); y -= 24;
  t('Arbeitszeit:', 56); y -= 34;

  t('Durchgeführte Arbeiten', 56, hb, 12); y -= 22;
  for (const z of ['Filter geprüft und ersetzt', 'Kanal gereinigt', 'Fotos vorher/nachher erstellt', 'Anlage wieder in Betrieb']) {
    t('o', 70); t(z, 86); y -= 19;
  }
  y -= 10;
  t('Zusatzarbeiten', 56, hb, 12); y -= 22;
  for (const z of ['Revisionsöffnung eingebaut', 'Brandschutzklappe geprüft']) {
    seite.drawText('❏', { x: 70, y, size: 10.5, font: zd }); t(z, 86); y -= 19;   // Kästchen aus ZapfDingbats
  }
  y -= 14;
  t('Bemerkungen:', 56, hb, 11); y -= 22;
  for (let i = 0; i < 4; i++) { t('_______________________________________________________________________________', 56); y -= 22; }
  y -= 20;
  t('Name Abnehmer (Blockschrift): ____________________________', 56); y -= 46;
  t('Unterschrift Kunde: ______________________', 56); t('Unterschrift Monteur: ________________', 320); y -= 40;
  t('Dieses Formular ist ein Muster zum Testen des Rapport-Tools.', 56, h, 8);

  const ziel = path.join(__dirname, 'muster-rapport.pdf');
  fs.writeFileSync(ziel, await pdf.save());
  console.log('geschrieben:', ziel);
})();
