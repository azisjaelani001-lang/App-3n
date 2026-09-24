import jsPDF from 'jspdf';
import autoTablePlugin, { autoTable as namedAutoTable } from 'jspdf-autotable';
import { Beneficiary } from '../types';
import { calculateAgeSimple, formatDateSimple } from './helpers';
import { triggerBlobDownload } from './fileDownload';

export interface ExportPdfResult {
  blob: Blob;
  filename: string;
  totalRows: number;
  pdfDataUrl: string;
}

export function exportToPdf(data: Beneficiary[], posyanduLabel: string): ExportPdfResult {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data sasaran penerima manfaat untuk dicetak ke PDF.');
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // Kop Surat Resmi BGN & SPPG Jayamukti
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 45, 80);
  doc.text('BADAN GIZI NASIONAL (BGN) REPUBLIK INDONESIA', pageWidth / 2, 11, { align: 'center' });

  doc.setFontSize(13);
  doc.setTextColor(15, 118, 110);
  doc.text('SATUAN PELAYANAN PEMENUHAN GIZI (SPPG) JAYAMUKTI', pageWidth / 2, 16, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);
  const printDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  doc.text(
    `Data Sasaran: Balita, Bumil, Busui, Kader  |  Wilayah: ${posyanduLabel}  |  Tanggal Cetak: ${printDate}`,
    pageWidth / 2,
    21,
    { align: 'center' }
  );

  doc.setDrawColor(15, 118, 110);
  doc.setLineWidth(0.6);
  doc.line(14, 24, pageWidth - 14, 24);

  // Tabel Data
  const rows = data.map((item, idx) => [
    (idx + 1).toString(),
    item.nik,
    item.nama,
    item.kategori,
    item.jenisKelamin,
    `${formatDateSimple(item.tanggalLahir)} (${calculateAgeSimple(item.tanggalLahir)})`,
    item.alamat,
    item.namaOrangTua || '-',
    item.posyandu.replace('Posyandu ', ''),
  ]);

  const tableOptions = {
    startY: 27,
    head: [[
      'No',
      'NIK',
      'Nama Lengkap',
      'Kategori',
      'JK',
      'Tgl Lahir / Usia',
      'Alamat',
      'Nama Orang Tua',
      'Posyandu',
    ]],
    body: rows,
    theme: 'grid' as const,
    headStyles: {
      fillColor: [16, 185, 129] as [number, number, number], // Emerald
      textColor: [255, 255, 255] as [number, number, number],
      fontSize: 8,
      fontStyle: 'bold' as const,
      halign: 'center' as const,
    },
    styles: {
      fontSize: 8,
      cellPadding: 2,
      overflow: 'linebreak' as const,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' as const },
      1: { cellWidth: 32, fontStyle: 'bold' as const },
      2: { cellWidth: 36 },
      3: { cellWidth: 18, halign: 'center' as const },
      4: { cellWidth: 10, halign: 'center' as const },
      5: { cellWidth: 32 },
      6: { cellWidth: 50 },
      7: { cellWidth: 42 },
      8: { cellWidth: 26, halign: 'center' as const },
    },
    margin: { left: 14, right: 14 },
  };

  // Panggil autoTable dengan fallback aman
  try {
    if (typeof namedAutoTable === 'function') {
      namedAutoTable(doc, tableOptions);
    } else if (typeof autoTablePlugin === 'function') {
      (autoTablePlugin as any)(doc, tableOptions);
    } else if ((autoTablePlugin as any)?.default && typeof (autoTablePlugin as any).default === 'function') {
      (autoTablePlugin as any).default(doc, tableOptions);
    } else if ((doc as any).autoTable && typeof (doc as any).autoTable === 'function') {
      (doc as any).autoTable(tableOptions);
    }
  } catch (tableErr) {
    console.warn('Fallback render tabel PDF manual:', tableErr);
    // Fallback darurat jika autoTable gagal
    let currentY = 32;
    doc.setFontSize(8);
    rows.slice(0, 40).forEach((r) => {
      doc.text(`${r[0]}. ${r[1]} - ${r[2]} (${r[3]})`, 14, currentY);
      currentY += 5;
    });
  }

  const lastTable = (doc as any).lastAutoTable;
  const finalY = (lastTable && typeof lastTable.finalY === 'number') ? lastTable.finalY + 10 : 150;
  
  if (finalY < 175) {
    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);
    doc.text('Mengetahui / Memeriksa,', 30, finalY);
    doc.text('Bidan Desa / Tenaga Kesehatan', 30, finalY + 5);
    doc.text('( ................................................ )', 30, finalY + 22);

    doc.text('Dicatat oleh,', pageWidth - 75, finalY);
    doc.text('Kader Posyandu SPPG', pageWidth - 75, finalY + 5);
    doc.text('( ................................................ )', pageWidth - 75, finalY + 22);
  }

  const cleanPos = (posyanduLabel || 'Jayamukti').replace(/\s+/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `SPPG_Jayamukti_Laporan_${cleanPos}_${dateStr}.pdf`;

  // Dapatkan Blob langsung agar aman di peramban seluler & iframe
  const blob = doc.output('blob');
  
  // Picu unduhan berkas
  triggerBlobDownload(blob, filename);

  // Buat URL pratinjau untuk modal in-app
  let pdfDataUrl = '';
  try {
    pdfDataUrl = URL.createObjectURL(blob);
  } catch (e) {
    console.warn('Gagal membuat object url:', e);
  }

  return { blob, filename, totalRows: rows.length, pdfDataUrl };
}
