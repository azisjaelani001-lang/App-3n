import React, { useState } from 'react';
import { 
  X, 
  UserPlus, 
  Users, 
  Key, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff, 
  Copy, 
  Check, 
  MapPin, 
  Mail, 
  Lock, 
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Search
} from 'lucide-react';
import { PosyanduLocation, UserAccount } from '../types';
import { POSYANDU_LIST } from '../data/posyanduData';

interface KaderManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserAccount[];
  currentUserId: string;
  onAddKader: (kader: {
    nama: string;
    email: string;
    password: string;
    posyanduDefault: PosyanduLocation;
  }) => { success: boolean; message: string };
  onUpdateKader: (
    id: string,
    updates: Partial<Pick<UserAccount, 'nama' | 'email' | 'password' | 'posyanduDefault'>>
  ) => { success: boolean; message: string };
  onDeleteKader: (id: string) => { success: boolean; message: string };
  onShowToast: (msg: string) => void;
}

export const KaderManagementModal: React.FC<KaderManagementModalProps> = ({
  isOpen,
  onClose,
  users,
  currentUserId,
  onAddKader,
  onUpdateKader,
  onDeleteKader,
  onShowToast,
}) => {
  // Tabs: 'list' or 'create'
  const [isCreating, setIsCreating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosyandu, setFilterPosyandu] = useState<string>('Semua');

  // Form Buat Kader Baru
  const [newNama, setNewNama] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('kader123');
  const [newPosyandu, setNewPosyandu] = useState<PosyanduLocation>('Posyandu Paseh');
  const [formError, setFormError] = useState('');

  // Password Visibility Toggle per User ID
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Edit State
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editPosyandu, setEditPosyandu] = useState<PosyanduLocation>('Posyandu Paseh');

  // Delete Confirm State
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Copied state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const kaderUsers = users.filter((u) => u.role === 'kader');

  const filteredKaders = kaderUsers.filter((k) => {
    if (filterPosyandu !== 'Semua' && k.posyanduDefault !== filterPosyandu) {
      return false;
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      return (
        k.nama.toLowerCase().includes(q) ||
        k.email.toLowerCase().includes(q) ||
        (k.posyanduDefault && k.posyanduDefault.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyCredentials = (user: UserAccount) => {
    const text = `*AKUN LOGIN SPPG JAYAMUKTI*\nNama Kader: ${user.nama}\nPosyandu: ${user.posyanduDefault || '-'}\nEmail: ${user.email}\nPassword: ${user.password}\n\nSilakan masuk melalui aplikasi SPPG Jayamukti.`;
    navigator.clipboard.writeText(text);
    setCopiedId(user.id);
    onShowToast(`Info login ${user.nama} berhasil disalin ke clipboard!`);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newNama.trim()) {
      setFormError('Nama lengkap kader wajib diisi.');
      return;
    }

    const cleanEmail = newEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setFormError('Format email tidak valid (harus mengandung @).');
      return;
    }

    if (newPassword.length < 4) {
      setFormError('Password minimal 4 karakter.');
      return;
    }

    const res = onAddKader({
      nama: newNama.trim(),
      email: cleanEmail,
      password: newPassword,
      posyanduDefault: newPosyandu,
    });

    if (!res.success) {
      setFormError(res.message);
      return;
    }

    onShowToast(`Akun kader ${newNama} berhasil dibuat!`);
    setNewNama('');
    setNewEmail('');
    setNewPassword('kader123');
    setIsCreating(false);
  };

  const handleStartEdit = (user: UserAccount) => {
    setEditingUserId(user.id);
    setEditNama(user.nama);
    setEditEmail(user.email);
    setEditPassword(user.password);
    setEditPosyandu(user.posyanduDefault || 'Posyandu Paseh');
  };

  const handleSaveEdit = (id: string) => {
    if (!editNama.trim() || !editEmail.trim() || !editPassword.trim()) {
      onShowToast('Semua kolom edit wajib diisi.');
      return;
    }

    const res = onUpdateKader(id, {
      nama: editNama.trim(),
      email: editEmail.trim().toLowerCase(),
      password: editPassword,
      posyanduDefault: editPosyandu,
    });

    if (res.success) {
      onShowToast('Data akun kader berhasil diperbarui.');
      setEditingUserId(null);
    } else {
      onShowToast(res.message);
    }
  };

  const handleConfirmDelete = (id: string) => {
    const res = onDeleteKader(id);
    if (res.success) {
      onShowToast('Akun kader berhasil dihapus.');
      setDeletingUserId(null);
    } else {
      onShowToast(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        
        {/* Header Modal */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base sm:text-lg">Manajemen Akun Kader Posyandu</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30">
                  Khusus Admin SPPG
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Buat dan kelola akun login para kader posyandu di Desa Jayamukti
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Info Bar & Action Toggle */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-500">Total Kader:</span>{' '}
              <span className="font-bold text-slate-800">{kaderUsers.length} Kader</span>
            </div>
            <div className="h-3 w-px bg-slate-300" />
            <div>
              <span className="text-slate-500">Posyandu:</span>{' '}
              <span className="font-bold text-emerald-700">6 Posyandu Desa Jayamukti</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsCreating(!isCreating);
              setFormError('');
            }}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
              isCreating
                ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
            }`}
          >
            {isCreating ? (
              <>
                <X className="w-4 h-4" />
                <span>Tutup Form Tambah</span>
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                <span>+ Buat Akun Kader Baru</span>
              </>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          
          {/* FORM BUAT AKUN KADER BARU */}
          {isCreating && (
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-emerald-700" />
                  <h4 className="font-bold text-sm text-emerald-950">
                    Form Pendaftaran Akun Kader Baru
                  </h4>
                </div>
                <span className="text-[11px] text-emerald-700 font-medium">
                  Password dan Posyandu ditentukan oleh Admin
                </span>
              </div>

              {formError && (
                <div className="mb-3 p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleCreateSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nama Lengkap Kader <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newNama}
                      onChange={(e) => setNewNama(e.target.value)}
                      placeholder="Contoh: Ibu Ani Maryani"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Posyandu Binaan <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={newPosyandu}
                      onChange={(e) => setNewPosyandu(e.target.value as PosyanduLocation)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                    >
                      {POSYANDU_LIST.map((pos) => (
                        <option key={pos} value={pos}>
                          {pos}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Alamat Email Kader <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="email"
                        required
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="contoh: kader.paseh@gmail.com"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        Password Awal <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setNewPassword(`kader${Math.floor(100 + Math.random() * 900)}`)}
                        className="text-[10px] text-emerald-700 hover:underline font-semibold"
                      >
                        Acak Password
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimal 4 karakter"
                        className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-white"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan & Terbitkan Akun</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Search & Filter Kader */}
          <div className="flex flex-col sm:flex-row gap-2.5 justify-between items-center">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari nama / email kader..."
                className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-500 shrink-0">Filter Posyandu:</span>
              <select
                value={filterPosyandu}
                onChange={(e) => setFilterPosyandu(e.target.value)}
                className="w-full sm:w-auto px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              >
                <option value="Semua">Semua Posyandu ({kaderUsers.length})</option>
                {POSYANDU_LIST.map((pos) => {
                  const count = kaderUsers.filter((k) => k.posyanduDefault === pos).length;
                  return (
                    <option key={pos} value={pos}>
                      {pos} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* DAFTAR AKUN KADER */}
          <div className="space-y-3">
            {filteredKaders.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-600">Tidak ada akun kader ditemukan</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Klik tombol "+ Buat Akun Kader Baru" di atas untuk menambahkan kader.
                </p>
              </div>
            ) : (
              filteredKaders.map((kader) => {
                const isEditing = editingUserId === kader.id;
                const isPasswordVisible = visiblePasswords[kader.id] || false;
                const isDeleting = deletingUserId === kader.id;

                if (isEditing) {
                  return (
                    <div
                      key={kader.id}
                      className="p-4 rounded-2xl border-2 border-emerald-500 bg-emerald-50/40 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-900">
                          Edit Akun: {kader.nama}
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditingUserId(null)}
                          className="text-xs text-slate-500 hover:text-slate-800"
                        >
                          Batal
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                            Nama Kader
                          </label>
                          <input
                            type="text"
                            value={editNama}
                            onChange={(e) => setEditNama(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                            Posyandu Binaan
                          </label>
                          <select
                            value={editPosyandu}
                            onChange={(e) => setEditPosyandu(e.target.value as PosyanduLocation)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-semibold"
                          >
                            {POSYANDU_LIST.map((pos) => (
                              <option key={pos} value={pos}>
                                {pos}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                            Email Kader
                          </label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-0.5">
                            Password Baru
                          </label>
                          <input
                            type="text"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingUserId(null)}
                          className="px-3 py-1 rounded-lg border border-slate-300 text-xs text-slate-600"
                        >
                          Batal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(kader.id)}
                          className="px-3.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                        >
                          Simpan Perubahan
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={kader.id}
                    className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs"
                  >
                    {/* Info Kader */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h5 className="font-bold text-sm text-slate-900">{kader.nama}</h5>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          <span>{kader.posyanduDefault || 'Posyandu Paseh'}</span>
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="font-mono text-slate-700">{kader.email}</span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400">Password:</span>
                          <span className="font-mono font-semibold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">
                            {isPasswordVisible ? kader.password : '••••••••'}
                          </span>
                          <button
                            type="button"
                            onClick={() => togglePasswordVisibility(kader.id)}
                            className="text-slate-400 hover:text-slate-600 p-0.5"
                            title={isPasswordVisible ? 'Sembunyikan' : 'Lihat password'}
                          >
                            {isPasswordVisible ? (
                              <EyeOff className="w-3.5 h-3.5" />
                            ) : (
                              <Eye className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      {/* Salin Akun untuk WA */}
                      <button
                        type="button"
                        onClick={() => handleCopyCredentials(kader)}
                        className={`p-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors ${
                          copiedId === kader.id
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white hover:text-emerald-700'
                        }`}
                        title="Salin info akun untuk dikirimkan ke kader lewat WA/SMS"
                      >
                        {copiedId === kader.id ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span className="text-[11px]">Tersalin</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span className="text-[11px] hidden sm:inline">Salin Akun</span>
                          </>
                        )}
                      </button>

                      {/* Edit Button */}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(kader)}
                        className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:text-emerald-700 hover:bg-slate-50 transition-colors"
                        title="Edit Info / Ganti Password"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Button */}
                      {isDeleting ? (
                        <div className="flex items-center gap-1 bg-rose-50 p-1 rounded-xl border border-rose-200">
                          <span className="text-[10px] text-rose-700 font-bold px-1">Yakin?</span>
                          <button
                            type="button"
                            onClick={() => handleConfirmDelete(kader.id)}
                            className="px-2 py-0.5 bg-rose-600 text-white rounded text-[10px] font-bold"
                          >
                            Ya
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingUserId(null)}
                            className="px-1.5 py-0.5 text-slate-600 text-[10px]"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setDeletingUserId(kader.id)}
                          className="p-1.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors"
                          title="Hapus Akun Kader"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <p className="text-[11px] text-slate-500">
            Kader yang telah memiliki akun dapat langsung login menggunakan email & password di atas.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition-colors"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
