import jsPDF from "jspdf";
import { METRIC_BY_KEY, type Lang, type MetricTrend } from "../../supabase/functions/_shared/medical-ai.ts";

/** The built-in PDF font is Latin-only: normalise quotes/dashes, and report whether text is printable. */
export function pdfSafe(text: string): string {
  return text
    .replace(/[ʻʼ‘’`]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[²]/g, "2")
    .replace(/[₂]/g, "2")
    .replace(/ /g, " ");
}

export const isLatinPrintable = (text: string) => /^[\x09\x0a\x0d\x20-\x7e -ÿ]*$/.test(pdfSafe(text));

const LABELS = {
  uz: {
    sub: "Salomatlik hisoboti / Health report",
    patient: "Bemor:",
    date: "Sana:",
    metric: "Ko'rsatkich",
    latest: "Oxirgi",
    previous: "Oldingi",
    change: "O'zgarish",
    normal: "Me'yor",
    status: "Holat",
    st: { low: "Past", high: "Yuqori", normal: "Me'yorda", unknown: "-" },
    ai: "AI izohi (saytdagi tibbiy kitoblar asosida)",
    aiSkipped: "AI izohi saytda ko'rsatilgan (PDF shrifti bu alifboni qo'llamaydi).",
    footer: "Bu hisobot shifokor ko'rigi uchun ma'lumot. Tashxis emas. MaxHospital",
  },
  en: {
    sub: "Health report",
    patient: "Patient:",
    date: "Date:",
    metric: "Measurement",
    latest: "Latest",
    previous: "Previous",
    change: "Change",
    normal: "Normal",
    status: "Status",
    st: { low: "Low", high: "High", normal: "Normal", unknown: "-" },
    ai: "AI explanation (based on the site's medical books)",
    aiSkipped: "The AI explanation is shown on the website (the PDF font does not support this alphabet).",
    footer: "This report is information for a doctor's visit. It is not a diagnosis. MaxHospital",
  },
};

export function generateHealthReportPdf(params: {
  patientName: string;
  trends: MetricTrend[];
  language: Lang;
  aiAnswer?: string | null;
}): jsPDF {
  // Cyrillic cannot be printed with the built-in font, so Russian users get the English layout.
  const pdfLang: "uz" | "en" = params.language === "uz" ? "uz" : "en";
  const L = LABELS[pdfLang];
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const left = 14;

  doc.setFillColor(20, 130, 115);
  doc.rect(0, 0, w, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("MAX HOSPITAL", w / 2, 13, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(L.sub, w / 2, 21, { align: "center" });

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  let y = 38;
  const name = isLatinPrintable(params.patientName) ? pdfSafe(params.patientName) : "-";
  doc.setTextColor(120, 120, 120); doc.text(L.patient, left, y);
  doc.setTextColor(30, 30, 30); doc.setFont("helvetica", "bold"); doc.text(name, left + 20, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120); doc.text(L.date, w - 60, y);
  doc.setTextColor(30, 30, 30); doc.text(new Date().toLocaleDateString("en-GB"), w - 46, y);

  // Table
  y += 10;
  const cols = [left, left + 52, left + 82, left + 108, left + 132, left + 162];
  const head = [L.metric, L.latest, L.previous, L.change, L.normal, L.status];
  doc.setFillColor(238, 243, 241);
  doc.rect(left - 2, y - 5, w - 2 * left + 4, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  head.forEach((t, i) => doc.text(t, cols[i], y));
  doc.setFont("helvetica", "normal");
  y += 8;

  for (const tr of params.trends) {
    if (y > h - 30) { doc.addPage(); y = 20; }
    const def = METRIC_BY_KEY[tr.metric];
    const unit = pdfSafe(def.unit);
    const change = tr.previous === null || tr.change === null
      ? "-"
      : `${tr.change > 0 ? "+" : ""}${tr.change}${tr.changePercent !== null ? ` (${tr.changePercent}%)` : ""}`;
    const row = [
      pdfSafe(def.label[pdfLang]),
      `${tr.latest} ${unit}`,
      tr.previous === null ? "-" : String(tr.previous),
      change,
      def.normal ? `${def.normal[0]}-${def.normal[1]}` : "-",
      L.st[tr.status],
    ];
    if (tr.status === "high" || tr.status === "low") doc.setTextColor(185, 28, 28);
    row.forEach((t, i) => doc.text(doc.splitTextToSize(t, (cols[i + 1] ?? w - left) - cols[i] - 2)[0] ?? "", cols[i], y));
    doc.setTextColor(30, 30, 30);
    doc.setDrawColor(225, 225, 225);
    doc.line(left - 2, y + 2.5, w - left + 2, y + 2.5);
    y += 7.5;
  }

  // AI explanation
  if (params.aiAnswer) {
    y += 6;
    if (y > h - 40) { doc.addPage(); y = 20; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 130, 115);
    doc.text(L.ai, left, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 30, 30);
    const text = isLatinPrintable(params.aiAnswer) ? pdfSafe(params.aiAnswer) : L.aiSkipped;
    for (const line of doc.splitTextToSize(text, w - 2 * left)) {
      if (y > h - 20) { doc.addPage(); y = 20; }
      doc.text(line, left, y);
      y += 4.8;
    }
  }

  doc.setFontSize(8);
  doc.setTextColor(140, 140, 140);
  doc.text(L.footer, w / 2, h - 10, { align: "center" });
  return doc;
}
