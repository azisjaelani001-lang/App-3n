/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  MapPin, 
  Plus, 
  Search, 
  Edit3, 
  Trash2, 
  FileSpreadsheet, 
  FileText, 
  LogOut, 
  ShieldCheck, 
  X, 
  Upload, 
  Download, 
  AlertCircle, 
  CheckCircle2, 
  FileUp,
  FileCheck,
  Key,
  Lock,
  Mail,
  Eye,
  EyeOff,
  UserPlus,
  User,
  Users,
  Settings,
  Share2,
  Smartphone,
  DownloadCloud,
  CheckSquare,
  Square,
  Check,
  AlertTriangle,
  Cloud,
  RefreshCw,
} from 'lucide-react';
import { Beneficiary, BeneficiaryCategory, Gender, PosyanduLocation, UserAccount } from './types';
import { DEFAULT_USERS, INITIAL_BENEFICIARIES, POSYANDU_LIST } from './data/posyanduData';
import { calculateAgeSimple, formatDateSimple, generateId, validateNik, checkBeneficiaryIssue } from './utils/helpers';
import { exportToExcel } from './utils/exportExcel';
import { exportToPdf } from './utils/exportPdf';
import { downloadExcelTemplate } from './utils/excelImport';
import { triggerBlobDownload, shareFileNative } from './utils/fileDownload';
import { BgnLogo } from './components/BgnLogo';
import { KaderManagementModal } from './components/KaderManagementModal';
import { ExcelImportModal } from './components/ExcelImportModal';
import {
  testConnection,
  ensureAuth,
  subscribeBeneficiaries,
  saveBeneficiaryToFirestore,
  deleteBeneficiaryFromFirestore,
  bulkSaveBeneficiariesToFirestore,
  bulkDeleteBeneficiariesFromFirestore,
  subscribeUsers,
  saveUserToFirestore,
  deleteUserFromFirestore,
  seedDefaultUsersIfEmpty,
} from './services/firebase';

export default function App() {
  // 1. Data State (Persistent via LocalStorage)
  const [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>(() => {
    try {
      const saved = localStorage.getItem('sip3b_simple_data');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error(e);
    }
    return INITIAL_BENEFICIARIES;
  });

  // 2. Daftar Pengguna Kader & Admin (Persistent via LocalStorage)
  const [users, setUsers] = useState<UserAccount[]>(() => {
    try {
      const saved = localStorage.getItem('sppg_jayamukti_users');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migrasi & standardisasi roles serta sinkronkan password bawaan jika masih memakai kader123
          const migrated: UserAccount[] = parsed.map((u: any) => {
            const isAdmin =
              u.email?.toLowerCase() === 'azisjaelani001@gmail.com' ||
              u.email?.toLowerCase() === 'admin.sppg@jayamukti.id' ||
              u.role === 'admin';

            const defaultMatch = DEFAULT_USERS.find(
              (du) => du.email.toLowerCase() === u.email?.toLowerCase()
            );

            // Perbarui password bawaan bila masih 'kader123' ke password spesifik posyandunya
            let currentPassword = u.password;
            if (defaultMatch && (u.password === 'kader123' || !u.password)) {
              currentPassword = defaultMatch.password;
            }

            let currentNama = u.nama;
            if (u.email?.toLowerCase() === 'azisjaelani001@gmail.com') {
              currentNama = 'Aslap SPPG Jayamukti (Azis Jaelani)';
            }

            return {
              ...u,
              nama: currentNama,
              password: currentPassword,
              role: isAdmin ? ('admin' as const) : ('kader' as const),
              posyanduDefault: isAdmin ? undefined : (u.posyanduDefault || defaultMatch?.posyanduDefault || 'Posyandu Paseh'),
            };
          });

          // Pastikan akun utama Aslap SPPG (Azis Jaelani) selalu terdaftar
          if (!migrated.some((u) => u.email?.toLowerCase() === 'azisjaelani001@gmail.com')) {
            migrated.unshift({
              id: 'admin-master',
              email: 'azisjaelani001@gmail.com',
              nama: 'Aslap SPPG Jayamukti (Azis Jaelani)',
              password: 'admin123',
              role: 'admin',
              username: 'admin_azis',
            });
          }
          return migrated;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return DEFAULT_USERS;
  });

  // Simpan daftar users ke localStorage jika ada perubahan
  useEffect(() => {
    localStorage.setItem('sppg_jayamukti_users', JSON.stringify(users));
  }, [users]);

  // Current Logged-in User
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem('sip3b_simple_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        const isAdmin =
          parsed.email?.toLowerCase() === 'azisjaelani001@gmail.com' ||
          parsed.email?.toLowerCase() === 'admin.sppg@jayamukti.id' ||
          parsed.role === 'admin';
        return {
          ...parsed,
          role: isAdmin ? ('admin' as const) : ('kader' as const),
          posyanduDefault: isAdmin ? undefined : (parsed.posyanduDefault || 'Posyandu Paseh'),
        };
      }
    } catch (e) {
      console.error(e);
    }
    return null; // Pengguna wajib login dengan email & password
  });

  // Modal Manajemen Akun Kader (Khusus Admin SPPG)
  const [isKaderModalOpen, setIsKaderModalOpen] = useState(false);

  // Auth Screen State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false);

  // Modal Ubah Password / Profil Kader (di dalam aplikasi)
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [changeNewPassword, setChangeNewPassword] = useState('');
  const [changeConfirmPassword, setChangeConfirmPassword] = useState('');
  const [profileNama, setProfileNama] = useState('');
  const [passwordModalError, setPasswordModalError] = useState('');
  const [showChangePassword, setShowChangePassword] = useState(false);

  // 3. Selected Posyandu State (Wajib dipilih kader)
  const [activePosyandu, setActivePosyandu] = useState<PosyanduLocation | 'Semua Posyandu'>('Posyandu Paseh');

  // 4. Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'Semua' | BeneficiaryCategory>('Semua');

  // 5. Modal Tambah / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Beneficiary | null>(null);

  // Form Fields
  const [formPosyandu, setFormPosyandu] = useState<PosyanduLocation>('Posyandu Paseh');
  const [formKategori, setFormKategori] = useState<BeneficiaryCategory>('Balita');
  const [formNik, setFormNik] = useState('');
  const [formNama, setFormNama] = useState('');
  const [formJk, setFormJk] = useState<Gender>('L');
  const [formTglLahir, setFormTglLahir] = useState('');
  const [formAlamat, setFormAlamat] = useState('');
  const [formOrangTua, setFormOrangTua] = useState('');
  const [formError, setFormError] = useState('');

  // 6. Modal Hapus Tunggal & Hapus Sekaligus (Centang)
  const [deletingItem, setDeletingItem] = useState<Beneficiary | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);

  // 7. Modal Impor Excel (BGN Smart Validator & Auto-Fix)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // PWA (Progressive Web App) Install State untuk HP Android
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallGuideModal, setShowInstallGuideModal] = useState(false);

  // 8. State Ekspor Excel & PDF (dengan umpan balik & opsi unduh/bagikan)
  const [isExporting, setIsExporting] = useState<'excel' | 'pdf' | null>(null);
  const [exportModal, setExportModal] = useState<{
    isOpen: boolean;
    type: 'excel' | 'pdf';
    filename: string;
    blob: Blob | null;
    totalRows: number;
    pdfUrl?: string;
  }>({
    isOpen: false,
    type: 'excel',
    filename: '',
    blob: null,
    totalRows: 0,
  });

  // Toast Notifikasi
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Status Sinkronisasi Cloud Antar-Perangkat (Firebase Firestore)
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudSyncMessage, setCloudSyncMessage] = useState('Menghubungkan ke Cloud...');
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  // 1. Initial Auth and Cloud Realtime Synchronization Effect
  useEffect(() => {
    let unsubscribeBeneficiaries: (() => void) | null = null;
    let unsubscribeUsers: (() => void) | null = null;
    let isMounted = true;

    async function initCloud() {
      try {
        setIsSyncing(true);
        setCloudSyncMessage('Menghubungkan ke Cloud Firebase...');
        await ensureAuth();
        await testConnection();

        if (!isMounted) return;
        setIsCloudConnected(true);

        // Pastikan akun awal tersimpan di Firestore
        await seedDefaultUsersIfEmpty(DEFAULT_USERS);

        // 1. Langganan Data Akun Pengguna / Kader (Realtime)
        unsubscribeUsers = subscribeUsers((cloudUsers) => {
          if (!isMounted) return;
          if (cloudUsers.length > 0) {
            setUsers(cloudUsers);
            localStorage.setItem('sppg_jayamukti_users', JSON.stringify(cloudUsers));
          }
        });

        // 2. Langganan Data Sasaran Penerima Manfaat (Realtime)
        unsubscribeBeneficiaries = subscribeBeneficiaries(
          async (cloudData) => {
            if (!isMounted) return;
            setIsSyncing(false);

            // Periksa data lokal di browser saat ini (misal data 89 sasaran dari komputer)
            const savedLocal = localStorage.getItem('sip3b_simple_data');
            let localItems: Beneficiary[] = [];
            try {
              if (savedLocal) {
                const parsed = JSON.parse(savedLocal);
                if (Array.isArray(parsed)) localItems = parsed;
              }
            } catch (e) {
              console.error(e);
            }

            if (cloudData.length > 0) {
              // Jika di local ada data baru yang belum terunggah ke cloud (misal dientri di komputer saat offline), unggah!
              const cloudIds = new Set(cloudData.map((c) => c.id));
              const missingInCloud = localItems.filter((loc) => !cloudIds.has(loc.id));

              if (missingInCloud.length > 0) {
                console.log(`Mengunggah ${missingInCloud.length} data lokal baru ke Firestore...`);
                const merged = [...cloudData, ...missingInCloud];
                setBeneficiaries(merged);
                localStorage.setItem('sip3b_simple_data', JSON.stringify(merged));
                await bulkSaveBeneficiariesToFirestore(missingInCloud);
                setCloudSyncMessage(`Tersinkron (${merged.length} data)`);
              } else {
                setBeneficiaries(cloudData);
                localStorage.setItem('sip3b_simple_data', JSON.stringify(cloudData));
                setCloudSyncMessage(`Tersinkron (${cloudData.length} data)`);
                setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
              }
            } else {
              // Cloud masih kosong: Otomatis migrasikan data lokal saat ini ke Firestore
              if (localItems.length > 0) {
                console.log(`Migrasi awal: Mengunggah ${localItems.length} data lokal ke Firestore...`);
                setCloudSyncMessage(`Mengunggah ${localItems.length} data ke Cloud...`);
                setBeneficiaries(localItems);
                await bulkSaveBeneficiariesToFirestore(localItems);
                setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
              }
            }
          },
          (err) => {
            console.error('Error subscribe beneficiaries:', err);
            if (isMounted) {
              setIsSyncing(false);
              setIsCloudConnected(false);
              setCloudSyncMessage('Mode Offline (Lokal)');
            }
          }
        );
      } catch (err) {
        console.error('Inisialisasi cloud gagal:', err);
        if (isMounted) {
          setIsSyncing(false);
          setIsCloudConnected(false);
          setCloudSyncMessage('Mode Offline (Lokal)');
        }
      }
    }

    initCloud();

    return () => {
      isMounted = false;
      if (unsubscribeBeneficiaries) unsubscribeBeneficiaries();
      if (unsubscribeUsers) unsubscribeUsers();
    };
  }, []);

  // Fungsi sinkronkan manual dengan Cloud
  const handleForceCloudSync = async () => {
    setIsSyncing(true);
    setCloudSyncMessage('Menyinkronkan dengan Cloud...');
    try {
      await ensureAuth();
      const savedLocal = localStorage.getItem('sip3b_simple_data');
      let currentData = [...beneficiaries];
      if (savedLocal) {
        try {
          const parsed = JSON.parse(savedLocal);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const map = new Map<string, Beneficiary>();
            currentData.forEach((item) => map.set(item.id, item));
            parsed.forEach((item: Beneficiary) => {
              if (item.id && item.nama) map.set(item.id, item);
            });
            currentData = Array.from(map.values());
          }
        } catch (e) {
          console.error(e);
        }
      }
      await bulkSaveBeneficiariesToFirestore(currentData);
      setBeneficiaries(currentData);
      setIsCloudConnected(true);
      setCloudSyncMessage(`Tersinkron (${currentData.length} data)`);
      setLastSyncTime(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
      showToast(`Sukses! ${currentData.length} data tersimpan di Cloud & dapat diakses di HP/Komputer.`);
    } catch (e) {
      console.error(e);
      showToast('Gagal menyinkronkan ke Cloud. Silakan periksa koneksi internet.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('sip3b_simple_data', JSON.stringify(beneficiaries));
  }, [beneficiaries]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('sip3b_simple_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('sip3b_simple_user');
    }
  }, [currentUser]);

  // Listener PWA Install untuk HP Android
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true
    ) {
      setIsAppInstalled(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (deferredInstallPrompt) {
      try {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          setIsAppInstalled(true);
          showToast('Aplikasi PM 3B Jayamukti berhasil dipasang ke HP Android!');
        }
        setDeferredInstallPrompt(null);
      } catch (err) {
        setShowInstallGuideModal(true);
      }
    } else {
      setShowInstallGuideModal(true);
    }
  };

  // 1. Handler Login dengan Email & Password
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const cleanEmail = loginEmail.trim().toLowerCase();
    const cleanPassword = loginPassword.trim();

    const userIndex = users.findIndex(
      (u) => u.email.toLowerCase() === cleanEmail || (u.username && u.username.toLowerCase() === cleanEmail)
    );

    if (userIndex === -1) {
      setAuthError('Alamat email belum terdaftar. Silakan periksa kembali atau hubungi Admin SPPG.');
      return;
    }

    const user = users[userIndex];
    const defaultMatch = DEFAULT_USERS.find(
      (du) => du.email.toLowerCase() === user.email.toLowerCase()
    );

    // Cek kecocokan password:
    // 1. Password tersimpan (dengan atau tanpa spasi bawaan keyboard HP)
    // 2. Password bawaan posyandu (misal: lewihalang123)
    // 3. Password bawaan transisi sebelumnya (kader123)
    // 4. Password admin (admin123)
    const isPasswordMatch =
      user.password === loginPassword ||
      user.password?.trim() === cleanPassword ||
      user.pin === loginPassword ||
      user.pin === cleanPassword ||
      (defaultMatch && (cleanPassword === defaultMatch.password || cleanPassword === 'kader123')) ||
      (cleanEmail === 'azisjaelani001@gmail.com' && (cleanPassword === 'admin123' || loginPassword === 'admin123'));

    if (!isPasswordMatch) {
      setAuthError('Password salah. Silakan coba lagi atau hubungi Admin SPPG untuk reset password.');
      return;
    }

    // Jika masuk dengan password baru yang valid, sinkronkan ke database browser agar selalu cocok
    let finalUser = user;
    if (user.password !== cleanPassword && cleanPassword.length >= 4) {
      finalUser = { ...user, password: cleanPassword };
      const nextUsers = [...users];
      nextUsers[userIndex] = finalUser;
      setUsers(nextUsers);
    }

    setCurrentUser(finalUser);
    if (finalUser.role === 'kader' && finalUser.posyanduDefault) {
      setActivePosyandu(finalUser.posyanduDefault);
    }
    showToast(`Selamat datang, ${finalUser.nama}!`);
  };

  // Handler Manajemen Kader oleh Admin SPPG
  const handleAddKader = (newKader: {
    nama: string;
    email: string;
    password: string;
    posyanduDefault: PosyanduLocation;
  }) => {
    const cleanEmail = newKader.email.trim().toLowerCase();
    if (users.some((u) => u.email?.toLowerCase() === cleanEmail)) {
      return { success: false, message: 'Alamat email ini sudah terdaftar dalam sistem.' };
    }

    const createdUser: UserAccount = {
      id: generateId(),
      nama: newKader.nama.trim(),
      email: cleanEmail,
      password: newKader.password,
      role: 'kader',
      posyanduDefault: newKader.posyanduDefault,
    };

    setUsers((prev) => [...prev, createdUser]);
    saveUserToFirestore(createdUser).catch((e) => console.error('Gagal simpan kader ke cloud:', e));
    return { success: true, message: 'Akun kader berhasil dibuat dan disinkronkan ke Cloud!' };
  };

  const handleUpdateKader = (
    id: string,
    updates: Partial<Pick<UserAccount, 'nama' | 'email' | 'password' | 'posyanduDefault'>>
  ) => {
    const userIndex = users.findIndex((u) => u.id === id);
    if (userIndex === -1) return { success: false, message: 'Akun kader tidak ditemukan.' };

    if (updates.email) {
      const cleanEmail = updates.email.trim().toLowerCase();
      const conflict = users.find((u) => u.email?.toLowerCase() === cleanEmail && u.id !== id);
      if (conflict) {
        return { success: false, message: 'Email sudah digunakan oleh akun lain.' };
      }
    }

    const updatedUser = { ...users[userIndex], ...updates };
    setUsers((prev) =>
      prev.map((u) => (u.id === id ? updatedUser : u))
    );
    saveUserToFirestore(updatedUser).catch((e) => console.error('Gagal update kader di cloud:', e));
    return { success: true, message: 'Akun kader berhasil diperbarui di Cloud.' };
  };

  const handleDeleteKader = (id: string) => {
    const target = users.find((u) => u.id === id);
    if (!target) return { success: false, message: 'Akun tidak ditemukan.' };
    if (target.role === 'admin' || target.id === 'admin-master' || target.email === 'azisjaelani001@gmail.com') {
      return { success: false, message: 'Akun Admin SPPG utama tidak dapat dihapus.' };
    }

    setUsers((prev) => prev.filter((u) => u.id !== id));
    deleteUserFromFirestore(id).catch((e) => console.error('Gagal hapus kader dari cloud:', e));
    return { success: true, message: 'Akun kader berhasil dihapus dari Cloud.' };
  };

  // 3. Handler Ubah Password & Profil di Dalam Aplikasi (Wajib verifikasi password lama)
  const handleChangePasswordInApp = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordModalError('');
    if (!currentUser) return;

    if (oldPassword !== currentUser.password && oldPassword !== currentUser.pin) {
      setPasswordModalError('Password lama yang Anda masukkan tidak sesuai.');
      return;
    }

    if (changeNewPassword.length < 4) {
      setPasswordModalError('Password baru minimal 4 karakter.');
      return;
    }

    if (changeNewPassword !== changeConfirmPassword) {
      setPasswordModalError('Konfirmasi password baru tidak cocok.');
      return;
    }

    const updatedUser: UserAccount = {
      ...currentUser,
      nama: profileNama.trim() || currentUser.nama,
      password: changeNewPassword,
    };

    setUsers((prev) =>
      prev.map((u) => (u.id === currentUser.id ? updatedUser : u))
    );
    saveUserToFirestore(updatedUser).catch((e) => console.error('Gagal simpan password ke cloud:', e));
    setCurrentUser(updatedUser);
    setIsPasswordModalOpen(false);
    setOldPassword('');
    setChangeNewPassword('');
    setChangeConfirmPassword('');
    showToast('Password & Profil Anda berhasil diperbarui di Cloud!');
  };

  // Open modal for add
  const handleOpenAdd = () => {
    setEditingItem(null);
    const defaultPos = currentUser?.role === 'kader'
      ? (currentUser.posyanduDefault || 'Posyandu Paseh')
      : (activePosyandu === 'Semua Posyandu' ? 'Posyandu Paseh' : activePosyandu);
    setFormPosyandu(defaultPos);
    setFormKategori('Balita');
    setFormNik('');
    setFormNama('');
    setFormJk('L');
    setFormTglLahir('');
    setFormAlamat('');
    setFormOrangTua('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Open modal for edit
  const handleOpenEdit = (item: Beneficiary) => {
    if (currentUser?.role === 'kader' && item.posyandu !== currentUser.posyanduDefault) {
      showToast('Akses ditolak: Anda hanya berhak mengedit data posyandu Anda.');
      return;
    }
    setEditingItem(item);
    setFormPosyandu(item.posyandu);
    setFormKategori(item.kategori);
    setFormNik(item.nik);
    setFormNama(item.nama);
    setFormJk(item.jenisKelamin);
    setFormTglLahir(item.tanggalLahir);
    setFormAlamat(item.alamat);
    setFormOrangTua(item.namaOrangTua || '');
    setFormError('');
    setIsModalOpen(true);
  };

  // Save form
  const handleSaveForm = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Validasi NIK
    const nikCheck = validateNik(formNik);
    if (!nikCheck.isValid) {
      setFormError(nikCheck.message);
      return;
    }

    if (!formNama.trim()) {
      setFormError('Nama lengkap wajib diisi');
      return;
    }
    if (!formTglLahir) {
      setFormError('Tanggal lahir wajib diisi');
      return;
    }
    if (!formAlamat.trim()) {
      setFormError('Alamat domisili wajib diisi');
      return;
    }

    // Tentukan posyandu: Kader wajib dikunci ke posyandunya
    const finalPosyandu: PosyanduLocation = currentUser?.role === 'kader'
      ? (currentUser.posyanduDefault || 'Posyandu Paseh')
      : formPosyandu;

    const finalJk: Gender = (formKategori === 'Bumil' || formKategori === 'Busui') ? 'P' : formJk;

    if (editingItem) {
      // Update
      const updatedItem: Beneficiary = {
        ...editingItem,
        posyandu: finalPosyandu,
        kategori: formKategori,
        nik: formNik.trim(),
        nama: formNama.trim(),
        jenisKelamin: finalJk,
        tanggalLahir: formTglLahir,
        alamat: formAlamat.trim(),
        namaOrangTua: formOrangTua.trim() || '-',
      };
      setBeneficiaries((prev) =>
        prev.map((b) => (b.id === editingItem.id ? updatedItem : b))
      );
      saveBeneficiaryToFirestore(updatedItem).catch((e) => console.error('Cloud save failed:', e));
      showToast(`Data ${formNama} berhasil diperbarui & disinkronkan ke Cloud.`);
    } else {
      // Tambah baru
      const newItem: Beneficiary = {
        id: generateId(),
        posyandu: finalPosyandu,
        kategori: formKategori,
        nik: formNik.trim(),
        nama: formNama.trim(),
        jenisKelamin: finalJk,
        tanggalLahir: formTglLahir,
        alamat: formAlamat.trim(),
        namaOrangTua: formOrangTua.trim() || '-',
      };
      setBeneficiaries((prev) => [newItem, ...prev]);
      saveBeneficiaryToFirestore(newItem).catch((e) => console.error('Cloud save failed:', e));
      showToast(`Data ${formNama} berhasil ditambahkan di Cloud & ${finalPosyandu}.`);
    }

    setIsModalOpen(false);
  };

  // Delete
  const handleConfirmDelete = () => {
    if (!deletingItem) return;
    if (currentUser?.role === 'kader' && deletingItem.posyandu !== currentUser.posyanduDefault) {
      showToast('Akses ditolak: Anda hanya dapat menghapus data di posyandu binaan Anda.');
      setDeletingItem(null);
      return;
    }
    const targetId = deletingItem.id;
    setBeneficiaries((prev) => prev.filter((b) => b.id !== targetId));
    deleteBeneficiaryFromFirestore(targetId).catch((e) => console.error('Cloud delete failed:', e));
    showToast(`Data ${deletingItem.nama} berhasil dihapus dari Cloud.`);
    setDeletingItem(null);
  };

  // Handler Impor Data Excel Resmi BGN
  const handleCommitImport = (importedRows: Beneficiary[]) => {
    if (importedRows.length === 0) return;

    // Tambahkan data hasil impor ke state utama & unggah ke Firestore
    setBeneficiaries((prev) => [...importedRows, ...prev]);
    bulkSaveBeneficiariesToFirestore(importedRows).catch((e) => console.error('Cloud import save failed:', e));
    showToast(`Berhasil menambahkan ${importedRows.length} data sasaran dari Excel ke Cloud!`);
    setIsImportModalOpen(false);
  };

  // Filtered List - DATA ISOLATION PER KADER
  const filteredData = useMemo(() => {
    return beneficiaries.filter((item) => {
      // 1. ISOLASI POSYANDU: Kader hanya bisa melihat posyandunya sendiri
      if (currentUser?.role === 'kader') {
        if (item.posyandu !== currentUser.posyanduDefault) {
          return false;
        }
      } else {
        // Admin bisa memfilter per posyandu atau 'Semua Posyandu'
        if (activePosyandu !== 'Semua Posyandu' && item.posyandu !== activePosyandu) {
          return false;
        }
      }

      // 2. Filter Kategori
      if (categoryFilter !== 'Semua' && item.kategori !== categoryFilter) {
        return false;
      }

      // 3. Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          item.nik.includes(q) ||
          item.nama.toLowerCase().includes(q) ||
          (item.namaOrangTua ? item.namaOrangTua.toLowerCase().includes(q) : false) ||
          item.alamat.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [beneficiaries, currentUser, activePosyandu, categoryFilter, searchQuery]);

  // Counts for current Posyandu (Isolasi untuk Kader)
  const currentPosData = useMemo(() => {
    if (currentUser?.role === 'kader') {
      return beneficiaries.filter((b) => b.posyandu === currentUser.posyanduDefault);
    }
    if (activePosyandu === 'Semua Posyandu') return beneficiaries;
    return beneficiaries.filter((b) => b.posyandu === activePosyandu);
  }, [beneficiaries, currentUser, activePosyandu]);

  const countBalita = currentPosData.filter((b) => b.kategori === 'Balita').length;
  const countBumil = currentPosData.filter((b) => b.kategori === 'Bumil').length;
  const countBusui = currentPosData.filter((b) => b.kategori === 'Busui').length;
  const countKader = currentPosData.filter((b) => b.kategori === 'Kader').length;

  // Daftar data yang terdeteksi salah / bermasalah pada filter saat ini
  const erroneousItemsInView = useMemo(() => {
    return filteredData.filter((item) => checkBeneficiaryIssue(item, beneficiaries).isError);
  }, [filteredData, beneficiaries]);

  // Handler toggle centang satu baris
  const handleToggleSelectRow = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    );
  };

  // Handler toggle centang semua yang tampil di tabel
  const handleToggleSelectAllVisible = () => {
    const visibleIds = filteredData.map((d) => d.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Handler centang otomatis seluruh data yang salah / bermasalah
  const handleSelectAllErroneous = () => {
    if (erroneousItemsInView.length === 0) {
      showToast('Bagus! Tidak ada data salah yang terdeteksi pada daftar ini.');
      return;
    }
    const wrongIds = erroneousItemsInView.map((d) => d.id);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...wrongIds])));
    showToast(`${wrongIds.length} data salah berhasil dicentang. Klik tombol Hapus Sekaligus.`);
  };

  // Handler eksekusi hapus data terpilih sekaligus
  const handleConfirmBulkDelete = () => {
    if (selectedIds.length === 0) return;

    if (currentUser?.role === 'kader') {
      const forbidden = beneficiaries.filter(
        (b) => selectedIds.includes(b.id) && b.posyandu !== currentUser.posyanduDefault
      );
      if (forbidden.length > 0) {
        showToast('Akses ditolak: Anda hanya dapat menghapus data di posyandu binaan Anda.');
        return;
      }
    }

    const idsToDelete = [...selectedIds];
    const count = idsToDelete.length;
    setBeneficiaries((prev) => prev.filter((b) => !idsToDelete.includes(b.id)));
    bulkDeleteBeneficiariesFromFirestore(idsToDelete).catch((e) => console.error('Cloud bulk delete failed:', e));
    setSelectedIds([]);
    setShowBulkDeleteModal(false);
    showToast(`Berhasil menghapus ${count} data sasaran dari Cloud & sistem.`);
  };

  // Handler Ekspor Excel (aman di ponsel & peramban iframe)
  const handleExportExcel = () => {
    const posLabel = currentUser?.role === 'kader' ? (currentUser.posyanduDefault || 'Posyandu') : activePosyandu;
    const targetList = (filteredData && filteredData.length > 0) ? filteredData : currentPosData;
    
    if (!targetList || targetList.length === 0) {
      showToast('Belum ada data sasaran di posyandu ini untuk diekspor.');
      return;
    }

    if (filteredData.length === 0 && currentPosData.length > 0) {
      showToast(`Filter kosong, mengekspor seluruh data sasaran (${currentPosData.length} baris)...`);
    }

    setIsExporting('excel');
    try {
      const res = exportToExcel(targetList, posLabel);
      showToast(`Berkas Excel (${res.totalRows} baris) berhasil dibuat & diunduh!`);
      setExportModal({
        isOpen: true,
        type: 'excel',
        filename: res.filename,
        blob: res.blob,
        totalRows: res.totalRows,
      });
    } catch (err: any) {
      console.error('Galat ekspor Excel:', err);
      showToast(`Gagal mengekspor Excel: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setTimeout(() => setIsExporting(null), 500);
    }
  };

  // Handler Ekspor PDF (aman di ponsel & peramban iframe)
  const handleExportPdf = () => {
    const posLabel = currentUser?.role === 'kader' ? (currentUser.posyanduDefault || 'Posyandu') : activePosyandu;
    const targetList = (filteredData && filteredData.length > 0) ? filteredData : currentPosData;

    if (!targetList || targetList.length === 0) {
      showToast('Belum ada data sasaran di posyandu ini untuk dicetak ke PDF.');
      return;
    }

    if (filteredData.length === 0 && currentPosData.length > 0) {
      showToast(`Filter kosong, mengekspor seluruh data sasaran (${currentPosData.length} baris)...`);
    }

    setIsExporting('pdf');
    try {
      const res = exportToPdf(targetList, posLabel);
      showToast(`Laporan PDF resmi (${res.totalRows} sasaran) berhasil dibuat & diunduh!`);
      setExportModal({
        isOpen: true,
        type: 'pdf',
        filename: res.filename,
        blob: res.blob,
        totalRows: res.totalRows,
        pdfUrl: res.pdfDataUrl,
      });
    } catch (err: any) {
      console.error('Galat ekspor PDF:', err);
      showToast(`Gagal menyusun PDF: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setTimeout(() => setIsExporting(null), 500);
    }
  };

  // JIKA BELUM LOGIN: Tampilkan Layar Login dengan Email & Password
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl border border-blue-900/30 p-6 sm:p-8 max-w-md w-full">
          {/* Header Card */}
          <div className="text-center mb-5">
            <div className="flex justify-center mb-3">
              <BgnLogo size="xl" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">SPPG Jayamukti</h1>
            <div className="text-xs font-bold text-blue-900 mt-0.5">
              Satuan Pelayanan Pemenuhan Gizi • Badan Gizi Nasional
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Aplikasi PM 3B Jayamukti • Pendataan Balita, Bumil, Busui & Kader
            </p>
          </div>

          {/* Tombol Pasang di HP Android (PWA) */}
          <div className="mb-3">
            <button
              type="button"
              onClick={handleInstallApp}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-800 hover:from-blue-950 hover:to-indigo-900 text-white rounded-2xl text-xs font-black shadow-sm flex items-center justify-center gap-2 transition-all group"
            >
              <Smartphone className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>Pasang Aplikasi PM 3B di HP Android</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-blue-950 text-[10px] font-extrabold">
                APK/PWA
              </span>
            </button>
          </div>

          {/* Status Cloud Realtime Antar-Perangkat (Komputer & HP) */}
          <div className="mb-4 flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200/90 rounded-2xl text-[11px]">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {isCloudConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isCloudConnected ? 'bg-emerald-500' : isSyncing ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                ></span>
              </span>
              <Cloud className="w-3.5 h-3.5 text-blue-900" />
              <span className="font-bold text-slate-700">
                {isSyncing ? 'Menghubungkan Cloud...' : isCloudConnected ? 'Cloud Firestore Aktif' : 'Mode Offline'}
              </span>
            </div>
            <span className="text-[10px] text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Sinkron Komputer & HP
            </span>
          </div>

          {/* Kebijakan Akses Aslap SPPG */}
          <div className="mb-4 p-3 bg-blue-50/80 border border-blue-200 rounded-2xl text-xs text-blue-950 flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-[11px] uppercase tracking-wide text-blue-900">
                Akses Terpusat & Terisolasi
              </div>
              <p className="text-[11px] text-blue-900/90 mt-0.5 leading-relaxed">
                Akun kader dibuat langsung oleh <strong>Aslap SPPG Jayamukti (Azis Jaelani)</strong>. Setiap kader hanya dapat melihat & menginput data di posyandu binaannya masing-masing.
              </p>
            </div>
          </div>

          {/* Alert Success / Error */}
          {authSuccess && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{authSuccess}</span>
            </div>
          )}

          {authError && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          {/* FORM LOGIN */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Alamat Email Akun <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="Masukkan alamat email Anda"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700">
                  Password <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(true)}
                  className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                >
                  Lupa Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="Masukkan password rahasia Anda"
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-blue-600 focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                  title={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-slate-500" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-sm shadow-md transition-colors flex items-center justify-center gap-2"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Masuk ke Aplikasi</span>
            </button>

            {/* Pilihan Cepat Bantuan Pilih Email Kader Posyandu (Admin Tersembunyi, Password Tidak Terisi) */}
            <div className="pt-4 border-t border-slate-100">
              <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Pilihan Cepat Masuk (Uji Coba Sistem):</span>
                <span className="text-[10px] text-slate-400 font-normal">Pilih email posyandu</span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2 leading-relaxed">
                Klik posyandu untuk mengisi kolom email. Password tidak terisi otomatis agar setiap akun tetap terlindungi:
              </p>

              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                {users
                  .filter((u) => u.role === 'kader')
                  .slice(0, 6)
                  .map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => {
                        setLoginEmail(k.email);
                        setLoginPassword('');
                        setAuthError('');
                      }}
                      className={`p-2 rounded-xl border text-left truncate transition-colors ${
                        loginEmail === k.email
                          ? 'border-blue-600 bg-blue-50 text-blue-950 font-bold ring-1 ring-blue-600'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                      }`}
                      title={`${k.nama} (${k.posyanduDefault})`}
                    >
                      <div className="font-bold truncate text-[11px] text-blue-950">
                        {k.posyanduDefault || k.nama}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">{k.email}</div>
                    </button>
                  ))}
              </div>

              {/* Catatan Privasi & Isolasi */}
              <div className="mt-2.5 p-2 bg-slate-50 border border-slate-200/80 rounded-xl text-[10px] text-slate-600 flex items-start gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  <strong>Akses Terisolasi:</strong> Setiap kader wajib memasukkan password rahasianya masing-masing. Kader suatu posyandu tidak dapat mengakses akun atau data posyandu lain.
                </span>
              </div>
            </div>
          </form>

          {/* Modal Petunjuk Lupa Password */}
          {isForgotModalOpen && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95 duration-150">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-3">
                  <Key className="w-6 h-6" />
                </div>
                <h3 className="font-black text-slate-900 text-base mb-1.5">
                  Bantuan Lupa Password
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-4 text-left">
                  Untuk menjaga kerahasiaan dan isolasi data posyandu Desa Jayamukti, permohonan reset password dilayani langsung oleh <strong>Aslap SPPG Jayamukti (Azis Jaelani)</strong>.
                  <br /><br />
                  Silakan hubungi Aslap SPPG untuk dibuatkan kata sandi baru atau diperbarui melalui dashboard kelola akun.
                </p>
                <button
                  type="button"
                  onClick={() => setIsForgotModalOpen(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-colors"
                >
                  Tutup
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    );
  }

  // TAMPILAN UTAMA YANG SIMPEL & RAMAH KADER
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans pb-12">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center gap-3 text-xs sm:text-sm font-bold">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. Header Sederhana */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BgnLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-base sm:text-lg text-slate-900 leading-tight tracking-tight">
                  SPPG Jayamukti
                </h1>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-extrabold rounded-md bg-amber-100 text-amber-900 border border-amber-300">
                  BGN
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Badan Gizi Nasional • Sasaran: Balita, Bumil, Busui & Kader
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Indikator Status & Sinkronisasi Cloud Antar-Perangkat (Firebase) */}
            <button
              type="button"
              onClick={handleForceCloudSync}
              disabled={isSyncing}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                isCloudConnected
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                  : isSyncing
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
              }`}
              title={`${cloudSyncMessage} • Klik untuk sinkronisasi paksa dengan Cloud Firebase`}
            >
              <span className="relative flex h-2 w-2 shrink-0">
                {isCloudConnected && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span
                  className={`relative inline-flex rounded-full h-2 w-2 ${
                    isCloudConnected ? 'bg-emerald-500' : isSyncing ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                ></span>
              </span>
              <Cloud className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">
                {isSyncing ? 'Menyinkronkan...' : isCloudConnected ? 'Cloud Aktif' : 'Offline'}
              </span>
              <RefreshCw
                className={`w-3 h-3 text-slate-500 hover:text-blue-900 shrink-0 ${
                  isSyncing ? 'animate-spin text-blue-600' : ''
                }`}
              />
            </button>

            {/* Tombol Pasang di HP Android */}
            <button
              type="button"
              onClick={handleInstallApp}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 text-white hover:from-blue-950 hover:to-indigo-950 text-xs font-bold shadow-xs transition-all"
              title="Pasang aplikasi ini ke layar menu HP Android"
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Pasang di HP</span>
              <span className="sm:hidden">Instal HP</span>
            </button>

            <div className="text-right hidden sm:block">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-xs font-bold text-slate-800">{currentUser.nama}</span>
                {currentUser.role === 'admin' ? (
                  <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-amber-100 text-amber-900 border border-amber-300">
                    ADMIN SPPG
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[9px] font-black rounded bg-blue-100 text-blue-900 border border-blue-300">
                    KADER
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 font-medium truncate max-w-[190px]">
                {currentUser.role === 'kader' ? (currentUser.posyanduDefault || 'Posyandu') : currentUser.email}
              </div>
            </div>

            {/* Tombol Kelola Akun Kader Khusus Admin SPPG */}
            {currentUser.role === 'admin' && (
              <button
                type="button"
                onClick={() => setIsKaderModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 text-amber-300 border border-slate-700 text-xs font-bold hover:bg-slate-800 transition-colors shadow-2xs"
                title="Kelola & Buat Akun Kader (Khusus Admin SPPG)"
              >
                <Users className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Kelola Akun Kader</span>
                <span className="sm:hidden">Kader</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setProfileNama(currentUser.nama);
                setOldPassword('');
                setChangeNewPassword('');
                setChangeConfirmPassword('');
                setPasswordModalError('');
                setIsPasswordModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-blue-900 transition-colors"
              title="Atur Password & Profil"
            >
              <Key className="w-3.5 h-3.5 text-blue-700" />
              <span className="hidden sm:inline">Ubah Password</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentUser(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors"
              title="Keluar Akun"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6 flex-1 w-full">

        {/* Banner Sinkronisasi Cloud Antar-Perangkat (Komputer, HP, & Tab) */}
        <div className="bg-gradient-to-r from-blue-950 via-indigo-950 to-slate-900 text-white p-3.5 sm:p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border border-blue-800/60">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-2.5 bg-blue-900/60 border border-blue-700/50 rounded-xl shrink-0 text-amber-300">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-amber-300">
                  Pangkalan Data Cloud Terhubung (Komputer, HP, & Tab)
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {beneficiaries.length} Data Tersimpan
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                Seluruh data yang diinput oleh Admin dan Kader otomatis tersinkronisasi antar-perangkat secara langsung (real-time).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleForceCloudSync}
            disabled={isSyncing}
            className="w-full sm:w-auto px-4 py-2 bg-amber-400 hover:bg-amber-300 text-blue-950 text-xs font-black rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            title="Klik untuk menyinkronkan seluruh data di perangkat ini ke Cloud"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-blue-950' : ''}`} />
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Data Sekarang'}</span>
          </button>
        </div>

        {/* 2. LANGKAH 1: WILAYAH KERJA POSYANDU */}
        {currentUser.role === 'admin' ? (
          /* TAMPILAN ADMIN: BISA PILIH SELURUH POSYANDU ATAU GABUNGAN */
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-blue-950 text-white flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                  Pilih Wilayah Posyandu (Akses Admin SPPG):
                </h2>
              </div>
              <span className="text-[11px] font-bold text-blue-900 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                Akses Penuh: Seluruh Posyandu Desa Jayamukti
              </span>
            </div>

            {/* 6 Tombol Posyandu */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              {POSYANDU_LIST.map((pos) => {
                const isSelected = activePosyandu === pos;
                const count = beneficiaries.filter((b) => b.posyandu === pos).length;

                return (
                  <button
                    key={pos}
                    type="button"
                    onClick={() => setActivePosyandu(pos)}
                    className={`p-3 rounded-xl border-2 text-center transition-all flex flex-col items-center justify-center gap-1 ${
                      isSelected
                        ? 'border-blue-700 bg-blue-50 text-blue-950 font-bold shadow-xs ring-2 ring-blue-600/20'
                        : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    <MapPin className={`w-4 h-4 ${isSelected ? 'text-blue-700' : 'text-slate-400'}`} />
                    <span className="text-xs leading-tight font-bold">{pos}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${isSelected ? 'bg-blue-200/70 text-blue-950' : 'text-slate-400'}`}>
                      {count} Data
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Tombol Tampilkan Semua */}
            <div className="mt-2.5 flex justify-end">
              <button
                onClick={() => setActivePosyandu('Semua Posyandu')}
                className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                  activePosyandu === 'Semua Posyandu'
                    ? 'bg-blue-950 text-white font-bold'
                    : 'text-slate-500 hover:text-slate-800 underline'
                }`}
              >
                Lihat Gabungan Semua Posyandu ({beneficiaries.length} data)
              </button>
            </div>
          </div>
        ) : (
          /* TAMPILAN KADER: POSYANDU TERKUNCI & TERISOLASI KHUSUS */
          <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-2xs bg-gradient-to-r from-blue-50/50 via-white to-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-900 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-black text-slate-900 text-base sm:text-lg">
                      {currentUser.posyanduDefault || 'Posyandu Paseh'}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[10px] font-bold border border-blue-300 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-blue-700" />
                      <span>Posyandu Binaan Anda (Terkunci)</span>
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 max-w-2xl leading-relaxed">
                    Anda login sebagai <strong>{currentUser.nama}</strong>. Sesuai kebijakan SPPG Jayamukti, akun Anda hanya dapat menginput, mengedit, dan mengelola data penerima manfaat di <strong>{currentUser.posyanduDefault}</strong>. Data posyandu lain di Desa Jayamukti terisolasi demi keamanan dan ketertiban.
                  </p>
                </div>
              </div>

              <div className="shrink-0 self-start sm:self-center">
                <div className="px-3 py-1.5 rounded-xl bg-blue-950 text-white text-xs font-bold flex items-center gap-2 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  <span>Isolasi Data Aktif</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. LANGKAH 2: RINGKASAN & TOMBOL AKSI UTAMA (BIRU BGN) */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-900 text-white p-5 rounded-2xl shadow-md">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-blue-200 font-extrabold flex items-center gap-1.5">
              <span>SPPG PM 3B Jayamukti</span>
              <span>•</span>
              <span>
                {currentUser.role === 'kader' ? 'Posyandu Kerja Anda:' : 'Posyandu Terpilih:'}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black">
              {currentUser.role === 'kader' ? (currentUser.posyanduDefault || 'Posyandu Paseh') : activePosyandu}
            </div>
            <div className="text-xs text-blue-100 flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5 font-medium">
              <span className="bg-blue-950/60 px-2.5 py-0.5 rounded-md border border-blue-800">👶 {countBalita} Balita</span>
              <span className="bg-blue-950/60 px-2.5 py-0.5 rounded-md border border-blue-800">🤰 {countBumil} Bumil</span>
              <span className="bg-blue-950/60 px-2.5 py-0.5 rounded-md border border-blue-800 font-bold text-amber-300">🤱 {countBusui} Busui</span>
              <span className="bg-blue-950/60 px-2.5 py-0.5 rounded-md border border-blue-800">👩‍⚕️ {countKader} Kader</span>
            </div>
          </div>

          {/* Tombol Aksi: Tambah Data, Impor Excel, Ekspor Excel, Ekspor PDF */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenAdd}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-blue-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all active:scale-95"
            >
              <Plus className="w-4 h-4 text-blue-950" />
              <span>+ Tambah Data</span>
            </button>

            {/* Tombol Impor Excel Resmi BGN */}
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white border border-blue-400/60 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95"
              title="Unggah berkas Excel dengan deteksi kesalahan otomatis (.xlsx / .xls / .csv)"
            >
              <Upload className="w-4 h-4 text-blue-100" />
              <span>Impor Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={isExporting !== null}
              className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-500 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-60"
              title="Unduh berkas Excel sasaran penerima manfaat"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              <span>{isExporting === 'excel' ? 'Menyiapkan...' : 'Ekspor Excel'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExporting !== null}
              className="px-3.5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white border border-teal-500 font-bold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer active:scale-95 disabled:opacity-60"
              title="Unduh berkas PDF sasaran penerima manfaat"
            >
              <FileText className="w-4 h-4 text-teal-100" />
              <span>{isExporting === 'pdf' ? 'Menyusun...' : 'Ekspor PDF'}</span>
            </button>
          </div>
        </div>

        {/* 4. TABEL DATA DENGAN PENCARIAN & FILTER KATEGORI */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          
          {/* Toolbar Pencarian, Filter Kategori & Tombol Cepat Ekspor/Impor */}
          <div className="p-4 border-b border-slate-200 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            
            {/* Filter Kategori: Semua, Balita, Bumil, Busui, Kader */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0">
              {(['Semua', 'Balita', 'Bumil', 'Busui', 'Kader'] as const).map((kat) => (
                <button
                  key={kat}
                  onClick={() => setCategoryFilter(kat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shrink-0 ${
                    categoryFilter === kat
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {kat === 'Busui' ? 'Busui (Ibu Menyusui)' : kat}
                </button>
              ))}
            </div>

            {/* Kolom Cari & Tombol Cepat */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:w-64 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari NIK, Nama, Orang Tua..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Tombol cepat Impor & Ekspor di toolbar tabel */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-800 text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                  title="Impor berkas Excel"
                >
                  <Upload className="w-3.5 h-3.5 text-blue-700" />
                  <span className="hidden sm:inline">Impor</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="px-2.5 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                  title="Ekspor ke berkas Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                  <span className="hidden sm:inline">Excel</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportPdf}
                  className="px-2.5 py-1.5 rounded-xl border border-teal-200 bg-teal-50/80 hover:bg-teal-100 text-teal-800 text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs cursor-pointer"
                  title="Ekspor ke laporan cetak PDF"
                >
                  <FileText className="w-3.5 h-3.5 text-teal-700" />
                  <span className="hidden sm:inline">PDF</span>
                </button>

                {/* Tombol Cepat: Centang Semua Data Salah */}
                {erroneousItemsInView.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllErroneous}
                    className="px-2.5 py-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-black flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                    title="Centang otomatis seluruh data yang salah/bermasalah agar bisa dihapus sekaligus"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    <span>Centang Data Salah ({erroneousItemsInView.length})</span>
                  </button>
                )}
              </div>
            </div>

          </div>

          {/* Bar Aksi Centang Terpilih (Bulk Action Toolbar) */}
          {selectedIds.length > 0 && (
            <div className="px-4 py-3 bg-gradient-to-r from-rose-50 via-rose-100/60 to-amber-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-xl bg-rose-600 text-white font-black text-xs flex items-center justify-center shadow-xs">
                  {selectedIds.length}
                </span>
                <div>
                  <div className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                    <span>{selectedIds.length} Data Tercentang</span>
                    <span className="text-[10px] bg-rose-200 text-rose-900 px-2 py-0.5 rounded-full font-bold">
                      Siap Dihapus Sekaligus
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Pilih baris data yang salah lalu tekan tombol hapus sekaligus di samping.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedIds([])}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-colors cursor-pointer shadow-2xs"
                >
                  Batal Centang
                </button>

                <button
                  type="button"
                  onClick={handleToggleSelectAllVisible}
                  className="px-3 py-1.5 rounded-xl border border-rose-200 bg-rose-100/70 hover:bg-rose-200 text-rose-900 text-xs font-bold transition-colors cursor-pointer"
                >
                  {filteredData.every((item) => selectedIds.includes(item.id))
                    ? 'Lepas Semua'
                    : 'Centang Semua'}
                </button>

                <button
                  type="button"
                  onClick={() => setShowBulkDeleteModal(true)}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus Sekaligus ({selectedIds.length})</span>
                </button>
              </div>
            </div>
          )}

          {/* Tabel Penerima */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
                <tr>
                  {/* Kolom Centang Semua */}
                  <th className="py-3 px-2 text-center w-10">
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        aria-label="Pilih semua baris"
                        checked={
                          filteredData.length > 0 &&
                          filteredData.every((item) => selectedIds.includes(item.id))
                        }
                        onChange={handleToggleSelectAllVisible}
                        className="w-4 h-4 rounded-md border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                      />
                    </div>
                  </th>
                  <th className="py-3 px-2 text-center w-10">No</th>
                  <th className="py-3 px-3">NIK (16 Digit)</th>
                  <th className="py-3 px-3">Nama Lengkap</th>
                  <th className="py-3 px-3 text-center">Kategori</th>
                  <th className="py-3 px-3 text-center">JK</th>
                  <th className="py-3 px-3">Tgl Lahir (Usia)</th>
                  <th className="py-3 px-3">Alamat</th>
                  <th className="py-3 px-3">Nama Orang Tua</th>
                  <th className="py-3 px-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-400">
                      Tidak ada data penerima yang ditemukan.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item, idx) => {
                    const isSelected = selectedIds.includes(item.id);
                    const issue = checkBeneficiaryIssue(item, beneficiaries);

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-rose-50/90 border-l-4 border-l-rose-600 font-medium'
                            : issue.isError
                            ? 'bg-amber-50/50 hover:bg-amber-100/40 border-l-4 border-l-amber-500'
                            : 'hover:bg-emerald-50/40'
                        }`}
                      >
                        {/* Centang Baris */}
                        <td className="py-2.5 px-2 text-center">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${item.nama}`}
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(item.id)}
                              className="w-4 h-4 rounded-md border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                            />
                          </div>
                        </td>

                        <td className="py-2.5 px-2 text-center font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-mono font-bold text-slate-800">
                            {item.nik}
                          </span>
                          {/* Indikator Kesalahan Data */}
                          {issue.isError && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {issue.issues.map((msg, errIdx) => (
                                <span
                                  key={errIdx}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-100 text-rose-800 border border-rose-200"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5 text-rose-600 shrink-0" />
                                  <span>{msg}</span>
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">
                          {item.nama}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.kategori === 'Balita'
                              ? 'bg-amber-100 text-amber-800'
                              : item.kategori === 'Bumil'
                              ? 'bg-rose-100 text-rose-800'
                              : item.kategori === 'Busui'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {item.kategori}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">
                          <span className={item.jenisKelamin === 'L' ? 'text-blue-600' : 'text-rose-600'}>
                            {item.jenisKelamin}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div>{formatDateSimple(item.tanggalLahir)}</div>
                          <div className="text-[10px] text-emerald-700 font-semibold">
                            {calculateAgeSimple(item.tanggalLahir)}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {item.alamat}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">
                          {item.namaOrangTua}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                              title="Edit Data"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingItem(item)}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50"
                              title="Hapus Data"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500 text-right">
            Total terdata: <strong>{filteredData.length}</strong> jiwa
          </div>

        </div>

      </main>

      {/* 5. MODAL INPUT / EDIT SEDERHANA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h3 className="font-extrabold text-base text-slate-900">
                {editingItem ? 'Ubah Data Penerima' : 'Tambah Penerima Manfaat Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveForm} className="space-y-3.5 text-xs">
              
              {/* Lokasi Posyandu */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Lokasi Posyandu <span className="text-rose-500">*</span>
                </label>
                {currentUser.role === 'kader' ? (
                  <div className="w-full px-3 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50/70 text-slate-800 font-bold flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                      <span>{currentUser.posyanduDefault || 'Posyandu Paseh'}</span>
                    </div>
                    <span className="text-[10px] text-emerald-800 font-bold bg-white px-2 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-emerald-600" />
                      <span>Terkunci (Posyandu Binaan)</span>
                    </span>
                  </div>
                ) : (
                  <select
                    value={formPosyandu}
                    onChange={(e) => setFormPosyandu(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  >
                    {POSYANDU_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Kategori: Balita, Bumil, Busui, Kader */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Kategori Sasaran <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['Balita', 'Bumil', 'Busui', 'Kader'] as const).map((kat) => (
                    <button
                      key={kat}
                      type="button"
                      onClick={() => {
                        setFormKategori(kat);
                        if (kat === 'Bumil' || kat === 'Busui') setFormJk('P');
                      }}
                      className={`py-2 px-2.5 rounded-xl border font-bold text-center transition-colors text-xs ${
                        formKategori === kat
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {kat}
                    </button>
                  ))}
                </div>
              </div>

              {/* NIK */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    NIK (Nomor Induk Kependudukan) <span className="text-rose-500">*</span>
                  </label>
                  <span className={`text-[10px] font-bold ${formNik.length === 16 ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {formNik.length}/16 digit
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={16}
                  required
                  value={formNik}
                  onChange={(e) => setFormNik(e.target.value.replace(/\D/g, ''))}
                  placeholder="Contoh: 3206124508230001"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono tracking-wider bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Nama Lengkap */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  placeholder="Ketik nama lengkap..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Jenis Kelamin & Tanggal Lahir */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Jenis Kelamin <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      disabled={formKategori === 'Bumil' || formKategori === 'Busui'}
                      onClick={() => setFormJk('L')}
                      className={`py-2 rounded-xl border font-bold text-center ${
                        formJk === 'L'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-300'
                      } ${(formKategori === 'Bumil' || formKategori === 'Busui') ? 'opacity-40 cursor-not-allowed' : ''}`}
                    >
                      Laki-laki
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormJk('P')}
                      className={`py-2 rounded-xl border font-bold text-center ${
                        formJk === 'P'
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Perempuan
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Tanggal Lahir <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formTglLahir}
                    onChange={(e) => setFormTglLahir(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  {formTglLahir && (
                    <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                      Usia: {calculateAgeSimple(formTglLahir)}
                    </div>
                  )}
                </div>
              </div>

              {/* Alamat */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Alamat Lengkap / RT RW <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formAlamat}
                  onChange={(e) => setFormAlamat(e.target.value)}
                  placeholder="Contoh: Dusun Paseh RT 02 / RW 01"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {/* Nama Orang Tua */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    Nama Orang Tua
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">Tidak wajib diisi</span>
                </div>
                <input
                  type="text"
                  value={formOrangTua}
                  onChange={(e) => setFormOrangTua(e.target.value)}
                  placeholder="Contoh: Nama Ayah / Ibu (Boleh dikosongkan)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 font-bold rounded-xl text-center">
                  {formError}
                </div>
              )}

              {/* Tombol Simpan & Batal */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                >
                  Simpan Data
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* 6. MODAL IMPOR EXCEL RESMI BGN DENGAN DETEKSI KESALAHAN OTOMATIS & PERBAIKAN LANGSUNG */}
      {isImportModalOpen && (
        <ExcelImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          currentUser={currentUser}
          activePosyandu={activePosyandu}
          existingBeneficiaries={beneficiaries}
          onCommitImport={handleCommitImport}
        />
      )}

      {/* 8. MODAL UBAH PASSWORD & PENGATURAN AKUN KADER */}
      {isPasswordModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-100">
            {/* Header Modal */}
            <div className="px-6 py-4 bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Key className="w-5 h-5 text-emerald-200" />
                <h3 className="font-bold text-base">Ubah Password & Akun Kader</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPasswordModalOpen(false)}
                className="p-1 rounded-full text-white/80 hover:text-white hover:bg-emerald-600/50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info Akun Saat Ini */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <div>
                <span className="text-slate-400">Email:</span>{' '}
                <span className="font-mono font-bold text-slate-800">{currentUser.email}</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                {currentUser.posyanduDefault || 'SPPG Jayamukti'}
              </span>
            </div>

            {/* Form Ubah Password */}
            <form onSubmit={handleChangePasswordInApp} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap Kader
                </label>
                <input
                  type="text"
                  value={profileNama}
                  onChange={(e) => setProfileNama(e.target.value)}
                  placeholder="Nama kader"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password Lama <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showChangePassword ? 'text' : 'password'}
                    required
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Masukkan password lama Anda"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(!showChangePassword)}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    {showChangePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-slate-500" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Password Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showChangePassword ? 'text' : 'password'}
                    required
                    value={changeNewPassword}
                    onChange={(e) => setChangeNewPassword(e.target.value)}
                    placeholder="Minimal 4 karakter (atur sendiri)"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Ulangi Password Baru <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type={showChangePassword ? 'text' : 'password'}
                    required
                    value={changeConfirmPassword}
                    onChange={(e) => setChangeConfirmPassword(e.target.value)}
                    placeholder="Ketik ulang password baru"
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {passwordModalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{passwordModalError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Simpan Password Baru</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. MODAL KONFIRMASI HAPUS TUNGGAL */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 text-center space-y-3">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Hapus Data Ini?</h3>
            <p className="text-xs text-slate-500">
              Apakah Anda yakin ingin menghapus data penerima <strong>{deletingItem.nama}</strong> (NIK: {deletingItem.nik})?
            </p>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7.B. MODAL KONFIRMASI HAPUS SEKALIGUS (BULK DELETE) */}
      {showBulkDeleteModal && selectedIds.length > 0 && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-6 text-center space-y-4 border border-rose-200">
            <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <Trash2 className="w-7 h-7" />
            </div>

            <div>
              <h3 className="font-black text-slate-900 text-base sm:text-lg">
                Hapus {selectedIds.length} Data Sekaligus?
              </h3>
              <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                Apakah Anda yakin ingin menghapus <strong>{selectedIds.length} data sasaran yang telah dicentang</strong> secara bersamaan? Tindakan ini permanen dan tidak dapat dibatalkan.
              </p>
            </div>

            {/* Ringkasan Data yang Akan Dihapus */}
            <div className="max-h-40 overflow-y-auto bg-slate-50 rounded-2xl p-3 text-left border border-slate-200 text-xs divide-y divide-slate-100">
              {beneficiaries
                .filter((b) => selectedIds.includes(b.id))
                .slice(0, 6)
                .map((item) => (
                  <div key={item.id} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900 truncate max-w-[180px]">
                      {item.nama}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 shrink-0">
                      {item.nik || '(Tanpa NIK)'}
                    </span>
                  </div>
                ))}
              {selectedIds.length > 6 && (
                <div className="pt-2 text-center text-slate-500 font-semibold text-[11px]">
                  ... dan {selectedIds.length - 6} data sasaran lainnya
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Ya, Hapus {selectedIds.length} Data</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL KELOLA AKUN KADER (KHUSUS ADMIN SPPG) */}
      {currentUser && currentUser.role === 'admin' && (
        <KaderManagementModal
          isOpen={isKaderModalOpen}
          onClose={() => setIsKaderModalOpen(false)}
          users={users}
          currentUserId={currentUser.id}
          onAddKader={handleAddKader}
          onUpdateKader={handleUpdateKader}
          onDeleteKader={handleDeleteKader}
          onShowToast={showToast}
        />
      )}

      {/* 10. MODAL HASIL EKSPOR & PILIHAN UNDUH / BAGIKAN BERKAS */}
      {exportModal.isOpen && exportModal.blob && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                    exportModal.type === 'excel'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-teal-100 text-teal-700'
                  }`}
                >
                  {exportModal.type === 'excel' ? (
                    <FileSpreadsheet className="w-6 h-6" />
                  ) : (
                    <FileText className="w-6 h-6" />
                  )}
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-base leading-tight">
                    {exportModal.type === 'excel' ? 'Berkas Excel Siap' : 'Laporan PDF Siap'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {exportModal.totalRows} sasaran penerima manfaat
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExportModal((prev) => ({ ...prev, isOpen: false }))}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Tutup dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nama & Info Berkas */}
            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 mb-4 text-left">
              <div className="text-[11px] font-semibold text-slate-500 mb-1">
                Nama Berkas:
              </div>
              <div className="font-mono text-xs font-bold text-slate-800 break-all bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                {exportModal.filename}
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                ✓ Berkas telah dikirim ke browser Anda. Jika unduhan tidak otomatis muncul di bar notifikasi HP Anda, silakan pilih salah satu opsi di bawah:
              </p>
            </div>

            {/* Tombol Opsi Tindakan */}
            <div className="space-y-2.5">
              {/* Unduh Berkas Langsung */}
              <button
                type="button"
                onClick={() => {
                  if (exportModal.blob) {
                    triggerBlobDownload(exportModal.blob, exportModal.filename);
                    showToast('Mengunduh berkas ke perangkat...');
                  }
                }}
                className={`w-full py-3 rounded-xl font-bold text-xs sm:text-sm text-white shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.99] ${
                  exportModal.type === 'excel'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Unduh Berkas Langsung</span>
              </button>

              {/* Bagikan ke WhatsApp / Drive / File HP */}
              <button
                type="button"
                onClick={async () => {
                  if (exportModal.blob) {
                    const shared = await shareFileNative(
                      exportModal.blob,
                      exportModal.filename,
                      `Laporan ${exportModal.type.toUpperCase()} SPPG Jayamukti`
                    );
                    if (shared) {
                      showToast('Dialog bagikan berkas dibuka.');
                    } else {
                      triggerBlobDownload(exportModal.blob, exportModal.filename);
                      showToast('Berkas diunduh langsung.');
                    }
                  }
                }}
                className="w-full py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 font-bold text-xs sm:text-sm text-slate-700 flex items-center justify-center gap-2 transition-colors"
              >
                <Share2 className="w-4 h-4 text-emerald-600" />
                <span>Bagikan ke WhatsApp / Simpan ke HP</span>
              </button>

              {/* Buka Dokumen PDF (khusus PDF) */}
              {exportModal.type === 'pdf' && exportModal.pdfUrl && (
                <a
                  href={exportModal.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-xs sm:text-sm text-slate-800 flex items-center justify-center gap-2 transition-colors"
                >
                  <Eye className="w-4 h-4 text-slate-600" />
                  <span>Buka / Pratinjau Laporan PDF</span>
                </a>
              )}

              <button
                type="button"
                onClick={() => setExportModal((prev) => ({ ...prev, isOpen: false }))}
                className="w-full py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Tutup Jendela Ini
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. MODAL PANDUAN PEMASANGAN KE HP ANDROID (PWA RESMI BGN) */}
      {showInstallGuideModal && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl border border-blue-900/20 text-slate-800 space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header Modal */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <BgnLogo size="md" />
                <div>
                  <h3 className="font-black text-slate-900 text-base leading-tight">
                    Pasang di HP Android
                  </h3>
                  <div className="text-[11px] font-bold text-blue-900">
                    Aplikasi PM 3B Jayamukti
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuideModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview Tampilan Icon Menu di HP */}
            <div className="p-4 bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 rounded-2xl text-center text-white space-y-2 shadow-inner">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-white p-1.5 shadow-lg flex items-center justify-center ring-4 ring-amber-400/30">
                <img
                  src="/logo_bgn.png"
                  alt="Logo BGN"
                  className="w-full h-full object-contain drop-shadow-xs"
                />
              </div>
              <div>
                <div className="font-extrabold text-sm text-white">Aplikasi PM 3B Jayamukti</div>
                <div className="text-[11px] text-amber-300 font-semibold">
                  Badan Gizi Nasional (BGN)
                </div>
              </div>
              <p className="text-[11px] text-blue-200/90 leading-relaxed pt-1 border-t border-blue-800/60">
                Aplikasi langsung terpasang di menu layar utama HP Android Anda. Buka lebih praktis dan cepat kapan saja tanpa harus mengetik tautan di browser!
              </p>
            </div>

            {/* Tombol Instal Langsung jika didukung browser */}
            {deferredInstallPrompt && (
              <button
                type="button"
                onClick={handleInstallApp}
                className="w-full py-3 rounded-2xl bg-blue-900 hover:bg-blue-950 text-white font-black text-sm shadow-md flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <Smartphone className="w-4 h-4 text-amber-400" />
                <span>Tekan di Sini untuk Memasang ke HP</span>
              </button>
            )}

            {/* Langkah-langkah mudah jika tombol otomatis tidak muncul */}
            <div className="space-y-2.5">
              <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                <span>📋 Petunjuk Pasang di HP Android (Google Chrome):</span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="w-5 h-5 rounded-full bg-blue-900 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="leading-snug">
                    Buka halaman ini menggunakan peramban <strong>Google Chrome</strong> di HP Android Anda.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="w-5 h-5 rounded-full bg-blue-900 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="leading-snug">
                    Ketuk tombol menu <strong>titik tiga (⋮)</strong> di sudut kanan atas layar peramban Chrome.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="w-5 h-5 rounded-full bg-blue-900 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    3
                  </span>
                  <div className="leading-snug">
                    Pilih opsi <strong>"Tambahkan ke Layar Utama"</strong> (atau <strong>"Instal Aplikasi"</strong>).
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 bg-blue-50 rounded-xl border border-blue-200 text-blue-950">
                  <span className="w-5 h-5 rounded-full bg-blue-900 text-white font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                    4
                  </span>
                  <div className="leading-snug font-medium">
                    Ketuk <strong>"Instal / Tambah"</strong>. Aplikasi akan otomatis muncul di menu aplikasi HP Anda dengan logo resmi BGN!
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowInstallGuideModal(false)}
              className="w-full py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 transition-colors"
            >
              Mengerti & Tutup
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
