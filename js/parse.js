// Kartvizit OCR metninden alan tahmini (Türkçe + İngilizce sezgisel kurallar).
import { emptyContact, splitName } from './vcard.js';

const TITLE_WORDS = [
  'müdür', 'müdürü', 'mudur', 'genel', 'uzman', 'mühendis', 'muhendis', 'direktör', 'direktörü', 'direktor',
  'koordinatör', 'koordinatörü', 'danışman', 'danisman', 'başkan', 'başkanı', 'baskan', 'yönetici', 'yönetim',
  'sorumlu', 'sorumlusu', 'şef', 'şefi', 'temsilci', 'temsilcisi', 'avukat', 'av.', 'dr.', 'prof.', 'doç.',
  'kurucu', 'ortak', 'satış', 'pazarlama', 'teknik', 'muhasebe', 'mimar', 'asistan', 'asistanı', 'yazılım',
  'ceo', 'cto', 'cfo', 'coo', 'cmo', 'cio', 'vp', 'founder', 'co-founder', 'cofounder', 'manager', 'director',
  'engineer', 'developer', 'consultant', 'specialist', 'officer', 'head', 'lead', 'partner', 'president',
  'executive', 'sales', 'marketing', 'analyst', 'architect', 'designer', 'owner', 'representative',
  'coordinator', 'assistant', 'chief', 'senior', 'junior', 'intern', 'attorney', 'lawyer', 'accountant'
];
// Karşılaştırmalar için: küçük harf + Türkçe karakterleri sadeleştir (İ→i, ş→s, ı→i ...)
export function fold(s) {
  return (s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
}
const B = '(?:^|[^a-z0-9])', E = '(?=$|[^a-z0-9])';
const COMPANY_RE = new RegExp(B + '(a\\.?\\s?s\\.?|ltd\\.?|sti\\.?|inc\\.?|llc|gmbh|corp\\.?|co\\.|holding|teknoloji|technolog(y|ies)|group|grup|san\\.|tic\\.|limited|sirketi|solutions|bilisim|danismanlik|enerji|lojistik|otomotiv|insaat|medya|ajans|agency|studio|labs?|ventures|capital|bank|bankasi|sigorta|elektronik|makina|makine|gida|tekstil|ilac|kimya)' + E);
const ADDRESS_RE = new RegExp(B + '(mah\\.?|mahallesi|cad\\.?|caddesi|cd\\.|sok\\.?|sk\\.?|sokak|sokagi|bulvari?|blv\\.?|plaza|blok|apt\\.?|daire|street|st\\.|avenue|ave\\.|road|rd\\.|floor|suite|turkiye|turkey|istanbul|ankara|izmir|bursa|antalya|kocaeli|konya|adana|gaziantep|mersin|eskisehir|kayseri)' + E + '|(?:^|[^a-z])(no|kat)\\s*[:.]?\\s*\\d|(?:^|\\D)\\d{5}(?=\\D|$)');
const isCompany = s => COMPANY_RE.test(fold(s));
const isAddress = s => ADDRESS_RE.test(fold(s));
const TITLE_WORDS_F = TITLE_WORDS.map(fold);
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const URL_RE = /\b((https?:\/\/)?(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|io|co|tr|com\.tr|net\.tr|org\.tr|gov\.tr|edu\.tr|biz|info|de|uk|eu|app|dev|ai)(\/[^\s]*)?)\b/i;
const LINKEDIN_RE = /(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/(in|company)\/[^\s,;]+/i;
const PHONE_RE = /(\+?\(?\d[\d\s().\-/]{7,}\d)/g;

function cleanLine(s) {
  return s.replace(/[|_~`•·»«©®™]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function digits(s) { return (s || '').replace(/\D/g, ''); }

function isMobile(num) {
  const d = digits(num);
  return /^(90)?0?5\d{9}$/.test(d);
}

function formatPhone(raw) {
  let s = raw.trim().replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  const d = s.replace(/\D/g, '');
  // Türkiye formatı: +90 5xx xxx xx xx
  let local = null;
  if (/^90\d{10}$/.test(d)) local = d.slice(2);
  else if (/^0\d{10}$/.test(d)) local = d.slice(1);
  else if (/^\d{10}$/.test(d) && /^[2-5]/.test(d)) local = d;
  if (local) return `+90 ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8)}`;
  return s;
}

function looksLikeName(line) {
  if (/\d|@|www|http|\.com/i.test(line)) return false;
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (isCompany(line) || isAddress(line)) return false;
  const words2 = fold(line).split(/[\s/&,|-]+/);
  if (TITLE_WORDS_F.some(w => words2.includes(w))) return false;
  // Her kelime büyük harfle başlamalı ve çoğunlukla harf olmalı
  return words.every(w => /^[A-ZÇĞİÖŞÜÂÎÛ][A-Za-zÇĞİÖŞÜçğıöşüâîû'’.-]*$/.test(w) && w.replace(/[^A-Za-zÇĞİÖŞÜçğıöşüâîû]/g, '').length >= 2);
}

function looksLikeTitle(line) {
  const words = fold(line).split(/[\s/&,|-]+/);
  return !/@|\d{3}/.test(line) && TITLE_WORDS_F.some(w => words.includes(w));
}

function titleCaseTR(s) {
  // "AHMET YILMAZ" -> "Ahmet Yılmaz"
  if (s !== s.toLocaleUpperCase('tr-TR')) return s;
  return s.toLocaleLowerCase('tr-TR').split(/\s+/)
    .map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1)).join(' ');
}

/**
 * text: OCR çıktısı; lines (opsiyonel): [{text, height}] — yazı boyutuna göre ad tahmini için.
 */
export function parseCardText(text, lines) {
  const c = emptyContact();
  let rows = (lines && lines.length ? lines : (text || '').split(/\n/).map(t => ({ text: t, height: 0 })))
    .map(l => ({ text: cleanLine(l.text || ''), height: l.height || 0 }))
    .filter(l => l.text.length > 1);

  const used = new Set();
  const all = rows.map(r => r.text).join('\n');

  // LinkedIn
  const li = all.match(LINKEDIN_RE);
  if (li) c.linkedin = li[0];

  // E-posta
  rows.forEach((r, i) => {
    const m = r.text.replace(/\s*@\s*/g, '@').match(EMAIL_RE);
    if (m && !c.email) { c.email = m[0].toLowerCase(); if (r.text.replace(m[0], '').replace(/e-?mail|e-?posta|[:\s]/gi, '').length < 3) used.add(i); }
  });

  // Telefonlar
  const phones = [];
  rows.forEach((r, i) => {
    if (EMAIL_RE.test(r.text) && !/\d{3}.*\d{3}/.test(r.text.replace(EMAIL_RE, ''))) return;
    const label = r.text.toLowerCase();
    const matches = r.text.match(PHONE_RE) || [];
    let any = false;
    for (const m of matches) {
      const d = digits(m);
      if (d.length < 10 || d.length > 13) continue;
      // posta kodu / tarih gibi şeyleri ele
      any = true;
      const hintMobile = /\b(m|mob|mobile|gsm|cep|cell)\b\.?/i.test(label);
      const hintWork = /\b(t|tel|phone|ofis|office|iş|work|santral)\b\.?/i.test(label) && !hintMobile;
      const hintFax = /\b(f|fax|faks)\b\.?/i.test(label);
      if (hintFax && !hintMobile) continue;
      phones.push({ num: formatPhone(m), mobile: hintMobile || (!hintWork && isMobile(m)) });
    }
    if (any) used.add(i);
  });
  for (const p of phones) {
    if (p.mobile && !c.phoneMobile) c.phoneMobile = p.num;
    else if (!p.mobile && !c.phoneWork) c.phoneWork = p.num;
  }
  if (!c.phoneMobile && phones.length && !phones.some(p => p.num === c.phoneWork)) c.phoneMobile = phones[0].num;

  // Web
  rows.forEach((r, i) => {
    if (c.web) return;
    const t = r.text.replace(EMAIL_RE, '');
    if (LINKEDIN_RE.test(t)) { used.add(i); return; }
    const m = t.match(URL_RE);
    if (m && /www\.|https?:|\.(com|tr|net|org|io)/i.test(m[0])) {
      c.web = m[0].replace(/[.,;]+$/, '').toLowerCase();
      if (t.replace(m[0], '').replace(/web|site|[:\s]/gi, '').length < 3) used.add(i);
    }
  });
  if (c.linkedin) rows.forEach((r, i) => { if (/linkedin/i.test(r.text)) used.add(i); });

  // Adres
  const addr = [];
  rows.forEach((r, i) => {
    if (used.has(i)) return;
    if (isAddress(r.text) && !looksLikeName(r.text)) { addr.push(r.text); used.add(i); }
  });
  if (addr.length) c.address = addr.join(', ');

  // Unvan
  rows.forEach((r, i) => {
    if (used.has(i) || c.title) return;
    if (looksLikeTitle(r.text) && !isCompany(r.text)) { c.title = r.text; used.add(i); }
  });

  // Şirket
  rows.forEach((r, i) => {
    if (used.has(i) || c.company) return;
    if (isCompany(r.text)) { c.company = r.text; used.add(i); }
  });

  // Ad soyad: isim gibi görünen satırlar arasında en büyük yazılı olan (yoksa ilki)
  const nameCands = rows.map((r, i) => ({ ...r, i })).filter(r => !used.has(r.i) && looksLikeName(r.text));
  if (nameCands.length) {
    nameCands.sort((a, b) => (b.height - a.height) || (a.i - b.i));
    const n = nameCands[0];
    Object.assign(c, splitName(titleCaseTR(n.text)));
    used.add(n.i);
  }

  // Şirket hâlâ yoksa: e-posta alan adından veya kalan büyük satırdan tahmin
  if (!c.company) {
    const rest = rows.map((r, i) => ({ ...r, i })).filter(r => !used.has(r.i) && !/\d{3}/.test(r.text) && r.text.length >= 3);
    if (rest.length && rest[0].text.split(/\s+/).length <= 5) { c.company = rest[0].text; used.add(rest[0].i); }
    else if (c.email) {
      const dom = c.email.split('@')[1] || '';
      const base = dom.split('.')[0];
      if (base && !/^(gmail|hotmail|outlook|yahoo|icloud|yandex|live|msn|me|mail|protonmail)$/.test(base)) {
        c.company = base.charAt(0).toLocaleUpperCase('tr-TR') + base.slice(1);
      }
    }
  }
  // Unvan yoksa adın hemen altındaki kullanılmamış kısa satır
  if (!c.title && nameCands.length) {
    const ni = nameCands[0].i;
    const next = rows[ni + 1];
    if (next && !used.has(ni + 1) && !/\d|@/.test(next.text) && next.text.split(/\s+/).length <= 6) {
      c.title = next.text; used.add(ni + 1);
    }
  }
  return c;
}
