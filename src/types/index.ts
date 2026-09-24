export type BeneficiaryCategory = 'Balita' | 'Bumil' | 'Busui' | 'Kader';

export type Gender = 'L' | 'P';

export type PosyanduLocation =
  | 'Posyandu Paseh'
  | 'Posyandu Lewihalang'
  | 'Posyandu Cibengang'
  | 'Posyandu Cipancur'
  | 'Posyandu Tonjong'
  | 'Posyandu Sindang Jaya';

export interface Beneficiary {
  id: string;
  nik: string;          // 16 digit
  nama: string;         // Nama lengkap
  kategori: BeneficiaryCategory; // Balita, Bumil, Kader
  jenisKelamin: Gender; // L / P
  tanggalLahir: string; // YYYY-MM-DD
  alamat: string;       // Alamat / RT / RW
  namaOrangTua?: string; // Nama Orang Tua (opsional)
  posyandu: PosyanduLocation; // Lokasi Posyandu
}

export type UserRole = 'admin' | 'kader';

export interface UserAccount {
  id: string;
  email: string;
  nama: string;
  password: string;
  role: UserRole;
  posyanduDefault?: PosyanduLocation;
  username?: string;
  pin?: string;
}
