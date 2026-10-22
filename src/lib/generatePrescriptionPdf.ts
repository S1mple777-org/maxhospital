import jsPDF from "jspdf";

export interface PrescriptionMedicine {
  name: string;
  dose: string;
  frequency: string;
  duration: string;
}

export interface PrescriptionData {
  id: string;
  patient_name: string;
  diagnosis: string;
  medicines: PrescriptionMedicine[];
  notes: string | null;
  doctor_name: string;
  doctor_title: string;
  department_name: string;
  created_at: string;
}

export function generatePrescriptionPdf(rx: PrescriptionData): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  let y = 18;

  // Header bar
  doc.setFillColor(20, 130, 115);
  doc.rect(0, 0, w, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text("MAX HOSPITAL", w / 2, 14, { align: "center" });
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Elektron Retsept / E-Prescription", w / 2, 22, { align: "center" });
  doc.text("max-hospital1.netlify.app", w / 2, 28, { align: "center" });

  y = 42;
  doc.setTextColor(30, 30, 30);

  // Info grid
  const left = 18;
  const right = w / 2 + 10;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");

  const infoRow = (label: string, value: string, x: number, row: number) => {
    const ry = y + row * 7;
    doc.setTextColor(120, 120, 120);
    doc.text(label, x, ry);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.text(value, x + 32, ry);
    doc.setFont("helvetica", "normal");
  };

  infoRow("Bemor:", rx.patient_name, left, 0);
  infoRow("Sana:", new Date(rx.created_at).toLocaleDateString("uz-UZ"), right, 0);
  infoRow("Shifokor:", rx.doctor_name, left, 1);
  infoRow("Mutaxassislik:", rx.doctor_title, right, 1);
  infoRow("Bo'lim:", rx.department_name, left, 2);
  infoRow("Retsept №:", rx.id.slice(0, 8).toUpperCase(), right, 2);

  y += 28;

  // Divider
  doc.setDrawColor(20, 130, 115);
  doc.setLineWidth(0.5);
  doc.line(left, y, w - left, y);
  y += 8;

  // Diagnosis
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 130, 115);
  doc.text("Tashxis / Diagnosis", left, y);
  y += 7;
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  const diagLines = doc.splitTextToSize(rx.diagnosis, w - 36);
  doc.text(diagLines, left, y);
  y += diagLines.length * 5 + 6;

  // Medicines table
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(20, 130, 115);
  doc.text("Dorilar / Medicines", left, y);
  y += 6;

  // Table header
  const cols = [left, left + 8, left + 58, left + 88, left + 120];
  doc.setFillColor(240, 248, 245);
  doc.rect(left - 2, y - 4, w - 32, 8, "F");
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(80, 80, 80);
  doc.text("№", cols[0], y);
  doc.text("Dori nomi", cols[1], y);
  doc.text("Dozasi", cols[2], y);
  doc.text("Qabul qilish", cols[3], y);
  doc.text("Muddat", cols[4], y);
  y += 7;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);

  rx.medicines.forEach((m, i) => {
    if (y > 260) { doc.addPage(); y = 20; }
    doc.text(`${i + 1}`, cols[0], y);
    doc.text(m.name, cols[1], y);
    doc.text(m.dose, cols[2], y);
    doc.text(m.frequency, cols[3], y);
    doc.text(m.duration, cols[4], y);
    y += 7;
  });

  y += 4;

  // Notes
  if (rx.notes) {
    doc.setDrawColor(200, 200, 200);
    doc.line(left, y, w - left, y);
    y += 7;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 130, 115);
    doc.text("Qo'shimcha ko'rsatmalar", left, y);
    y += 7;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 30, 30);
    const noteLines = doc.splitTextToSize(rx.notes, w - 36);
    doc.text(noteLines, left, y);
    y += noteLines.length * 5 + 6;
  }

  // Signature area
  y = Math.max(y + 10, 240);
  doc.setDrawColor(180, 180, 180);
  doc.line(w - 80, y, w - 20, y);
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text("Shifokor imzosi", w - 50, y + 5, { align: "center" });

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(160, 160, 160);
  doc.text("Bu elektron retsept MAX HOSPITAL platformasi orqali yaratilgan.", w / 2, 288, { align: "center" });

  return doc;
}
