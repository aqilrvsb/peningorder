import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Attachments on Half Day / Absent days (MC slip, letter…). Private bucket; the path starts
// with the HQ id so storage RLS gives each HQ (and its HR account) only its own files.
export const HR_BUCKET = 'hr-attachments';
export const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';
const ALLOWED = ATTACHMENT_ACCEPT.split(',');
const MAX_BYTES = 10 * 1024 * 1024;

export const isPdfFile = (nameOrPath: string) => /\.pdf$/i.test(nameOrPath);

/** Error text for a file we won't upload, or null when it's fine. */
export function attachmentProblem(file: File): string | null {
  if (!ALLOWED.includes(file.type)) return 'Format tak disokong — guna gambar (JPG/PNG) atau PDF.';
  if (file.size > MAX_BYTES) return 'Fail terlalu besar — maksimum 10MB.';
  return null;
}

// Phone photos are 3–6MB; shrink to ≤1600px JPEG. Anything that can't be decoded goes up as-is.
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 800_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export async function uploadAttendanceFile(tenantId: string, userId: string, date: string, file: File) {
  const f = await shrinkImage(file);
  const ext = f.type === 'application/pdf' ? 'pdf' : (f.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
  const path = `${tenantId}/${userId}/${date}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const { error } = await supabase.storage.from(HR_BUCKET).upload(path, f, { contentType: f.type, upsert: false });
  if (error) throw error;
  return { path, name: f.name };
}

/** Best effort — a leftover file is harmless, a failed attendance save is not. */
export async function removeAttendanceFile(path: string | null | undefined) {
  if (!path) return;
  await supabase.storage.from(HR_BUCKET).remove([path]).catch(() => {});
}

/** Short-lived link to view a stored attachment. */
export function useAttendanceFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['hr-attachment-url', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(HR_BUCKET).createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
