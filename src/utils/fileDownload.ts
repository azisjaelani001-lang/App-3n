/**
 * Utility untuk mengunduh dan membagikan berkas secara andal di browser desktop, 
 * browser seluler (Android Chrome / iOS Safari), maupun dalam lingkungan iframe / PWA.
 */

export function triggerBlobDownload(blob: Blob, filename: string): boolean {
  try {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = url;
    link.setAttribute('download', filename);
    link.target = '_self';

    document.body.appendChild(link);
    link.click();

    // Beri waktu browser memproses unduhan sebelum membersihkan URL objek
    setTimeout(() => {
      try {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.warn('Gagal membersihkan blob URL:', err);
      }
    }, 4000);

    return true;
  } catch (error) {
    console.error('Gagal memicu unduhan berkas:', error);
    return false;
  }
}

/**
 * Memeriksa apakah perangkat mendukung Web Share API untuk berkas (khusus ponsel Android/iOS)
 */
export function isFileSharingSupported(blob: Blob, filename: string): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false;
  }
  try {
    const testFile = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Membagikan berkas melalui Web Share API (WhatsApp, Google Drive, Simpan ke File di HP)
 */
export async function shareFileNative(
  blob: Blob,
  filename: string,
  title: string
): Promise<boolean> {
  try {
    if (!navigator.share) return false;

    const file = new File([blob], filename, {
      type: blob.type || 'application/octet-stream',
      lastModified: Date.now(),
    });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: title,
        text: `Dokumen ${filename} dari Sistem SIP-3B SPPG Jayamukti (Badan Gizi Nasional)`,
      });
      return true;
    }
    return false;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // Pengguna membatalkan dialog bagikan, ini bukan galat
      return true;
    }
    console.error('Galat saat membagikan berkas:', error);
    return false;
  }
}
