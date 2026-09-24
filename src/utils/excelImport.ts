import * as XLSX from 'xlsx';
import { Beneficiary, BeneficiaryCategory, Gender, PosyanduLocation } from '../types';
import { POSYANDU_LIST } from '../data/posyanduData';
import { generateId, validateNik } from './helpers';
import { triggerBlobDownload } from './fileDownload';

export interface ParsedImportRow {
  id: string;
  rowNumber: number;
  nik: string;
  nama: string;
  kategori: BeneficiaryCategory;
  jenisKelamin: Gender;
  tanggalLahir: string;
  alamat: string;
  namaOrangTua: string;
  posyandu: PosyanduLocation;
  isValid: boolean;
  errors: string[];
  rawValues?: Record<string, any>;
}

export interface ImportErrorSummary {
  missingAddress: number;
  invalidDate: number;
  invalidNik: number;
  duplicateNik: number;
  missingName: number;
  other: number;
}

export interface ImportResult {
  validRows: Beneficiary[];
  previewRows: ParsedImportRow[];
  totalParsed: number;
  totalValid: number;
  totalInvalid: number;
  errorSummary: ImportErrorSummary;
}

// Map Indonesian month names to 2-digit format
const INDO_MONTH_MAP: Record<string, string> = {
  jan: '01',
  januari: '01',
  january: '01',
  feb: '02',
  februari: '02',
  february: '02',
  mar: '03',
  maret: '03',
  march: '03',
  apr: '04',
  april: '04',
  mei: '05',
  may: '05',
  jun: '06',
  juni: '06',
  june: '06',
  jul: '07',
  juli: '07',
  july: '07',
  agu: '08',
  agustus: '08',
  agt: '08',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  okt: '10',
  oktober: '10',
  oct: '10',
  october: '10',
  nop: '11',
  nov: '11',
  november: '11',
  nopember: '11',
  des: '12',
  desember: '12',
  dec: '12',
  december: '12',
};

// Convert Excel dates (supports serial numbers, Indonesian text, ISO, DD/MM/YYYY, etc.)
export function parseExcelDate(val: any): string {
  if (val === null || val === undefined || val === '') return '';

  // If number (Excel serial date number)
  if (typeof val === 'number') {
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj && dateObj.y && dateObj.m && dateObj.d) {
        const y = dateObj.y.toString().padStart(4, '0');
        const m = dateObj.m.toString().padStart(2, '0');
        const d = dateObj.d.toString().padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch {
      // fallback
    }
  }

  let str = String(val).trim();
  if (!str) return '';

  // Remove location prefix if any (e.g., "Tasikmalaya, 15-08-2023" -> "15-08-2023")
  if (str.includes(',')) {
    const parts = str.split(',');
    str = parts[parts.length - 1].trim();
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // YYYY/MM/DD or YYYY.MM.DD
  const ymdMatch = str.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YY or DD-MM-YY (e.g. 15/08/23 or 22/04/98)
  const dmyShortMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmyShortMatch) {
    const d = dmyShortMatch[1].padStart(2, '0');
    const m = dmyShortMatch[2].padStart(2, '0');
    const shortY = parseInt(dmyShortMatch[3], 10);
    // If > 40 assume 1900s (e.g. 1975), else 2000s (e.g. 2023)
    const y = shortY > 40 ? `19${shortY}` : `20${shortY.toString().padStart(2, '0')}`;
    return `${y}-${m}-${d}`;
  }

  // Indonesian Text Date: e.g. "15 Agustus 2023", "12-Des-2022", "5 Jan 2024"
  const textDateMatch = str.match(/^(\d{1,2})[\s\-\/\.]*([a-zA-Z]+)[\s\-\/\.]*(\d{2,4})$/);
  if (textDateMatch) {
    const d = textDateMatch[1].padStart(2, '0');
    const monthKey = textDateMatch[2].toLowerCase();
    let rawY = textDateMatch[3];
    if (rawY.length === 2) {
      const numY = parseInt(rawY, 10);
      rawY = numY > 40 ? `19${numY}` : `20${numY.toString().padStart(2, '0')}`;
    }
    const m = INDO_MONTH_MAP[monthKey];
    if (m && rawY) {
      return `${rawY}-${m}-${d}`;
    }
  }

  // Standard JS Date.parse fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 1920 && parsed.getFullYear() < 2100) {
    const y = parsed.getFullYear().toString().padStart(4, '0');
    const m = (parsed.getMonth() + 1).toString().padStart(2, '0');
    const d = parsed.getDate().toString().padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return '';
}

// Normalize Category
export function parseCategory(val: any): BeneficiaryCategory {
  const s = String(val || '').trim().toLowerCase();
  if (s.includes('balita') || s.includes('anak') || s.includes('bayi')) return 'Balita';
  if (s.includes('bumil') || s.includes('hamil')) return 'Bumil';
  if (s.includes('busui') || s.includes('menyusui') || s.includes('nifas')) return 'Busui';
  if (s.includes('kader') || s.includes('posyandu')) return 'Kader';
  return 'Balita';
}

// Normalize Gender
export function parseGender(val: any, category: BeneficiaryCategory): Gender {
  if (category === 'Bumil' || category === 'Busui') return 'P';
  const s = String(val || '').trim().toUpperCase();
  if (s.startsWith('L') || s.includes('LAKI') || s.includes('PRIA')) return 'L';
  if (s.startsWith('P') || s.includes('PEREMPUAN') || s.includes('WANITA')) return 'P';
  return 'L';
}

// Normalize Posyandu
export function parsePosyandu(val: any, defaultPosyandu: PosyanduLocation): PosyanduLocation {
  const s = String(val || '').trim().toLowerCase();
  if (!s) return defaultPosyandu;
  for (const pos of POSYANDU_LIST) {
    const pLower = pos.toLowerCase();
    const shortName = pLower.replace('posyandu ', '');
    if (s.includes(shortName) || s.includes(pLower)) {
      return pos;
    }
  }
  return defaultPosyandu;
}

// Clean and sanitize NIK string (handles scientific notation like 3.20604E+15 or formatted NIK)
export function sanitizeNikString(raw: any): string {
  if (raw === null || raw === undefined) return '';

  // If numeric and in scientific format or large integer
  if (typeof raw === 'number') {
    // If it's a standard integer without exponents
    const numStr = raw.toLocaleString('fullwide', { useGrouping: false });
    return numStr.replace(/\D/g, '');
  }

  let str = String(raw).trim();

  // If scientific notation string e.g. "3.20604e+15"
  if (/^[0-9]+(\.[0-9]+)?[eE]\+[0-9]+$/.test(str)) {
    try {
      const num = Number(str);
      str = num.toLocaleString('fullwide', { useGrouping: false });
    } catch {
      // keep original
    }
  }

  // Remove leading single quote, spaces, dashes, dots
  return str.replace(/['"\s\-\.]/g, '').replace(/\D/g, '');
}

// Validate single row against rules and existing database
export function validateRow(
  row: {
    nik: string;
    nama: string;
    tanggalLahir: string;
    alamat: string;
    kategori: BeneficiaryCategory;
    posyandu: PosyanduLocation;
  },
  existingBeneficiaries: Beneficiary[] = [],
  batchDuplicateNikMap?: Map<string, number>
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // NIK Validation
  const cleanNik = row.nik ? row.nik.trim() : '';
  if (!cleanNik) {
    errors.push('NIK belum diisi / kosong');
  } else if (!/^\d+$/.test(cleanNik)) {
    errors.push('NIK mengandung karakter non-angka');
  } else if (cleanNik.length !== 16) {
    errors.push(`NIK harus 16 digit (saat ini ${cleanNik.length} digit)`);
  } else {
    // Check if duplicate in batch
    if (batchDuplicateNikMap && (batchDuplicateNikMap.get(cleanNik) || 0) > 1) {
      errors.push('NIK duplikat di dalam berkas Excel ini');
    }
    // Check if duplicate in existing DB
    const existingMatch = existingBeneficiaries.find((b) => b.nik === cleanNik);
    if (existingMatch) {
      errors.push(`NIK sudah terdaftar di sistem: ${existingMatch.nama} (${existingMatch.posyandu})`);
    }
  }

  // Nama
  if (!row.nama || !row.nama.trim()) {
    errors.push('Nama belum diisi');
  }

  // Tanggal Lahir
  if (!row.tanggalLahir || !row.tanggalLahir.trim()) {
    errors.push('Tanggal lahir kosong atau format tidak dikenali');
  } else {
    const birthDate = new Date(row.tanggalLahir);
    if (isNaN(birthDate.getTime())) {
      errors.push('Format tanggal lahir tidak valid');
    } else {
      const today = new Date();
      if (birthDate > today) {
        errors.push('Tanggal lahir tidak boleh di masa depan');
      }
    }
  }

  // Alamat
  if (!row.alamat || !row.alamat.trim()) {
    errors.push('Alamat belum diisi (klik "Lengkapi Alamat Otomatis" atau edit baris)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Revalidate all rows in batch
export function revalidateAllRows(
  rows: ParsedImportRow[],
  existingBeneficiaries: Beneficiary[] = []
): {
  rows: ParsedImportRow[];
  totalValid: number;
  totalInvalid: number;
  errorSummary: ImportErrorSummary;
} {
  // Build frequency map for batch duplicates
  const nikCountMap = new Map<string, number>();
  rows.forEach((r) => {
    const clean = r.nik.trim();
    if (clean && clean.length === 16) {
      nikCountMap.set(clean, (nikCountMap.get(clean) || 0) + 1);
    }
  });

  const summary: ImportErrorSummary = {
    missingAddress: 0,
    invalidDate: 0,
    invalidNik: 0,
    duplicateNik: 0,
    missingName: 0,
    other: 0,
  };

  const updatedRows = rows.map((r) => {
    const val = validateRow(r, existingBeneficiaries, nikCountMap);
    
    // Categorize errors for summary
    val.errors.forEach((err) => {
      const lower = err.toLowerCase();
      if (lower.includes('alamat')) summary.missingAddress++;
      else if (lower.includes('tanggal')) summary.invalidDate++;
      else if (lower.includes('duplikat') || lower.includes('sudah terdaftar')) summary.duplicateNik++;
      else if (lower.includes('nik')) summary.invalidNik++;
      else if (lower.includes('nama')) summary.missingName++;
      else summary.other++;
    });

    return {
      ...r,
      isValid: val.isValid,
      errors: val.errors,
    };
  });

  const totalValid = updatedRows.filter((r) => r.isValid).length;
  const totalInvalid = updatedRows.length - totalValid;

  return {
    rows: updatedRows,
    totalValid,
    totalInvalid,
    errorSummary: summary,
  };
}

// Perbaiki semua baris otomatis dengan nilai default cerdas
export function autoRepairAllRows(
  rows: ParsedImportRow[],
  existingBeneficiaries: Beneficiary[] = [],
  defaultAddress = 'Desa Jayamukti, Kec. Leuwisadeng'
): {
  rows: ParsedImportRow[];
  totalValid: number;
  totalInvalid: number;
  errorSummary: ImportErrorSummary;
} {
  const repaired = rows.map((r) => {
    let newNik = sanitizeNikString(r.nik);
    // Jika NIK kosong atau kurang 16 digit, buatkan format NIK sementara berbasis timestamp/acak agar data tidak hilang
    if (!newNik || newNik.length !== 16) {
      if (!newNik) {
        newNik = '3206' + Math.floor(100000000000 + Math.random() * 900000000000).toString();
      } else if (newNik.length < 16) {
        newNik = newNik.padEnd(16, '0');
      } else if (newNik.length > 16) {
        newNik = newNik.slice(0, 16);
      }
    }

    const newNama = r.nama && r.nama.trim() ? r.nama.trim() : 'Sasaran Penerima Manfaat';
    const newAlamat = r.alamat && r.alamat.trim() ? r.alamat.trim() : `${defaultAddress} (${r.posyandu})`;
    let newTglLahir = r.tanggalLahir;
    if (!newTglLahir) {
      newTglLahir = '2023-01-01'; // Default tanggal lahir balita
    }

    return {
      ...r,
      nik: newNik,
      nama: newNama,
      alamat: newAlamat,
      tanggalLahir: newTglLahir,
    };
  });

  return revalidateAllRows(repaired, existingBeneficiaries);
}

// Parse uploaded Excel File Buffer
export function parseExcelFile(
  fileBuffer: ArrayBuffer,
  currentPosyandu: PosyanduLocation | 'Semua Posyandu',
  existingBeneficiaries: Beneficiary[] = []
): ImportResult {
  const workbook = XLSX.read(fileBuffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  const defaultPos: PosyanduLocation =
    currentPosyandu === 'Semua Posyandu' ? 'Posyandu Paseh' : currentPosyandu;

  const initialRows: ParsedImportRow[] = [];

  rawRows.forEach((row, index) => {
    const keys = Object.keys(row);
    const findVal = (terms: string[]) => {
      for (const k of keys) {
        const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const t of terms) {
          if (kClean.includes(t)) {
            return row[k];
          }
        }
      }
      return '';
    };

    // Extract fields with generous synonyms
    const rawNikVal = findVal(['nik', 'noktp', 'noidentitas', 'ktp', 'nomorinduk', 'nonik', 'idkependudukan']);
    const rawNik = sanitizeNikString(rawNikVal);

    const nama = String(findVal(['namalengkap', 'namasasaran', 'namaanak', 'namabalita', 'namaibu', 'nama', 'sasaran']) || '').trim();
    const rawKategori = findVal(['kategori', 'jenissasaran', 'jenis', 'status', 'golongan', 'kelompok']);
    const rawJk = findVal(['jeniskelamin', 'gender', 'sex', 'jk', 'kelamin']);
    const rawTglLahir = findVal(['tanggallahir', 'tgllahir', 'tgl', 'dob', 'lahiran', 'ttl', 'tglanak', 'tglbayi', 'lahir']);
    const alamat = String(findVal(['alamat', 'domisili', 'dusun', 'rtrw', 'rt', 'rw', 'kampung', 'kp', 'desa']) || '').trim();
    const namaOrangTua = String(findVal(['namaorangtua', 'orangtua', 'ortu', 'ayahibu', 'namaayah', 'namaibu', 'wali', 'keluarga']) || '-').trim();
    const rawPos = findVal(['posyandu', 'lokasi', 'tempat', 'pos']);

    // Lewati baris yang benar-benar kosong
    if (!rawNik && !nama && !alamat && !rawTglLahir && !rawNikVal) {
      return;
    }

    const kategori = parseCategory(rawKategori);
    const jenisKelamin = parseGender(rawJk, kategori);
    const tanggalLahir = parseExcelDate(rawTglLahir);
    const posyandu = parsePosyandu(rawPos, defaultPos);

    initialRows.push({
      id: generateId(),
      rowNumber: index + 2, // Excel 1-based header is row 1
      nik: rawNik,
      nama,
      kategori,
      jenisKelamin,
      tanggalLahir,
      alamat,
      namaOrangTua,
      posyandu,
      isValid: false,
      errors: [],
      rawValues: {
        rawNik: rawNikVal,
        rawTglLahir,
      },
    });
  });

  const reval = revalidateAllRows(initialRows, existingBeneficiaries);

  const validRows: Beneficiary[] = reval.rows
    .filter((r) => r.isValid)
    .map((r) => ({
      id: generateId(),
      nik: r.nik,
      nama: r.nama,
      kategori: r.kategori,
      jenisKelamin: r.jenisKelamin,
      tanggalLahir: r.tanggalLahir,
      alamat: r.alamat,
      namaOrangTua: r.namaOrangTua || '-',
      posyandu: r.posyandu,
    }));

  return {
    validRows,
    previewRows: reval.rows,
    totalParsed: rawRows.length,
    totalValid: reval.totalValid,
    totalInvalid: reval.totalInvalid,
    errorSummary: reval.errorSummary,
  };
}

// Download Sample Template for Cadres
export function downloadExcelTemplate() {
  const sampleData = [
    {
      'NIK': '3206124508230001',
      'Nama Lengkap': 'Muhammad Al-Fatih',
      'Kategori': 'Balita',
      'Jenis Kelamin': 'L',
      'Tanggal Lahir': '2023-08-15',
      'Alamat': 'Dusun Paseh RT 02 / RW 01, Desa Jayamukti',
      'Nama Orang Tua': 'Ahmad Fauzi & Siti',
      'Posyandu': 'Posyandu Paseh',
    },
    {
      'NIK': '3206126204980002',
      'Nama Lengkap': 'Rina Marlina',
      'Kategori': 'Bumil',
      'Jenis Kelamin': 'P',
      'Tanggal Lahir': '1998-04-22',
      'Alamat': 'Dusun Paseh RT 01 / RW 01, Desa Jayamukti',
      'Nama Orang Tua': 'Dadan Ramdani',
      'Posyandu': 'Posyandu Paseh',
    },
    {
      'NIK': '3206126509990003',
      'Nama Lengkap': 'Nurul Hidayah',
      'Kategori': 'Busui',
      'Jenis Kelamin': 'P',
      'Tanggal Lahir': '1999-09-25',
      'Alamat': 'Dusun Paseh RT 03 / RW 01, Desa Jayamukti',
      'Nama Orang Tua': 'Irfan Hakim',
      'Posyandu': 'Posyandu Paseh',
    },
    {
      'NIK': '3206125109750004',
      'Nama Lengkap': 'Hj. Siti Rohmah',
      'Kategori': 'Kader',
      'Jenis Kelamin': 'P',
      'Tanggal Lahir': '1975-09-11',
      'Alamat': 'Dusun Paseh RT 02 / RW 01, Desa Jayamukti',
      'Nama Orang Tua': 'H. Suherman',
      'Posyandu': 'Posyandu Paseh',
    },
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleData);

  ws['!cols'] = [
    { wch: 22 }, // NIK
    { wch: 25 }, // Nama
    { wch: 14 }, // Kategori
    { wch: 14 }, // JK
    { wch: 15 }, // Tgl Lahir
    { wch: 35 }, // Alamat
    { wch: 28 }, // Orang Tua
    { wch: 22 }, // Posyandu
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Template_SPPG_Jayamukti');
  
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerBlobDownload(blob, 'Template_Import_SPPG_Jayamukti_BGN.xlsx');
}
