// vCard 3.0 üretimi ve vCard / MeCard / düz metin ayrıştırma.
// Bu dosya DOM kullanmaz; Node ile de test edilebilir.

const CRLF = '\r\n';

export function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

// vCard satırlarını 75 bayttan (UTF-8) uzun olmayacak şekilde katlar.
// Çok baytlı karakterler (ş, ğ, ı, İ...) asla ortadan bölünmez.
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74; // devam satırları baştaki boşlukla birlikte 75 bayt
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) parts.push(cur);
  return parts.join(CRLF + ' ');
}

export function fullName(c) {
  return [c.firstName, c.lastName].map(x => (x || '').trim()).filter(Boolean).join(' ');
}

export function formatDateTR(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

export function buildNote(c, eventName) {
  const tags = (c.tags || []).join(', ');
  return `Tanışma: ${eventName || '-'}, ${formatDateTR(c.createdAt)}. ` +
    `Etiketler: ${tags || '-'}. Not: ${(c.note || '').trim() || '-'}`;
}

function normalizeUrl(u) {
  u = (u || '').trim();
  if (!u) return '';
  // Güvenlik: sadece http/https bağlantılarına izin ver (javascript:, data: vb. engellenir)
  if (/^[a-z][a-z0-9+.-]*:/i.test(u) && !/^[a-z0-9.-]+:\d+/i.test(u)) return /^https?:\/\//i.test(u) ? u : '';
  return 'https://' + u.replace(/^\/+/, '');
}
export { normalizeUrl };

export function linkedinUrl(v) {
  v = (v || '').trim();
  if (!v) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) return '';
  if (/linkedin\.com/i.test(v)) return normalizeUrl(v);
  // sadece kullanıcı adı yazıldıysa
  return 'https://www.linkedin.com/in/' + v.replace(/^@/, '').replace(/^\/+|\/+$/g, '');
}

/**
 * vCard 3.0 üretir.
 * c: { firstName, lastName, title, company, phoneMobile, phoneWork, email,
 *      web, linkedin, address, photo (data URL), note, tags, createdAt }
 * opts: { note: string|null  (NOTE alanı), photo: bool }
 */
export function buildVCard(c, opts = {}) {
  const L = [];
  const add = s => L.push(foldLine(s));
  add('BEGIN:VCARD');
  add('VERSION:3.0');
  const fn = fullName(c) || c.company || c.email || c.phoneMobile || 'Kişi';
  add(`N:${escapeText(c.lastName)};${escapeText(c.firstName)};;;`);
  add(`FN:${escapeText(fn)}`);
  if (c.company) add(`ORG:${escapeText(c.company)}`);
  if (c.title) add(`TITLE:${escapeText(c.title)}`);
  if (c.phoneMobile) add(`TEL;TYPE=CELL,VOICE:${escapeText(c.phoneMobile)}`);
  if (c.phoneWork) add(`TEL;TYPE=WORK,VOICE:${escapeText(c.phoneWork)}`);
  if (c.email) add(`EMAIL;TYPE=INTERNET,WORK:${escapeText(c.email)}`);
  if (c.web) add(`URL;TYPE=WORK:${escapeText(normalizeUrl(c.web))}`);
  if (c.linkedin) {
    const li = linkedinUrl(c.linkedin);
    // iOS etiketli URL ("LinkedIn") + sosyal profil olarak da gösterir
    add(`item1.URL:${escapeText(li)}`);
    add('item1.X-ABLabel:LinkedIn');
    if (opts.social !== false) add(`X-SOCIALPROFILE;TYPE=linkedin:${escapeText(li)}`);
  }
  if (c.address) {
    add(`ADR;TYPE=WORK:;;${escapeText(c.address)};;;;`);
  }
  if (opts.note) add(`NOTE:${escapeText(opts.note)}`);
  if (opts.photo !== false && c.photo && /^data:image\/(jpeg|jpg|png);base64,/.test(c.photo)) {
    const type = /png/.test(c.photo.slice(0, 20)) ? 'PNG' : 'JPEG';
    const b64 = c.photo.split(',')[1];
    add(`PHOTO;ENCODING=b;TYPE=${type}:${b64}`);
  }
  add('END:VCARD');
  return L.join(CRLF) + CRLF;
}

// ---------------- Ayrıştırma ----------------

function decodeQP(str, charset) {
  const bytes = [];
  const s = str.replace(/=\r?\n/g, '');
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.substr(i + 1, 2))) {
      bytes.push(parseInt(s.substr(i + 1, 2), 16));
      i += 2;
    } else {
      const enc = new TextEncoder().encode(s[i]);
      enc.forEach(b => bytes.push(b));
    }
  }
  try {
    return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }
}

function unescapeText(s) {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1');
}

function splitUnescaped(s, sep) {
  const out = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) { cur += s[i] + s[i + 1]; i++; continue; }
    if (s[i] === sep) { out.push(cur); cur = ''; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}

export function emptyContact() {
  return {
    firstName: '', lastName: '', title: '', company: '', phoneMobile: '',
    phoneWork: '', email: '', web: '', linkedin: '', address: '', note: '', photo: ''
  };
}

export function splitName(full) {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function isMobileNumber(p) {
  const d = (p || '').replace(/\D/g, '');
  return /^(90)?0?5\d{9}$/.test(d);
}

export function parseVCards(text) {
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // QP yumuşak satır sonlarını ve katlamayı birleştir
  const unfolded = raw.replace(/\n[ \t]/g, '');
  const cards = [];
  let cur = null;
  let qpBuffer = null;
  const lines = unfolded.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // vCard 2.1 QP satırı '=' ile bitiyorsa devam eder
    while (/QUOTED-PRINTABLE/i.test(line.split(':')[0]) && /=$/.test(line) && i + 1 < lines.length) {
      line = line.slice(0, -1) + lines[++i];
    }
    if (!line.trim()) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    let left = line.slice(0, colon);
    let value = line.slice(colon + 1);
    const leftParts = left.split(';');
    let name = leftParts[0].toUpperCase();
    let group = '';
    if (name.includes('.')) { [group, name] = [name.split('.')[0], name.split('.').slice(1).join('.')]; }
    const params = {};
    const types = [];
    for (const p of leftParts.slice(1)) {
      const [k, v] = p.includes('=') ? p.split('=') : ['TYPE', p];
      const K = k.toUpperCase();
      params[K] = v;
      if (K === 'TYPE') v.split(',').forEach(t => types.push(t.toLowerCase().replace(/"/g, '')));
    }
    if (name === 'BEGIN' && /VCARD/i.test(value)) { cur = { ...emptyContact(), _groups: {} }; continue; }
    if (!cur) continue;
    if (name === 'END') { finalize(cur); cards.push(cur); cur = null; continue; }
    const isQP = /QUOTED-PRINTABLE/i.test(params.ENCODING || '') || types.includes('quoted-printable');
    if (isQP) value = decodeQP(value, params.CHARSET);
    switch (name) {
      case 'N': {
        const comps = splitUnescaped(value, ';').map(unescapeText);
        cur.lastName = (comps[0] || '').trim();
        cur.firstName = [comps[1], comps[2]].filter(Boolean).join(' ').trim();
        break;
      }
      case 'FN': cur._fn = unescapeText(value).trim(); break;
      case 'ORG': cur.company = splitUnescaped(value, ';').map(unescapeText).filter(Boolean).join(' - ').trim(); break;
      case 'TITLE': cur.title = unescapeText(value).trim(); break;
      case 'TEL': {
        const v = unescapeText(value).replace(/^tel:/i, '').trim();
        const mobile = types.some(t => ['cell', 'mobile', 'iphone'].includes(t)) || (!types.includes('work') && isMobileNumber(v));
        if (mobile && !cur.phoneMobile) cur.phoneMobile = v;
        else if (!cur.phoneWork) cur.phoneWork = v;
        else if (!cur.phoneMobile) cur.phoneMobile = v;
        break;
      }
      case 'EMAIL': if (!cur.email) cur.email = unescapeText(value).replace(/^mailto:/i, '').trim(); break;
      case 'URL': {
        const v = unescapeText(value).trim();
        if (/linkedin\.com/i.test(v)) cur.linkedin = cur.linkedin || v;
        else if (!cur.web) cur.web = v;
        break;
      }
      case 'X-SOCIALPROFILE': {
        const v = unescapeText(value).trim();
        if (/linkedin/i.test(v) || types.includes('linkedin')) cur.linkedin = cur.linkedin || v;
        break;
      }
      case 'ADR': {
        const comps = splitUnescaped(value, ';').map(unescapeText).map(s => s.trim()).filter(Boolean);
        if (!cur.address) cur.address = comps.join(', ');
        break;
      }
      case 'LABEL': if (!cur.address) cur.address = unescapeText(value).replace(/\n/g, ', ').trim(); break;
      case 'NOTE': cur.note = unescapeText(value).trim(); break;
      case 'PHOTO': {
        const enc = (params.ENCODING || '').toLowerCase();
        if (enc === 'b' || enc === 'base64' || types.includes('base64')) {
          const t = (types.find(t => ['jpeg', 'jpg', 'png'].includes(t)) || 'jpeg').replace('jpg', 'jpeg');
          cur.photo = `data:image/${t};base64,${value.replace(/\s/g, '')}`;
        } else if (/^data:image/.test(value)) cur.photo = value;
        break;
      }
      default: break;
    }
  }
  return cards;
}

function finalize(c) {
  if (!c.firstName && !c.lastName && c._fn) Object.assign(c, splitName(c._fn));
  delete c._fn;
  delete c._groups;
}

export function parseMeCard(text) {
  const body = text.replace(/^MECARD:/i, '');
  const c = emptyContact();
  const fields = splitUnescaped(body, ';');
  for (const f of fields) {
    const i = f.indexOf(':');
    if (i < 0) continue;
    const k = f.slice(0, i).toUpperCase();
    const v = f.slice(i + 1).replace(/\\([;:,\\])/g, '$1').trim();
    if (!v) continue;
    if (k === 'N') {
      const parts = v.split(',');
      if (parts.length > 1) { c.lastName = parts[0].trim(); c.firstName = parts.slice(1).join(' ').trim(); }
      else Object.assign(c, splitName(v));
    } else if (k === 'TEL') {
      if (!c.phoneMobile && isMobileNumber(v)) c.phoneMobile = v;
      else if (!c.phoneWork) c.phoneWork = v;
      else if (!c.phoneMobile) c.phoneMobile = v;
    } else if (k === 'EMAIL') c.email = c.email || v;
    else if (k === 'URL') { if (/linkedin\.com/i.test(v)) c.linkedin = v; else c.web = c.web || v; }
    else if (k === 'ORG') c.company = v;
    else if (k === 'TITLE') c.title = v;
    else if (k === 'ADR') c.address = v.replace(/,+/g, ', ').replace(/^[, ]+|[, ]+$/g, '');
    else if (k === 'NOTE') c.note = v;
  }
  return c;
}

/**
 * QR içeriğini türüne göre ayrıştırır.
 * Dönüş: { kind: 'vcard'|'mecard'|'linkedin'|'url'|'email'|'phone'|'text', contact, contacts? }
 */
export function parseQRContent(text, textParser) {
  const t = (text || '').trim();
  if (/BEGIN:VCARD/i.test(t)) {
    const cards = parseVCards(t);
    return { kind: 'vcard', contact: cards[0] || emptyContact(), contacts: cards };
  }
  if (/^MECARD:/i.test(t)) return { kind: 'mecard', contact: parseMeCard(t) };
  if (/^BIZCARD:/i.test(t)) {
    const c = emptyContact();
    t.replace(/^BIZCARD:/i, '').split(';').forEach(f => {
      const i = f.indexOf(':'); if (i < 0) return;
      const k = f.slice(0, i).toUpperCase(), v = f.slice(i + 1).trim();
      if (k === 'N') c.firstName = v; else if (k === 'X') c.lastName = v;
      else if (k === 'T') c.title = v; else if (k === 'C') c.company = v;
      else if (k === 'A') c.address = v; else if (k === 'B') c.phoneMobile = v;
      else if (k === 'F') c.phoneWork = c.phoneWork || v; else if (k === 'E') c.email = v;
    });
    return { kind: 'mecard', contact: c };
  }
  if (/^mailto:/i.test(t)) {
    const c = emptyContact();
    c.email = decodeURIComponent(t.replace(/^mailto:/i, '').split('?')[0]);
    return { kind: 'email', contact: c };
  }
  if (/^tel:/i.test(t)) {
    const c = emptyContact();
    c.phoneMobile = t.replace(/^tel:/i, '');
    return { kind: 'phone', contact: c };
  }
  if (/^(https?:\/\/)?([a-z0-9-]+\.)*linkedin\.com\//i.test(t)) {
    const c = emptyContact();
    c.linkedin = normalizeUrl(t);
    const m = t.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (m) {
      // "ad-soyad-123abc" -> "Ad Soyad"
      const slug = decodeURIComponent(m[1]).split('-').filter(p => !/\d/.test(p) && p.length > 1);
      if (slug.length) {
        const name = slug.map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)).join(' ');
        Object.assign(c, splitName(name));
      }
    }
    return { kind: 'linkedin', contact: c };
  }
  if (/^https?:\/\//i.test(t) || /^www\./i.test(t)) {
    const c = emptyContact();
    c.web = normalizeUrl(t);
    return { kind: 'url', contact: c };
  }
  const c = textParser ? textParser(t) : { ...emptyContact(), note: t };
  return { kind: 'text', contact: c };
}

// ------------- Takvim (.ics) -------------
function icsDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}
function icsUtc(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}
export function buildICS({ uid, title, description, start, durationMin = 30 }) {
  const end = new Date(start.getTime() + durationMin * 60000);
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  const L = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kartvizit//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@kartvizit`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-PT15M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ];
  return L.map(foldLine).join(CRLF) + CRLF;
}

// ------------- Telefon yardımcıları -------------
export function phoneKey(p) {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-10) : '';
}
export function whatsappNumber(p) {
  let d = (p || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10 && d.startsWith('5')) d = '90' + d;
  return d;
}
