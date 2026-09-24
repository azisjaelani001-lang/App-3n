import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileUp,
  FileCheck,
  Edit3,
  Wand2,
  Search,
  Check,
  Info,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  User,
  Hash,
  Sparkles,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { Beneficiary, BeneficiaryCategory, Gender, PosyanduLocation, UserAccount } from '../types';
import { POSYANDU_LIST } from '../data/posyanduData';
import {
  ParsedImportRow,
  ImportResult,
  parseExcelFile,
  downloadExcelTemplate,
  revalidateAllRows,
  autoRepairAllRows,
  validateRow,
  parseExcelDate,
  sanitizeNikString,
} from '../utils/excelImport';
import { BgnLogo } from './BgnLogo';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserAccount;
  activePosyandu: PosyanduLocation | 'Semua Posyandu';
  existingBeneficiaries: Beneficiary[];
  onCommitImport: (importedBeneficiaries: Beneficiary[]) => void;
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  activePosyandu,
  existingBeneficiaries,
  onCommitImport,
}) => {
  const [importFileName, setImportFileName] = useState('');
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorFilterType, setErrorFilterType] = useState<string | null>(null);

  // Direct editing modal state
  const [editingRow, setEditingRow] = useState<ParsedImportRow | null>(null);
  const [editNik, setEditNik] = useState('');
  const [editNama, setEditNama] = useState('');
  const [editKategori, setEditKategori] = useState<BeneficiaryCategory>('Balita');
  const [editJk, setEditJk] = useState<Gender>('L');
  const [editTglLahir, setEditTglLahir] = useState('');
  const [editAlamat, setEditAlamat] = useState('');
  const [editNamaOrangTua, setEditNamaOrangTua] = useState('');
  const [editPosyandu, setEditPosyandu] = useState<PosyanduLocation>('Posyandu Paseh');
  const [editRowErrors, setEditRowErrors] = useState<string[]>([]);

  // Auto-fix address state
  const [showAddressFixDialog, setShowAddressFixDialog] = useState(false);
  const [autoAddressText, setAutoAddressText] = useState('Desa Jayamukti, Kec. Leuwisadeng');

  // Help Accordion State
  const [showHelpGuide, setShowHelpGuide] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recalculate stats whenever `rows` changes
  const { totalValid, totalInvalid, errorSummary } = useMemo(() => {
    const validCount = rows.filter((r) => r.isValid).length;
    const invalidCount = rows.length - validCount;

    const summary = {
      missingAddress: 0,
      invalidDate: 0,
      invalidNik: 0,
      duplicateNik: 0,
      missingName: 0,
    };

    rows.forEach((r) => {
      r.errors.forEach((err) => {
        const lower = err.toLowerCase();
        if (lower.includes('alamat')) summary.missingAddress++;
        else if (lower.includes('tanggal')) summary.invalidDate++;
        else if (lower.includes('duplikat') || lower.includes('sudah terdaftar')) summary.duplicateNik++;
        else if (lower.includes('nik')) summary.invalidNik++;
        else if (lower.includes('nama')) summary.missingName++;
      });
    });

    return {
      totalValid: validCount,
      totalInvalid: invalidCount,
      errorSummary: summary,
    };
  }, [rows]);

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    setIsReadingFile(true);

    try {
      const buffer = await file.arrayBuffer();
      const targetPos =
        currentUser.role === 'kader'
          ? currentUser.posyanduDefault || 'Posyandu Paseh'
          : activePosyandu;

      const res = parseExcelFile(buffer, targetPos, existingBeneficiaries);

      let processedRows = res.previewRows;
      if (currentUser.role === 'kader') {
        const kaderPos = currentUser.posyanduDefault || 'Posyandu Paseh';
        processedRows = processedRows.map((p) => ({ ...p, posyandu: kaderPos }));
      }

      setRows(processedRows);

      // Auto-switch to invalid tab if errors exist so cadre immediately sees what to fix
      if (res.totalInvalid > 0) {
        setFilterTab('invalid');
      } else {
        setFilterTab('all');
      }
    } catch (err) {
      console.error('Gagal membaca berkas Excel', err);
      alert('Gagal membaca berkas Excel. Pastikan berkas berformat .xlsx, .xls, atau .csv');
    } finally {
      setIsReadingFile(false);
    }
  };

  // Open direct edit modal for a specific row
  const handleOpenRowEdit = (row: ParsedImportRow) => {
    setEditingRow(row);
    setEditNik(row.nik);
    setEditNama(row.nama);
    setEditKategori(row.kategori);
    setEditJk(row.jenisKelamin);
    setEditTglLahir(row.tanggalLahir);
    setEditAlamat(row.alamat);
    setEditNamaOrangTua(row.namaOrangTua || '');
    setEditPosyandu(
      currentUser.role === 'kader'
        ? currentUser.posyanduDefault || 'Posyandu Paseh'
        : row.posyandu
    );
    setEditRowErrors(row.errors);
  };

  // Save changes from direct edit modal
  const handleSaveRowEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRow) return;

    const cleanedNik = sanitizeNikString(editNik);

    const updatedRow: ParsedImportRow = {
      ...editingRow,
      nik: cleanedNik,
      nama: editNama.trim(),
      kategori: editKategori,
      jenisKelamin: editJk,
      tanggalLahir: editTglLahir,
      alamat: editAlamat.trim(),
      namaOrangTua: editNamaOrangTua.trim() || '-',
      posyandu:
        currentUser.role === 'kader'
          ? currentUser.posyanduDefault || 'Posyandu Paseh'
          : editPosyandu,
    };

    // Revalidate against the entire batch
    const updatedRows = rows.map((r) => (r.id === editingRow.id ? updatedRow : r));
    const reval = revalidateAllRows(updatedRows, existingBeneficiaries);
    setRows(reval.rows);

    setEditingRow(null);
  };

  // Auto-Fix: Fill missing address for all rows
  const handleApplyAutoAddress = () => {
    if (!autoAddressText.trim()) return;

    const updated = rows.map((r) => {
      if (!r.alamat || !r.alamat.trim()) {
        const addressVal = autoAddressText.includes('{posyandu}')
          ? autoAddressText.replace('{posyandu}', r.posyandu)
          : `${autoAddressText.trim()} (${r.posyandu})`;
        return {
          ...r,
          alamat: addressVal,
        };
      }
      return r;
    });

    const reval = revalidateAllRows(updated, existingBeneficiaries);
    setRows(reval.rows);
    setShowAddressFixDialog(false);
  };

  // Auto-Fix: Sanitize all NIKs
  const handleAutoCleanNiks = () => {
    const updated = rows.map((r) => ({
      ...r,
      nik: sanitizeNikString(r.nik),
    }));
    const reval = revalidateAllRows(updated, existingBeneficiaries);
    setRows(reval.rows);
  };

  // Auto-Fix: Attempt intelligent date re-parsing
  const handleAutoFixDates = () => {
    const updated = rows.map((r) => {
      if (!r.tanggalLahir && r.rawValues?.rawTglLahir) {
        const parsed = parseExcelDate(r.rawValues.rawTglLahir);
        if (parsed) {
          return {
            ...r,
            tanggalLahir: parsed,
          };
        }
      }
      return r;
    });
    const reval = revalidateAllRows(updated, existingBeneficiaries);
    setRows(reval.rows);
  };

  // Filtered rows display
  const filteredRows = useMemo(() => {
    let result = rows;

    if (filterTab === 'valid') {
      result = result.filter((r) => r.isValid);
    } else if (filterTab === 'invalid') {
      result = result.filter((r) => !r.isValid);
    }

    if (errorFilterType) {
      result = result.filter((r) =>
        r.errors.some((err) => err.toLowerCase().includes(errorFilterType.toLowerCase()))
      );
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (r) =>
          r.nama.toLowerCase().includes(q) ||
          r.nik.includes(q) ||
          r.alamat.toLowerCase().includes(q) ||
          r.posyandu.toLowerCase().includes(q)
      );
    }

    return result;
  }, [rows, filterTab, errorFilterType, searchQuery]);

  // Auto repair and commit all rows
  const handleAutoRepairAndCommit = () => {
    if (rows.length === 0) return;
    const repaired = autoRepairAllRows(rows, existingBeneficiaries, autoAddressText);
    const validRowsToCommit: Beneficiary[] = repaired.rows.map((r) => ({
      id: r.id,
      nik: r.nik,
      nama: r.nama,
      kategori: r.kategori,
      jenisKelamin: r.jenisKelamin,
      tanggalLahir: r.tanggalLahir,
      alamat: r.alamat,
      namaOrangTua: r.namaOrangTua || '-',
      posyandu:
        currentUser.role === 'kader'
          ? currentUser.posyanduDefault || 'Posyandu Paseh'
          : r.posyandu,
    }));

    onCommitImport(validRowsToCommit);
  };

  // Commit valid rows
  const handleCommit = () => {
    const validRowsToCommit: Beneficiary[] = rows
      .filter((r) => r.isValid)
      .map((r) => ({
        id: r.id,
        nik: r.nik,
        nama: r.nama,
        kategori: r.kategori,
        jenisKelamin: r.jenisKelamin,
        tanggalLahir: r.tanggalLahir,
        alamat: r.alamat,
        namaOrangTua: r.namaOrangTua || '-',
        posyandu:
          currentUser.role === 'kader'
            ? currentUser.posyanduDefault || 'Posyandu Paseh'
            : r.posyandu,
      }));

    if (validRowsToCommit.length === 0) {
      // Jika belum ada yang valid, langsung tawarkan perbaikan otomatis
      handleAutoRepairAndCommit();
      return;
    }

    onCommitImport(validRowsToCommit);
  };

  // Handler toggle centang baris pratinjau impor
  const handleToggleSelectRow = (id: string) => {
    setSelectedRowIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Handler toggle centang semua yang tampak di tabel
  const handleToggleSelectAllVisibleRows = () => {
    const visibleIds = filteredRows.map((r) => r.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedRowIds.includes(id));
    if (allSelected) {
      setSelectedRowIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedRowIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Centang otomatis seluruh data yang gagal/salah (Perlu Perbaikan)
  const handleSelectAllInvalidRows = () => {
    const invalidIds = rows.filter((r) => !r.isValid).map((r) => r.id);
    setSelectedRowIds(invalidIds);
  };

  // Hapus semua baris tercentang dari pratinjau impor sekaligus
  const handleBulkDeleteSelectedRows = () => {
    if (selectedRowIds.length === 0) return;
    const remaining = rows.filter((r) => !selectedRowIds.includes(r.id));
    const reval = revalidateAllRows(remaining, existingBeneficiaries);
    setRows(reval.rows);
    setSelectedRowIds([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full my-auto max-h-[94vh] flex flex-col border border-slate-200 overflow-hidden">
        
        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-900 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <BgnLogo size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                  SPPG PM 3B Jayamukti — Impor Data Excel
                </h3>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-blue-950">
                  BGN Official
                </span>
              </div>
              <p className="text-xs text-blue-200">
                Pendeteksian kesalahan otomatis & perbaikan langsung data penerima manfaat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-blue-200 hover:text-white hover:bg-white/10 transition-colors"
            title="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MODAL BODY (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 text-slate-800 flex-1">
          
          {/* Kader Posyandu Context Notice */}
          {currentUser.role === 'kader' && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 flex items-center gap-2.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Hasil impor otomatis dialokasikan ke posyandu binaan Anda:{' '}
                <strong className="text-blue-950 font-bold underline">
                  {currentUser.posyanduDefault || 'Posyandu Paseh'}
                </strong>.
              </span>
            </div>
          )}

          {/* Upload Box & Template Link */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700">Pilih Berkas Excel dari HP / Komputer:</span>
              <button
                type="button"
                onClick={downloadExcelTemplate}
                className="text-blue-700 hover:text-blue-900 font-bold flex items-center gap-1.5 underline text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Unduh Format Excel Resmi BGN
              </button>
            </div>

            <label
              htmlFor="excel-file-upload-input"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const file = e.dataTransfer.files?.[0];
                if (file && fileInputRef.current) {
                  const dataTransfer = new DataTransfer();
                  dataTransfer.items.add(file);
                  fileInputRef.current.files = dataTransfer.files;
                  const event = new Event('change', { bubbles: true });
                  fileInputRef.current.dispatchEvent(event);
                }
              }}
              className="block border-2 border-dashed border-blue-400 hover:border-blue-700 bg-blue-50/60 hover:bg-blue-50 p-5 sm:p-6 rounded-2xl text-center cursor-pointer transition-all group"
            >
              <FileUp className="w-10 h-10 text-blue-600 mx-auto mb-2 group-hover:scale-110 transition-transform" />
              <div className="font-black text-sm sm:text-base text-slate-900">
                {importFileName ? (
                  <span className="text-blue-950 font-black">📄 {importFileName}</span>
                ) : (
                  'Sentuh / Klik di Sini untuk Memilih Berkas Excel'
                )}
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                Mendukung berkas <strong>.xlsx</strong>, <strong>.xls</strong>, dan <strong>.csv</strong> dari galeri/file HP Android & Komputer.
              </p>
              
              <div className="mt-3 flex justify-center">
                <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-extrabold text-xs shadow-md transition-transform active:scale-95">
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Buka File Excel Sekarang</span>
                </span>
              </div>

              <input
                id="excel-file-upload-input"
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = '';
                }}
                onChange={handleFileSelect}
                className="hidden"
              />
            </label>
          </div>

          {isReadingFile && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-center text-xs text-blue-800 flex items-center justify-center gap-2 font-semibold">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              Membaca dan memvalidasi berkas data Excel...
            </div>
          )}

          {/* HASIL PEMBACAAN & PENDETEKSIAN KESALAHAN */}
          {rows.length > 0 && (
            <div className="space-y-4 pt-2">
              
              {/* 1. KARTU RINGKASAN & STATISTIK KESALAHAN */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="text-slate-500">Total data terbaca:</span>{' '}
                    <strong className="text-slate-900 text-sm font-black">{rows.length} baris</strong>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 font-extrabold text-xs flex items-center gap-1.5 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {totalValid} Siap Diimpor
                    </span>
                    {totalInvalid > 0 && (
                      <span className="px-3 py-1 rounded-xl bg-rose-100 text-rose-800 font-extrabold text-xs flex items-center gap-1.5 border border-rose-300">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {totalInvalid} Perlu Perbaikan
                      </span>
                    )}
                  </div>
                </div>

                {/* Breakdown Kategori Kesalahan */}
                {totalInvalid > 0 && (
                  <div className="pt-2 border-t border-slate-200">
                    <div className="text-[11px] font-bold text-slate-600 mb-1.5">
                      Penyebab Kesalahan Terdeteksi (Klik untuk menyaring):
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {errorSummary.missingAddress > 0 && (
                        <button
                          type="button"
                          onClick={() => setErrorFilterType(errorFilterType === 'alamat' ? null : 'alamat')}
                          className={`px-2.5 py-1 rounded-lg font-bold border transition-colors flex items-center gap-1 ${
                            errorFilterType === 'alamat'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                          }`}
                        >
                          <MapPin className="w-3 h-3" />
                          <span>{errorSummary.missingAddress} Alamat Belum Diisi</span>
                        </button>
                      )}

                      {errorSummary.invalidDate > 0 && (
                        <button
                          type="button"
                          onClick={() => setErrorFilterType(errorFilterType === 'tanggal' ? null : 'tanggal')}
                          className={`px-2.5 py-1 rounded-lg font-bold border transition-colors flex items-center gap-1 ${
                            errorFilterType === 'tanggal'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          <span>{errorSummary.invalidDate} Tanggal Lahir Kosong/Format Salah</span>
                        </button>
                      )}

                      {errorSummary.invalidNik > 0 && (
                        <button
                          type="button"
                          onClick={() => setErrorFilterType(errorFilterType === 'nik' ? null : 'nik')}
                          className={`px-2.5 py-1 rounded-lg font-bold border transition-colors flex items-center gap-1 ${
                            errorFilterType === 'nik'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                          }`}
                        >
                          <Hash className="w-3 h-3" />
                          <span>{errorSummary.invalidNik} NIK Tidak 16 Digit / Bermasalah</span>
                        </button>
                      )}

                      {errorSummary.duplicateNik > 0 && (
                        <button
                          type="button"
                          onClick={() => setErrorFilterType(errorFilterType === 'duplikat' ? null : 'duplikat')}
                          className={`px-2.5 py-1 rounded-lg font-bold border transition-colors flex items-center gap-1 ${
                            errorFilterType === 'duplikat'
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                          }`}
                        >
                          <AlertCircle className="w-3 h-3" />
                          <span>{errorSummary.duplicateNik} NIK Duplikat / Sudah Terdaftar</span>
                        </button>
                      )}

                      {errorSummary.missingName > 0 && (
                        <button
                          type="button"
                          onClick={() => setErrorFilterType(errorFilterType === 'nama' ? null : 'nama')}
                          className={`px-2.5 py-1 rounded-lg font-bold border transition-colors flex items-center gap-1 ${
                            errorFilterType === 'nama'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-white text-rose-700 border-rose-200 hover:bg-rose-50'
                          }`}
                        >
                          <User className="w-3 h-3" />
                          <span>{errorSummary.missingName} Nama Kosong</span>
                        </button>
                      )}

                      {errorFilterType && (
                        <button
                          type="button"
                          onClick={() => setErrorFilterType(null)}
                          className="px-2 py-1 rounded-lg font-bold bg-slate-200 text-slate-700 hover:bg-slate-300"
                        >
                          Reset Filter
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* 2. BAR ALAT PERBAIKAN CEPAT (1-CLICK AUTO-FIX) */}
              {totalInvalid > 0 && (
                <div className="p-3.5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-700" />
                      <span className="font-extrabold text-xs text-blue-950">
                        Alat Perbaikan Otomatis Cepat (Solusi 1-Klik)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowHelpGuide(!showHelpGuide)}
                      className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1"
                    >
                      <Info className="w-3 h-3" />
                      {showHelpGuide ? 'Sembunyikan Panduan' : 'Mengapa Terjadi Kesalahan?'}
                    </button>
                  </div>

                  {/* Tombol-tombol aksi instan */}
                  <div className="flex flex-wrap gap-2">
                    {/* Lengkapi Alamat Otomatis */}
                    {errorSummary.missingAddress > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowAddressFixDialog(true)}
                        className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>⚡ Lengkapi Alamat Kosong ({errorSummary.missingAddress} baris)</span>
                      </button>
                    )}

                    {/* Rapikan NIK */}
                    <button
                      type="button"
                      onClick={handleAutoCleanNiks}
                      className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-all"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-blue-600" />
                      <span>Bersihkan Format NIK</span>
                    </button>

                    {/* Perbaiki Format Tanggal */}
                    {errorSummary.invalidDate > 0 && (
                      <button
                        type="button"
                        onClick={handleAutoFixDates}
                        className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center gap-1.5 transition-all"
                      >
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        <span>Re-Analisis Format Tanggal</span>
                      </button>
                    )}
                  </div>

                  {/* Panduan Akordion */}
                  {showHelpGuide && (
                    <div className="p-3 bg-white rounded-xl border border-blue-200 text-xs space-y-1.5 text-slate-700">
                      <div className="font-bold text-blue-900">
                        💡 Cara Memperbaiki Masalah Impor:
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-[11px]">
                        <li>
                          <strong>Alamat Kosong:</strong> Seringkali kader posyandu tidak mengetik alamat di Excel karena semua anak tinggal di desa yang sama. Klik tombol <strong>"⚡ Lengkapi Alamat Kosong"</strong> untuk mengisi alamat desa secara massal.
                        </li>
                        <li>
                          <strong>NIK Kurang dari 16 Digit:</strong> Di Excel, angka awal nol (0) sering terpotong atau terformat ilmiah (misal 3.206E+15). Klik tombol <strong>"✏️ Perbaiki"</strong> pada baris terkait untuk memasukkan NIK yang benar.
                        </li>
                        <li>
                          <strong>Tanggal Lahir:</strong> Pastikan format tanggal menggunakan YYYY-MM-DD, DD/MM/YYYY, atau nama bulan seperti 15 Agustus 2023. Anda bisa mengedit tanggal secara langsung di tabel.
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* DIALOG POPUP: AUTO-FILL ADDRESS */}
              {showAddressFixDialog && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-extrabold text-xs text-amber-950">
                      <MapPin className="w-4 h-4 text-amber-700" />
                      <span>Lengkapi Alamat Otomatis untuk Semua Baris yang Kosong</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddressFixDialog(false)}
                      className="text-amber-800 hover:text-amber-950"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-xs text-amber-900">
                    Masukkan alamat standar yang akan otomatis diisikan ke {errorSummary.missingAddress} data yang alamatnya belum terisi:
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={autoAddressText}
                      onChange={(e) => setAutoAddressText(e.target.value)}
                      placeholder="Contoh: Dusun Paseh RT 02 / RW 01, Desa Jayamukti"
                      className="flex-1 px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={handleApplyAutoAddress}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs shrink-0"
                    >
                      Terapkan Sekarang
                    </button>
                  </div>
                </div>
              )}

              {/* 3. TABS FILTER & SEARCH BAR */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                {/* Tabs */}
                <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterTab('all');
                      setErrorFilterType(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all ${
                      filterTab === 'all' && !errorFilterType
                        ? 'bg-white text-blue-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Semua ({rows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterTab('valid');
                      setErrorFilterType(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                      filterTab === 'valid'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:text-emerald-900'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Siap Diimpor ({totalValid})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterTab('invalid');
                      setErrorFilterType(null);
                    }}
                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1 ${
                      filterTab === 'invalid'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-700 hover:text-rose-900'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Perlu Perbaikan ({totalInvalid})
                  </button>
                </div>

                {/* Tombol Cepat Centang Data Salah & Hapus Sekaligus */}
                <div className="flex flex-wrap items-center gap-2">
                  {totalInvalid > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllInvalidRows}
                      className="px-2.5 py-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-800 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Centang otomatis seluruh baris yang perlu perbaikan agar bisa dihapus sekaligus"
                    >
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span>Centang Semua Data Salah ({totalInvalid})</span>
                    </button>
                  )}

                  {selectedRowIds.length > 0 && (
                    <div className="flex items-center gap-1.5 animate-in fade-in">
                      <button
                        type="button"
                        onClick={handleBulkDeleteSelectedRows}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                        title="Hapus baris yang tercentang dari pratinjau impor"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Tercentang ({selectedRowIds.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRowIds([])}
                        className="px-2 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-600 text-[11px] font-medium"
                      >
                        Batal
                      </button>
                    </div>
                  )}

                  {/* Search */}
                  <div className="relative flex-1 max-w-xs min-w-[170px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari NIK atau Nama sasaran..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 4. TABEL PREVIEW DATA & DETAIL KESALAHAN & AKSES PERBAIKAN */}
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="max-h-72 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[700px]">
                    <thead className="bg-slate-100 text-slate-700 font-extrabold uppercase text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-200">
                      <tr>
                        {/* Checkbox Centang Kolom Header */}
                        <th className="py-2.5 px-2 text-center w-10">
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              aria-label="Centang semua baris"
                              checked={
                                filteredRows.length > 0 &&
                                filteredRows.every((r) => selectedRowIds.includes(r.id))
                              }
                              onChange={handleToggleSelectAllVisibleRows}
                              className="w-3.5 h-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                            />
                          </div>
                        </th>
                        <th className="py-2.5 px-3 text-center w-16">Status</th>
                        <th className="py-2.5 px-2 text-center w-12">Baris</th>
                        <th className="py-2.5 px-3">NIK</th>
                        <th className="py-2.5 px-3">Nama Sasaran</th>
                        <th className="py-2.5 px-3">Kategori</th>
                        <th className="py-2.5 px-3">Tgl Lahir</th>
                        <th className="py-2.5 px-3 min-w-[220px]">
                          Penyebab Kesalahan / Keterangan
                        </th>
                        <th className="py-2.5 px-3 text-center w-24">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                            Tidak ada data yang sesuai dengan filter pencarian.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => {
                          const isRowSelected = selectedRowIds.includes(r.id);

                          return (
                            <tr
                              key={r.id}
                              className={`transition-colors ${
                                isRowSelected
                                  ? 'bg-rose-100/90 border-l-4 border-l-rose-600 font-medium'
                                  : r.isValid
                                  ? 'bg-white hover:bg-emerald-50/40'
                                  : 'bg-rose-50/60 hover:bg-rose-100/50'
                              }`}
                            >
                              {/* Checkbox Baris */}
                              <td className="py-2 px-2 text-center">
                                <div className="flex items-center justify-center">
                                  <input
                                    type="checkbox"
                                    aria-label={`Centang baris ${r.rowNumber}`}
                                    checked={isRowSelected}
                                    onChange={() => handleToggleSelectRow(r.id)}
                                    className="w-3.5 h-3.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer accent-rose-600"
                                  />
                                </div>
                              </td>

                              {/* Status */}
                              <td className="py-2 px-3 text-center">
                                {r.isValid ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <Check className="w-3 h-3" /> OK
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300">
                                    <AlertTriangle className="w-3 h-3" /> Batal
                                  </span>
                                )}
                              </td>

                              {/* Baris Excel */}
                              <td className="py-2 px-2 text-center font-mono text-slate-400 text-[11px]">
                                #{r.rowNumber}
                              </td>

                              {/* NIK */}
                              <td className="py-2 px-3 font-mono text-xs font-semibold text-slate-800">
                                {r.nik ? (
                                  <span className={r.nik.length === 16 ? 'text-slate-900' : 'text-rose-600 font-bold'}>
                                    {r.nik}
                                  </span>
                                ) : (
                                  <span className="text-rose-500 italic font-normal">(Kosong)</span>
                                )}
                              </td>

                            {/* Nama */}
                            <td className="py-2 px-3 font-bold text-slate-900">
                              {r.nama || <span className="text-rose-500 italic font-normal">(Nama Kosong)</span>}
                              <div className="text-[10px] text-slate-500 font-normal">
                                {r.posyandu} • {r.jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}
                              </div>
                            </td>

                            {/* Kategori */}
                            <td className="py-2 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-md font-extrabold text-[10px] ${
                                  r.kategori === 'Balita'
                                    ? 'bg-blue-100 text-blue-800'
                                    : r.kategori === 'Bumil'
                                    ? 'bg-purple-100 text-purple-800'
                                    : r.kategori === 'Busui'
                                    ? 'bg-pink-100 text-pink-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {r.kategori}
                              </span>
                            </td>

                            {/* Tgl Lahir */}
                            <td className="py-2 px-3 text-[11px] text-slate-700">
                              {r.tanggalLahir || (
                                <span className="text-rose-500 italic">(Kosong)</span>
                              )}
                            </td>

                            {/* Detail Kesalahan / Masalah */}
                            <td className="py-2 px-3">
                              {r.isValid ? (
                                <span className="text-emerald-700 font-medium text-[11px] flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  Data lengkap & valid
                                </span>
                              ) : (
                                <div className="space-y-1">
                                  {r.errors.map((err, errIdx) => (
                                    <div
                                      key={errIdx}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-900 border border-rose-200 text-[10px] font-bold mr-1 mb-0.5"
                                    >
                                      <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />
                                      <span>{err}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>

                            {/* Aksi: Perbaiki Langsung */}
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleOpenRowEdit(r)}
                                className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 transition-all mx-auto ${
                                  r.isValid
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                    : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                                }`}
                                title="Klik untuk memperbaiki data baris ini langsung di aplikasi"
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{r.isValid ? 'Edit' : 'Perbaiki'}</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Info Bawah */}
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>
                  Menampilkan {filteredRows.length} dari {rows.length} data.
                </span>
                {totalInvalid > 0 && (
                  <span className="text-amber-700 font-semibold">
                    * Hanya baris yang berstatus ✓ OK yang akan disimpan ke basis data.
                  </span>
                )}
              </div>

            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Tutup
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {rows.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-black shadow-md flex items-center gap-2 transition-all active:scale-95"
              >
                <FileUp className="w-4 h-4" />
                <span>Pilih Berkas Excel (.xlsx / .csv)</span>
              </button>
            ) : (
              <>
                {/* Opsi 1: Perbaiki Otomatis & Masukkan Semua Data */}
                <button
                  type="button"
                  onClick={handleAutoRepairAndCommit}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  title="Otomatis melengkapi alamat desa, membersihkan NIK, dan memasukkan seluruh data sekaligus"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>⚡ Perbaiki Otomatis & Masukkan Semua ({rows.length}) Data</span>
                </button>

                {/* Opsi 2: Masukkan hanya data yang sudah valid */}
                {totalValid > 0 && (
                  <button
                    type="button"
                    onClick={handleCommit}
                    className="px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                  >
                    <FileCheck className="w-4 h-4" />
                    <span>Masukkan ({totalValid}) Data Valid Saja</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>

      </div>

      {/* POPUP / MODAL PERBAIKAN LANGSUNG (INLINE ROW REPAIR FORM) */}
      {editingRow && (
        <div className="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-5 sm:p-6 border border-slate-100 space-y-4 max-h-[92vh] overflow-y-auto animate-in fade-in zoom-in-95">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                  #{editingRow.rowNumber}
                </div>
                <div>
                  <h4 className="font-extrabold text-sm sm:text-base text-slate-900">
                    Perbaiki Data Baris #{editingRow.rowNumber}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Koreksi kesalahan data agar langsung berstatus ✓ OK Siap Diimpor
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingRow(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error alerts on current row */}
            {editRowErrors.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs space-y-1">
                <div className="font-extrabold text-rose-800 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  Kesalahan yang Perlu Diperbaiki:
                </div>
                <ul className="list-disc pl-4 text-[11px] text-rose-700 font-semibold space-y-0.5">
                  {editRowErrors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSaveRowEdit} className="space-y-3.5 text-xs">
              
              {/* NIK */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    NIK (Nomor Induk Kependudukan) <span className="text-rose-500">*</span>
                  </label>
                  <span className={`text-[10px] font-bold ${editNik.length === 16 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {editNik.length}/16 digit
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={16}
                  required
                  value={editNik}
                  onChange={(e) => setEditNik(e.target.value.replace(/\D/g, ''))}
                  placeholder="Contoh: 3206044612250001"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono tracking-wider bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
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
                  value={editNama}
                  onChange={(e) => setEditNama(e.target.value)}
                  placeholder="Nama sasaran..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Kategori & JK */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Kategori <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editKategori}
                    onChange={(e) => {
                      const k = e.target.value as BeneficiaryCategory;
                      setEditKategori(k);
                      if (k === 'Bumil' || k === 'Busui') setEditJk('P');
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    <option value="Balita">Balita</option>
                    <option value="Bumil">Bumil</option>
                    <option value="Busui">Busui</option>
                    <option value="Kader">Kader</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Jenis Kelamin <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editJk}
                    disabled={editKategori === 'Bumil' || editKategori === 'Busui'}
                    onChange={(e) => setEditJk(e.target.value as Gender)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden disabled:opacity-50"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>

              {/* Tanggal Lahir */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Tanggal Lahir <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={editTglLahir}
                  onChange={(e) => setEditTglLahir(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Alamat */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700">
                    Alamat Lengkap / RT RW <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setEditAlamat(`Dusun Paseh, Desa Jayamukti (${editPosyandu})`)
                    }
                    className="text-[10px] text-blue-700 font-bold hover:underline"
                  >
                    + Pasang Alamat Jayamukti
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={editAlamat}
                  onChange={(e) => setEditAlamat(e.target.value)}
                  placeholder="Contoh: Dusun Paseh RT 02 / RW 01, Desa Jayamukti"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Nama Orang Tua */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nama Orang Tua (Opsional)
                </label>
                <input
                  type="text"
                  value={editNamaOrangTua}
                  onChange={(e) => setEditNamaOrangTua(e.target.value)}
                  placeholder="Nama Ayah / Ibu..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              {/* Posyandu (Hanya Admin yang dapat mengubah) */}
              {currentUser.role === 'admin' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Lokasi Posyandu <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={editPosyandu}
                    onChange={(e) => setEditPosyandu(e.target.value as PosyanduLocation)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  >
                    {POSYANDU_LIST.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="px-4 py-2 rounded-xl border border-slate-300 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan & Validasi Ulang</span>
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
};
