import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const UPLOAD_LIMITS = {
  image: {
    maxBytes: 25 * 1024 * 1024, // 25 MB
    extensions: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']),
    mimePrefixes: ['image/']
  },
  video: {
    maxBytes: 400 * 1024 * 1024, // 400 MB
    extensions: new Set(['.mp4', '.webm', '.mov']),
    mimePrefixes: ['video/', 'application/octet-stream']
  },
  theme: {
    maxBytes: 50 * 1024 * 1024, // 50 MB
    extensions: new Set(['.pptx', '.potx', '.thmx', '.json', '.pdf']),
    mimePrefixes: [
      'application/vnd.openxmlformats',
      'application/vnd.ms-powerpoint',
      'application/vnd.ms-officetheme',
      'application/zip',
      'application/octet-stream',
      'application/json',
      'application/pdf'
    ]
  },
  font: {
    maxBytes: 15 * 1024 * 1024, // 15 MB
    extensions: new Set(['.woff2', '.woff', '.ttf', '.otf']),
    mimePrefixes: ['font/', 'application/font', 'application/x-font', 'application/octet-stream']
  }
};

const KEBAB_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validates that a deck or organisation identifier is strict kebab-case.
 */
export function isValidKebabSlug(slug) {
  if (typeof slug !== 'string') return false;
  if (slug.length < 2 || slug.length > 64) return false;
  if (slug.includes('..') || slug.includes('/') || slug.includes('\\') || slug.includes('\0')) {
    return false;
  }
  return KEBAB_SLUG_REGEX.test(slug);
}

/**
 * Throws if slug is not valid kebab-case.
 */
export function assertValidDeckSlug(slug) {
  if (!isValidKebabSlug(slug)) {
    const err = new Error(`Invalid deck name "${slug}". Deck names must be lowercase kebab-case (2-64 chars, a-z, 0-9, hyphens).`);
    err.statusCode = 400;
    err.code = 'INVALID_DECK_SLUG';
    throw err;
  }
  return slug;
}

/**
 * Generates a clean kebab-case deck name from a brief or title.
 */
export function slugifyDeckName(input, fallback = 'untitled-deck') {
  if (!input || typeof input !== 'string') return fallback;
  const cleaned = input
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  if (!cleaned) return fallback;
  const words = cleaned.split('-').slice(0, 6).join('-').slice(0, 56).replace(/-+$/, '');
  return words.length >= 2 ? words : `${words}-deck`;
}

/**
 * Safely resolves paths inside baseDir and rejects any path traversal attempt.
 */
export function safeResolvePath(baseDir, ...segments) {
  if (!baseDir || typeof baseDir !== 'string') {
    throw new Error('Base directory is required for path resolution.');
  }
  const resolvedBase = path.resolve(baseDir);

  for (const seg of segments) {
    if (typeof seg !== 'string') {
      const err = new Error('Invalid path segment type.');
      err.statusCode = 400;
      err.code = 'PATH_TRAVERSAL_REJECTED';
      throw err;
    }
    const decoded = decodeURIComponentSafe(seg);
    if (
      decoded.includes('\0') ||
      decoded.includes('..') ||
      path.isAbsolute(decoded) ||
      decoded.includes('\\')
    ) {
      const err = new Error(`Path traversal or unsafe path rejected: "${seg}"`);
      err.statusCode = 400;
      err.code = 'PATH_TRAVERSAL_REJECTED';
      throw err;
    }
  }

  const target = path.resolve(resolvedBase, ...segments);
  const relative = path.relative(resolvedBase, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const err = new Error('Path escapes base directory.');
    err.statusCode = 400;
    err.code = 'PATH_TRAVERSAL_REJECTED';
    throw err;
  }
  return target;
}

function decodeURIComponentSafe(str) {
  try {
    return decodeURIComponent(str);
  } catch {
    return str;
  }
}

/**
 * Validates an uploaded file's size, extension, and MIME type, and returns a clean asset filename.
 */
export function validateUploadFile({ originalname, mimetype = '', size = 0, category = 'auto' }) {
  if (!originalname || typeof originalname !== 'string') {
    const err = new Error('Missing file name.');
    err.statusCode = 400;
    err.code = 'INVALID_UPLOAD';
    throw err;
  }
  if (originalname.includes('\0') || originalname.includes('..') || originalname.includes('/') || originalname.includes('\\')) {
    const err = new Error(`Unsafe upload filename rejected: "${originalname}"`);
    err.statusCode = 400;
    err.code = 'UNSAFE_FILENAME';
    throw err;
  }

  const rawExt = path.extname(originalname);
  const ext = rawExt.toLowerCase();
  let resolvedCategory = category;

  if (resolvedCategory === 'auto') {
    if (UPLOAD_LIMITS.image.extensions.has(ext)) resolvedCategory = 'image';
    else if (UPLOAD_LIMITS.video.extensions.has(ext)) resolvedCategory = 'video';
    else if (UPLOAD_LIMITS.theme.extensions.has(ext)) resolvedCategory = 'theme';
    else if (UPLOAD_LIMITS.font.extensions.has(ext)) resolvedCategory = 'font';
    else {
      const err = new Error(`Unsupported file extension "${ext}".`);
      err.statusCode = 400;
      err.code = 'UNSUPPORTED_FILE_TYPE';
      throw err;
    }
  }

  const rule = UPLOAD_LIMITS[resolvedCategory];
  if (!rule) {
    const err = new Error(`Unknown upload category "${resolvedCategory}".`);
    err.statusCode = 400;
    err.code = 'INVALID_UPLOAD_CATEGORY';
    throw err;
  }

  if (!rule.extensions.has(ext)) {
    const err = new Error(`File "${originalname}" (${ext}) is not allowed for category "${resolvedCategory}". Allowed: ${[...rule.extensions].join(', ')}`);
    err.statusCode = 400;
    err.code = 'UNSUPPORTED_FILE_TYPE';
    throw err;
  }

  if (typeof size !== 'number' || size <= 0) {
    const err = new Error(`Uploaded file "${originalname}" is empty.`);
    err.statusCode = 400;
    err.code = 'EMPTY_FILE';
    throw err;
  }

  if (size > rule.maxBytes) {
    const maxMb = Math.round(rule.maxBytes / (1024 * 1024));
    const err = new Error(`File "${originalname}" exceeds maximum size of ${maxMb} MB for ${resolvedCategory}.`);
    err.statusCode = 413;
    err.code = 'FILE_TOO_LARGE';
    throw err;
  }

  if (mimetype) {
    const lowerMime = mimetype.toLowerCase();
    const mimeOk = rule.mimePrefixes.some((prefix) => lowerMime.startsWith(prefix));
    if (!mimeOk) {
      const err = new Error(`MIME type "${mimetype}" is not permitted for ${resolvedCategory} (${ext}).`);
      err.statusCode = 400;
      err.code = 'INVALID_MIME_TYPE';
      throw err;
    }
  }

  const baseStem = path
    .basename(originalname, rawExt)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || resolvedCategory;
  const suffix = crypto.randomBytes(3).toString('hex');
  const safeFilename = `${baseStem}-${suffix}${ext}`;

  return {
    category: resolvedCategory,
    extension: ext,
    safeFilename
  };
}

/**
 * Redacts PII (emails, tokens, secrets, account/SSN numbers) from text before placing on slides or logs.
 */
export function redactPII(text) {
  if (!text || typeof text !== 'string') return { text: '', redactions: [] };
  const redactions = [];
  let output = text;

  // Emails
  output = output.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, (match) => {
    redactions.push({ type: 'email', original: match });
    return '[redacted-email]';
  });

  // Bearer / API tokens (sk-..., ghp_..., AIza..., eyJ... JWTs)
  output = output.replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{25,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g, (match) => {
    redactions.push({ type: 'token', original: match.slice(0, 6) + '…' });
    return '[redacted-token]';
  });

  // SSN or structured account numbers (e.g., 123-45-6789 or ACCT-123456789)
  output = output.replace(/\b(?:\d{3}-\d{2}-\d{4}|ACCT-\d{6,14}|\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4})\b/gi, (match) => {
    redactions.push({ type: 'account_number', original: '****' });
    return '[redacted-account]';
  });

  return { text: output, redactions };
}

/**
 * Escapes HTML special characters to prevent XSS or prompt injection into markup.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Wraps untrusted user/document input in XML data boundary tags and strips prompt-injection control sequences.
 */
export function isolateUntrustedData(label, rawText) {
  const { text } = redactPII(String(rawText || ''));
  const sanitized = text.replace(/<\/?untrusted_source_data>/gi, '');
  return `<untrusted_source_data label="${escapeHtml(label)}">\n${sanitized}\n</untrusted_source_data>`;
}

/**
 * Executes a binary with an explicit argument array and shell: false (per §10).
 */
export async function execWithoutShell(binary, args = [], options = {}) {
  if (typeof binary !== 'string' || !binary.trim()) {
    throw new Error('Binary path must be a non-empty string.');
  }
  if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
    throw new Error('Arguments must be an array of strings.');
  }
  return execFileAsync(binary, args, {
    ...options,
    shell: false,
    windowsHide: true
  });
}
