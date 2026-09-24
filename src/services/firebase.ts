import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocFromServer,
  getDocs,
  Firestore,
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Beneficiary, UserAccount } from '../types';

// Inisialisasi Firebase App (Singleton)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Inisialisasi Auth
export const auth: Auth = getAuth(app);

// Inisialisasi Firestore dengan Database ID yang ditentukan
export const db: Firestore = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Pastikan koneksi siap untuk membaca/menulis data
export async function ensureAuth(): Promise<string> {
  // Sesi langsung terhubung dengan Firestore
  return 'online';
}

// Handler error Firestore terstandarisasi
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: 'app-user',
      email: null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Uji koneksi Firestore
export async function testConnection(): Promise<boolean> {
  try {
    await getDocs(collection(db, 'beneficiaries'));
    return true;
  } catch (error) {
    console.warn('Firestore connection check:', error);
    return false;
  }
}

// Helper untuk menghasilkan key identitas unik penerima manfaat (berbasis NIK atau Nama+TglLahir+Posyandu)
export function getBeneficiaryKey(b: Partial<Beneficiary>): string {
  const cleanNik = (b.nik || '').trim();
  if (cleanNik.length >= 10) {
    return `nik_${cleanNik}`;
  }
  const cleanNama = (b.nama || '').trim().toLowerCase();
  const cleanTgl = (b.tanggalLahir || '').trim();
  const cleanPos = (b.posyandu || '').trim();
  return `meta_${cleanNama}_${cleanTgl}_${cleanPos}`;
}

// Helper untuk menyaring data ganda (deduplikasi) agar setiap sasaran hanya memiliki 1 catatan
export function deduplicateBeneficiaries(list: Beneficiary[]): Beneficiary[] {
  const map = new Map<string, Beneficiary>();
  for (const item of list) {
    const key = getBeneficiaryKey(item);
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      // Jika data ganda, prioritaskan yang memiliki nama orang tua lengkap
      const existing = map.get(key)!;
      if ((!existing.namaOrangTua || existing.namaOrangTua === '-') && item.namaOrangTua && item.namaOrangTua !== '-') {
        map.set(key, item);
      }
    }
  }
  return Array.from(map.values());
}

// 1. Langganan Realtime Data Sasaran Penerima Manfaat (Anti-Duplikasi Otomatis)
export function subscribeBeneficiaries(
  onUpdate: (data: Beneficiary[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, 'beneficiaries');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const items: Beneficiary[] = [];
      const seenKeys = new Map<string, string>(); // key -> docId
      const duplicateDocIdsToDelete: string[] = [];

      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        const item: Beneficiary = {
          id: docSnap.id,
          nik: String(d.nik || ''),
          nama: String(d.nama || ''),
          kategori: d.kategori || 'Balita',
          jenisKelamin: d.jenisKelamin || 'L',
          tanggalLahir: String(d.tanggalLahir || ''),
          alamat: String(d.alamat || ''),
          namaOrangTua: d.namaOrangTua ? String(d.namaOrangTua) : '-',
          posyandu: d.posyandu || 'Posyandu Paseh',
        };

        const key = getBeneficiaryKey(item);
        if (!seenKeys.has(key)) {
          seenKeys.set(key, docSnap.id);
          items.push(item);
        } else {
          // Dokumen ganda terdeteksi di Firestore, kumpulkan untuk dibersihkan
          duplicateDocIdsToDelete.push(docSnap.id);
        }
      });

      // Bersihkan dokumen ganda di latar belakang jika ada
      if (duplicateDocIdsToDelete.length > 0) {
        console.log(`[Cloud] Membersihkan ${duplicateDocIdsToDelete.length} dokumen duplikat dari Firestore...`);
        bulkDeleteBeneficiariesFromFirestore(duplicateDocIdsToDelete).catch((e) =>
          console.warn('Pembersihan duplikat cloud gagal:', e)
        );
      }

      onUpdate(items);
    },
    (err) => {
      console.error('Error snapshot beneficiaries:', err);
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'beneficiaries');
    }
  );
}

// 2. Simpan atau perbarui 1 data sasaran ke Firestore
export async function saveBeneficiaryToFirestore(item: Beneficiary): Promise<void> {
  await ensureAuth();
  try {
    const docRef = doc(db, 'beneficiaries', item.id);
    await setDoc(docRef, {
      id: item.id,
      nik: item.nik,
      nama: item.nama,
      kategori: item.kategori,
      jenisKelamin: item.jenisKelamin,
      tanggalLahir: item.tanggalLahir,
      alamat: item.alamat,
      namaOrangTua: item.namaOrangTua || '-',
      posyandu: item.posyandu,
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `beneficiaries/${item.id}`);
  }
}

// 3. Hapus 1 data sasaran dari Firestore
export async function deleteBeneficiaryFromFirestore(id: string): Promise<void> {
  await ensureAuth();
  try {
    const docRef = doc(db, 'beneficiaries', id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `beneficiaries/${id}`);
  }
}

// 4. Batch simpan banyak data sasaran (otomatis dedup sebelum tulis)
export async function bulkSaveBeneficiariesToFirestore(rawItems: Beneficiary[]): Promise<void> {
  if (!rawItems || rawItems.length === 0) return;
  await ensureAuth();

  // Deduplikasi sebelum dikirim ke database
  const items = deduplicateBeneficiaries(rawItems);

  // Firestore writeBatch dibatasi maksimal 500 operasi per batch
  const CHUNK_SIZE = 400;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    chunk.forEach((item) => {
      const docRef = doc(db, 'beneficiaries', item.id);
      batch.set(docRef, {
        id: item.id,
        nik: item.nik,
        nama: item.nama,
        kategori: item.kategori,
        jenisKelamin: item.jenisKelamin,
        tanggalLahir: item.tanggalLahir,
        alamat: item.alamat,
        namaOrangTua: item.namaOrangTua || '-',
        posyandu: item.posyandu,
        updatedAt: new Date().toISOString(),
      });
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'beneficiaries (batch)');
    }
  }
}

// Fungsi manual untuk membersihkan dokumen ganda di Cloud Firestore
export async function cleanDuplicateBeneficiariesInFirestore(): Promise<number> {
  await ensureAuth();
  try {
    const colRef = collection(db, 'beneficiaries');
    const snapshot = await getDocs(colRef);
    const seen = new Map<string, string>();
    const toDelete: string[] = [];

    snapshot.forEach((d) => {
      const data = d.data();
      const item: Beneficiary = {
        id: d.id,
        nik: String(data.nik || ''),
        nama: String(data.nama || ''),
        kategori: data.kategori || 'Balita',
        jenisKelamin: data.jenisKelamin || 'L',
        tanggalLahir: String(data.tanggalLahir || ''),
        alamat: String(data.alamat || ''),
        namaOrangTua: data.namaOrangTua ? String(data.namaOrangTua) : '-',
        posyandu: data.posyandu || 'Posyandu Paseh',
      };
      const key = getBeneficiaryKey(item);
      if (!seen.has(key)) {
        seen.set(key, d.id);
      } else {
        toDelete.push(d.id);
      }
    });

    if (toDelete.length > 0) {
      await bulkDeleteBeneficiariesFromFirestore(toDelete);
    }
    return toDelete.length;
  } catch (err) {
    console.error('Error cleaning duplicates in Firestore:', err);
    return 0;
  }
}

// 5. Batch hapus banyak data sasaran sekaligus
export async function bulkDeleteBeneficiariesFromFirestore(ids: string[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  await ensureAuth();

  const CHUNK_SIZE = 400;
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    chunk.forEach((id) => {
      const docRef = doc(db, 'beneficiaries', id);
      batch.delete(docRef);
    });

    try {
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'beneficiaries (batch delete)');
    }
  }
}

// 6. Langganan Realtime Data Akun Kader & Admin
export function subscribeUsers(
  onUpdate: (data: UserAccount[]) => void,
  onError?: (err: any) => void
): () => void {
  const colRef = collection(db, 'users');
  return onSnapshot(
    colRef,
    (snapshot) => {
      const users: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        users.push({
          id: docSnap.id,
          email: String(d.email || d.username || ''),
          username: d.username ? String(d.username) : undefined,
          password: String(d.password || ''),
          pin: d.pin ? String(d.pin) : undefined,
          nama: String(d.nama || ''),
          role: d.role === 'admin' ? 'admin' : 'kader',
          posyanduDefault: d.posyanduDefault || undefined,
        });
      });
      onUpdate(users);
    },
    (err) => {
      console.error('Error snapshot users:', err);
      if (onError) onError(err);
      handleFirestoreError(err, OperationType.LIST, 'users');
    }
  );
}

// 7. Simpan atau perbarui akun pengguna di Firestore
export async function saveUserToFirestore(user: UserAccount): Promise<void> {
  await ensureAuth();
  try {
    const docRef = doc(db, 'users', user.id);
    await setDoc(docRef, {
      id: user.id,
      email: user.email,
      username: user.username || '',
      password: user.password,
      pin: user.pin || '',
      nama: user.nama,
      role: user.role,
      posyanduDefault: user.posyanduDefault || '',
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.id}`);
  }
}

// 8. Hapus akun pengguna dari Firestore
export async function deleteUserFromFirestore(id: string): Promise<void> {
  await ensureAuth();
  try {
    const docRef = doc(db, 'users', id);
    await deleteDoc(docRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
  }
}

// 9. Inisialisasi awal koleksi pengguna jika masih kosong di Firestore
export async function seedDefaultUsersIfEmpty(defaultUsers: UserAccount[]): Promise<void> {
  try {
    await ensureAuth();
    const colRef = collection(db, 'users');
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) {
      const batch = writeBatch(db);
      defaultUsers.forEach((u) => {
        const docRef = doc(db, 'users', u.id);
        batch.set(docRef, {
          id: u.id,
          email: u.email,
          username: u.username || '',
          password: u.password,
          pin: u.pin || '',
          nama: u.nama,
          role: u.role,
          posyanduDefault: u.posyanduDefault || '',
          updatedAt: new Date().toISOString(),
        });
      });
      await batch.commit();
      console.log('Akun awal berhasil disinkronkan ke Firestore.');
    }
  } catch (err) {
    console.warn('Gagal seed default users:', err);
  }
}
