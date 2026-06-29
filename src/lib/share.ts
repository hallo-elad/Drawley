import LZString from 'lz-string';

// Sharing in Drawley is fully client-side: a shared artwork is encoded into a
// compressed URL fragment so the link works on any device without a backend.
// Shared works opened via a link can also be added to the local public gallery.

export interface SharedArt {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  /** Composited image data URL (PNG/JPEG). */
  image: string;
  author?: string;
  createdAt: number;
}

const GALLERY_KEY = 'drawley:gallery';

/** Encode a shared artwork into a compact, URL-safe string. */
export function encodeShare(art: SharedArt): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(art));
}

/** Decode a shared artwork from a URL-safe string (null if invalid). */
export function decodeShare(token: string): SharedArt | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(token);
    if (!json) return null;
    return JSON.parse(json) as SharedArt;
  } catch {
    return null;
  }
}

/** Build a full shareable link for an artwork. */
export function buildShareLink(art: SharedArt): string {
  const token = encodeShare(art);
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/view?art=${token}`;
}

// --- Local public gallery ----------------------------------------------------

export function listGallery(): SharedArt[] {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    if (!raw) return seedGallery();
    const items = JSON.parse(raw) as SharedArt[];
    return items.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function addToGallery(art: SharedArt): void {
  try {
    const items = listGallery().filter((a) => a.id !== art.id);
    items.unshift(art);
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items.slice(0, 60)));
  } catch {
    /* quota — ignore */
  }
}

export function removeFromGallery(id: string): void {
  const items = listGallery().filter((a) => a.id !== id);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
}

/**
 * Seed the gallery with a few sample artworks the first time it is opened so
 * the public gallery is never empty. Samples are generated procedurally as SVG
 * data URLs to avoid bundling binary assets.
 */
function seedGallery(): SharedArt[] {
  const samples: SharedArt[] = [
    sample('Sunset Gradient', 'Warm dusk study', '#ff9a3c', '#ff2e63', 'wave'),
    sample('Ocean Calm', 'Cool blues practice', '#4dd4f7', '#3b82f6', 'circles'),
    sample('Neon Dreams', 'Synthwave grid', '#a855f7', '#ec4899', 'grid'),
    sample('Forest Mist', 'Layered greens', '#22c55e', '#10b981', 'wave'),
  ];
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(samples));
  } catch {
    /* ignore */
  }
  return samples;
}

function sample(
  title: string,
  description: string,
  c1: string,
  c2: string,
  motif: 'wave' | 'circles' | 'grid',
): SharedArt {
  const w = 640;
  const h = 420;
  let inner = '';
  if (motif === 'wave') {
    inner = `<path d="M0 ${h * 0.6} Q ${w * 0.25} ${h * 0.4}, ${w * 0.5} ${h * 0.6} T ${w} ${h * 0.6} V ${h} H 0 Z" fill="rgba(255,255,255,0.25)"/>
      <path d="M0 ${h * 0.7} Q ${w * 0.25} ${h * 0.55}, ${w * 0.5} ${h * 0.72} T ${w} ${h * 0.7} V ${h} H 0 Z" fill="rgba(255,255,255,0.18)"/>
      <circle cx="${w * 0.78}" cy="${h * 0.28}" r="48" fill="rgba(255,255,255,0.85)"/>`;
  } else if (motif === 'circles') {
    inner = Array.from({ length: 7 }, (_, i) => {
      const r = 30 + i * 18;
      return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,${0.5 - i * 0.05})" stroke-width="6"/>`;
    }).join('');
  } else {
    inner =
      Array.from({ length: 9 }, (_, i) => `<line x1="${(i * w) / 8}" y1="0" x2="${(i * w) / 8}" y2="${h}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>`).join('') +
      Array.from({ length: 6 }, (_, i) => `<line x1="0" y1="${(i * h) / 5}" x2="${w}" y2="${(i * h) / 5}" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>`).join('');
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
      <stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/>
    </linearGradient></defs>
    <rect width='${w}' height='${h}' fill='url(#g)'/>${inner}</svg>`;
  const image = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  return {
    id: 'sample-' + title.toLowerCase().replace(/\s+/g, '-'),
    title,
    description,
    width: w,
    height: h,
    image,
    author: 'Drawley Studio',
    createdAt: Date.now() - Math.floor(Math.random() * 1e9),
  };
}
