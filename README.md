# Kartvizit

iPhone için dijital kartvizit uygulaması. Etkinliklerde kendi kartvizitinizi QR kodla paylaşır, tanıştığınız kişileri (QR, kâğıt kartvizit fotoğrafı veya elle) hızlıca kaydeder ve iPhone Kişiler'e ekler.

- **Sunucu yok, hesap yok.** Tüm veriler sadece telefonunuzda (tarayıcının IndexedDB deposunda) saklanır.
- **Kişisel bilgileriniz kodda yok.** Bilgilerinizi ilk açılışta uygulamanın içinden girersiniz.
- **İnternetsiz çalışır.** QR okuma, QR üretme ve kartvizit metin okuma (OCR) tamamen telefonda yapılır.
- Analitik, reklam veya dış servise veri gönderimi **yoktur**.

Yayın adresi: **https://ygorer.github.io/Kartvizit/**

---

## 1. Yayını açma (tek seferlik, telefondan)

GitHub Pages ayarı GitHub'ın güvenlik kuralları gereği sadece depo sahibi tarafından açılabilir. Telefondan şöyle yapın:

1. Safari'de **github.com/ygorer/Kartvizit** adresini açın ve GitHub hesabınızla giriş yapın.
   (GitHub uygulaması bu ayarı göstermez; Safari kullanın. Sayfa mobil görünümde ayarları göstermezse alttaki **aA** veya **⋯** menüsünden **Masaüstü Web Sitesi İste**'ye dokunun.)
2. Depo sayfasında üstteki **⚙️ Settings (Ayarlar)** sekmesine dokunun.
3. Soldaki menüden (mobilde sayfanın altına doğru) **Pages**'e dokunun.
4. **Build and deployment → Source** kısmında **Deploy from a branch** seçili olsun.
5. **Branch** kısmında dalı seçin (uygulamanın bulunduğu dal; örn. `main` veya `claude/...`), klasör olarak **/ (root)** seçin ve **Save**'e dokunun.
6. 1–2 dakika bekleyin. Sayfanın üstünde "Your site is live at https://ygorer.github.io/Kartvizit/" yazısı çıkar.

> Depo **Public (herkese açık)** olmalıdır. Ücretsiz GitHub hesaplarında Pages sadece herkese açık depolarda çalışır. Kodda kişisel bilgi yoktur.

## 2. iPhone'a kurulum (ana ekrana ekleme)

1. iPhone'da **Safari** ile https://ygorer.github.io/Kartvizit/ adresini açın. (Chrome değil, Safari olmalı.)
2. Alttaki **Paylaş** düğmesine (kare ve yukarı ok ⬆️) dokunun.
3. Listeyi aşağı kaydırıp **Ana Ekrana Ekle**'ye dokunun.
4. Ad olarak **Kartvizit** görünür; sağ üstten **Ekle**'ye dokunun.
5. Artık ana ekrandaki **Kartvizit** simgesinden açın. Uygulama tam ekran açılır ve internetsiz de çalışır.
6. İlk açılışta **Profil oluştur**'a dokunup bilgilerinizi girin. İsterseniz **+ Profil** ile "İş" ve "Kişisel" gibi ikinci bir profil ekleyin.

> Önemli: Verileriniz "ana ekran uygulamasının" kendi deposunda tutulur. Safari sekmesinde girdiğiniz veriler ana ekran uygulamasında görünmez (ve tersi). Hep ana ekrandaki simgeyi kullanın.

## 3. Güncelleme

- Uygulama yeni bir sürüm yayınlandığında, açılışta bunu kendiliğinden fark eder ve **Kartım** ekranında **"Yeni sürüm hazır. Güncellemek için dokunun."** yazısı çıkar. Dokunmanız yeterli.
- Bu yazı çıkmazsa: uygulamayı tamamen kapatın (ekranın altından yukarı kaydırıp uygulamayı yukarı atın), internete bağlıyken tekrar açın; gerekirse bir kez daha kapatıp açın.
- Güncelleme verilerinizi **silmez**. Yine de güncellemeden önce yedek almak iyi bir alışkanlıktır.

## 4. Kullanım

### Kendi kartvizitim
- **QR Kodu Göster**: Tam ekran QR açılır. Karşı taraf iPhone veya Android kamerasıyla okuttuğunda kartınız doğrudan rehberine kaydedilebilir. Okutmayı kolaylaştırmak için ekran parlaklığını artırın (QR gösterilirken ekran kararmaz).
- **Paylaş**: iPhone paylaşım menüsü açılır; AirDrop, WhatsApp, Mesajlar veya e-posta ile `.vcf` kartvizit dosyası gönderilir.
- Profiller arasında üstteki **İş / Kişisel** düğmeleriyle geçiş yapın.

### Kişi ekleme (ortadaki **+** düğmesi)
- **QR Okut**: vCard, MeCard, LinkedIn linki, web linki veya düz metin okunur ve form otomatik dolar. Kamera açılmazsa **Fotoğraftan** ile galeriden QR fotoğrafı seçebilirsiniz.
- **Kartvizit Fotoğrafı**: Kâğıt kartvizitin fotoğrafını çekin; Türkçe ve İngilizce metin telefonda okunur, ad, unvan, şirket, telefon, e-posta ve web alanları tahmin edilir. Kaydetmeden önce alanları kontrol edip düzeltin. Kartın fotoğrafı kişinin kaydında saklanır. (İlk kullanımda OCR motorunun açılması 10–30 saniye sürebilir.)
- **Hızlı Giriş**: Sadece ad ve telefon/e-posta yazıp **Kaydet**.

### Bir kişinin kartını başkasıyla paylaşma
Kişi kartını açın ve **Bu kişiyi başkasıyla paylaş** bölümünü kullanın:
- **▦ QR kod olarak göster**: Karşı taraf kamerasıyla okutup kişiyi rehberine kaydeder.
- **💬 WhatsApp / AirDrop / Mesajlar (vCard)**: Paylaşım menüsü açılır; **WhatsApp**'ı seçip alıcıyı seçin. Kişi, WhatsApp'ta kartvizit (.vcf) olarak gider.
- **💬 WhatsApp'ta metin olarak gönder**: WhatsApp açılır; alıcıyı seçince iletişim bilgileri metin olarak gönderilir.

Paylaşılan kartta **sadece iletişim bilgileri** bulunur. Kendi notlarınız, etiketler, öncelik ve etkinlik bilgisi **asla gönderilmez**.

### Etkinlik ve takip
- **Etkinlik** sekmesinde etkinlik oluşturup **aktif** yapın. Aktifken kaydettiğiniz herkes otomatik olarak o etkinliğe bağlanır (üst köşede yeşil etkinlik adı görünür).
- Her kişiye etiket (Müşteri, Tedarikçi, İş ortağı, Aday…), öncelik, not ve **takip hatırlatması** (X gün sonra dönüş) eklenebilir.
- Zamanı gelen takipler uygulama açıldığında **Kişiler** ekranının en üstünde listelenir. Kişi kartındaki **📅 Takvime ekle** ile iPhone Takvim'e hatırlatma eklenir.
- Kişi kartından tek dokunuşla **Ara**, **WhatsApp**, **E-posta**, **LinkedIn** ve **Takip e-postası hazırla** (şablon: "Merhaba {ad}, {etkinlik}'te tanışmak güzeldi…"). Şablonu **Ayarlar**'dan değiştirebilirsiniz.

## 5. Kişileri iPhone Kişiler'e ekleme

### Tek kişi
1. Kişiyi kaydedince **"iPhone Kişiler'e eklensin mi?"** sorusu çıkar (Ayarlar → *Her kayıttan sonra otomatik sor* ile açıp kapatabilirsiniz). Ya da kişi kartındaki yeşil **📇 iPhone Kişiler'e ekle** düğmesine dokunun.
2. iPhone'un kişi ekranı açılır. **Yeni Kişi Oluştur**'a (veya **Kaydet**'e) dokunun.
3. Uygulamaya dönünce sorulan **"Kişiler'e kaydedildi mi?"** sorusuna **Evet** deyin. Kişi **Rehberde ✓** olarak işaretlenir.

Kişiler'e eklenen kartta şunların hepsi bulunur: ad ve soyad (ayrı alanlarda), unvan, şirket, cep ve iş telefonu, e-posta, web, LinkedIn, adres, fotoğraf (kişi fotoğrafı yoksa küçültülmüş kartvizit fotoğrafı) ve NOT alanında:
`Tanışma: {etkinlik adı}, {tarih}. Etiketler: {etiketler}. Not: {notunuz}`

### Toplu ekleme
- **Etkinlik** sekmesinde etkinliğin yanındaki **📇 N kişiyi Kişiler'e ekle** düğmesi, o etkinlikte henüz rehbere eklenmemiş kişileri **tek bir .vcf dosyasında** birleştirir. iPhone'da **"Tüm N Kişiyi Ekle"**ye dokunun, sonra uygulamada **Evet**'i seçin.
- "Rehberde ✓" olan kişiler toplu eklemede **tekrar gönderilmez**.
- Kişiler listesinde filtre uyguladığınızda "Listelenen N kişiyi Kişiler'e ekle" düğmesi de çıkar. Ayarlar'da "Rehberde olmayan tüm kişileri ekle" de vardır.

### Mükerrer önleme
Yeni bir kişi kaydederken aynı telefon veya e-posta uygulamada zaten varsa uyarı çıkar ve **birleştirme** önerilir.

### Hangi yöntem kullanılıyor? (teknik not)
Ana ekran uygulamalarında Safari'nin "indirme" davranışı kısıtlı olduğu için iki yöntem vardır (Ayarlar → *Ekleme yöntemi*):

| Yöntem | Nasıl çalışır |
|---|---|
| **Kişi ekranını doğrudan aç** (varsayılan, önerilen) | vCard dosyası uygulamanın kendi adresinden (service worker üzerinden, `files/...vcf`) gerçek bir dosya olarak açılır; Safari bunu iPhone'un kişi ekranıyla gösterir. Blob/data adresleri ana ekran uygulamalarında güvenilir çalışmadığı için bu yöntem seçildi. Service worker henüz hazır değilse (ilk açılışın ilk saniyeleri) `data:` adresi denenir. |
| **Paylaşım menüsü** | `.vcf` dosyası iOS paylaşım menüsüyle açılır; menüde **Kişiler** (veya dosya önizlemesi → paylaş → Kişiler) seçilir. |

Kişi ekranı açılmazsa çıkan soruda **"Kişi ekranı açılmadı — paylaşım menüsüyle dene"** düğmesi diğer yöntemi dener. Hangisi telefonunuzda çalışıyorsa Ayarlar'dan onu seçin.

**Hızlı deneme:** Ayarlar → **🧪 Türkçe karakterli deneme kişisi ekle**. "Şükrü Çağlayan-Öztürk / Gıda İhracat Müdürü / Iğdır Üzüm ve Çay A.Ş." kişisi açılır. Kişiler'de ş, ğ, ı, İ, ç, ö, ü harfleri doğru görünüyorsa her şey yolundadır. Sonra deneme kişisini Kişiler'den silebilirsiniz.

## 6. Yedekleme

- **Ayarlar → 💾 Yedek al (JSON)**: Paylaşım menüsü açılır. **Dosyalar'a Kaydet** → **iCloud Drive** → bir klasör seçip **Kaydet**. Tüm profiller, kişiler, kartvizit fotoğrafları, etkinlikler ve ayarlar tek dosyadadır.
- **Geri yükleme**: Ayarlar → **♻️ Yedekten geri yükle** → iCloud Drive'dan yedek dosyasını seçin. "Birleştir" (mevcut verileri korur) ya da "Mevcut verilerin yerine geç" seçin.
- **CSV (Excel)**: Ayarlar → **📊 CSV olarak dışa aktar**. Excel'de Türkçe karakterlerle düzgün açılır (`;` ayırıcı, UTF-8).
- **Toplu vCard**: Ayarlar → **👥 Tüm kişileri vCard olarak dışa aktar**.
- Son yedekten **14 gün** geçtiyse uygulama yedek almanızı hatırlatır.

> Uygulamayı ana ekrandan silerseniz veya iPhone "Safari geçmişini ve verilerini temizle" yaparsanız veriler silinebilir. Düzenli yedek alın.

## 7. Gizlilik ve veri güvenliği

**Uygulama hiçbir sunucuya veri göndermez.** GitHub Pages sadece uygulama dosyalarını (HTML, JS, simgeler, OCR dil dosyaları) telefona indirir; bu, bir web sayfasını açmakla aynıdır. Girdiğiniz bilgiler ve kişiler telefonunuzdaki IndexedDB deposunda kalır. GitHub'a, Claude'a, Anthropic'e veya başka bir yere gitmez.

Teknik önlemler:
- Sayfada **İçerik Güvenlik Politikası (CSP)** var: tarayıcı, uygulamanın kendi adresi dışındaki hiçbir adrese bağlantı kurulmasına izin vermez (`connect-src 'self'`).
- Analitik, reklam, çerez, yazı tipi servisi veya CDN yoktur. Bütün kütüphaneler repoya dahildir. OCR kütüphanesindeki varsayılan CDN adresleri koddan çıkarılmıştır.
- Kişiler'e ekleme ve takvim için oluşturulan geçici dosyalar telefonda tutulur, adlarında kişi adı yer almaz ve 2 dakika içinde silinir.
- QR koddan gelen içerik güvenli işlenir: kod enjeksiyonu (XSS), `javascript:` bağlantıları ve e-posta başlığı enjeksiyonu engellenir. CSV dışa aktarmada Excel formül enjeksiyonu engellenir.
- Otomatik testler, tarayıcının dışarıya yaptığı her isteği kaydeden bir düzenekle çalışır. Tüm akışlarda (QR, OCR, kamera, Kişiler'e ekleme, yedekleme) **sıfır dış istek** ve sunucuya **sıfır veri gönderimi** doğrulanmıştır (`tests/e2e.cjs`).

Veri telefondan **yalnızca sizin dokunuşunuzla** çıkar:
- Paylaş / WhatsApp / AirDrop ile birine kart gönderdiğinizde,
- **Kişiler'e ekle** dediğinizde: iCloud Kişiler açıksa Apple bunları iCloud'a eşitler (iPhone Ayarlar → [adınız] → iCloud → Kişiler),
- **Yedek al** dediğinizde: iCloud Drive'a kaydederseniz yedek Apple'ın bulutuna gider. Sadece telefonda kalsın istiyorsanız **Dosyalar → iPhone'umda** klasörünü seçin,
- Ara / e-posta / WhatsApp / LinkedIn düğmelerine dokunduğunuzda (ilgili uygulama açılır).

Bilinmesi gerekenler:
- iPhone'un kendi iCloud yedeği açıksa, Apple tüm telefonu yedeklerken uygulama verileri de bu yedeğe girebilir (şifreli Apple yedeği).
- Uygulama kodu GitHub'dan yüklendiği için GitHub hesabınızın güvenliği önemlidir. GitHub hesabınızda **iki adımlı doğrulamayı (2FA)** açın. Kodu sadece siz (ya da sizin isteğinizle Claude) değiştirebilirsiniz.

## 8. Güvenlik (PIN ve sıfırlama)

- **Ayarlar → 🔒 4 haneli PIN kilidi**: Kişiler, etkinlikler ve ayarlar için PIN istenir. Kendi QR kodunuz ve kartınızı paylaşma PIN'siz çalışır. Uygulama 1 dakikadan uzun arka planda kalırsa yeniden kilitlenir.
  PIN bir ekran kilididir; telefonun kendi kilidi ve Face ID'si asıl korumadır.
- **Ayarlar → 🗑 Verileri sıfırla**: İki kez onay ister ve bu telefondaki tüm uygulama verilerini siler. (iPhone Kişiler'e eklenmiş kişiler silinmez.)

---

## Geliştirici notları

Yapı derleme gerektirmez; dosyalar olduğu gibi yayınlanır.

```
index.html, styles.css, manifest.webmanifest, sw.js
js/app.js      arayüz ve akışlar
js/vcard.js    vCard 3.0 üretimi, vCard/MeCard/QR içerik ayrıştırma, .ics
js/parse.js    kartvizit OCR metninden alan tahmini
js/db.js       IndexedDB
lib/           üçüncü taraf kütüphaneler (CDN kullanılmaz)
icons/         uygulama simgeleri
tests/         testler
```

Kütüphaneler (repoya dahil, lisans dosyalarıyla):
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4 (MIT) — QR üretimi
- [jsQR](https://github.com/cozmo/jsQR) 1.4.0 (Apache-2.0) — QR okuma (iOS Safari'de çalışır)
- [Tesseract.js](https://github.com/naptha/tesseract.js) 5.1.1 + tesseract.js-core 5.1.1 (Apache-2.0) — OCR
- Tesseract dil verileri `tur` ve `eng` (4.0.0_best_int)

Testler:
```
node --test tests/unit.test.mjs      # vCard, Türkçe karakter, QR içerik, OCR ayrıştırma
node tests/e2e.cjs                   # Chromium + Playwright ile uçtan uca (playwright gerekir)
```

Yeni sürüm yayınlarken `sw.js` içindeki `VERSION` değerini artırın; aksi halde telefonlar eski önbelleği kullanmaya devam eder.
