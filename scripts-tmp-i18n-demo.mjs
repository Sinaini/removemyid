import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFileSync, writeFileSync } from "fs";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 56;

const ink = rgb(0.12, 0.14, 0.18);
const muted = rgb(0.4, 0.42, 0.47);
const rule = rgb(0.82, 0.84, 0.87);
const accent = rgb(0.09, 0.47, 0.82);
const red = rgb(0.75, 0.2, 0.2);

// --- Minimal "visual bidi" for simple RTL lines (Hebrew, no complex shaping
// needed since Hebrew letters don't join). Splits on spaces; any token
// containing a Hebrew character gets its characters reversed (so it reads
// correctly left-to-right on screen); pure-LTR tokens (numbers, emails,
// dates) are left alone; then the token order itself is reversed. This is
// NOT a full Unicode Bidi Algorithm implementation, just enough to lay out
// "Hebrew label: LTR value" style lines correctly.
const HEBREW_RE = /[\u0590-\u05FF]/;
function visualBidi(lineText) {
  const tokens = lineText.split(" ");
  const transformed = tokens.map((tok) =>
    HEBREW_RE.test(tok) ? [...tok].reverse().join("") : tok
  );
  return transformed.reverse().join(" ");
}

async function buildReport({ outPath, rtl, t, content }) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  let font, bold;
  if (rtl) {
    font = await doc.embedFont(readFileSync("C:/Windows/Fonts/NotoSansHebrew-Regular.ttf"), {
      subset: true,
    });
    bold = await doc.embedFont(readFileSync("C:/Windows/Fonts/NotoSansHebrew-Bold.ttf"), {
      subset: true,
    });
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }

  let page;
  let y;

  function newPage() {
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    y = PAGE_HEIGHT - 50;
  }

  // Draws at a fixed x (used for LTR docs, and for Hebrew doc labels/table
  // where we still want a stable left edge for the numeric columns).
  function lineAt(text, { size = 10.5, font: f = font, color = ink, gap = 15, x = MARGIN } = {}) {
    const display = rtl ? visualBidi(text) : text;
    page.drawText(display, { x, y, size, font: f, color });
    y -= gap;
  }

  // Draws right-aligned to the page's right margin, mirroring how an RTL
  // reader expects the line to hug the right edge.
  function lineRTL(text, { size = 10.5, font: f = font, color = ink, gap = 15 } = {}) {
    const display = visualBidi(text);
    const width = f.widthOfTextAtSize(display, size);
    page.drawText(display, { x: PAGE_WIDTH - MARGIN - width, y, size, font: f, color });
    y -= gap;
  }

  const line = rtl ? lineRTL : lineAt;

  function spacer(h) {
    y -= h;
  }

  function hr() {
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_WIDTH - MARGIN, y },
      thickness: 1,
      color: rule,
    });
    spacer(14);
  }

  function sectionHeader(text) {
    line(text, { size: 11.5, font: bold, color: accent, gap: 18 });
  }

  function footer(pageLabel) {
    const f1 = t.footerLine1;
    const f2 = t.footerLine2;
    if (rtl) {
      const w1 = font.widthOfTextAtSize(visualBidi(f1), 8);
      page.drawText(visualBidi(f1), {
        x: PAGE_WIDTH - MARGIN - w1,
        y: 40,
        size: 8,
        font,
        color: muted,
      });
      const w2 = font.widthOfTextAtSize(visualBidi(f2), 8);
      page.drawText(visualBidi(f2), {
        x: PAGE_WIDTH - MARGIN - w2,
        y: 28,
        size: 8,
        font,
        color: muted,
      });
      page.drawText(pageLabel, { x: MARGIN, y: 28, size: 8, font, color: muted });
    } else {
      page.drawText(f1, { x: MARGIN, y: 40, size: 8, font, color: muted });
      page.drawText(f2, { x: MARGIN, y: 28, size: 8, font, color: muted });
      page.drawText(pageLabel, {
        x: PAGE_WIDTH - MARGIN - 40,
        y: 28,
        size: 8,
        font,
        color: muted,
      });
    }
  }

  // ============================== Page 1 ==============================
  newPage();
  line(t.title, { size: 17, font: bold, gap: 20 });
  line(t.subtitle, { size: 10.5, color: muted, gap: 22 });
  hr();

  sectionHeader(t.patientInfo);
  for (const l of content.patient) line(l);
  spacer(10);

  sectionHeader(t.orderingProvider);
  for (const l of content.provider) line(l);
  spacer(10);

  sectionHeader(t.specimenInfo);
  for (const l of content.specimen) line(l);
  spacer(10);
  hr();

  sectionHeader(t.testResults);

  const colGap = 16;
  if (rtl) {
    // Right-align each column header/cell within its own slot so Hebrew
    // digraphs/labels read correctly, while keeping the table's overall
    // left-to-right column positions (test | result | range | flag) for
    // simplicity/consistency with the other language files.
    const cols = [
      { x: MARGIN, w: 230 },
      { x: 300, w: 75 },
      { x: 390, w: 95 },
      { x: 500, w: 56 },
    ];
    const drawCellR = (text, col, f, color) => {
      const display = visualBidi(text);
      const width = f.widthOfTextAtSize(display, 9.5);
      page.drawText(display, { x: col.x + col.w - width, y, size: 9.5, font: f, color: color ?? ink });
    };
    t.tableHeader.forEach((h, i) => drawCellR(h, cols[i], bold));
    spacer(colGap);
    for (const row of content.results) {
      row.forEach((cell, i) => {
        const isFlag = i === 3;
        const isHigh = cell === t.high;
        drawCellR(cell, cols[i], isFlag && isHigh ? bold : font, isFlag && isHigh ? red : ink);
      });
      spacer(colGap);
    }
  } else {
    const colX = { c0: MARGIN, c1: 300, c2: 390, c3: 500 };
    page.drawText(t.tableHeader[0], { x: colX.c0, y, size: 9.5, font: bold, color: ink });
    page.drawText(t.tableHeader[1], { x: colX.c1, y, size: 9.5, font: bold, color: ink });
    page.drawText(t.tableHeader[2], { x: colX.c2, y, size: 9.5, font: bold, color: ink });
    page.drawText(t.tableHeader[3], { x: colX.c3, y, size: 9.5, font: bold, color: ink });
    spacer(colGap);
    for (const [test, result, range, flag] of content.results) {
      page.drawText(test, { x: colX.c0, y, size: 9.5, font, color: ink });
      page.drawText(result, { x: colX.c1, y, size: 9.5, font, color: ink });
      page.drawText(range, { x: colX.c2, y, size: 9.5, font, color: ink });
      const isHigh = flag === t.high;
      page.drawText(flag, {
        x: colX.c3,
        y,
        size: 9.5,
        font: isHigh ? bold : font,
        color: isHigh ? red : ink,
      });
      spacer(colGap);
    }
  }

  footer("1/2");

  // ============================== Page 2 ==============================
  newPage();
  line(t.title, { size: 13, font: bold, gap: 16 });
  line(t.subtitleContinued, { size: 9.5, color: muted, gap: 20 });
  hr();

  sectionHeader(t.clinicalNotes);
  for (const l of content.notes) line(l);
  spacer(10);
  hr();

  sectionHeader(t.billingInfo);
  for (const l of content.billing) line(l);
  spacer(10);
  hr();

  sectionHeader(t.authorization);
  for (const l of content.authorization) line(l);

  footer("2/2");

  const bytes = await doc.save();
  writeFileSync(outPath, bytes);
  console.log("wrote", outPath);
}

// ============================================================
// Spanish
// ============================================================
await buildReport({
  outPath: "test/Demo Lab Report (Spanish).pdf",
  rtl: false,
  t: {
    title: "Laboratorio Clínico QuickHealth",
    subtitle: "Panel Metabólico Completo y Perfil Lipídico — Informe Final",
    subtitleContinued: "Panel Metabólico Completo y Perfil Lipídico — Informe Final (continuación)",
    patientInfo: "Información del Paciente",
    orderingProvider: "Médico Solicitante",
    specimenInfo: "Información de la Muestra",
    testResults: "Resultados de Pruebas",
    tableHeader: ["Prueba", "Resultado", "Rango de Referencia", "Indicador"],
    high: "Alto",
    clinicalNotes: "Notas Clínicas",
    billingInfo: "Información de Facturación",
    authorization: "Autorización del Informe",
    footerLine1: "Este informe es confidencial y de uso exclusivo del paciente y el médico solicitante.",
    footerLine2: "Laboratorio Clínico QuickHealth  |  Calle Mayor 118, Madrid, España  |  Directora: Dra. Beatriz Soler",
  },
  content: {
    patient: [
      "Nombre del Paciente:      María José Fernández López",
      "Fecha de Nacimiento:     14/03/1985       Edad: 40 años",
      "Sexo:                                   Femenino",
      "Número de Identificación:  452-90-1187",
      "Dirección:                          Calle Mayor 118, Madrid, España 28013",
      "Teléfono:                           +34 612 345 678",
      "Correo Electrónico:            maria.fernandez85@gmail.com",
    ],
    provider: [
      "Médico:                              Dra. Carmen Ruiz Martínez",
      "Clínica:                                Centro de Salud Familiar Madrid, Madrid, España",
      "Teléfono del Médico:      +34 611 987 654",
      "Correo del Médico:           c.ruiz@centrosaludmadrid.es",
    ],
    specimen: [
      "Fecha de Recolección:    12/01/2024      Hora: 08:14",
      "Fecha del Informe:            14/01/2024",
      "ID de Muestra:                   LAB2024X08834",
    ],
    results: [
      ["Glucosa en Ayunas", "96 mg/dL", "70-99", "Normal"],
      ["Colesterol Total", "210 mg/dL", "<200", "Alto"],
      ["Colesterol HDL", "48 mg/dL", ">40", "Normal"],
      ["Colesterol LDL", "138 mg/dL", "<130", "Alto"],
      ["Triglicéridos", "142 mg/dL", "<150", "Normal"],
      ["Hemoglobina A1c", "5.6 %", "<5.7", "Normal"],
      ["TSH", "2.1 mIU/L", "0.4-4.0", "Normal"],
      ["Creatinina", "0.9 mg/dL", "0.6-1.3", "Normal"],
      ["Sodio", "140 mmol/L", "136-145", "Normal"],
      ["Potasio", "4.2 mmol/L", "3.5-5.1", "Normal"],
    ],
    notes: [
      "La paciente es una mujer de 40 años que acude para un chequeo anual de",
      "rutina. Refiere fatiga ocasional durante las últimas tres semanas; niega",
      "dolor torácico, dificultad para respirar o palpitaciones. Antecedentes",
      "familiares de hiperlipidemia (madre, fallecida en 2019). Se recomienda",
      "asesoramiento dietético y repetir el perfil lipídico en 12 semanas.",
      "Contacto de emergencia: Laura Fernández, +34 611 222 333,",
      "laura.fernandez85@gmail.com.",
    ],
    billing: [
      "Proveedor de Seguro:      Sanitas Seguros de España",
      "Número de Afiliado:          SAN778104455X",
      "Tarjeta Registrada:            4539 1488 0343 6467",
      "Contacto de Facturación: maria.fernandez85@gmail.com",
    ],
    authorization: [
      "Revisado y emitido por: Dra. Carmen Ruiz Martínez",
      "Fecha de Emisión: 14/01/2024",
    ],
  },
});

// ============================================================
// French
// ============================================================
await buildReport({
  outPath: "test/Demo Lab Report (French).pdf",
  rtl: false,
  t: {
    title: "Laboratoire Clinique QuickHealth",
    subtitle: "Bilan Métabolique Complet et Profil Lipidique — Rapport Final",
    subtitleContinued: "Bilan Métabolique Complet et Profil Lipidique — Rapport Final (suite)",
    patientInfo: "Informations du Patient",
    orderingProvider: "Médecin Prescripteur",
    specimenInfo: "Informations sur l'Échantillon",
    testResults: "Résultats des Analyses",
    tableHeader: ["Analyse", "Résultat", "Plage de Référence", "Indicateur"],
    high: "Élevé",
    clinicalNotes: "Notes Cliniques",
    billingInfo: "Informations de Facturation",
    authorization: "Autorisation du Rapport",
    footerLine1: "Ce rapport est confidentiel et destiné exclusivement au patient et au médecin prescripteur.",
    footerLine2: "Laboratoire Clinique QuickHealth  |  12 Rue de la République, Lyon, France  |  Directrice: Dr. Isabelle Lefevre",
  },
  content: {
    patient: [
      "Nom du Patient:                Éléonore Marie Dubois",
      "Date de Naissance:          22/03/1985       Âge: 40 ans",
      "Sexe:                                    Féminin",
      "Numéro d'Identification:  452-90-1187",
      "Adresse:                              12 Rue de la République, Lyon, France 69002",
      "Téléphone:                          +33 6 12 34 56 78",
      "E-mail:                                  eleonore.dubois85@gmail.com",
    ],
    provider: [
      "Médecin:                             Dr. Camille Bernard",
      "Clinique:                               Centre Médical de Lyon, Lyon, France",
      "Téléphone du Médecin:  +33 6 11 98 76 54",
      "E-mail du Médecin:           c.bernard@centremedicallyon.fr",
    ],
    specimen: [
      "Date de Prélèvement:       12/01/2024      Heure: 08h14",
      "Date du Rapport:                14/01/2024",
      "ID de l'Échantillon:               LAB2024X08834",
    ],
    results: [
      ["Glycémie à Jeun", "96 mg/dL", "70-99", "Normal"],
      ["Cholestérol Total", "210 mg/dL", "<200", "Élevé"],
      ["Cholestérol HDL", "48 mg/dL", ">40", "Normal"],
      ["Cholestérol LDL", "138 mg/dL", "<130", "Élevé"],
      ["Triglycérides", "142 mg/dL", "<150", "Normal"],
      ["Hémoglobine A1c", "5.6 %", "<5.7", "Normal"],
      ["TSH", "2.1 mIU/L", "0.4-4.0", "Normal"],
      ["Créatinine", "0.9 mg/dL", "0.6-1.3", "Normal"],
      ["Sodium", "140 mmol/L", "136-145", "Normal"],
      ["Potassium", "4.2 mmol/L", "3.5-5.1", "Normal"],
    ],
    notes: [
      "La patiente est une femme de 40 ans se présentant pour un bilan de santé",
      "annuel de routine. Elle signale une fatigue occasionnelle au cours des",
      "trois dernières semaines; elle nie toute douleur thoracique, essoufflement",
      "ou palpitations. Antécédents familiaux d'hyperlipidémie (mère, décédée",
      "en 2019). Un suivi diététique et un nouveau bilan lipidique dans 12",
      "semaines sont recommandés. Contact d'urgence: Laura Dubois,",
      "+33 6 11 22 33 44, laura.dubois85@gmail.com.",
    ],
    billing: [
      "Assureur:                            Mutuelle Générale de France",
      "Numéro d'Adhérent:          MGF778104455X",
      "Carte Enregistrée:              4539 1488 0343 6467",
      "Contact Facturation:         eleonore.dubois85@gmail.com",
    ],
    authorization: [
      "Vérifié et publié par: Dr. Camille Bernard",
      "Date de Publication: 14/01/2024",
    ],
  },
});

// ============================================================
// German
// ============================================================
await buildReport({
  outPath: "test/Demo Lab Report (German).pdf",
  rtl: false,
  t: {
    title: "QuickHealth Diagnostiklabor",
    subtitle: "Umfassendes Stoffwechsel- und Lipidprofil — Abschlussbericht",
    subtitleContinued: "Umfassendes Stoffwechsel- und Lipidprofil — Abschlussbericht (Fortsetzung)",
    patientInfo: "Patienteninformationen",
    orderingProvider: "Überweisender Arzt",
    specimenInfo: "Probeninformationen",
    testResults: "Testergebnisse",
    tableHeader: ["Test", "Ergebnis", "Referenzbereich", "Flag"],
    high: "Hoch",
    clinicalNotes: "Klinische Notizen",
    billingInfo: "Abrechnungsinformationen",
    authorization: "Berichtsfreigabe",
    footerLine1: "Dieser Bericht ist vertraulich und ausschließlich für Patient und überweisenden Arzt bestimmt.",
    footerLine2: "QuickHealth Diagnostiklabor  |  Hauptstraße 118, München, Deutschland  |  Laborleiterin: Dr. Petra Wagner",
  },
  content: {
    patient: [
      "Patientenname:                Anna Sophie Müller",
      "Geburtsdatum:                  22.03.1985      Alter: 40 Jahre",
      "Geschlecht:                        Weiblich",
      "Patienten-ID:                       452-90-1187",
      "Adresse:                               Hauptstraße 118, München, Deutschland 80331",
      "Telefon:                                +49 89 1234 5678",
      "E-Mail:                                   anna.mueller85@gmail.com",
    ],
    provider: [
      "Arzt:                                       Dr. Julia Schmidt",
      "Praxis:                                  Familienpraxis München, München, Deutschland",
      "Telefon des Arztes:            +49 89 9876 5432",
      "E-Mail des Arztes:               j.schmidt@familienpraxis-muenchen.de",
    ],
    specimen: [
      "Entnahmedatum:                12.01.2024      Uhrzeit: 08:14 Uhr",
      "Berichtsdatum:                     14.01.2024",
      "Proben-ID:                              LAB2024X08834",
    ],
    results: [
      ["Nüchternglukose", "96 mg/dL", "70-99", "Normal"],
      ["Gesamtcholesterin", "210 mg/dL", "<200", "Hoch"],
      ["HDL-Cholesterin", "48 mg/dL", ">40", "Normal"],
      ["LDL-Cholesterin", "138 mg/dL", "<130", "Hoch"],
      ["Triglyzeride", "142 mg/dL", "<150", "Normal"],
      ["Hämoglobin A1c", "5.6 %", "<5.7", "Normal"],
      ["TSH", "2.1 mIU/L", "0.4-4.0", "Normal"],
      ["Kreatinin", "0.9 mg/dL", "0.6-1.3", "Normal"],
      ["Natrium", "140 mmol/L", "136-145", "Normal"],
      ["Kalium", "4.2 mmol/L", "3.5-5.1", "Normal"],
    ],
    notes: [
      "Die Patientin ist eine 40-jährige Frau, die sich zu einer routinemäßigen",
      "jährlichen Vorsorgeuntersuchung vorstellt. Sie berichtet über gelegentliche",
      "Müdigkeit in den letzten drei Wochen; verneint Brustschmerzen, Atemnot",
      "oder Herzklopfen. Familienanamnese positiv für Hyperlipidämie (Mutter,",
      "verstorben 2019). Ernährungsberatung und Kontrolle des Lipidprofils in",
      "12 Wochen empfohlen. Notfallkontakt: Laura Müller,",
      "+49 89 1122 3344, laura.mueller85@gmail.com.",
    ],
    billing: [
      "Versicherung:                     Techniker Krankenkasse",
      "Mitgliedsnummer:              TK778104455X",
      "Hinterlegte Karte:               4539 1488 0343 6467",
      "Rechnungskontakt:            anna.mueller85@gmail.com",
    ],
    authorization: [
      "Geprüft und freigegeben von: Dr. Julia Schmidt",
      "Freigabedatum: 14.01.2024",
    ],
  },
});

// ============================================================
// Hebrew (RTL)
// ============================================================
await buildReport({
  outPath: "test/Demo Lab Report (Hebrew).pdf",
  rtl: true,
  t: {
    title: "QuickHealth - דוח מעבדה מסכם",
    subtitle: "פאנל מטבולי מקיף ופרופיל שומנים בדם — דוח סופי",
    subtitleContinued: "פאנל מטבולי מקיף ופרופיל שומנים בדם — דוח סופי (המשך)",
    patientInfo: "פרטי המטופלת",
    orderingProvider: "רופא מפנה",
    specimenInfo: "פרטי הדגימה",
    testResults: "תוצאות בדיקות",
    tableHeader: ["בדיקה", "תוצאה", "טווח ייחוס", "דגל"],
    high: "גבוה",
    clinicalNotes: "הערות קליניות",
    billingInfo: "פרטי חיוב",
    authorization: "אישור הדוח",
    footerLine1: "דוח זה חסוי ומיועד לשימושם הבלעדי של המטופלת והרופא המפנה.",
    footerLine2: "QuickHealth מעבדות אבחון | רחוב הרצל 118, תל אביב | מנהלת מעבדה: ד\"ר אורית ברק",
  },
  content: {
    patient: [
      "שם המטופלת: מיכל דנה כהן",
      "תאריך לידה: 22.03.1985 גיל: 40",
      "מין: נקבה",
      "מספר זהות: 452-90-1187",
      "כתובת: רחוב הרצל 118, תל אביב, ישראל 6473118",
      "טלפון: 054-123-4567",
      "דוא\"ל: michal.cohen85@gmail.com",
    ],
    provider: [
      "רופאה: ד\"ר רונית לוי",
      "מרפאה: מרפאת משפחה תל אביב, תל אביב",
      "טלפון הרופאה: 054-987-6543",
      "דוא\"ל הרופאה: r.levi@clinic-telaviv.co.il",
    ],
    specimen: [
      "תאריך איסוף: 12.01.2024 שעה: 08:14",
      "תאריך הדוח: 14.01.2024",
      "מספר דגימה: LAB2024X08834",
    ],
    results: [
      ["גלוקוז בצום", "96 mg/dL", "70-99", "תקין"],
      ["כולסטרול כללי", "210 mg/dL", "<200", "גבוה"],
      ["כולסטרול HDL", "48 mg/dL", ">40", "תקין"],
      ["כולסטרול LDL", "138 mg/dL", "<130", "גבוה"],
      ["טריגליצרידים", "142 mg/dL", "<150", "תקין"],
      ["המוגלובין A1c", "5.6 %", "<5.7", "תקין"],
      ["TSH", "2.1 mIU/L", "0.4-4.0", "תקין"],
      ["קריאטינין", "0.9 mg/dL", "0.6-1.3", "תקין"],
      ["נתרן", "140 mmol/L", "136-145", "תקין"],
      ["אשלגן", "4.2 mmol/L", "3.5-5.1", "תקין"],
    ],
    notes: [
      "המטופלת היא אישה בת 40 המגיעה לבדיקה שנתית שגרתית. מדווחת על",
      "עייפות מזדמנת בשלושת השבועות האחרונים; מכחישה כאבים בחזה, קוצר",
      "נשימה או דפיקות לב. היסטוריה משפחתית של היפרליפידמיה (אמה, נפטרה",
      "ב-2019). מומלץ ייעוץ תזונתי ובדיקה חוזרת של פרופיל השומנים בעוד 12",
      "שבועות. איש קשר לשעת חירום: לאורה כהן,",
      "054-111-2233, laura.cohen85@gmail.com.",
    ],
    billing: [
      "חברת ביטוח: כלל ביטוח בריאות",
      "מספר חבר: CLL778104455X",
      "כרטיס בתיק: 4539 1488 0343 6467",
      "איש קשר לחיוב: michal.cohen85@gmail.com",
    ],
    authorization: [
      "נבדק ואושר על ידי: ד\"ר רונית לוי",
      "תאריך אישור: 14.01.2024",
    ],
  },
});
