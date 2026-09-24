import * as XLSX from 'xlsx';
import { Beneficiary } from '../types';
import { calculateAgeSimple, formatDateSimple } from './helpers';
import { triggerBlobDownload } from './fileDownload';

export interface ExportExcelResult {
  blob: Blob;
  filename: string;
  totalRows: number;
}

export function exportToExcel(
  data: Beneficiary[],
  posyanduLabel: string
): ExportExcelResult {
  if (!data || data.length === 0) {
    throw new Error('Tidak ada data sasaran penerima manfaat untuk diekspor.');
  }

  const rows = data.map((item, idx) => ({
    'No': idx + 1,
    'NIK': `'${item.nik}`,
    'Nama Lengkap': item.nama,
    'Kategori': item.kategori,
    'Jenis Kelamin': item.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan',
    'Tanggal Lahir': formatDateSimple(item.tanggalLahir),
    'Usia': calculateAgeSimple(item.tanggalLahir),
    'Alamat': item.alamat,
    'Nama Orang Tua': item.namaOrangTua || '-',
    'Posyandu': item.posyandu,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);

  ws['!cols'] = [
    { wch: 6 },  // No
    { wch: 22 }, // NIK
    { wch: 28 }, // Nama
    { wch: 14 }, // Kategori
    { wch: 15 }, // JK
    { wch: 16 }, // Tgl Lahir
    { wch: 16 }, // Usia
    { wch: 34 }, // Alamat
    { wch: 28 }, // Orang Tua
    { wch: 24 }, // Posyandu
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Data Sasaran SPPG');

  const cleanPos = (posyanduLabel || 'Jayamukti').replace(/\s+/g, '_');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `SPPG_Jayamukti_Data_${cleanPos}_${dateStr}.xlsx`;

  // Hasilkan berkas biner murni yang aman di semua peramban (tanpa ketergantungan modul NodeJS fs)
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  // Picu unduhan berkas langsung
  triggerBlobDownload(blob, filename);

  return { blob, filename, totalRows: rows.length };
}
