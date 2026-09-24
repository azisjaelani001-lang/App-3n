export function calculateAgeSimple(dateStr: string): string {
  if (!dateStr) return '-';
  const birth = new Date(dateStr);
  if (isNaN(birth.getTime())) return '-';

  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  let months = today.getMonth() - birth.getMonth();

  if (today.getDate() < birth.getDate()) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  if (years === 0) {
    return `${Math.max(0, months)} bln`;
  }
  if (months === 0) {
    return `${years} thn`;
  }
  return `${years} thn ${months} bln`;
}

export function formatDateSimple(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function validateNik(nik: string): { isValid: boolean; message: string } {
  const clean = nik.trim();
  if (!clean) return { isValid: false, message: 'NIK wajib diisi' };
  if (!/^\d+$/.test(clean)) return { isValid: false, message: 'NIK harus berupa angka' };
  if (clean.length !== 16) return { isValid: false, message: `NIK harus 16 digit (${clean.length} digit)` };
  return { isValid: true, message: '' };
}

export function generateId(): string {
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
}

/**
 * Memeriksa apakah data penerima manfaat memiliki masalah (NIK tidak 16 digit, nama kosong, duplikat, dsb.)
 */
export function checkBeneficiaryIssue(
  item: { nik: string; nama: string; alamat: string; tanggalLahir: string; id: string },
  allBeneficiaries: { nik: string; id: string }[] = []
): { isError: boolean; issues: string[] } {
  const issues: string[] = [];
  const cleanNik = item.nik ? item.nik.replace(/\D/g, '') : '';
  
  if (!cleanNik) {
    issues.push('NIK Kosong');
  } else if (cleanNik.length !== 16) {
    issues.push(`NIK ${cleanNik.length} digit (harus 16)`);
  }

  // Cek duplikasi NIK di dalam basis data
  if (cleanNik && allBeneficiaries.some((b) => b.id !== item.id && b.nik.replace(/\D/g, '') === cleanNik)) {
    issues.push('NIK Terduplikasi');
  }

  const cleanNama = (item.nama || '').trim();
  if (!cleanNama || cleanNama.length < 2 || cleanNama.toLowerCase().includes('(kosong)') || cleanNama.toLowerCase().includes('(nama kosong)')) {
    issues.push('Nama belum lengkap');
  }

  const cleanAlamat = (item.alamat || '').trim();
  if (!cleanAlamat || cleanAlamat.length < 3 || cleanAlamat.toLowerCase().includes('(kosong)') || cleanAlamat.toLowerCase().includes('(alamat kosong)')) {
    issues.push('Alamat belum lengkap');
  }

  if (!item.tanggalLahir || isNaN(Date.parse(item.tanggalLahir))) {
    issues.push('Tanggal lahir tidak valid');
  }

  return {
    isError: issues.length > 0,
    issues,
  };
}
