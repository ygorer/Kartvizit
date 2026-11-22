// Node ile çalışan birim testleri: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVCard, parseVCards, parseQRContent, buildNote, foldLine, buildICS, whatsappNumber, phoneKey } from '../js/vcard.js';
import { parseCardText } from '../js/parse.js';

const tr = { firstName: 'Şükrü İsmail', lastName: 'Çağlayan-Öztürk', title: 'Gıda İhracat Müdürü', company: 'Iğdır Üzüm; Çay, A.Ş.',
  phoneMobile: '+90 532 111 22 33', phoneWork: '+90 212 444 55 66', email: 'sukru@ornek.com.tr', web: 'ornek.com.tr',
  linkedin: 'linkedin.com/in/sukru', address: 'Kızılay Mah. Atatürk Blv. No:1, Çankaya/Ankara', createdAt: new Date(2026, 10, 22).getTime(),
  tags: ['Müşteri', 'İş ortağı'], note: 'Çok ilgili; ğüşıöç' };

test('vCard 3.0: Türkçe karakterler, ayrı ad/soyad, tüm alanlar', () => {
  const note = buildNote(tr, 'Teknoloji Zirvesi');
  assert.equal(note, 'Tanışma: Teknoloji Zirvesi, 22.11.2026. Etiketler: Müşteri, İş ortağı. Not: Çok ilgili; ğüşıöç');
  const v = buildVCard({ ...tr, photo: 'data:image/jpeg;base64,' + 'A'.repeat(500) }, { note });
  assert.match(v, /^BEGIN:VCARD\r\nVERSION:3\.0\r\n/);
  assert.match(v, /\r\nN:Çağlayan-Öztürk;Şükrü İsmail;;;\r\n/);
  assert.match(v, /\r\nFN:Şükrü İsmail Çağlayan-Öztürk\r\n/);
  assert.ok(v.includes("\r\nORG:Iğdır Üzüm\\; Çay\\, A.Ş.\r\n"));
  assert.match(v, /TEL;TYPE=CELL,VOICE:\+90 532 111 22 33/);
  assert.match(v, /TEL;TYPE=WORK,VOICE:\+90 212 444 55 66/);
  assert.match(v, /EMAIL;TYPE=INTERNET,WORK:sukru@ornek\.com\.tr/);
  assert.match(v, /URL;TYPE=WORK:https:\/\/ornek\.com\.tr/);
  assert.match(v, /item1\.URL:https:\/\/linkedin\.com\/in\/sukru/);
  assert.match(v, /ADR;TYPE=WORK:;;Kızılay/);
  assert.match(v, /PHOTO;ENCODING=b;TYPE=JPEG:AAAA/);
  assert.match(v, /\r\nEND:VCARD\r\n$/);
  // her satır en fazla 75 bayt
  for (const line of v.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  // geri ayrıştırınca aynı veriler
  const [p] = parseVCards(v);
  assert.equal(p.firstName, 'Şükrü İsmail');
  assert.equal(p.lastName, 'Çağlayan-Öztürk');
  assert.equal(p.company, 'Iğdır Üzüm; Çay, A.Ş.');
  assert.equal(p.title, 'Gıda İhracat Müdürü');
  assert.equal(p.phoneMobile, '+90 532 111 22 33');
  assert.equal(p.phoneWork, '+90 212 444 55 66');
  assert.equal(p.linkedin, 'https://linkedin.com/in/sukru');
  assert.equal(p.note, note);
  assert.ok(p.photo.startsWith('data:image/jpeg;base64,AAAA'));
});

test('foldLine çok baytlı karakterleri bölmez', () => {
  const s = 'NOTE:' + 'ğüşİıçö'.repeat(30);
  const f = foldLine(s);
  const back = f.split('\r\n ').join('');
  assert.equal(back, s);
  for (const l of f.split('\r\n')) assert.ok(Buffer.byteLength(l) <= 75);
});

test('Toplu vCard ayrıştırma (birden çok kişi)', () => {
  const v = buildVCard(tr) + buildVCard({ firstName: 'Ayşe', lastName: 'Güneş', email: 'ayse@x.com' });
  const list = parseVCards(v);
  assert.equal(list.length, 2);
  assert.equal(list[1].firstName, 'Ayşe');
});

test('vCard 2.1 quoted-printable', () => {
  const v = 'BEGIN:VCARD\r\nVERSION:2.1\r\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=C3=96zt=C3=BCrk;=C5=9Eule\r\nTEL;CELL:05321112233\r\nEND:VCARD';
  const [c] = parseVCards(v);
  assert.equal(c.lastName, 'Öztürk');
  assert.equal(c.firstName, 'Şule');
  assert.equal(c.phoneMobile, '05321112233');
});

test('QR içerik türleri', () => {
  let r = parseQRContent('MECARD:N:Yılmaz,Ahmet;TEL:+905321234567;EMAIL:ahmet@firma.com;ORG:Firma A.Ş.;URL:https://firma.com;;');
  assert.equal(r.kind, 'mecard');
  assert.deepEqual([r.contact.firstName, r.contact.lastName, r.contact.phoneMobile, r.contact.email, r.contact.company, r.contact.web],
    ['Ahmet', 'Yılmaz', '+905321234567', 'ahmet@firma.com', 'Firma A.Ş.', 'https://firma.com']);
  r = parseQRContent('https://www.linkedin.com/in/elif-sahin-3a2b1c/');
  assert.equal(r.kind, 'linkedin');
  assert.equal(r.contact.firstName, 'Elif');
  assert.equal(r.contact.lastName, 'Sahin');
  r = parseQRContent('www.ornek.com');
  assert.equal(r.kind, 'url');
  assert.equal(r.contact.web, 'https://www.ornek.com');
  r = parseQRContent('Merhaba ben Can Demir 0532 123 45 67', parseCardText);
  assert.equal(r.kind, 'text');
  assert.equal(r.contact.phoneMobile, '+90 532 123 45 67');
});

test('OCR metninden alan tahmini (Türkçe kart)', () => {
  const text = `ANADOLU TEKNOLOJİ A.Ş.
MEHMET ÖZDEMİR
Satış Müdürü
M: 0532 987 65 43
T: +90 (212) 555 44 33
F: +90 212 555 44 34
mehmet.ozdemir@anadolutek.com.tr
www.anadolutek.com.tr
Barbaros Mah. Çiğdem Sok. No:5 Kat:3
Ataşehir / İstanbul`;
  const c = parseCardText(text);
  assert.equal(c.firstName, 'Mehmet');
  assert.equal(c.lastName, 'Özdemir');
  assert.equal(c.title, 'Satış Müdürü');
  assert.equal(c.company, 'ANADOLU TEKNOLOJİ A.Ş.');
  assert.equal(c.phoneMobile, '+90 532 987 65 43');
  assert.equal(c.phoneWork, '+90 212 555 44 33');
  assert.equal(c.email, 'mehmet.ozdemir@anadolutek.com.tr');
  assert.equal(c.web, 'www.anadolutek.com.tr');
  assert.match(c.address, /Barbaros Mah/);
  assert.match(c.address, /İstanbul/);
});

test('OCR metninden alan tahmini (İngilizce kart)', () => {
  const c = parseCardText(`Jane Cooper
Senior Product Manager
Northwind Solutions Ltd.
+44 20 7946 0958
jane.cooper@northwind.co.uk
linkedin.com/in/janecooper`);
  assert.equal(c.firstName, 'Jane');
  assert.equal(c.lastName, 'Cooper');
  assert.equal(c.title, 'Senior Product Manager');
  assert.equal(c.company, 'Northwind Solutions Ltd.');
  assert.equal(c.email, 'jane.cooper@northwind.co.uk');
  assert.equal(c.linkedin, 'linkedin.com/in/janecooper');
  assert.ok(c.phoneMobile || c.phoneWork);
});

test('ICS takvim dosyası', () => {
  const ics = buildICS({ uid: 'x1', title: 'Dönüş yap: Şükrü', description: 'Not: ğüş', start: new Date(2026, 11, 1, 10, 0) });
  assert.match(ics, /BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /DTSTART:20261201T100000/);
  assert.match(ics, /SUMMARY:Dönüş yap: Şükrü/);
  assert.match(ics, /BEGIN:VALARM/);
});

test('Telefon yardımcıları', () => {
  assert.equal(whatsappNumber('0532 123 45 67'), '905321234567');
  assert.equal(whatsappNumber('+90 (532) 123-45-67'), '905321234567');
  assert.equal(whatsappNumber('532 123 45 67'), '905321234567');
  assert.equal(phoneKey('+90 532 123 45 67'), phoneKey('0532 123 4567'));
});
