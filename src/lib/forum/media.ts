// Форум: проверка загружаемых картинок по сигнатуре (а не по заголовку Content-Type)
// и удаление метаданных (EXIF/XMP: геопозиция, модель телефона…) из JPEG/PNG/WebP.

export type Mime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export const EXT: Record<Mime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export function sniff(b: Uint8Array): Mime | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function stripJpeg(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return b; // неожиданная структура — оставляем как есть
    const marker = b[i + 1];
    if (marker === 0xda) { parts.push(b.subarray(i)); return concat(parts); } // начало данных изображения
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) return b;
    const isMeta = marker === 0xe1 || (marker >= 0xe2 && marker <= 0xef && marker !== 0xe2) || marker === 0xfe; // APP1 (EXIF/XMP), APP3–15, комментарий; APP2 (ICC) оставляем
    if (!isMeta) parts.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return b;
}
function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (i + 12 <= b.length) {
    const len = dv.getUint32(i);
    const type = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const end = i + 12 + len;
    if (end > b.length) return b;
    if (!["eXIf", "tEXt", "zTXt", "iTXt", "tIME"].includes(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }
  return concat(parts);
}
function stripWebp(b: Uint8Array): Uint8Array {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const parts: Uint8Array[] = [];
  let i = 12;
  let removed = false;
  while (i + 8 <= b.length) {
    const type = String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    const len = dv.getUint32(i + 4, true);
    const end = i + 8 + len + (len & 1);
    if (end > b.length + 1) return b;
    if (type === "EXIF" || type === "XMP ") removed = true;
    else parts.push(b.subarray(i, Math.min(end, b.length)));
    i = end;
  }
  if (!removed) return b;
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  out.set(body, 12);
  new DataView(out.buffer).setUint32(4, out.length - 8, true);
  // флаги EXIF/XMP в VP8X больше не верны — снимаем
  if (out.length > 30 && String.fromCharCode(out[12], out[13], out[14], out[15]) === "VP8X") out[20] &= ~(0x08 | 0x04);
  return out;
}

export function stripMeta(b: Uint8Array, mime: Mime): Uint8Array {
  try {
    if (mime === "image/jpeg") return stripJpeg(b);
    if (mime === "image/png") return stripPng(b);
    if (mime === "image/webp") return stripWebp(b);
  } catch {}
  return b;
}

/** Размер картинки по заголовку (без декодирования). null — не удалось разобрать. */
export function imageSize(b: Uint8Array, mime: Mime): { w: number; h: number } | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u16le = (i: number) => b[i] | (b[i + 1] << 8);
  const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
  const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
  try {
    if (mime === "image/png") return b.length >= 24 ? { w: u32be(16), h: u32be(20) } : null;
    if (mime === "image/gif") return b.length >= 10 ? { w: u16le(6), h: u16le(8) } : null;
    if (mime === "image/webp") {
      const fmt = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (fmt === "VP8 " && b.length >= 30) return { w: u16le(26) & 0x3fff, h: u16le(28) & 0x3fff };
      if (fmt === "VP8L" && b.length >= 25) { const x = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (x & 0x3fff) + 1, h: ((x >>> 14) & 0x3fff) + 1 }; }
      if (fmt === "VP8X" && b.length >= 30) return { w: u24le(24) + 1, h: u24le(27) + 1 };
      return null;
    }
    if (mime === "image/jpeg") {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01 || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
        if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: u16be(i + 5), w: u16be(i + 7) };
        i += 2 + u16be(i + 2);
      }
    }
  } catch {}
  return null;
}
