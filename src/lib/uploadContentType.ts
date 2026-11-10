/**
 * The MIME type to store an upload under.
 *
 * Supabase stores whatever `contentType` it is handed and serves that back
 * verbatim as `Content-Type`. The browser's `File.type` is empty more often than
 * it looks — Android WebView, some file pickers, and anything that hands over a
 * `Blob` rather than a `File` — and an empty string was being stored as
 * `application/octet-stream`. Desktop browsers sniff the bytes and still paint
 * the image, but strict mobile and in-app browsers (Facebook/Instagram WebView,
 * UC, Samsung Internet) trust the declared type and show the `alt` text instead.
 * That is the "picture is missing, only words" report.
 *
 * So: prefer a real `file.type`, and otherwise derive the type from the
 * extension. `application/octet-stream` is treated as "unknown" rather than as a
 * deliberate choice, because it never is one here.
 */

const BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  json: "application/json",
};

/** A declared type is usable only when it is specific; the generic ones are not. */
export function isUsableContentType(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = type.trim().toLowerCase();
  if (!t) return false;
  // `application/octet-stream` is what a caller sends when it does not know, so
  // it must not be trusted over the extension.
  return t !== "application/octet-stream";
}

/** `photo.JPEG` -> `jpeg`; `archive.tar.gz` -> `gz`; no extension -> `""`. */
export function extensionOf(name: string): string {
  const base = name.split(/[?#]/)[0].split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Resolve the type to store for `file`. Never returns an empty string, so the
 * bucket metadata is always specific enough for a strict browser to accept.
 */
export function uploadContentType(file: { name?: string; type?: string }): string {
  if (isUsableContentType(file.type)) return (file.type as string).trim();
  const ext = extensionOf(file.name ?? "");
  return BY_EXTENSION[ext] ?? "application/octet-stream";
}
