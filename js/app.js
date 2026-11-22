// Kartvizit — ana uygulama
import { db, uid } from './db.js';
import {
  buildVCard, buildNote, fullName, formatDateTR, parseQRContent, parseVCards, emptyContact,
  splitName, normalizeUrl, linkedinUrl, buildICS, phoneKey, whatsappNumber
} from './vcard.js';
import { parseCardText } from './parse.js';

const APP_VERSION = '1.1.2';
// QR içinde Türkçe karakterler için UTF-8 kullan
if (window.qrcode) qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
const DAY = 86400000;
const DEFAULT_TAGS = ['Müşteri', 'Tedarikçi', 'İş ortağı', 'Aday'];
const PRIORITIES = { dusuk: 'Düşük', orta: 'Orta', yuksek: 'Yüksek' };
const DEFAULT_SUBJECT = '{etkinlik} — tanışmamız hakkında';
const DEFAULT_BODY = 'Merhaba {ad},\n\n{etkinlik}\'te tanışmak güzeldi. Konuştuğumuz konuları devam ettirmek isterim; uygun olduğunuz bir zamanda kısa bir görüşme ayarlayabilir miyiz?\n\nSevgiler,\n{benim_adim}';

const state = {
  profiles: [], contacts: [], events: [], settings: {},
  view: 'card', unlocked: false, hiddenAt: 0,
  filters: { q: '', event: '', tag: '', date: '', book: '' },
  pendingAfterUnlock: null,
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = k => state.settings[k];

// --------------------------------------------------------------
// Başlangıç
// --------------------------------------------------------------
async function init() {
  // Gizlilik: önceki oturumdan kalan geçici .vcf/.ics dosyalarını sil
  try { if ('caches' in window) caches.delete('kartvizit-files'); } catch { }
  const [profiles, contacts, events, settings] = await Promise.all(db.STORES.map(s => db.all(s)));
  state.profiles = profiles.sort((a, b) => a.createdAt - b.createdAt);
  state.contacts = contacts;
  state.events = events;
  state.settings = Object.fromEntries(settings.map(s => [s.key, s.value]));
  if (!S('firstRunAt')) await setSetting('firstRunAt', Date.now());
  if (S('autoAsk') === undefined) await setSetting('autoAsk', true);
  if (!S('addMethod')) await setSetting('addMethod', 'open');
  if (!S('tags')) await setSetting('tags', DEFAULT_TAGS);
  state.unlocked = !S('pinHash');
  bindGlobal();
  // Bekleyen takip varsa uygulama açılışında Kişiler'den başla (PIN varsa Kartım'da uyarı gösterilir)
  const due = dueFollowUps().length;
  go(due && state.unlocked ? 'contacts' : 'card');
  registerSW();
}

async function setSetting(k, v) { state.settings[k] = v; await db.setSetting(k, v); }

// --------------------------------------------------------------
// Yardımcılar
// --------------------------------------------------------------
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function eventById(id) { return state.events.find(e => e.id === id); }
function eventName(id) { return eventById(id)?.name || ''; }
function activeEvent() { return eventById(S('activeEventId')); }
function activeProfile() { return state.profiles.find(p => p.id === S('activeProfileId')) || state.profiles[0]; }
function initials(c) {
  const a = (c.firstName || c.company || '?').trim()[0] || '?';
  const b = (c.lastName || '').trim()[0] || '';
  return (a + b).toLocaleUpperCase('tr-TR');
}
function avatar(c, cls = '') {
  const src = c.photo || c.cardThumb;
  return src ? `<img class="avatar ${cls}" src="${esc(src)}" alt="">` : `<div class="avatar ${cls}">${esc(initials(c))}</div>`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function endOfToday() { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); }
function dueFollowUps() {
  const e = endOfToday();
  return state.contacts.filter(c => c.followUpAt && !c.followUpDone && c.followUpAt <= e)
    .sort((a, b) => a.followUpAt - b.followUpAt);
}
function displayName(c) { return fullName(c) || c.company || c.email || c.phoneMobile || 'İsimsiz'; }
function safeFile(s) {
  return (s || 'kisi').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'kisi';
}
function relDays(ts) {
  const d = Math.round((new Date(ts).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / DAY);
  if (d === 0) return 'bugün';
  if (d === 1) return 'yarın';
  if (d === -1) return 'dün';
  return d < 0 ? `${-d} gün gecikti` : `${d} gün sonra`;
}
function backupDue() {
  if (!state.contacts.length) return false;
  const last = S('lastBackupAt') || S('firstRunAt') || Date.now();
  return Date.now() - last > 14 * DAY;
}
function isStandalone() { return navigator.standalone === true || matchMedia('(display-mode: standalone)').matches; }

// --------------------------------------------------------------
// Görüntü işleme
// --------------------------------------------------------------
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
    img.onerror = () => reject(new Error('Görsel açılamadı'));
    img.src = url;
  });
}
function drawScaled(img, maxSide) {
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.min(1, maxSide / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function toJpeg(img, maxSide, q = 0.8) { return drawScaled(img, maxSide).toDataURL('image/jpeg', q); }
function dataUrlToImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// --------------------------------------------------------------
// Dosya açma / paylaşma (iPhone Kişiler, Takvim, Dosyalar)
// --------------------------------------------------------------
function canShareFiles(file) {
  try { return !!(navigator.canShare && navigator.canShare({ files: [file] })); } catch { return false; }
}

// Paylaşım menüsü: kullanıcı dokunuşu içinde senkron çağrılmalı.
function shareFile(text, filename, type, title) {
  const file = new File([text], filename, { type });
  if (!canShareFiles(file)) return null;
  return navigator.share({ files: [file], title }).then(() => true).catch(err => {
    if (err && err.name === 'AbortError') return false;
    throw err;
  });
}

// Dosyayı Safari'nin kendi önizlemesiyle açar (vCard → "Yeni Kişi Oluştur", ics → "Takvime Ekle").
// Service worker hazırsa dosya, uygulamanın kendi adresinden (gerçek bir dosya gibi) sunulur;
// bu yöntem ana ekran uygulamasında blob/data adreslerinden daha güvenilirdir.
async function openFile(text, filename, type) {
  // Gizlilik: adreste kişi adı yer almaz, sadece rastgele bir kod kullanılır
  const ext = (filename.match(/\.[a-z]+$/i) || [''])[0];
  const name = `${crypto.getRandomValues(new Uint32Array(2)).join('')}${ext}`;
  const url = new URL(`files/${encodeURIComponent(name)}`, location.href).href;
  try {
    if ('caches' in window && navigator.serviceWorker?.controller) {
      const cache = await caches.open('kartvizit-files');
      // eski geçici dosyaları temizle
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - 10)).map(k => cache.delete(k)));
      await cache.put(url, new Response(new Blob([text], { type: `${type}; charset=utf-8` }), {
        headers: { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }
      }));
      location.href = url;
      // Gizlilik: geçici dosya 2 dakika sonra cihazdan da silinir
      setTimeout(() => cache.delete(url).catch(() => { }), 120000);
      return;
    }
  } catch (e) { console.warn(e); }
  // Yedek yöntem: data URL
  location.href = `data:${type};charset=utf-8,${encodeURIComponent(text)}`;
}

function downloadFile(text, filename, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

// Kişiler'e ekleme: ayara göre doğrudan aç ya da paylaşım menüsü.
function sendToContacts(vcf, filename, { onDone, forceMethod } = {}) {
  const method = forceMethod || S('addMethod') || 'open';
  if (method === 'share') {
    const p = shareFile(vcf, filename, 'text/vcard', 'Kişi');
    if (p) {
      p.then(ok => { if (ok && onDone) onDone(); }).catch(() => { toast('Paylaşım açılamadı, doğrudan açılıyor'); openFile(vcf, filename, 'text/vcard'); onDone && setTimeout(onDone, 800); });
      return;
    }
  }
  openFile(vcf, filename, 'text/vcard');
  if (onDone) setTimeout(onDone, 900);
}

function contactVCard(c) {
  return buildVCard(c.photo || c.cardThumb ? { ...c, photo: c.photo || c.cardThumb } : c, {
    note: buildNote(c, eventName(c.eventId))
  });
}

function addContactsToPhone(list, { retry } = {}) {
  if (!list.length) { toast('Eklenecek yeni kişi yok'); return; }
  const vcf = list.map(contactVCard).join('');
  const filename = list.length === 1 ? `${safeFile(displayName(list[0]))}.vcf` : `kisiler-${list.length}.vcf`;
  sendToContacts(vcf, filename, {
    forceMethod: retry,
    onDone: () => confirmAdded(list)
  });
}

function confirmAdded(list) {
  const one = list.length === 1;
  dialog({
    title: one ? 'Kişiler\'e kaydedildi mi?' : `${list.length} kişi Kişiler'e kaydedildi mi?`,
    message: one
      ? '1) iPhone "kişi kartı indirilsin mi?" diye sorarsa "Allow / İzin Ver"e dokunun.\n2) Açılan kişi ekranında "Yeni Kişi Oluştur"a dokunun.\n3) Sonra burada Evet deyin; kişi "Rehberde ✓" olarak işaretlenir.'
      : '1) iPhone sorarsa "Allow / İzin Ver"e dokunun.\n2) "Tüm N Kişiyi Ekle"ye dokunun.\n3) Sonra burada Evet deyin; bu kişiler bir daha toplu eklemeye dahil edilmez.'.replace('N', list.length),
    buttons: [
      { label: 'Evet, Rehberde ✓', style: 'ok', run: () => markInContacts(list) },
      { label: 'Kişi ekranı açılmadı — paylaşım menüsüyle dene', run: () => addContactsToPhone(list, { retry: S('addMethod') === 'share' ? 'open' : 'share' }) },
      { label: 'Hayır', style: 'ghost' }
    ]
  });
}

async function markInContacts(list) {
  const now = Date.now();
  for (const c of list) { c.inContacts = true; c.inContactsAt = now; }
  await db.putMany('contacts', list);
  toast(list.length === 1 ? 'Rehberde ✓' : `${list.length} kişi Rehberde ✓`);
  refresh();
}

// --------------------------------------------------------------
// Katmanlar (sheet, dialog)
// --------------------------------------------------------------
function openSheet({ title, body, foot = '', short = false, onClose, id = '' }) {
  const el = document.createElement('div');
  el.className = 'layer';
  el.dataset.sheet = id;
  el.innerHTML = `<div class="scrim" data-act="close-layer"></div>
    <section class="sheet ${short ? 'short' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="close-x" data-act="close-layer" aria-label="Kapat">✕</button></div>
      <div class="sheet-body">${body}</div>
      ${foot ? `<div class="sheet-foot">${foot}</div>` : ''}
    </section>`;
  el._onClose = onClose;
  $('#layers').appendChild(el);
  return el;
}
function closeLayer(el) {
  el = el || $('#layers').lastElementChild;
  if (!el) return;
  el._onClose && el._onClose();
  el.remove();
}
function closeAllLayers() { while ($('#layers').lastElementChild) closeLayer(); }

/** buttons: [{label, style, run}] — run, dokunuş anında senkron çalışır (paylaşım menüsü için gerekli). */
function dialog({ title, message = '', html = '', buttons = [{ label: 'Tamam', style: 'primary' }] }) {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'layer dialog-wrap';
    el.innerHTML = `<div class="scrim"></div><div class="dialog" role="alertdialog" aria-modal="true">
      <h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}${html}
      <div class="stack">${buttons.map((b, i) => `<button class="btn ${b.style || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('button[data-i]');
      if (!b) return;
      const btn = buttons[+b.dataset.i];
      el.remove();
      try { btn.run && btn.run(el); } finally { resolve(btn.value ?? +b.dataset.i); }
    });
    $('#layers').appendChild(el);
  });
}
const confirmDlg = (title, message, okLabel = 'Evet', danger = false) =>
  dialog({ title, message, buttons: [{ label: okLabel, style: danger ? 'danger' : 'primary', value: true }, { label: 'Vazgeç', value: false }] });

// --------------------------------------------------------------
// Gezinme
// --------------------------------------------------------------
function go(view) {
  if (view !== 'card' && !state.unlocked) { askPin(() => go(view)); return; }
  state.view = view;
  $$('.tabbar .tab[data-view]').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  render();
  window.scrollTo(0, 0);
}
function refresh() {
  render();
  // açık kişi detayını yenile
  const det = $('#layers [data-sheet^="contact:"]');
  if (det) { const id = det.dataset.sheet.split(':')[1]; closeLayer(det); if (state.contacts.find(c => c.id === id)) openContact(id); }
}

function render() {
  const titles = { card: 'Kartım', contacts: 'Kişiler', events: 'Etkinlikler', settings: 'Ayarlar' };
  $('#topTitle').textContent = titles[state.view] || 'Kartvizit';
  const ev = activeEvent();
  const pill = $('#eventPill');
  pill.classList.toggle('hidden', !ev);
  if (ev) pill.textContent = `● ${ev.name}`;
  const fn = { card: viewCard, contacts: viewContacts, events: viewEvents, settings: viewSettings }[state.view];
  $('#main').innerHTML = fn();
}

// --------------------------------------------------------------
// GÖRÜNÜM: Kartım
// --------------------------------------------------------------
function viewCard() {
  const p = activeProfile();
  const due = dueFollowUps().length;
  let banners = '';
  if (window._updateReady) banners += `<button class="banner info" data-act="apply-update"><span class="bi">⬆️</span><span>Yeni sürüm hazır. Güncellemek için dokunun.</span></button>`;
  if (due) banners += `<button class="banner warn" data-act="go" data-view="contacts"><span class="bi">⏰</span><span><b>${due}</b> kişiye dönüş yapma zamanı geldi.</span><span>›</span></button>`;
  if (backupDue()) banners += `<button class="banner warn" data-act="backup"><span class="bi">💾</span><span>Son yedekten bu yana 14 günden fazla geçti. Şimdi yedek alın.</span><span>›</span></button>`;
  if (!isStandalone() && /iPhone|iPad/.test(navigator.userAgent) && !S('installHintClosed')) {
    banners += `<div class="banner info"><span class="bi">📲</span><span>Ana ekrana eklemek için Safari'de <b>Paylaş</b> ⬆️ → <b>Ana Ekrana Ekle</b>'ye dokunun.</span><button class="close-x" data-act="close-install-hint" aria-label="Kapat">✕</button></div>`;
  }
  if (!p) {
    return banners + `<div class="card center stack" style="padding:28px 18px">
      <div style="font-size:56px">🪪</div>
      <h2 style="margin:0">Kartvizitinizi oluşturun</h2>
      <p class="muted">Bilgileriniz sadece bu telefonda saklanır. İnternete veya bir sunucuya gönderilmez.</p>
      <button class="btn primary big" data-act="edit-profile">Profil oluştur</button>
    </div>`;
  }
  const chips = state.profiles.map(x => `<button class="chip ${x.id === p.id ? 'on' : ''}" data-act="switch-profile" data-id="${x.id}">${esc(x.label || 'Profil')}</button>`).join('')
    + `<button class="chip" data-act="edit-profile" data-new="1">+ Profil</button>`;
  const info = [
    ['Cep', p.phoneMobile], ['İş', p.phoneWork], ['E-posta', p.email], ['Web', p.web], ['LinkedIn', p.linkedin], ['Adres', p.address]
  ].filter(x => x[1]).map(([k, v]) => `<li><b>${k}</b><span>${esc(v)}</span></li>`).join('');
  return `${banners}
    <div class="chips">${chips}</div>
    <div class="card">
      <div class="bizcard">${avatar(p)}<div><h2>${esc(fullName(p) || 'Adınız')}</h2>
        <p>${esc([p.title, p.company].filter(Boolean).join(' · '))}</p></div></div>
      ${info ? `<ul class="kv">${info}</ul>` : ''}
    </div>
    <div class="stack">
      <button class="btn primary huge" data-act="show-qr">▦ QR Kodu Göster<small>Karşı taraf kamerasıyla okutup rehberine kaydeder</small></button>
      <div class="grid2">
        <button class="btn big" data-act="share-me">⬆️ Paylaş</button>
        <button class="btn big" data-act="edit-profile" data-id="${p.id}">✏️ Düzenle</button>
      </div>
    </div>
    <p class="muted small center" style="margin-top:18px">Paylaş: AirDrop, WhatsApp, Mesajlar veya e-posta ile .vcf kartvizit gönderir.</p>`;
}

function profileQRText(p) {
  // QR'a fotoğraf ve özel notlar eklenmez (okunabilir boyut + gizlilik)
  return buildVCard(shareableFields(p), { photo: false, social: false });
}

// Başkasıyla paylaşılacak kartta sadece kartvizit bilgileri bulunur;
// kendi notlarınız, etiketleriniz, etkinlik ve öncelik bilgisi asla eklenmez.
function shareableFields(c) {
  const f = ['firstName', 'lastName', 'title', 'company', 'phoneMobile', 'phoneWork', 'email', 'web', 'linkedin', 'address'];
  const o = {};
  for (const k of f) o[k] = c[k] || '';
  return o;
}
function shareableVCard(c) {
  return buildVCard({ ...shareableFields(c), photo: c.photo || '' }, {});
}
function contactShareText(c) {
  const lines = [
    displayName(c),
    [c.title, c.company].filter(Boolean).join(' · '),
    c.phoneMobile && `Cep: ${c.phoneMobile}`,
    c.phoneWork && `İş: ${c.phoneWork}`,
    c.email && `E-posta: ${c.email}`,
    c.web && `Web: ${c.web}`,
    c.linkedin && `LinkedIn: ${linkedinUrl(c.linkedin)}`,
    c.address && `Adres: ${c.address}`,
  ].filter(Boolean);
  return lines.join('\n');
}

function qrSvg(text) {
  const qr = qrcode(0, text.length > 900 ? 'L' : 'M');
  qr.addData(text, 'Byte');
  qr.make();
  const n = qr.getModuleCount(), m = 4, size = n + m * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m},${r + m}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR kod"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

let wakeLock = null;
async function showQR(person, label = '') {
  const p = person || activeProfile();
  if (!p) return;
  const el = document.createElement('div');
  el.className = 'qr-full';
  el.dataset.act = 'close-qr';
  el.innerHTML = `<div class="hint">☀️ Okutmayı kolaylaştırmak için ekran parlaklığını artırın<br><span style="font-size:13px">(Sağ üstten aşağı kaydırın → parlaklığı sonuna kadar açın)</span></div>
    <div class="qr" id="qrBox">${qrSvg(profileQRText(p))}</div>
    ${label ? `<div class="close-hint">${esc(label)}</div>` : ''}
    <div class="nm">${esc(fullName(p) || p.company || '')}</div>
    <div class="muted">${esc([p.title, p.company].filter(Boolean).join(' · '))}</div>
    <div class="close-hint">Kapatmak için dokunun</div>`;
  document.body.appendChild(el);
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { }
}
function closeQR() {
  $('.qr-full')?.remove();
  try { wakeLock && wakeLock.release(); } catch { }
  wakeLock = null;
}

function shareMe() {
  const p = activeProfile();
  if (!p) return;
  const vcf = buildVCard(p, {});
  const filename = `${safeFile(fullName(p))}.vcf`;
  const r = shareFile(vcf, filename, 'text/vcard', fullName(p));
  if (r) { r.catch(() => toast('Paylaşılamadı')); return; }
  // Paylaşım menüsü yoksa (ör. bilgisayar) dosyayı indir
  downloadFile(vcf, filename, 'text/vcard');
}

function editProfile(id, isNew) {
  const p = (!isNew && state.profiles.find(x => x.id === id)) || { id: uid(), label: state.profiles.length ? 'Kişisel' : 'İş', createdAt: Date.now() };
  const f = (name, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input class="input" name="${name}" type="${type}" value="${esc(p[name] || '')}" ${extra}></label>`;
  const el = openSheet({
    title: p.firstName ? 'Profili düzenle' : 'Yeni profil',
    id: 'profile',
    body: `<form id="profileForm" autocomplete="on">
      ${f('label', 'Profil adı (ör. İş, Kişisel)')}
      <div class="grid2">${f('firstName', 'Ad', 'text', 'autocomplete="given-name"')}${f('lastName', 'Soyad', 'text', 'autocomplete="family-name"')}</div>
      ${f('title', 'Unvan', 'text', 'autocomplete="organization-title"')}
      ${f('company', 'Şirket', 'text', 'autocomplete="organization"')}
      ${f('phoneMobile', 'Cep telefonu', 'tel', 'autocomplete="tel"')}
      ${f('phoneWork', 'İş telefonu', 'tel')}
      ${f('email', 'E-posta', 'email', 'autocomplete="email" autocapitalize="off"')}
      ${f('web', 'Web sitesi', 'url', 'autocapitalize="off" placeholder="ornek.com"')}
      ${f('linkedin', 'LinkedIn', 'url', 'autocapitalize="off" placeholder="linkedin.com/in/kullaniciadi"')}
      <label class="field"><span>Adres</span><textarea class="input" name="address" rows="2">${esc(p.address || '')}</textarea></label>
      <div class="field"><span>Fotoğraf / logo</span>
        <div class="row" style="align-items:center">
          <div id="profPhotoPrev" style="flex:0 0 auto">${avatar(p)}</div>
          <button type="button" class="btn sm" data-act="pick-image" data-target="profile">Seç</button>
          <button type="button" class="btn sm danger" data-act="remove-image" data-target="profile">Kaldır</button>
        </div></div>
      ${state.profiles.find(x => x.id === p.id) ? `<button type="button" class="btn danger" data-act="delete-profile" data-id="${p.id}" style="margin-top:20px">Bu profili sil</button>` : ''}
    </form>`,
    foot: `<button class="btn primary" data-act="save-profile">Kaydet</button>`
  });
  el._data = { ...p };
}

async function saveProfile() {
  const el = $('#layers [data-sheet="profile"]');
  const form = $('#profileForm', el);
  const data = { ...el._data, ...Object.fromEntries(new FormData(form)) };
  for (const k of Object.keys(data)) if (typeof data[k] === 'string') data[k] = data[k].trim();
  if (!data.firstName && !data.company) { toast('En az ad veya şirket girin'); return; }
  data.label = data.label || 'Profil';
  data.updatedAt = Date.now();
  await db.put('profiles', data);
  const i = state.profiles.findIndex(x => x.id === data.id);
  if (i >= 0) state.profiles[i] = data; else state.profiles.push(data);
  await setSetting('activeProfileId', data.id);
  closeLayer(el);
  toast('Profil kaydedildi');
  render();
}

// --------------------------------------------------------------
// GÖRÜNÜM: Kişiler
// --------------------------------------------------------------
function filteredContacts() {
  const f = state.filters;
  const q = f.q.trim().toLocaleLowerCase('tr-TR');
  let list = state.contacts.slice();
  if (f.event) list = list.filter(c => f.event === '_none' ? !c.eventId : c.eventId === f.event);
  if (f.tag) list = list.filter(c => (c.tags || []).includes(f.tag));
  if (f.book) list = list.filter(c => f.book === 'in' ? c.inContacts : !c.inContacts);
  if (f.date) {
    const now = Date.now();
    const lim = { today: new Date().setHours(0, 0, 0, 0), '7': now - 7 * DAY, '30': now - 30 * DAY, '90': now - 90 * DAY }[f.date];
    list = list.filter(c => c.createdAt >= lim);
  }
  if (q) {
    list = list.filter(c => [c.firstName, c.lastName, fullName(c), c.company, c.title, c.email, c.phoneMobile, c.phoneWork,
      c.note, (c.tags || []).join(' '), eventName(c.eventId)].join(' ').toLocaleLowerCase('tr-TR').includes(q));
  }
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

function contactRow(c, extra = '') {
  const sub = [c.title, c.company].filter(Boolean).join(' · ') || c.email || c.phoneMobile || '';
  const ev = eventName(c.eventId);
  return `<li><button class="item" data-act="open-contact" data-id="${c.id}">${avatar(c, 'sm')}
    <div class="t"><div class="n">${esc(displayName(c))}</div><div class="s">${esc(sub)}</div>
    ${ev || extra ? `<div class="s">${extra || ('📅 ' + esc(ev))}</div>` : ''}</div>
    <div class="r">${c.inContacts ? '<span class="badge ok">Rehberde ✓</span>' : ''}
      ${c.priority === 'yuksek' ? '<span class="badge danger">Öncelikli</span>' : ''}
      <span class="muted small">${formatDateTR(c.createdAt).slice(0, 5)}</span></div></button></li>`;
}

function viewContacts() {
  const f = state.filters;
  const due = dueFollowUps();
  const list = filteredContacts();
  const tags = S('tags') || [];
  const evOpts = state.events.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(e => `<option value="${e.id}" ${f.event === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const anyFilter = f.q || f.event || f.tag || f.date || f.book;
  const notIn = list.filter(c => !c.inContacts);
  let html = '';
  if (backupDue()) html += `<button class="banner warn" data-act="backup"><span class="bi">💾</span><span>14 günden fazla süredir yedek alınmadı.</span><span>›</span></button>`;
  if (due.length) {
    html += `<div class="section-title">⏰ Bekleyen takipler (${due.length})</div><ul class="list">${due.map(c => contactRow(c, `⏰ Dönüş: ${relDays(c.followUpAt)}`)).join('')}</ul>`;
  }
  html += `<div class="search"><input class="input" type="search" id="q" placeholder="Ad, şirket, etiket, etkinlik, not ara…" value="${esc(f.q)}" enterkeyhint="search">
    <div class="filters">
      <select class="input" data-filter="event"><option value="">Tüm etkinlikler</option><option value="_none" ${f.event === '_none' ? 'selected' : ''}>Etkinliksiz</option>${evOpts}</select>
      <select class="input" data-filter="tag"><option value="">Tüm etiketler</option>${tags.map(t => `<option ${f.tag === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select class="input" data-filter="date"><option value="">Tüm tarihler</option>
        <option value="today" ${f.date === 'today' ? 'selected' : ''}>Bugün</option><option value="7" ${f.date === '7' ? 'selected' : ''}>Son 7 gün</option>
        <option value="30" ${f.date === '30' ? 'selected' : ''}>Son 30 gün</option><option value="90" ${f.date === '90' ? 'selected' : ''}>Son 90 gün</option></select>
      <select class="input" data-filter="book"><option value="">Rehber: hepsi</option>
        <option value="in" ${f.book === 'in' ? 'selected' : ''}>Rehberde ✓</option><option value="out" ${f.book === 'out' ? 'selected' : ''}>Rehberde değil</option></select>
    </div></div>`;
  html += `<div class="row" style="margin:10px 4px"><span class="muted small">${list.length} kişi${anyFilter ? ' (filtreli)' : ''}</span>
    ${anyFilter ? '<button class="btn sm ghost" style="flex:0" data-act="clear-filters">Temizle</button>' : ''}</div>`;
  if (anyFilter && notIn.length) {
    html += `<button class="btn" data-act="bulk-filtered">📇 Listelenen ${notIn.length} kişiyi Kişiler'e ekle</button><div style="height:10px"></div>`;
  }
  html += list.length ? `<ul class="list" id="contactList">${list.map(c => contactRow(c)).join('')}</ul>`
    : `<div class="empty">${state.contacts.length ? 'Sonuç yok.' : 'Henüz kişi yok.<br>Aşağıdaki <b>+</b> ile QR okutun, kartvizit fotoğrafı çekin veya hızlıca ekleyin.'}</div>`;
  return html;
}

// --------------------------------------------------------------
// Kişi detayı
// --------------------------------------------------------------
function openContact(id) {
  const c = state.contacts.find(x => x.id === id);
  if (!c) return;
  const ev = eventById(c.eventId);
  const tel = c.phoneMobile || c.phoneWork;
  const wa = whatsappNumber(c.phoneMobile || c.phoneWork);
  const mailOk = /^[^\s@?&#<>"']+@[^\s@?&#<>"']+$/.test(c.email || '');
  const li = linkedinUrl(c.linkedin);
  const info = [
    ['Cep', c.phoneMobile && `<a href="tel:${esc(c.phoneMobile.replace(/[^\d+]/g, ''))}">${esc(c.phoneMobile)}</a>`],
    ['İş tel.', c.phoneWork && `<a href="tel:${esc(c.phoneWork.replace(/[^\d+]/g, ''))}">${esc(c.phoneWork)}</a>`],
    ['E-posta', c.email && (mailOk ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : esc(c.email))],
    ['Web', c.web && (normalizeUrl(c.web) ? `<a href="${esc(normalizeUrl(c.web))}" target="_blank" rel="noopener noreferrer">${esc(c.web)}</a>` : esc(c.web))],
    ['LinkedIn', c.linkedin && (linkedinUrl(c.linkedin) ? `<a href="${esc(linkedinUrl(c.linkedin))}" target="_blank" rel="noopener noreferrer">${esc(c.linkedin)}</a>` : esc(c.linkedin))],
    ['Adres', c.address && esc(c.address)],
    ['Etkinlik', ev ? esc(ev.name) : ''],
    ['Tarih', esc(formatDateTR(c.createdAt))],
    ['Etiketler', (c.tags || []).map(t => `<span class="badge primary">${esc(t)}</span>`).join(' ')],
    ['Öncelik', c.priority ? esc(PRIORITIES[c.priority]) : ''],
    ['Not', c.note && esc(c.note).replace(/\n/g, '<br>')],
  ].filter(x => x[1]).map(([k, v]) => `<li><b>${k}</b><span>${v}</span></li>`).join('');

  const fu = c.followUpAt ? `<div class="card">
      <div class="row"><div><b>⏰ Takip: ${esc(formatDateTR(c.followUpAt))}</b><div class="muted small">${c.followUpDone ? 'Tamamlandı ✓' : esc(relDays(c.followUpAt))}</div></div></div>
      <div class="grid2" style="margin-top:10px">
        <button class="btn sm" style="width:100%" data-act="ics" data-id="${c.id}">📅 Takvime ekle</button>
        <button class="btn sm ${c.followUpDone ? '' : 'ok'}" style="width:100%" data-act="toggle-fu" data-id="${c.id}">${c.followUpDone ? 'Geri al' : '✓ Dönüş yapıldı'}</button>
      </div></div>`
    : `<div class="card"><b>⏰ Takip hatırlatması</b><div class="chips wrap" style="margin-top:8px">${[1, 3, 7, 14, 30].map(d => `<button class="chip" data-act="set-fu" data-id="${c.id}" data-days="${d}">${d} gün sonra</button>`).join('')}</div></div>`;

  openSheet({
    title: displayName(c),
    id: `contact:${c.id}`,
    body: `<div class="bizcard" style="margin:6px 0 10px">${avatar(c)}<div><h2>${esc(displayName(c))}</h2><p>${esc([c.title, c.company].filter(Boolean).join(' · '))}</p></div></div>
      ${c.inContacts
        ? `<div class="banner ok"><span class="bi">✓</span><span><b>Rehberde ✓</b> — iPhone Kişiler'e eklendi.</span><button class="btn sm ghost" style="flex:0" data-act="to-phone" data-id="${c.id}">Tekrar</button></div>`
        : `<button class="btn ok big" data-act="to-phone" data-id="${c.id}">📇 iPhone Kişiler'e ekle</button>`}
      <div class="actions">
        <a class="action" href="${tel ? 'tel:' + esc(tel.replace(/[^\d+]/g, '')) : '#'}" aria-disabled="${!tel}"><span class="ai">📞</span>Ara</a>
        <a class="action" href="${wa ? 'https://wa.me/' + esc(wa) : '#'}" target="_blank" rel="noopener noreferrer" aria-disabled="${!wa}"><span class="ai">💬</span>WhatsApp</a>
        <a class="action" href="${mailOk ? 'mailto:' + esc(c.email) : '#'}" aria-disabled="${!mailOk}"><span class="ai">✉️</span>E-posta</a>
        <a class="action" href="${li ? esc(li) : '#'}" target="_blank" rel="noopener noreferrer" aria-disabled="${!li}"><span class="ai">in</span>LinkedIn</a>
      </div>
      <button class="btn" data-act="followup-mail" data-id="${c.id}" ${mailOk ? '' : 'disabled'}>✉️ Takip e-postası hazırla</button>
      ${fu}
      <div class="card"><ul class="kv" style="margin:0">${info}</ul></div>
      ${c.cardImage ? `<div class="section-title">Kartvizit fotoğrafı</div><img class="img-prev" src="${esc(c.cardImage)}" alt="Kartvizit">` : ''}
      <div class="section-title">Bu kişiyi başkasıyla paylaş</div>
      <div class="card stack">
        <button class="btn primary" data-act="qr-contact" data-id="${c.id}">▦ QR kod olarak göster</button>
        <button class="btn" data-act="share-contact" data-id="${c.id}">💬 WhatsApp / AirDrop / Mesajlar (vCard)</button>
        <button class="btn" data-act="wa-text-contact" data-id="${c.id}">💬 WhatsApp'ta metin olarak gönder</button>
        <p class="muted small" style="margin:0">Paylaşılan kartta sadece iletişim bilgileri bulunur. Notlarınız, etiketler, öncelik ve etkinlik bilgisi gönderilmez.</p>
      </div>
      <button class="btn" style="margin-top:10px" data-act="edit-contact" data-id="${c.id}">✏️ Düzenle</button>
      <button class="btn danger" style="margin-top:10px" data-act="delete-contact" data-id="${c.id}">Kişiyi sil</button>`
  });
}

function fillTemplate(tpl, c) {
  const me = activeProfile();
  return tpl.replace(/\{ad\}/g, c.firstName || displayName(c))
    .replace(/\{soyad\}/g, c.lastName || '')
    .replace(/\{sirket\}|\{şirket\}/g, c.company || '')
    .replace(/\{etkinlik\}/g, eventName(c.eventId) || 'etkinlik')
    .replace(/\{benim_adim\}|\{benim_adım\}/g, me ? fullName(me) : '');
}
function followUpMail(c) {
  const subject = fillTemplate(S('emailSubject') || DEFAULT_SUBJECT, c);
  const body = fillTemplate(S('emailBody') || DEFAULT_BODY, c);
  location.href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function followUpICS(c) {
  const d = new Date(c.followUpAt);
  d.setHours(10, 0, 0, 0);
  const ev = eventName(c.eventId);
  const desc = [
    `${displayName(c)}${c.company ? ' (' + c.company + ')' : ''} ile takip.`,
    ev ? `Tanışma: ${ev}, ${formatDateTR(c.createdAt)}` : '',
    c.phoneMobile ? `Tel: ${c.phoneMobile}` : '', c.email ? `E-posta: ${c.email}` : '',
    c.note ? `Not: ${c.note}` : ''
  ].filter(Boolean).join('\n');
  const ics = buildICS({ uid: c.id + '-' + c.followUpAt, title: `Dönüş yap: ${displayName(c)}`, description: desc, start: d });
  openFile(ics, `takip-${safeFile(displayName(c))}.ics`, 'text/calendar');
}

// --------------------------------------------------------------
// Kişi ekleme akışları
// --------------------------------------------------------------
function addMenu() {
  if (!state.unlocked) { askPin(addMenu); return; }
  const ev = activeEvent();
  openSheet({
    title: 'Kişi ekle', short: true, id: 'addmenu',
    body: `${ev ? `<div class="banner ok"><span class="bi">📅</span><span>Kaydedilenler <b>${esc(ev.name)}</b> etkinliğine bağlanacak.</span></div>`
      : `<button class="banner info" data-act="go-events"><span class="bi">📅</span><span>Aktif etkinlik yok. Seçmek için dokunun.</span><span>›</span></button>`}
      <div class="stack" style="padding-bottom:calc(env(safe-area-inset-bottom) + 10px)">
        <button class="btn primary huge" data-act="scan-qr">▦ QR Okut<small>vCard, MeCard, LinkedIn, web linki</small></button>
        <button class="btn huge" data-act="scan-card">📷 Kartvizit Fotoğrafı<small>Metni otomatik okur (Türkçe/İngilizce)</small></button>
        <button class="btn huge" data-act="quick-add">⚡ Hızlı Giriş<small>Ad + telefon veya e-posta</small></button>
      </div>`
  });
}

function contactForm(c, { title = 'Yeni kişi', ocrText = '', quick = false } = {}) {
  const isEdit = !!state.contacts.find(x => x.id === c.id);
  const tags = S('tags') || [];
  const allTags = [...new Set([...tags, ...(c.tags || [])])];
  const evOpts = state.events.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(e => `<option value="${e.id}" ${c.eventId === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const f = (name, label, type = 'text', extra = '') => `<label class="field"><span>${label}</span><input class="input" name="${name}" type="${type}" value="${esc(c[name] || '')}" ${extra}></label>`;
  const moreOpen = !quick || c.title || c.company || c.web || c.linkedin || c.address || c.phoneWork;
  const el = openSheet({
    title, id: 'cform',
    body: `<form id="contactForm" autocomplete="off">
      ${c.cardImage ? `<img class="img-prev" src="${esc(c.cardImage)}" alt="Kartvizit fotoğrafı">` : ''}
      ${ocrText ? `<div class="banner info"><span class="bi">🔎</span><span>Alanlar kartvizitten tahmin edildi. Kaydetmeden önce kontrol edin.</span></div>` : ''}
      <div class="grid2">${f('firstName', 'Ad', 'text', 'autocapitalize="words" enterkeyhint="next"')}${f('lastName', 'Soyad', 'text', 'autocapitalize="words"')}</div>
      ${f('phoneMobile', 'Cep telefonu', 'tel', 'inputmode="tel"')}
      ${f('email', 'E-posta', 'email', 'autocapitalize="off" inputmode="email"')}
      <details class="more" ${moreOpen ? 'open' : ''}><summary>＋ Diğer alanlar (unvan, şirket, web…)</summary>
        ${f('title', 'Unvan')}
        ${f('company', 'Şirket')}
        ${f('phoneWork', 'İş telefonu', 'tel', 'inputmode="tel"')}
        ${f('web', 'Web sitesi', 'url', 'autocapitalize="off"')}
        ${f('linkedin', 'LinkedIn', 'url', 'autocapitalize="off"')}
        <label class="field"><span>Adres</span><textarea class="input" name="address" rows="2">${esc(c.address || '')}</textarea></label>
        <div class="field"><span>Kişi fotoğrafı</span><div class="row">
          <div id="cPhotoPrev" style="flex:0 0 auto">${avatar(c)}</div>
          <button type="button" class="btn sm" data-act="pick-image" data-target="contact">Seç</button>
          <button type="button" class="btn sm danger" data-act="remove-image" data-target="contact">Kaldır</button></div></div>
      </details>
      <div class="section-title">Etkinlik ve takip</div>
      <label class="field"><span>Tanışılan etkinlik</span><select class="input" name="eventId"><option value="">— Yok —</option>${evOpts}</select></label>
      <div class="field"><span>Etiketler</span><div class="chips wrap" id="tagChips">
        ${allTags.map(t => `<button type="button" class="chip ${(c.tags || []).includes(t) ? 'on' : ''}" data-act="toggle-tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
        <button type="button" class="chip" data-act="new-tag">+ Yeni</button></div></div>
      <div class="field"><span>Öncelik</span><div class="seg" id="prioSeg">
        ${Object.entries(PRIORITIES).map(([k, v]) => `<button type="button" data-act="set-prio" data-v="${k}" class="${(c.priority || 'orta') === k ? 'on' : ''}">${v}</button>`).join('')}</div></div>
      <div class="field"><span>Takip hatırlatması</span><div class="seg" id="fuSeg">
        ${[['0', 'Yok'], ['1', '1 gün'], ['3', '3 gün'], ['7', '7 gün'], ['14', '14 gün']].map(([k, v]) => `<button type="button" data-act="set-fu-form" data-v="${k}" class="${String(c._fuDays ?? 0) === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        ${c.followUpAt ? `<div class="muted small" style="margin:6px 4px">Mevcut takip: ${esc(formatDateTR(c.followUpAt))}</div>` : ''}</div>
      <label class="field"><span>Not</span><textarea class="input" name="note" rows="3" placeholder="Ne konuştunuz?">${esc(c.note || '')}</textarea></label>
      ${ocrText ? `<details class="more"><summary>Okunan metni göster</summary><pre class="ocr">${esc(ocrText)}</pre></details>` : ''}
    </form>`,
    foot: `<button class="btn primary big" data-act="save-contact">${isEdit ? 'Kaydet' : 'Kaydet'}</button>`
  });
  el._data = { ...c, tags: [...(c.tags || [])], priority: c.priority || 'orta', _fuDays: c._fuDays ?? 0 };
  if (quick) setTimeout(() => $('input[name="firstName"]', el)?.focus(), 250);
}

function newContactBase(partial = {}) {
  const ev = activeEvent();
  return { ...emptyContact(), id: uid(), createdAt: Date.now(), eventId: ev ? ev.id : '', tags: [], priority: 'orta', ...partial };
}

function readContactForm() {
  const el = $('#layers [data-sheet="cform"]');
  const form = $('#contactForm', el);
  const fd = Object.fromEntries(new FormData(form));
  const d = { ...el._data, ...fd };
  for (const k of Object.keys(d)) if (typeof d[k] === 'string') d[k] = d[k].trim();
  return { el, d };
}

function findDuplicate(c) {
  const pk = [phoneKey(c.phoneMobile), phoneKey(c.phoneWork)].filter(Boolean);
  const em = (c.email || '').toLowerCase();
  return state.contacts.find(x => x.id !== c.id && (
    (em && (x.email || '').toLowerCase() === em) ||
    (pk.length && [phoneKey(x.phoneMobile), phoneKey(x.phoneWork)].some(k => k && pk.includes(k)))
  ));
}

function mergeInto(target, src) {
  const fields = ['firstName', 'lastName', 'title', 'company', 'phoneMobile', 'phoneWork', 'email', 'web', 'linkedin', 'address', 'photo', 'cardImage', 'cardThumb', 'eventId'];
  for (const k of fields) if (!target[k] && src[k]) target[k] = src[k];
  target.tags = [...new Set([...(target.tags || []), ...(src.tags || [])])];
  if (src.note && !(target.note || '').includes(src.note)) target.note = [target.note, src.note].filter(Boolean).join('\n');
  if (src.followUpAt && !target.followUpAt) { target.followUpAt = src.followUpAt; target.followUpDone = false; }
  if (src.priority === 'yuksek') target.priority = 'yuksek';
  target.updatedAt = Date.now();
  return target;
}

async function saveContact() {
  const { el, d } = readContactForm();
  if (!d.firstName && !d.lastName && !d.company) { toast('Lütfen ad girin'); $('input[name="firstName"]', el)?.focus(); return; }
  if (!d.phoneMobile && !d.email && !d.phoneWork) {
    const ok = await confirmDlg('Telefon veya e-posta yok', 'Bu kişiye ulaşmak için bilgi girilmedi. Yine de kaydedilsin mi?', 'Kaydet');
    if (!ok) return;
  }
  const fuDays = +d._fuDays || 0;
  if (fuDays > 0) {
    const t = new Date(); t.setHours(10, 0, 0, 0);
    d.followUpAt = t.getTime() + fuDays * DAY;
    d.followUpDone = false;
  }
  delete d._fuDays;
  const isEdit = !!state.contacts.find(x => x.id === d.id);
  if (!isEdit) {
    const dup = findDuplicate(d);
    if (dup) {
      const choice = await dialog({
        title: 'Bu kişi zaten kayıtlı olabilir',
        message: `Aynı telefon veya e-posta ile kayıtlı kişi: ${displayName(dup)}${dup.company ? ' (' + dup.company + ')' : ''}.\nYeni bilgileri mevcut kayda eklemek (birleştirmek) ister misiniz?`,
        buttons: [
          { label: 'Birleştir (önerilen)', style: 'primary', value: 'merge' },
          { label: 'Ayrı kişi olarak kaydet', value: 'new' },
          { label: 'Vazgeç', style: 'ghost', value: 'cancel' }
        ]
      });
      if (choice === 'cancel') return;
      if (choice === 'merge') {
        mergeInto(dup, d);
        await db.put('contacts', dup);
        closeLayer(el);
        toast('Kişi birleştirildi');
        render();
        openContact(dup.id);
        afterSaveAsk(dup, true);
        return;
      }
    }
  }
  d.updatedAt = Date.now();
  await db.put('contacts', d);
  const i = state.contacts.findIndex(x => x.id === d.id);
  if (i >= 0) state.contacts[i] = d; else state.contacts.push(d);
  closeLayer(el);
  // açık eski detay sayfasını kapat
  $$(`#layers [data-sheet="contact:${d.id}"]`).forEach(x => x.remove());
  toast(isEdit ? 'Güncellendi' : 'Kişi kaydedildi');
  render();
  openContact(d.id);
  if (!isEdit) afterSaveAsk(d);
}

function afterSaveAsk(c, merged = false) {
  if (c.inContacts && !merged) return;
  if (!S('autoAsk')) return;
  if (c.inContacts) return;
  dialog({
    title: 'iPhone Kişiler\'e eklensin mi?',
    message: `${displayName(c)} iPhone rehberinize kaydedilsin. iPhone sorarsa "Allow / İzin Ver", ardından "Yeni Kişi Oluştur"a dokunun.`,
    buttons: [
      { label: '📇 iPhone Kişiler\'e ekle', style: 'ok', run: () => addContactsToPhone([c]) },
      { label: 'Şimdi değil', style: 'ghost' }
    ]
  });
}

// ---- QR okuma ----
let scanStream = null, scanRAF = null;
async function startScanner() {
  closeAllLayers();
  const el = document.createElement('div');
  el.className = 'scanner';
  el.innerHTML = `<video playsinline muted autoplay></video><div class="frame"></div>
    <div class="msg" id="scanMsg">QR kodu çerçeveye getirin</div>
    <div class="bar"><button class="btn" data-act="qr-from-photo">🖼 Fotoğraftan</button><button class="btn" data-act="stop-scan">Kapat</button></div>`;
  document.body.appendChild(el);
  const video = $('video', el);
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = scanStream;
    await video.play();
  } catch (e) {
    $('#scanMsg').textContent = 'Kameraya erişilemedi. Ayarlar → Safari → Kamera iznini kontrol edin ya da "Fotoğraftan" ile deneyin.';
    return;
  }
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = 0;
  const tick = t => {
    scanRAF = requestAnimationFrame(tick);
    if (t - last < 120 || video.readyState < 2) return;
    last = t;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw) return;
    const k = Math.min(1, 720 / Math.max(vw, vh));
    canvas.width = Math.round(vw * k); canvas.height = Math.round(vh * k);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) { stopScanner(); handleQRText(code.data); }
  };
  scanRAF = requestAnimationFrame(tick);
}
function stopScanner() {
  cancelAnimationFrame(scanRAF);
  scanStream && scanStream.getTracks().forEach(t => t.stop());
  scanStream = null;
  $('.scanner')?.remove();
}

async function qrFromFile(file) {
  const img = await loadImage(file);
  for (const size of [1200, 800, 1800]) {
    const c = drawScaled(img, size);
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const code = jsQR(data.data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    if (code && code.data) return code.data;
  }
  return null;
}

function handleQRText(text) {
  const r = parseQRContent(text, parseCardText);
  const kindTxt = { vcard: 'vCard', mecard: 'MeCard', linkedin: 'LinkedIn linki', url: 'Web linki', email: 'E-posta', phone: 'Telefon', text: 'Metin' }[r.kind];
  toast(`QR okundu: ${kindTxt}`);
  if (r.kind === 'vcard' && r.contacts.length > 1) {
    importVCardList(r.contacts);
    return;
  }
  const c = newContactBase({ ...r.contact, source: 'qr' });
  if (r.contact.photo) c.photo = r.contact.photo;
  // QR'dan gelen notu kendi notumuzla karıştırmayalım
  if (r.kind !== 'text' && c.note) c.note = 'QR notu: ' + c.note;
  contactForm(c, { title: 'QR\'dan kişi' });
}

async function importVCardList(cards) {
  const ok = await confirmDlg(`${cards.length} kişi bulundu`, 'Hepsi uygulamaya kaydedilsin mi?', 'Hepsini kaydet');
  if (!ok) return;
  const list = cards.map(x => newContactBase({ ...x }));
  await db.putMany('contacts', list);
  state.contacts.push(...list);
  toast(`${list.length} kişi kaydedildi`);
  go('contacts');
}

// ---- Kartvizit OCR ----
let ocrWorker = null;
async function getOcrWorker(onProgress) {
  if (ocrWorker) return ocrWorker;
  if (!window.Tesseract) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'lib/tesseract/tesseract.min.js';
      s.onload = res; s.onerror = () => rej(new Error('OCR kütüphanesi yüklenemedi'));
      document.head.appendChild(s);
    });
  }
  const abs = p => new URL(p, location.href).href;
  ocrWorker = await Tesseract.createWorker(['tur', 'eng'], 1, {
    workerPath: abs('lib/tesseract/worker.min.js'),
    corePath: abs('lib/tesseract/core'),
    langPath: abs('lib/tesseract/lang'),
    gzip: true,
    workerBlobURL: false,
    cacheMethod: 'none',
    logger: m => onProgress && onProgress(m)
  });
  return ocrWorker;
}

async function scanCard(file) {
  closeAllLayers();
  const el = openSheet({
    title: 'Kartvizit okunuyor', short: true, id: 'ocr',
    body: `<div class="stack" style="padding-bottom:calc(env(safe-area-inset-bottom) + 16px)">
      <img class="img-prev" id="ocrImg" alt="">
      <div class="progress"><i id="ocrBar"></i></div>
      <div class="muted center" id="ocrStatus">Hazırlanıyor…</div>
      <button class="btn" data-act="ocr-skip">Beklemeden elle doldur</button></div>`
  });
  let cancelled = false;
  el._onClose = () => { cancelled = true; };
  try {
    const img = await loadImage(file);
    const cardImage = toJpeg(img, 1400, 0.72);
    const cardThumb = toJpeg(img, 360, 0.7);
    $('#ocrImg').src = cardImage;
    el._partial = { cardImage, cardThumb };
    const status = $('#ocrStatus'), bar = $('#ocrBar');
    const labels = { 'loading tesseract core': 'OCR motoru yükleniyor', 'initializing tesseract': 'OCR başlatılıyor', 'loading language traineddata': 'Dil verileri yükleniyor (Türkçe + İngilizce)', 'initializing api': 'Hazırlanıyor', 'recognizing text': 'Metin okunuyor' };
    const worker = await getOcrWorker(m => {
      if (status) status.textContent = `${labels[m.status] || m.status}… %${Math.round((m.progress || 0) * 100)}`;
      if (bar) bar.style.width = `${Math.round((m.progress || 0) * 100)}%`;
    });
    if (cancelled) return;
    // Ön işleme: büyüt/küçült, gri tonlama + kontrast
    const cv = drawScaled(img, 2000);
    const ctx = cv.getContext('2d');
    const id = ctx.getImageData(0, 0, cv.width, cv.height);
    const px = id.data;
    for (let i = 0; i < px.length; i += 4) {
      let g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128));
      px[i] = px[i + 1] = px[i + 2] = g;
    }
    ctx.putImageData(id, 0, 0);
    const res = await worker.recognize(cv);
    if (cancelled) return;
    const lines = (res.data.lines || []).map(l => ({ text: l.text.trim(), height: l.bbox ? l.bbox.y1 - l.bbox.y0 : 0 }));
    const parsed = parseCardText(res.data.text, lines);
    closeLayer(el);
    contactForm(newContactBase({ ...parsed, cardImage, cardThumb, source: 'ocr' }), { title: 'Kartvizitten kişi', ocrText: res.data.text.trim() || '(metin bulunamadı)' });
  } catch (e) {
    console.error(e);
    if (cancelled) return;
    const partial = el._partial || {};
    closeLayer(el);
    toast('Metin okunamadı, elle doldurun');
    contactForm(newContactBase({ ...partial, source: 'ocr' }), { title: 'Kartvizitten kişi', quick: true });
  }
}

// --------------------------------------------------------------
// GÖRÜNÜM: Etkinlikler
// --------------------------------------------------------------
function viewEvents() {
  const ev = activeEvent();
  const list = state.events.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);
  const counts = id => {
    const cs = state.contacts.filter(c => c.eventId === id);
    return { all: cs.length, out: cs.filter(c => !c.inContacts).length };
  };
  return `${ev ? `<div class="card" style="border:2px solid var(--ok)">
      <div class="muted small">AKTİF ETKİNLİK</div><h2 style="margin:4px 0">${esc(ev.name)}</h2>
      <div class="muted small">${esc(ev.date ? formatDateTR(ev.date + 'T12:00') : '')}${ev.place ? ' · ' + esc(ev.place) : ''}</div>
      <p class="small">Şu an kaydettiğiniz herkes otomatik olarak bu etkinliğe bağlanır.</p>
      <button class="btn" data-act="deactivate-event">Etkinliği bitir (aktiflikten çıkar)</button></div>`
    : `<div class="banner info"><span class="bi">💡</span><span>Bir etkinliğe gitmeden önce oluşturup <b>aktif</b> yapın; kaydettiğiniz herkes otomatik olarak o etkinliğe bağlanır.</span></div>`}
    <button class="btn primary big" data-act="new-event">＋ Yeni etkinlik</button>
    <div class="section-title">Etkinlikler</div>
    ${list.length ? `<ul class="list">${list.map(e => {
      const n = counts(e.id);
      return `<li><div class="item" style="flex-wrap:wrap">
        <div class="t"><div class="n">${e.id === S('activeEventId') ? '<span class="badge ok">Aktif</span> ' : ''}${esc(e.name)}</div>
        <div class="s">${esc(e.date ? formatDateTR(e.date + 'T12:00') : '')}${e.place ? ' · ' + esc(e.place) : ''} · ${n.all} kişi${n.out ? `, ${n.out} rehberde değil` : ''}</div></div>
        <div class="row" style="width:100%;flex-wrap:wrap;gap:8px">
          ${e.id !== S('activeEventId') ? `<button class="btn sm" data-act="activate-event" data-id="${e.id}">Aktif yap</button>` : ''}
          <button class="btn sm" data-act="event-contacts" data-id="${e.id}">Kişileri gör</button>
          <button class="btn sm ${n.out ? 'ok' : ''}" data-act="bulk-event" data-id="${e.id}" ${n.out ? '' : 'disabled'}>📇 ${n.out ? n.out + ' kişiyi ' : ''}Kişiler'e ekle</button>
          <button class="btn sm" data-act="edit-event" data-id="${e.id}">✏️</button>
        </div></div></li>`;
    }).join('')}</ul>` : '<div class="empty">Henüz etkinlik yok.</div>'}`;
}

function editEvent(id) {
  const e = state.events.find(x => x.id === id) || { id: uid(), name: '', date: todayStr(), place: '', createdAt: Date.now() };
  const isNew = !state.events.find(x => x.id === e.id);
  const el = openSheet({
    title: isNew ? 'Yeni etkinlik' : 'Etkinliği düzenle', short: true, id: 'event',
    body: `<form id="eventForm">
      <label class="field"><span>Etkinlik adı</span><input class="input" name="name" value="${esc(e.name)}" placeholder="ör. Teknoloji Zirvesi 2026" required></label>
      <label class="field"><span>Tarih</span><input class="input" type="date" name="date" value="${esc(e.date || todayStr())}"></label>
      <label class="field"><span>Yer (isteğe bağlı)</span><input class="input" name="place" value="${esc(e.place || '')}"></label>
      ${isNew ? `<label class="switch"><span>Hemen aktif yap</span><input type="checkbox" name="activate" checked></label>` : ''}
      ${!isNew ? `<button type="button" class="btn danger" data-act="delete-event" data-id="${e.id}">Etkinliği sil</button>` : ''}
      </form><div style="height:calc(env(safe-area-inset-bottom) + 6px)"></div>`,
    foot: `<button class="btn primary" data-act="save-event">Kaydet</button>`
  });
  el._data = e;
  if (isNew) setTimeout(() => $('input[name="name"]', el)?.focus(), 250);
}

async function saveEvent() {
  const el = $('#layers [data-sheet="event"]');
  const fd = new FormData($('#eventForm', el));
  const e = { ...el._data, name: (fd.get('name') || '').trim(), date: fd.get('date') || todayStr(), place: (fd.get('place') || '').trim() };
  if (!e.name) { toast('Etkinlik adı girin'); return; }
  await db.put('events', e);
  const i = state.events.findIndex(x => x.id === e.id);
  if (i >= 0) state.events[i] = e; else state.events.push(e);
  if (fd.get('activate')) await setSetting('activeEventId', e.id);
  closeLayer(el);
  toast('Etkinlik kaydedildi');
  render();
}

// --------------------------------------------------------------
// GÖRÜNÜM: Ayarlar
// --------------------------------------------------------------
function viewSettings() {
  const tags = S('tags') || [];
  const last = S('lastBackupAt');
  return `
    <div class="section-title">iPhone Kişiler'e ekleme</div>
    <div class="card">
      <label class="switch"><span>Her kayıttan sonra otomatik sor</span><input type="checkbox" data-setting="autoAsk" ${S('autoAsk') ? 'checked' : ''}></label>
      <label class="field"><span>Ekleme yöntemi</span><select class="input" data-setting="addMethod">
        <option value="open" ${S('addMethod') === 'open' ? 'selected' : ''}>Kişi ekranını doğrudan aç (önerilen)</option>
        <option value="share" ${S('addMethod') === 'share' ? 'selected' : ''}>Paylaşım menüsü ile</option></select></label>
      <button class="btn" data-act="test-contacts">🧪 Türkçe karakterli deneme kişisi ekle</button>
      <p class="muted small">Deneme kişisi: "Şükrü Çağlayan-Öztürk / Gıda İhracat Müdürü". Kişiler'de harfler doğru görünüyorsa her şey yolunda; sonra deneme kişisini silebilirsiniz.</p>
      <button class="btn" data-act="bulk-all" style="margin-top:6px">📇 Rehberde olmayan tüm kişileri ekle (${state.contacts.filter(c => !c.inContacts).length})</button>
    </div>

    <div class="section-title">Yedekleme ve dışa aktarma</div>
    <div class="card stack">
      <div class="muted small">Son yedek: ${last ? esc(formatDateTR(last)) : 'hiç alınmadı'}</div>
      <button class="btn primary" data-act="backup">💾 Yedek al (JSON) — iCloud Drive'a kaydet</button>
      <button class="btn" data-act="restore">♻️ Yedekten geri yükle</button>
      <button class="btn" data-act="export-csv">📊 CSV (Excel) olarak dışa aktar</button>
      <button class="btn" data-act="export-vcf">👥 Tüm kişileri vCard olarak dışa aktar</button>
    </div>

    <div class="section-title">Güvenlik</div>
    <div class="card stack">
      <div class="muted small">PIN açıkken kişiler, etkinlikler ve ayarlar için PIN istenir. Kendi QR kodunuz PIN'siz gösterilir.</div>
      ${S('pinHash')
        ? `<button class="btn" data-act="set-pin">🔢 PIN'i değiştir</button><button class="btn" data-act="remove-pin">PIN kilidini kapat</button><button class="btn" data-act="lock-now">🔒 Şimdi kilitle</button>`
        : `<button class="btn" data-act="set-pin">🔒 4 haneli PIN kilidi aç</button>`}
    </div>

    <div class="section-title">Etiketler</div>
    <div class="card"><div class="chips wrap">${tags.map(t => `<button class="chip" data-act="remove-tag" data-tag="${esc(t)}">${esc(t)} ✕</button>`).join('')}
      <button class="chip on" data-act="new-tag-setting">+ Etiket ekle</button></div></div>

    <div class="section-title">Takip e-postası şablonu</div>
    <div class="card">
      <label class="field"><span>Konu</span><input class="input" data-setting="emailSubject" value="${esc(S('emailSubject') || DEFAULT_SUBJECT)}"></label>
      <label class="field"><span>Metin</span><textarea class="input" rows="7" data-setting="emailBody">${esc(S('emailBody') || DEFAULT_BODY)}</textarea></label>
      <p class="muted small">Kullanılabilir alanlar: {ad} {soyad} {sirket} {etkinlik} {benim_adim}</p>
      <button class="btn sm ghost" data-act="reset-template">Varsayılan şablona dön</button>
    </div>

    <div class="section-title">Gizlilik</div>
    <div class="card small muted">Tüm veriler sadece bu telefonda (IndexedDB) saklanır. Uygulama hiçbir sunucuya veri göndermez: sunucu, hesap, analitik, reklam veya dış servis yoktur; OCR ve QR işlemleri cihazda yapılır. Veri telefondan yalnızca <b>sizin dokunuşunuzla</b> çıkar: Paylaş/WhatsApp, Kişiler'e ekleme, yedek dosyası ve e-posta. Kişiler'e eklediğiniz kişiler iCloud Kişiler açıksa Apple tarafından iCloud'a eşitlenir; yedeği iCloud Drive yerine "iPhone'umda" klasörüne kaydederseniz telefonda kalır.</div>

    <div class="section-title">Tehlikeli bölge</div>
    <button class="btn danger" data-act="reset-all">🗑 Verileri sıfırla</button>
    <p class="muted small center" style="margin-top:20px">Kartvizit v${APP_VERSION}</p>`;
}

// ---- Yedekleme ----
function backupJSON() {
  const settings = { ...state.settings };
  return JSON.stringify({
    app: 'kartvizit', version: 1, exportedAt: new Date().toISOString(),
    profiles: state.profiles, contacts: state.contacts, events: state.events, settings
  });
}
function stamp() { return todayStr(); }
function backup() {
  if (!state.unlocked) { askPin(backup); return; }
  const json = backupJSON();
  const name = `kartvizit-yedek-${stamp()}.json`;
  const r = shareFile(json, name, 'application/json', 'Kartvizit yedeği');
  const done = async () => { await setSetting('lastBackupAt', Date.now()); toast('Yedek alındı ✓'); render(); };
  if (r) { r.then(ok => ok && done()).catch(() => { downloadFile(json, name, 'application/json'); done(); }); return; }
  downloadFile(json, name, 'application/json');
  done();
}

async function restore(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { toast('Dosya okunamadı'); return; }
  if (!data || data.app !== 'kartvizit' || !Array.isArray(data.contacts)) { toast('Bu bir Kartvizit yedeği değil'); return; }
  const choice = await dialog({
    title: 'Yedek geri yüklensin mi?',
    message: `Yedekte ${data.contacts.length} kişi, ${(data.events || []).length} etkinlik ve ${(data.profiles || []).length} profil var.`,
    buttons: [
      { label: 'Birleştir (mevcutları koru)', style: 'primary', value: 'merge' },
      { label: 'Mevcut verilerin yerine geç', style: 'danger', value: 'replace' },
      { label: 'Vazgeç', style: 'ghost', value: 'cancel' }
    ]
  });
  if (choice === 'cancel') return;
  if (choice === 'replace') await db.clearAll();
  await db.putMany('profiles', data.profiles || []);
  await db.putMany('contacts', data.contacts || []);
  await db.putMany('events', data.events || []);
  if (data.settings) {
    const keep = choice === 'merge' ? state.settings : {};
    const merged = { ...data.settings, ...keep };
    await db.putMany('settings', Object.entries(merged).map(([key, value]) => ({ key, value })));
  }
  toast('Yedek geri yüklendi ✓');
  await reloadState();
  go('contacts');
}

async function reloadState() {
  const [profiles, contacts, events, settings] = await Promise.all(db.STORES.map(s => db.all(s)));
  state.profiles = profiles.sort((a, b) => a.createdAt - b.createdAt);
  state.contacts = contacts; state.events = events;
  state.settings = Object.fromEntries(settings.map(s => [s.key, s.value]));
  if (!S('tags')) await setSetting('tags', DEFAULT_TAGS);
  if (S('autoAsk') === undefined) await setSetting('autoAsk', true);
  if (!S('addMethod')) await setSetting('addMethod', 'open');
}

function csvCell(v) {
  let s = String(v ?? '');
  // Excel formül enjeksiyonunu engelle (=, @, + veya - ile başlayan ve telefon olmayan hücreler)
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !/^[+\-\d\s()./]+$/.test(s))) s = "'" + s;
  return /[;"\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function buildCSV(contacts, evName) {
  const head = ['Ad', 'Soyad', 'Unvan', 'Şirket', 'Cep Telefonu', 'İş Telefonu', 'E-posta', 'Web', 'LinkedIn', 'Adres', 'Etkinlik', 'Tanışma Tarihi', 'Etiketler', 'Öncelik', 'Not', 'Takip Tarihi', 'Rehberde'];
  const rows = contacts.slice().sort((a, b) => b.createdAt - a.createdAt).map(c => [
    c.firstName, c.lastName, c.title, c.company, c.phoneMobile, c.phoneWork, c.email, c.web, c.linkedin, c.address,
    evName(c.eventId), formatDateTR(c.createdAt), (c.tags || []).join(', '), PRIORITIES[c.priority] || '', c.note,
    c.followUpAt ? formatDateTR(c.followUpAt) : '', c.inContacts ? 'Evet' : 'Hayır'
  ]);
  // Türkçe Excel için ; ayırıcı ve UTF-8 BOM
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n') + '\r\n';
}
function exportCSV() {
  const csv = buildCSV(state.contacts, eventName);
  const name = `kartvizit-kisiler-${stamp()}.csv`;
  const r = shareFile(csv, name, 'text/csv', 'Kişiler (CSV)');
  if (r) { r.catch(() => downloadFile(csv, name, 'text/csv')); return; }
  downloadFile(csv, name, 'text/csv');
}
function exportVCF() {
  if (!state.contacts.length) { toast('Kişi yok'); return; }
  const vcf = state.contacts.map(contactVCard).join('');
  const name = `kartvizit-kisiler-${stamp()}.vcf`;
  const r = shareFile(vcf, name, 'text/vcard', 'Kişiler (vCard)');
  if (r) { r.catch(() => downloadFile(vcf, name, 'text/vcard')); return; }
  downloadFile(vcf, name, 'text/vcard');
}

async function resetAll() {
  const a = await confirmDlg('Tüm veriler silinsin mi?', 'Profilleriniz, tüm kişiler, etkinlikler ve ayarlar bu telefondan kalıcı olarak silinir. iPhone Kişiler\'e eklediğiniz kişiler silinmez.', 'Devam et', true);
  if (!a) return;
  const b = await dialog({
    title: 'Emin misiniz?',
    message: 'Bu işlem geri alınamaz. Önce yedek almanızı öneririz.',
    buttons: [{ label: 'Evet, her şeyi sil', style: 'danger', value: true }, { label: 'Önce yedek al', run: () => backup(), value: false }, { label: 'Vazgeç', style: 'ghost', value: false }]
  });
  if (b !== true) return;
  await db.clearAll();
  try { await caches.delete('kartvizit-files'); } catch { }
  state.profiles = []; state.contacts = []; state.events = []; state.settings = {};
  await reloadState();
  await setSetting('firstRunAt', Date.now());
  state.unlocked = true;
  toast('Tüm veriler silindi');
  go('card');
}

// ---- PIN ----
async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function pinPad(title, sub, onComplete) {
  const el = document.createElement('div');
  el.className = 'pin';
  let val = '';
  el.innerHTML = `<div style="font-size:40px">🔒</div><h2>${esc(title)}</h2><div class="muted center" id="pinSub">${esc(sub)}</div>
    <div class="dots">${'<i></i>'.repeat(4)}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}
      <button data-k="x" class="blank" style="font-size:16px">Vazgeç</button><button data-k="0">0</button><button data-k="b" class="blank">⌫</button></div>`;
  const dots = () => $$('.dots i', el).forEach((d, i) => d.classList.toggle('f', i < val.length));
  el.addEventListener('click', async e => {
    const k = e.target.closest('button')?.dataset.k;
    if (!k) return;
    if (k === 'x') { el.remove(); return; }
    if (k === 'b') { val = val.slice(0, -1); dots(); return; }
    if (val.length >= 4) return;
    val += k; dots();
    if (val.length === 4) {
      const ok = await onComplete(val, el);
      if (ok) el.remove();
      else { val = ''; const d = $('.dots', el); d.classList.add('shake'); setTimeout(() => { d.classList.remove('shake'); dots(); }, 360); }
    }
  });
  document.body.appendChild(el);
  return el;
}
function askPin(then) {
  pinPad('PIN girin', 'Kişilerinizi görmek için PIN gerekli', async pin => {
    const h = await hashPin(pin, S('pinSalt'));
    if (h === S('pinHash')) { state.unlocked = true; then && then(); return true; }
    return false;
  });
}
function setPin() {
  let first = null;
  pinPad('Yeni PIN', '4 haneli bir PIN seçin', async (pin, el) => {
    if (!first) { first = pin; $('#pinSub', el).textContent = 'PIN\'i tekrar girin'; $('h2', el).textContent = 'PIN\'i onaylayın'; return false; }
    if (pin !== first) { first = null; $('#pinSub', el).textContent = 'Eşleşmedi. Baştan 4 haneli PIN girin'; $('h2', el).textContent = 'Yeni PIN'; return false; }
    const salt = uid();
    await setSetting('pinSalt', salt);
    await setSetting('pinHash', await hashPin(pin, salt));
    state.unlocked = true;
    toast('PIN kilidi açıldı 🔒');
    render();
    return true;
  });
}

// --------------------------------------------------------------
// Olaylar
// --------------------------------------------------------------
let imageTarget = null;
const actions = {
  'go': el => { closeAllLayers(); go(el.dataset.view); },
  'go-events': () => { closeAllLayers(); go('events'); },
  'close-layer': el => closeLayer(el.closest('.layer')),
  'add-menu': () => addMenu(),
  'apply-update': () => { window._newSW && window._newSW.postMessage('skipWaiting'); },
  'close-install-hint': async () => { await setSetting('installHintClosed', true); render(); },
  // Kartım
  'show-qr': () => showQR(),
  'close-qr': () => closeQR(),
  'share-me': () => shareMe(),
  'switch-profile': async el => { await setSetting('activeProfileId', el.dataset.id); render(); },
  'edit-profile': el => editProfile(el.dataset.id, !!el.dataset.new),
  'save-profile': () => saveProfile(),
  'delete-profile': async el => {
    if (!await confirmDlg('Profil silinsin mi?', 'Bu kartvizit profili silinecek.', 'Sil', true)) return;
    await db.del('profiles', el.dataset.id);
    state.profiles = state.profiles.filter(p => p.id !== el.dataset.id);
    if (S('activeProfileId') === el.dataset.id) await setSetting('activeProfileId', state.profiles[0]?.id || '');
    closeAllLayers(); render();
  },
  'pick-image': el => { imageTarget = el.dataset.target; $('#fileImage').click(); },
  'remove-image': el => {
    const layer = $(`#layers [data-sheet="${el.dataset.target === 'profile' ? 'profile' : 'cform'}"]`);
    layer._data.photo = '';
    $(el.dataset.target === 'profile' ? '#profPhotoPrev' : '#cPhotoPrev').innerHTML = avatar(layer._data);
  },
  // Kişi ekleme
  'scan-qr': () => startScanner(),
  'stop-scan': () => stopScanner(),
  'qr-from-photo': () => { stopScanner(); $('#fileQR').click(); },
  'scan-card': () => $('#fileCard').click(),
  'quick-add': () => { closeAllLayers(); contactForm(newContactBase({ source: 'manual' }), { title: 'Hızlı giriş', quick: true }); },
  'ocr-skip': () => {
    const l = $('#layers [data-sheet="ocr"]');
    const partial = l?._partial || {};
    closeLayer(l);
    contactForm(newContactBase({ ...partial, source: 'ocr' }), { title: 'Kartvizitten kişi', quick: true });
  },
  'toggle-tag': el => {
    const d = $('#layers [data-sheet="cform"]')._data;
    const t = el.dataset.tag;
    d.tags = d.tags.includes(t) ? d.tags.filter(x => x !== t) : [...d.tags, t];
    el.classList.toggle('on');
  },
  'new-tag': async el => {
    const t = (prompt('Yeni etiket adı') || '').trim();
    if (!t) return;
    const tags = S('tags') || [];
    if (!tags.includes(t)) await setSetting('tags', [...tags, t]);
    const d = $('#layers [data-sheet="cform"]')._data;
    if (!d.tags.includes(t)) d.tags.push(t);
    el.insertAdjacentHTML('beforebegin', `<button type="button" class="chip on" data-act="toggle-tag" data-tag="${esc(t)}">${esc(t)}</button>`);
  },
  'set-prio': el => { $('#layers [data-sheet="cform"]')._data.priority = el.dataset.v; $$('#prioSeg button').forEach(b => b.classList.toggle('on', b === el)); },
  'set-fu-form': el => { $('#layers [data-sheet="cform"]')._data._fuDays = +el.dataset.v; $$('#fuSeg button').forEach(b => b.classList.toggle('on', b === el)); },
  'save-contact': () => saveContact(),
  // Kişi detayı
  'open-contact': el => openContact(el.dataset.id),
  'to-phone': el => addContactsToPhone([state.contacts.find(c => c.id === el.dataset.id)]),
  'share-contact': el => {
    const c = state.contacts.find(x => x.id === el.dataset.id);
    const vcf = shareableVCard(c), name = `${safeFile(displayName(c))}.vcf`;
    const r = shareFile(vcf, name, 'text/vcard', displayName(c));
    if (r) { r.catch(() => toast('Paylaşılamadı')); return; }
    downloadFile(vcf, name, 'text/vcard');
  },
  'qr-contact': el => {
    const c = state.contacts.find(x => x.id === el.dataset.id);
    showQR(c, 'Kamerayla okutun → rehbere kaydedin');
  },
  'wa-text-contact': el => {
    const c = state.contacts.find(x => x.id === el.dataset.id);
    // Alıcıyı WhatsApp'ta siz seçersiniz; metin sadece sizin dokunuşunuzla gönderilir
    window.open(`https://wa.me/?text=${encodeURIComponent(contactShareText(c))}`, '_blank', 'noopener,noreferrer');
  },
  'edit-contact': el => {
    const c = state.contacts.find(x => x.id === el.dataset.id);
    contactForm({ ...c }, { title: 'Kişiyi düzenle' });
  },
  'delete-contact': async el => {
    if (!await confirmDlg('Kişi silinsin mi?', 'Kişi bu uygulamadan silinir (iPhone Kişiler\'den silinmez).', 'Sil', true)) return;
    await db.del('contacts', el.dataset.id);
    state.contacts = state.contacts.filter(c => c.id !== el.dataset.id);
    closeAllLayers(); toast('Silindi'); render();
  },
  'followup-mail': el => followUpMail(state.contacts.find(c => c.id === el.dataset.id)),
  'set-fu': async el => {
    const c = state.contacts.find(x => x.id === el.dataset.id);
    const t = new Date(); t.setHours(10, 0, 0, 0);
    c.followUpAt = t.getTime() + (+el.dataset.days) * DAY; c.followUpDone = false;
    await db.put('contacts', c); toast(`Takip: ${formatDateTR(c.followUpAt)}`); refresh();
  },
  'toggle-fu': async el => {
    const c = state.contacts.find(x => x.id === el.dataset.id);
    c.followUpDone = !c.followUpDone;
    await db.put('contacts', c); refresh();
  },
  'ics': el => followUpICS(state.contacts.find(c => c.id === el.dataset.id)),
  // Liste
  'clear-filters': () => { state.filters = { q: '', event: '', tag: '', date: '', book: '' }; render(); },
  'bulk-filtered': () => addContactsToPhone(filteredContacts().filter(c => !c.inContacts)),
  // Etkinlik
  'new-event': () => editEvent(),
  'edit-event': el => editEvent(el.dataset.id),
  'save-event': () => saveEvent(),
  'activate-event': async el => { await setSetting('activeEventId', el.dataset.id); toast('Aktif etkinlik ayarlandı'); render(); },
  'deactivate-event': async () => { await setSetting('activeEventId', ''); render(); },
  'event-contacts': el => { state.filters = { q: '', event: el.dataset.id, tag: '', date: '', book: '' }; go('contacts'); },
  'bulk-event': el => addContactsToPhone(state.contacts.filter(c => c.eventId === el.dataset.id && !c.inContacts)),
  'delete-event': async el => {
    if (!await confirmDlg('Etkinlik silinsin mi?', 'Kişiler silinmez; sadece etkinlik bağlantısı kalkar.', 'Sil', true)) return;
    const id = el.dataset.id;
    await db.del('events', id);
    state.events = state.events.filter(e => e.id !== id);
    const affected = state.contacts.filter(c => c.eventId === id);
    affected.forEach(c => { c.eventId = ''; });
    await db.putMany('contacts', affected);
    if (S('activeEventId') === id) await setSetting('activeEventId', '');
    closeAllLayers(); render();
  },
  // Ayarlar
  'bulk-all': () => addContactsToPhone(state.contacts.filter(c => !c.inContacts)),
  'test-contacts': () => {
    const t = { firstName: 'Şükrü', lastName: 'Çağlayan-Öztürk', title: 'Gıda İhracat Müdürü', company: 'Iğdır Üzüm ve Çay A.Ş.', phoneMobile: '+90 532 000 00 00', email: 'deneme@ornek.com.tr', web: 'ornek.com.tr', linkedin: 'linkedin.com/in/deneme', address: 'Kızılay Mah. Atatürk Bulvarı No:1, Çankaya / Ankara', createdAt: Date.now(), tags: ['Müşteri', 'İş ortağı'], note: 'Bu bir deneme kişisidir: ş ğ ı İ ç ö ü Ş Ğ Ç Ö Ü' };
    const vcf = buildVCard(t, { note: buildNote(t, 'Deneme Etkinliği') });
    sendToContacts(vcf, 'deneme-kisi.vcf');
  },
  'backup': () => backup(),
  'restore': () => $('#fileRestore').click(),
  'export-csv': () => exportCSV(),
  'export-vcf': () => exportVCF(),
  'set-pin': () => setPin(),
  'remove-pin': async () => {
    if (!await confirmDlg('PIN kilidi kapatılsın mı?', '', 'Kapat')) return;
    await setSetting('pinHash', ''); await setSetting('pinSalt', ''); toast('PIN kapatıldı'); render();
  },
  'lock-now': () => { state.unlocked = false; closeAllLayers(); go('card'); toast('Kilitlendi 🔒'); },
  'remove-tag': async el => {
    if (!await confirmDlg(`"${el.dataset.tag}" etiketi listeden kaldırılsın mı?`, 'Kişilerdeki mevcut etiketler korunur.', 'Kaldır')) return;
    await setSetting('tags', (S('tags') || []).filter(t => t !== el.dataset.tag)); render();
  },
  'new-tag-setting': async () => {
    const t = (prompt('Yeni etiket adı') || '').trim();
    if (!t) return;
    const tags = S('tags') || [];
    if (!tags.includes(t)) await setSetting('tags', [...tags, t]);
    render();
  },
  'reset-template': async () => { await setSetting('emailSubject', DEFAULT_SUBJECT); await setSetting('emailBody', DEFAULT_BODY); render(); toast('Şablon sıfırlandı'); },
  'reset-all': () => resetAll(),
};

function bindGlobal() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (!fn) return;
    if (el.tagName === 'A' && el.getAttribute('href') !== '#') return;
    e.preventDefault();
    fn(el, e);
  });
  // Arama ve filtreler
  document.addEventListener('input', e => {
    if (e.target.id === 'q') {
      state.filters.q = e.target.value;
      const list = filteredContacts();
      const ul = $('#contactList');
      if (ul) ul.innerHTML = list.map(c => contactRow(c)).join('');
      else { const pos = e.target.selectionStart; render(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }
    }
  });
  document.addEventListener('change', async e => {
    const t = e.target;
    if (t.dataset.filter) { state.filters[t.dataset.filter] = t.value; render(); return; }
    if (t.dataset.setting) {
      const v = t.type === 'checkbox' ? t.checked : t.value;
      await setSetting(t.dataset.setting, v);
      toast('Kaydedildi');
      return;
    }
    if (t.id === 'fileCard' && t.files[0]) { const f = t.files[0]; t.value = ''; scanCard(f); }
    if (t.id === 'fileQR' && t.files[0]) {
      const f = t.files[0]; t.value = '';
      const txt = await qrFromFile(f).catch(() => null);
      if (txt) handleQRText(txt); else toast('Fotoğrafta QR kod bulunamadı');
    }
    if (t.id === 'fileRestore' && t.files[0]) { const f = t.files[0]; t.value = ''; restore(f); }
    if (t.id === 'fileImage' && t.files[0]) {
      const f = t.files[0]; t.value = '';
      const img = await loadImage(f);
      const photo = toJpeg(img, 320, 0.8);
      const layer = $(`#layers [data-sheet="${imageTarget === 'profile' ? 'profile' : 'cform'}"]`);
      if (!layer) return;
      layer._data.photo = photo;
      $(imageTarget === 'profile' ? '#profPhotoPrev' : '#cPhotoPrev').innerHTML = avatar(layer._data);
    }
  });
  // Uygulama arka plana gidince bir süre sonra kilitle
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.hiddenAt = Date.now();
    else if (S('pinHash') && state.unlocked && Date.now() - state.hiddenAt > 60000) {
      state.unlocked = false; closeAllLayers(); stopScanner(); go('card');
    }
    if (!document.hidden && wakeLock === null && $('.qr-full') && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then(w => { wakeLock = w; }).catch(() => { });
    }
  });
}

// --------------------------------------------------------------
// Service worker (çevrimdışı + güncelleme)
// --------------------------------------------------------------
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const onWaiting = w => { window._newSW = w; window._updateReady = true; if (state.view === 'card') render(); toast('Yeni sürüm hazır — Kartım ekranından güncelleyin', 3500); };
    if (reg.waiting && navigator.serviceWorker.controller) onWaiting(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) onWaiting(w);
      });
    });
    setInterval(() => reg.update().catch(() => { }), 60 * 60 * 1000);
  }).catch(e => console.warn('SW', e));
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded || !window._updateReady) return;
    reloaded = true; location.reload();
  });
}

// Test erişimi için
window.__kartvizit = { state, db, buildVCard, contactVCard, parseCardText, parseQRContent, handleQRText, buildCSV, backupJSON, getOcrWorker };

init().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<div class="card" style="margin:16px">Başlatılamadı: ${esc(e.message)}</div>`); });
