import jsPDF from 'jspdf';

const cleanFilename = (value) => (value || 'patient-records')
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/gi, '-')
  .replace(/^-|-$/g, '')
  .toLowerCase() || 'patient-records';

export function downloadRecordsPdf({ patientName, patientEmail, patient = {}, records = [], demo = false }) {
  const pdf = new jsPDF();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const left = 18;
  const width = pdf.internal.pageSize.getWidth() - left * 2;
  let y = 20;

  const ensureSpace = (height = 8) => {
    if (y + height > pageHeight - 18) {
      pdf.addPage();
      y = 20;
    }
  };

  const addText = (text, { size = 11, bold = false, color = [55, 65, 81], gap = 6 } = {}) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.setTextColor(...color);
    const lines = pdf.splitTextToSize(String(text || '—'), width);
    ensureSpace(lines.length * gap + 2);
    pdf.text(lines, left, y);
    y += lines.length * gap + 2;
  };

  pdf.setFillColor(37, 99, 235);
  pdf.rect(0, 0, 210, 34, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  pdf.text('HealthGuard AI', left, 16);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.text('Medical Records', left, 25);
  y = 46;

  addText(patientName || 'Patient', { size: 16, bold: true, color: [31, 41, 55], gap: 8 });
  const profileEntries = [
    ['Email', patientEmail || patient.email], ['Phone', patient.phone], ['Date of Birth', patient.dateOfBirth],
    ['Address', patient.address], ['Blood Type', patient.bloodType], ['Allergies', patient.allergies],
    ['Emergency Contact', patient.emergencyContact], ['Insurance Provider', patient.insuranceProvider],
    ['Insurance Number', patient.insuranceNumber]
  ].filter(([, value]) => value);
  profileEntries.forEach(([label, value]) => addText(`${label}: ${value}`));
  addText(`Downloaded: ${new Date().toLocaleString()}`);
  addText(`Records included: ${records.length}`);
  if (demo || records.some(record => record.demo)) {
    addText('DEMO DATA — fictional records for demonstration only.', { size: 10, bold: true, color: [180, 83, 9] });
  }
  y += 3;

  records.forEach((record, index) => {
    ensureSpace(34);
    pdf.setDrawColor(219, 234, 254);
    pdf.setFillColor(239, 246, 255);
    pdf.roundedRect(left, y - 4, width, 10, 2, 2, 'FD');
    addText(`${index + 1}. ${record.type || 'Medical visit'} — ${record.date || 'Date not provided'}`, { size: 12, bold: true, color: [29, 78, 216], gap: 6 });
    if (record.doctor) addText(`Doctor: ${record.doctor}`);
    if (record.hospital) addText(`Clinic: ${record.hospital}`);
    if (record.diagnosis) addText(`Diagnosis: ${record.diagnosis}`);
    if (record.prescription) addText(`Prescription: ${record.prescription}`);
    if (record.notes) addText(`Notes: ${record.notes}`);
    if (record.vitals) {
      addText('Vitals:', { bold: true, color: [29, 78, 216] });
      Object.entries(record.vitals).forEach(([key, value]) => addText(`${key}: ${value}`));
    }
    if (record.labResults) {
      addText('Lab Results:', { bold: true, color: [29, 78, 216] });
      Object.entries(record.labResults).forEach(([key, value]) => addText(`${key}: ${value}`));
    }
    if (record.followUp) addText(`Follow-up: ${record.followUp}`);
    y += 3;
  });

  pdf.save(`${cleanFilename(patientName)}-medical-records.pdf`);
}
