// Uçtan uca test (Chromium + Playwright). Çalıştırma: node tests/e2e.cjs
// Gerçek iPhone'un yerini tutmaz; uygulamanın akışlarını ve üretilen dosyaları doğrular.
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-'));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.gz': 'application/gzip' };
// Güvenlik testi: uygulama sunucusuna gelen her istek kaydedilir
const serverLog = [];
const server = http.createServer((req, res) => {
  let body = 0;
  req.on('data', c => { body += c.length; });
  req.on('end', () => serverLog.push({ method: req.method, url: req.url, body }));
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// Güvenlik testi: tarayıcının dış dünyaya yaptığı HER istek bu sahte proxy'den geçer ve kaydedilir
const externalLog = [];
const net = require('net');
const proxy = http.createServer((req, res) => { externalLog.push(`${req.method} ${req.url}`); res.writeHead(403); res.end(); });
proxy.on('connect', (req, sock) => { externalLog.push(`CONNECT ${req.url}`); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); });

let passed = 0;
const results = [];
function ok(cond, msg) {
  if (!cond) throw new Error('BAŞARISIZ: ' + msg);
  passed++; results.push('✓ ' + msg); console.log('✓', msg);
}

async function makeImages(browser) {
  const p = await browser.newPage();
  // 1) MeCard QR görseli (uygulamanın kütüphanesiyle üretilir)
  await p.goto('http://localhost:8765/index.html');
  const qrPng = await p.evaluate(() => {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    const q = qrcode(0, 'M');
    q.addData('MECARD:N:Kılıç,Gülşen;TEL:+905551112233;EMAIL:gulsen@ornek.com.tr;ORG:Öğretmenler Eğitim Ltd. Şti.;TITLE:Genel Müdür;;', 'Byte');
    q.make();
    return q.createDataURL(12, 6);
  });
  // gif data URL -> canvas -> jpeg (beyaz kenarla 640x480)
  const jpg = await p.evaluate(src => new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 640, 480); const s = 400; x.drawImage(i, 120, 40, s, s); r(c.toDataURL('image/jpeg', 0.95)); }; i.src = src; }), qrPng);
  fs.writeFileSync(path.join(TMP, 'qr.jpg'), Buffer.from(jpg.split(',')[1], 'base64'));
  // 2) Kartvizit görseli (Türkçe)
  const card = await browser.newPage({ viewport: { width: 1050, height: 600 } });
  await card.setContent(`<html><body style="margin:0;background:#fff;font-family:DejaVu Sans,Arial,sans-serif;color:#111">
    <div style="padding:50px 60px">
      <div style="font-size:30px;font-weight:bold;letter-spacing:1px">ANADOLU TEKNOLOJİ A.Ş.</div>
      <div style="font-size:52px;font-weight:bold;margin-top:40px">Çağrı Şahin</div>
      <div style="font-size:30px;margin-top:6px">Satış Müdürü</div>
      <div style="font-size:26px;margin-top:36px;line-height:1.5">M: 0532 987 65 43<br>T: +90 212 555 44 33<br>cagri.sahin@anadolutek.com.tr<br>www.anadolutek.com.tr</div>
    </div></body></html>`);
  await card.screenshot({ path: path.join(TMP, 'card.png') });
  await card.close();
  await p.close();
  // MJPEG sahte kamera akışı
  fs.writeFileSync(path.join(TMP, 'qr.mjpeg'), Buffer.concat(Array(30).fill(fs.readFileSync(path.join(TMP, 'qr.jpg')))));
}

(async () => {
  await new Promise(r => server.listen(8765, r));
  await new Promise(r => proxy.listen(8899, r));
  const pre = await chromium.launch();
  await makeImages(pre);
  await pre.close();

  const browser = await chromium.launch({ args: ['--proxy-server=http://127.0.0.1:8899', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${path.join(TMP, 'qr.mjpeg')}`] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, acceptDownloads: true, permissions: ['camera', 'geolocation'], geolocation: { latitude: 40.990212, longitude: 29.028971 }, locale: 'tr-TR' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept(d.message().includes('etiket') ? 'Yatırımcı' : undefined));

  await page.goto('http://localhost:8765/');
  await page.waitForSelector('text=Kartvizitinizi oluşturun');
  ok(true, 'Uygulama açıldı, ilk açılış ekranı görünüyor');

  // ---- Profil ----
  await page.click('text=Profil oluştur');
  const pf = { firstName: 'İlkay Şebnem', lastName: 'Güçlü-Ağaoğlu', title: 'Kurucu Ortak', company: 'Çınar Yazılım A.Ş.', phoneMobile: '+90 533 444 55 66', email: 'ilkay@cinar.com.tr', web: 'cinar.com.tr', linkedin: 'linkedin.com/in/ilkay', address: 'Göztepe Mah. Işık Sok. No:7 İstanbul' };
  for (const [k, v] of Object.entries(pf)) await page.fill(`#profileForm [name="${k}"]`, v);
  await page.click('[data-act="save-profile"]');
  await page.waitForSelector('text=QR Kodu Göster');
  ok(await page.isVisible('text=İlkay Şebnem Güçlü-Ağaoğlu'), 'Profil kaydedildi (Türkçe karakterler korunuyor)');

  // İkinci profil ve geçiş
  await page.click('[data-act="edit-profile"][data-new="1"]');
  await page.fill('#profileForm [name="label"]', 'Kişisel');
  await page.fill('#profileForm [name="firstName"]', 'İlkay');
  await page.fill('#profileForm [name="lastName"]', 'Güçlü');
  await page.fill('#profileForm [name="phoneMobile"]', '+90 533 000 00 00');
  await page.click('[data-act="save-profile"]');
  await page.waitForSelector('.chip.on:has-text("Kişisel")');
  await page.click('.chip:has-text("İş")');
  await page.waitForSelector('.chip.on:has-text("İş")');
  ok(await page.isVisible('text=Kurucu Ortak · Çınar Yazılım A.Ş.'), 'Birden fazla profil ve profiller arası geçiş çalışıyor');

  // ---- QR üretme ----
  await page.click('[data-act="show-qr"]');
  await page.waitForSelector('.qr-full svg');
  ok(await page.isVisible('text=ekran parlaklığını artırın'), 'QR ekranında parlaklık uyarısı var');
  const decoded = await page.evaluate(async () => {
    const svg = document.querySelector('#qrBox svg').outerHTML;
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 600;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 600, 600);
    const d = x.getImageData(0, 0, 600, 600);
    return jsQR(d.data, 600, 600).data;
  });
  ok(decoded.startsWith('BEGIN:VCARD') && decoded.includes('N:Güçlü-Ağaoğlu;İlkay Şebnem;;;') && decoded.includes('ORG:Çınar Yazılım A.Ş.') && decoded.includes('TEL;TYPE=CELL,VOICE:+90 533 444 55 66'),
    'QR kod okunabiliyor ve içinde UTF-8 vCard var (ad/soyad, şirket, telefon)');
  await page.click('.qr-full');

  // Paylaş (headless'ta paylaşım menüsü yok → .vcf indirilir)
  const [dlMe] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="share-me"]')]);
  const meVcf = fs.readFileSync(await dlMe.path(), 'utf8');
  ok(meVcf.includes('FN:İlkay Şebnem Güçlü-Ağaoğlu') && dlMe.suggestedFilename().endsWith('.vcf'), 'Paylaş butonu .vcf kartvizit dosyası üretiyor');

  // ---- Etkinlik ----
  await page.click('.tab[data-view="events"]');
  await page.click('[data-act="new-event"]');
  await page.fill('#eventForm [name="name"]', 'İzmir Fuarı 2026');
  await page.click('[data-act="save-event"]');
  await page.waitForSelector('#eventPill:has-text("İzmir Fuarı 2026")');
  ok(true, 'Etkinlik oluşturuldu ve aktif etkinlik olarak ayarlandı');

  // ---- QR okutma (sahte kamera) ----
  await page.click('[data-act="add-menu"]');
  await page.click('[data-act="scan-qr"]');
  await page.waitForSelector('[data-sheet="cform"]', { timeout: 15000 });
  ok(await page.inputValue('#contactForm [name="firstName"]') === 'Gülşen' && await page.inputValue('#contactForm [name="lastName"]') === 'Kılıç'
    && await page.inputValue('#contactForm [name="company"]') === 'Öğretmenler Eğitim Ltd. Şti.' && await page.inputValue('#contactForm [name="email"]') === 'gulsen@ornek.com.tr',
    'Kamerayla QR okutma: MeCard ayrıştırıldı ve form dolduruldu');
  ok(await page.inputValue('#contactForm [name="eventId"]') !== '', 'Yeni kişi aktif etkinliğe otomatik bağlandı');
  await page.click('#tagChips [data-tag="Müşteri"]');
  await page.click('#prioSeg [data-v="yuksek"]');
  await page.click('#fuSeg [data-v="3"]');
  await page.fill('#contactForm [name="note"]', 'Stantta görüştük; ürün demosu istiyor.');
  await page.click('[data-act="save-contact"]');
  await page.waitForSelector('text=iPhone Kişiler\'e eklensin mi?');
  ok(true, 'Kayıttan hemen sonra "iPhone Kişiler\'e eklensin mi?" sorusu çıktı');

  // ---- Kişiler'e tekli ekleme ----
  const [dl1] = await Promise.all([page.waitForEvent('download'), page.click('.dialog button:has-text("iPhone Kişiler\'e ekle")')]);
  const v1 = fs.readFileSync(await dl1.path(), 'utf8');
  ok(dl1.url().includes('/files/') , 'vCard uygulamanın kendi adresinden (service worker) dosya olarak sunuldu');
  ok(v1.includes('VERSION:3.0') && v1.includes('N:Kılıç;Gülşen;;;') && v1.includes('ORG:Öğretmenler Eğitim Ltd. Şti.') && v1.includes('TITLE:Genel Müdür'), 'Tekli vCard: ad/soyad ayrı, Türkçe karakterler bozulmadan UTF-8');
  const unfolded = v1.replace(/\r\n /g, '');
  ok(/NOTE:Tanışma: İzmir Fuarı 2026\\, \d\d\.\d\d\.\d{4}\. Etiketler: Müşteri\. Not: Stantta görüştük\\; ürün demosu istiyor\./.test(unfolded), 'vCard NOT alanı: "Tanışma: {etkinlik}, {tarih}. Etiketler: … Not: …"');
  await page.waitForSelector('text=Kişiler\'e kaydedildi mi?');
  await page.click('.dialog button:has-text("Evet, Rehberde")');
  await page.waitForSelector('[data-sheet^="contact:"] .banner.ok:has-text("Rehberde ✓")');
  ok(true, 'Kişi "Rehberde ✓" olarak işaretlendi');
  await page.click('[data-sheet^="contact:"] .close-x');

  // ---- Fotoğraftan QR ----
  await page.click('[data-act="add-menu"]');
  await page.setInputFiles('#fileQR', path.join(TMP, 'qr.jpg'));
  await page.waitForSelector('[data-sheet="cform"]');
  ok(await page.inputValue('#contactForm [name="firstName"]') === 'Gülşen', 'Fotoğraftan QR okuma çalışıyor');
  // Mükerrer uyarısı
  await page.click('[data-act="save-contact"]');
  await page.waitForSelector('text=Bu kişi zaten kayıtlı olabilir');
  ok(true, 'Aynı telefon/e-posta ile kayıtta mükerrer uyarısı çıktı');
  await page.click('.dialog button:has-text("Birleştir")');
  await page.waitForSelector('text=Kişi birleştirildi');
  ok(await page.evaluate(() => window.__kartvizit.state.contacts.length) === 1, 'Birleştirme sonrası tek kayıt kaldı');
  await page.evaluate(() => document.querySelectorAll('#layers .layer').forEach(l => l.remove()));

  // ---- OCR ----
  await page.click('[data-act="add-menu"]');
  await page.setInputFiles('#fileCard', path.join(TMP, 'card.png'));
  await page.waitForSelector('[data-sheet="cform"]', { timeout: 120000 });
  const ocr = {};
  for (const k of ['firstName', 'lastName', 'title', 'company', 'phoneMobile', 'phoneWork', 'email', 'web']) ocr[k] = await page.inputValue(`#contactForm [name="${k}"]`);
  console.log('OCR sonucu:', ocr);
  ok(ocr.firstName === 'Çağrı' && ocr.lastName === 'Şahin', 'OCR: Türkçe ad soyad doğru okundu (Çağrı Şahin)');
  ok(ocr.title === 'Satış Müdürü', 'OCR: unvan doğru');
  ok(/ANADOLU TEKNOLOJ[İI] A\.Ş\./.test(ocr.company), 'OCR: şirket doğru');
  ok(ocr.phoneMobile === '+90 532 987 65 43' && ocr.phoneWork === '+90 212 555 44 33', 'OCR: cep ve iş telefonu doğru');
  ok(ocr.email === 'cagri.sahin@anadolutek.com.tr' && ocr.web === 'www.anadolutek.com.tr', 'OCR: e-posta ve web doğru');
  ok(await page.isVisible('[data-sheet="cform"] img.img-prev'), 'OCR: kartvizit fotoğrafı forma eklendi');
  await page.click('[data-act="save-contact"]');
  await page.waitForSelector('text=iPhone Kişiler\'e eklensin mi?');
  await page.click('.dialog button:has-text("Şimdi değil")');
  const saved = await page.evaluate(() => window.__kartvizit.state.contacts.find(c => c.source === 'ocr'));
  ok(saved.cardImage && saved.cardImage.startsWith('data:image/jpeg'), 'OCR: kartvizit fotoğrafı kişinin kaydında saklandı');
  await page.evaluate(() => document.querySelectorAll('#layers .layer').forEach(l => l.remove()));

  // ---- Hızlı giriş ----
  const t0 = Date.now();
  await page.click('[data-act="add-menu"]');
  await page.click('[data-act="quick-add"]');
  await page.fill('#contactForm [name="firstName"]', 'Ümit');
  await page.fill('#contactForm [name="lastName"]', 'Işık');
  await page.fill('#contactForm [name="phoneMobile"]', '0544 222 33 44');
  await page.fill('#contactForm [name="whatsapp"]', '@umit.isik');
  await page.fill('#contactForm [name="location"]', 'Kadıköy, İstanbul');
  await page.click('[data-act="geo"]');
  await page.waitForSelector('#geoInfo:has-text("40.99021, 29.02897")');
  ok(true, 'Konum: "Bulunduğum yeri ekle" GPS koordinatını forma ekledi');
  await page.click('[data-act="save-contact"]');
  await page.waitForSelector('text=iPhone Kişiler\'e eklensin mi?');
  ok(Date.now() - t0 < 10000, 'Hızlı giriş: ad + telefon ile kayıt');
  await page.click('.dialog button:has-text("Şimdi değil")');
  await page.evaluate(() => document.querySelectorAll('#layers .layer').forEach(l => l.remove()));

  // ---- Toplu ekleme ----
  await page.click('.tab[data-view="events"]');
  const bulkBtn = page.locator('[data-act="bulk-event"]');
  ok((await bulkBtn.textContent()).includes('2 kişiyi'), 'Toplu ekleme sadece rehberde olmayan 2 kişiyi sayıyor');
  const [dl2] = await Promise.all([page.waitForEvent('download'), bulkBtn.click()]);
  const v2 = fs.readFileSync(await dl2.path(), 'utf8');
  const n = (v2.match(/BEGIN:VCARD/g) || []).length;
  ok(n === 2 && v2.includes('N:Şahin;Çağrı;;;') && v2.includes('N:Işık;Ümit;;;') && !v2.includes('Gülşen'), 'Toplu vCard: 2 kişi tek dosyada, rehberdeki kişi tekrar gönderilmedi');
  const v2u = v2.replace(/\r\n /g, '');
  ok(v2u.includes('IMPP;X-SERVICE-TYPE=WhatsApp:x-apple:umit.isik') && v2u.includes('GEO:40.99021;29.02897') && v2u.includes('Konum: Kadıköy\\, İstanbul — 40.99021\\, 29.02897.'), 'vCard: WhatsApp kullanıcı adı, GEO ve NOT alanında konum var');
  ok(/PHOTO;ENCODING=b;TYPE=JPEG:/.test(v2), 'Toplu vCard: kartvizit fotoğrafı PHOTO alanında (küçültülmüş)');
  await page.click('.dialog button:has-text("Evet, Rehberde")');
  await page.waitForSelector('[data-act="bulk-event"][disabled]');
  ok(true, 'Toplu eklemeden sonra hepsi Rehberde ✓; buton pasif');

  // ---- Liste, arama, filtre ----
  await page.click('.tab[data-view="contacts"]');
  await page.fill('#q', 'demo');
  ok(await page.locator('#contactList li').count() === 1, 'Not içinde arama çalışıyor');
  await page.fill('#q', 'anadolu');
  ok(await page.locator('#contactList li').count() === 1, 'Şirket içinde arama çalışıyor');
  await page.fill('#q', '');
  await page.selectOption('[data-filter="tag"]', 'Müşteri');
  ok(await page.locator('#contactList li').count() === 1, 'Etikete göre filtre çalışıyor');
  await page.click('[data-act="clear-filters"]');

  // ---- Takip, e-posta şablonu, ics ----
  await page.evaluate(async () => { const k = window.__kartvizit; const c = k.state.contacts.find(x => x.firstName === 'Gülşen'); c.followUpAt = Date.now() - 1000; await k.db.put('contacts', c); });
  await page.reload();
  await page.waitForSelector('text=Bekleyen takipler (1)');
  ok(true, 'Uygulama açılışında bekleyen takipler en üstte listeleniyor');
  await page.click('.list .item:has-text("Gülşen")');
  const [dl3] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="ics"]')]);
  const ics = fs.readFileSync(await dl3.path(), 'utf8');
  ok(ics.includes('BEGIN:VEVENT') && ics.includes('SUMMARY:Dönüş yap: Gülşen Kılıç'), 'Takvim (.ics) takip dosyası oluşturuluyor');
  const href = await page.evaluate(() => document.querySelector('[data-sheet^="contact:"] a.action[href^="https://wa.me/"]').href);
  ok(href === 'https://wa.me/905551112233', 'WhatsApp bağlantısı doğru numarayla');

  // ---- Başka bir kişinin kartını paylaşma ----
  await page.click('[data-act="qr-contact"]');
  await page.waitForSelector('.qr-full svg');
  const cq = await page.evaluate(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(document.querySelector('#qrBox svg').outerHTML);
    await img.decode();
    const c = document.createElement('canvas'); c.width = c.height = 600;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 600, 600);
    return jsQR(x.getImageData(0, 0, 600, 600).data, 600, 600).data;
  });
  ok(cq.includes('N:Kılıç;Gülşen;;;') && cq.includes('TEL;TYPE=CELL,VOICE:+905551112233'), 'Başka kişinin kartı QR olarak gösteriliyor ve okunabiliyor');
  ok(!/NOTE|Tanışma|demo|Müşteri/.test(cq), 'Paylaşılan QR\'da özel not, etiket ve etkinlik bilgisi YOK');
  await page.click('.qr-full');
  const [dlS] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="share-contact"]')]);
  const sv = fs.readFileSync(await dlS.path(), 'utf8');
  ok(sv.includes('N:Kılıç;Gülşen;;;') && !/NOTE|Tanışma|demo/.test(sv), 'WhatsApp/AirDrop için paylaşılan vCard\'da özel not YOK');
  await page.evaluate(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
  await page.click('[data-act="wa-text-contact"]');
  const wurl = await page.evaluate(() => window.__opened[0]);
  const wtext = decodeURIComponent(wurl.split('text=')[1]);
  ok(wurl.startsWith('https://wa.me/?text=') && wtext.includes('Gülşen Kılıç') && wtext.includes('+905551112233') && !/demo|Tanışma/.test(wtext), 'WhatsApp metin paylaşımı: sadece iletişim bilgileri');

  // ---- Yedekleme ----
  await page.evaluate(() => document.querySelectorAll('#layers .layer').forEach(l => l.remove()));
  await page.click('.tab[data-view="settings"]');
  const [dlB] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="backup"]')]);
  const backupPath = path.join(TMP, 'yedek.json');
  await dlB.saveAs(backupPath);
  const bj = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  ok(bj.app === 'kartvizit' && bj.contacts.length === 3 && bj.profiles.length === 2 && bj.events.length === 1, 'JSON yedek: tüm profiller, kişiler, etkinlikler');
  const [dlC] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export-csv"]')]);
  const csv = fs.readFileSync(await dlC.path(), 'utf8');
  ok(csv.charCodeAt(0) === 0xFEFF && csv.includes('Ad;Soyad;Unvan;Şirket') && csv.includes('Çağrı;Şahin;Satış Müdürü'), 'CSV: Excel için UTF-8 BOM, ; ayırıcı, Türkçe karakterler');
  const [dlV] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export-vcf"]')]);
  ok((fs.readFileSync(await dlV.path(), 'utf8').match(/BEGIN:VCARD/g) || []).length === 3, 'Toplu vCard dışa aktarma (3 kişi)');

  // Sıfırla (çift onay) → geri yükle
  await page.click('[data-act="reset-all"]');
  await page.click('.dialog button:has-text("Devam et")');
  await page.click('.dialog button:has-text("Evet, her şeyi sil")');
  await page.waitForSelector('text=Kartvizitinizi oluşturun');
  ok(await page.evaluate(() => window.__kartvizit.state.contacts.length) === 0, 'Verileri sıfırla: çift onaydan sonra tüm veriler silindi');
  await page.click('.tab[data-view="settings"]');
  await page.setInputFiles('#fileRestore', backupPath);
  await page.click('.dialog button:has-text("Mevcut verilerin yerine geç")');
  await page.waitForSelector('#contactList li');
  const rs = await page.evaluate(() => { const s = window.__kartvizit.state; return { c: s.contacts.length, p: s.profiles.length, e: s.events.length, img: !!s.contacts.find(c => c.cardImage), inC: s.contacts.filter(c => c.inContacts).length }; });
  ok(rs.c === 3 && rs.p === 2 && rs.e === 1 && rs.img && rs.inC === 3, 'Yedekten geri yükleme: kişiler, fotoğraflar, Rehberde işaretleri geri geldi');

  // ---- PIN ----
  await page.click('.tab[data-view="settings"]');
  await page.click('[data-act="set-pin"]');
  for (const k of '12341234') await page.click(`.pin [data-k="${k}"]`);
  await page.waitForSelector('text=PIN kilidi açıldı');
  await page.click('[data-act="lock-now"]');
  await page.click('[data-act="show-qr"]');
  ok(await page.isVisible('.qr-full svg'), 'PIN açıkken kendi QR kodum PIN\'siz gösteriliyor');
  await page.click('.qr-full');
  await page.click('.tab[data-view="contacts"]');
  await page.waitForSelector('.pin');
  for (const k of '9999') await page.click(`.pin [data-k="${k}"]`);
  await page.waitForTimeout(500);
  ok(await page.isVisible('.pin') && !(await page.isVisible('#contactList')), 'Yanlış PIN ile kişi listesi açılmıyor');
  for (const k of '1234') await page.click(`.pin [data-k="${k}"]`);
  await page.waitForSelector('#contactList li');
  ok(true, 'Doğru PIN ile kişi listesi açıldı');

  // ---- Çevrimdışı ----
  await page.waitForFunction(() => navigator.serviceWorker.controller);
  await page.waitForTimeout(1500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('text=QR Kodu Göster');
  ok(true, 'Çevrimdışı (internet yokken) uygulama açılıyor');
  const ocrCached = await page.evaluate(async () => !!(await caches.match('lib/tesseract/lang/tur.traineddata.gz', { ignoreSearch: true })));
  ok(ocrCached, 'OCR dil dosyaları çevrimdışı kullanım için önbellekte');
  await ctx.setOffline(false);

  // ---- XSS: zararlı QR içeriği çalıştırılamaz ----
  await page.click('.tab[data-view="contacts"]');
  await page.waitForSelector('.pin');
  for (const k of '1234') await page.click(`.pin [data-k="${k}"]`);
  await page.waitForSelector('#contactList li');
  await page.evaluate(() => window.__kartvizit.handleQRText('BEGIN:VCARD\nVERSION:3.0\nN:<img src=x onerror="window.__xss=1">;"><script>window.__xss=2</script>\nORG:<svg onload="window.__xss=3">\nURL:javascript:window.__xss=4\nX-SOCIALPROFILE;TYPE=linkedin:javascript:window.__xss=5\nEMAIL:a@b.com?bcc=kotu@x.com\nEND:VCARD'));
  await page.waitForSelector('[data-sheet="cform"]');
  await page.click('[data-act="save-contact"]');
  await page.waitForSelector('.dialog');
  await page.click('.dialog button:has-text("Şimdi değil")');
  await page.waitForSelector('[data-sheet^="contact:"]');
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('[data-sheet^="contact:"] a')].map(a => a.getAttribute('href')));
  await page.evaluate(() => document.querySelectorAll('#layers .layer').forEach(l => l.remove()));
  await page.click('.tab[data-view="card"]'); await page.click('.tab[data-view="contacts"]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__xss) === undefined && !hrefs.some(h => /javascript:|bcc=/i.test(h || '')), 'Zararlı QR (XSS / javascript: bağlantısı / e-posta enjeksiyonu) çalıştırılamadı');

  // ---- Güvenlik / sızma kontrolleri ----
  ok(externalLog.length === 0, 'Tüm testler boyunca uygulama dış dünyaya TEK BİR istek bile yapmadı (OCR, QR, kamera dahil)' + (externalLog.length ? ': ' + externalLog.join(', ') : ''));
  const nonGet = serverLog.filter(r => r.method !== 'GET' || r.body > 0);
  ok(nonGet.length === 0, 'Uygulama kendi sunucusuna (GitHub Pages) hiçbir veri GÖNDERMEDİ (POST/PUT/gövde yok)');
  const secret = /g%C3%BCl|gulsen|kilic|%C3%87a%C4%9Fr|cagri|sahin|umit|isik|ilkay|ornek|anadolu|905|0532|533|demo|izmir|%C4%B0zmir/i;
  const leaky = serverLog.filter(r => secret.test(r.url) || r.url.includes('?'));
  ok(leaky.length === 0, 'Sunucu isteklerinde hiçbir kişisel veri yok (sadece uygulama dosyaları istendi)' + (leaky.length ? ': ' + leaky.map(r => r.url).join(', ') : ''));
  const allowed = /^\/(index\.html|styles\.css|sw\.js|manifest\.webmanifest|js\/[a-z]+\.js|lib\/[\w./-]+|icons\/[\w.-]+\.png|favicon\.ico)?$/;
  const odd = serverLog.filter(r => !allowed.test(r.url.split('?')[0]));
  ok(odd.length === 0, 'Sunucudan sadece bilinen uygulama dosyaları istendi' + (odd.length ? ': ' + odd.map(r => r.url).join(', ') : ''));

  const realErrors = errors.filter(e => !/favicon|net::ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e));
  ok(realErrors.length === 0, 'Konsolda hata yok' + (realErrors.length ? ': ' + realErrors.join(' | ') : ''));

  // Ölçüm düzeneğinin gerçekten çalıştığını doğrula: bilerek dış istek at, kaydedilmeli
  const blocked = await page.evaluate(() => new Promise(r => {
    document.addEventListener('securitypolicyviolation', e => r(e.violatedDirective), { once: true });
    fetch('https://example.com/kontrol').catch(() => null);
    setTimeout(() => r(null), 1500);
  }));
  ok(blocked === 'connect-src', 'Güvenlik politikası (CSP): uygulama içinden dış adrese bağlantı tarayıcı tarafından engelleniyor');
  const before = externalLog.length;
  const probe = await ctx.newPage();
  await probe.goto('http://example.com/kontrol').catch(() => null);
  await probe.close();
  ok(externalLog.length > before, 'Kontrol: ölçüm düzeneği dış istekleri gerçekten yakalıyor (ayrı sekmeden atılan deneme isteği kaydedildi)');
  await page.screenshot({ path: path.join(TMP, 'son.png') });
  await browser.close();
  server.close(); proxy.close();
  console.log(`\nTOPLAM: ${passed} kontrol başarılı`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
