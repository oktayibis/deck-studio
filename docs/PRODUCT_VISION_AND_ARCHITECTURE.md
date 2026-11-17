# Deck Studio — Ürün Vizyonu, Kullanıcı Deneyimi ve SaaS Mimarisi

Bu doküman, **Deck Studio**'nun ne olduğunu, kullanıcının hangi temel sorunlarını çözdüğünü, uçtan uca kullanıcı deneyimini ve hedef SaaS mimarisini (`Rust Axum + SQL` + `React/TypeScript` + `Bağımsız HTML Sunum Motoru`) tanımlar.

---

## 1. Ürün Nedir? (Tek Cümlelik Özet)

**Deck Studio**, şirketlerin ve profesyonellerin **kendi kurumsal tasarım kimliklerinden (CVI) milim sapmayan**, etkileşimli ve sunuma hazır sunumları dakikalar içinde üretmesini sağlayan **yapay zeka destekli bir SaaS ürünüdür**.

Klasik AI sunum araçları herkese aynı görünen jenerik şablonlar üretir; PowerPoint'te ise insanlar saatlerce kutu hizalamak, font düzeltmek ve marka kurallarını tutturmakla uğraşır. **Deck Studio bu iki dünyayı birleştirir**: Kullanıcının kendi CVI/tasarım kurallarını bir kez öğrenir; sonrasında kullanıcı yalnızca konuyu ve elindeki ekran görüntülerini/videoları verir, sistem de şirketin tasarım ekibi elinden çıkmış gibi kusursuz ve doğrulanmış bir sunum üretir.

---

## 2. Kullanıcının Hangi Sorunlarını Çözüyor?

1. **"Slayt Hizalama" Mesaisini Bitirir**: Mühendisler, ürün yöneticileri veya yöneticiler 10 dakikalık bir sunum için saatlerce PowerPoint'te kutu kaydırmak, renk kodu aramak ve ekran görüntüsü kırpmak zorunda kalmaz.
2. **Marka (CVI) Bozulmasını %100 Engeller**: Şirketlerde eski sunumların kopyalanıp bozulmasıyla oluşan yanlış logo yerleşimi, okunmayan kontrastlar ve yasaklı gölge/gradyan kullanımı ortadan kalkar. Arka plandaki **Headless Chromium Kalite Denetçisi**, her slaytı WCAG AA kontrastı, taşma (overflow) ve CVI renk paleti açısından otomatik denetler ve hataları kendi düzeltir.
3. **Uydurma Bilgi (Halüsinasyon) Üretmez**: AI yalnızca kullanıcının verdiği notlardaki gerçek rakamları, tarihleri ve yüklediği ekran görüntülerini/videoları kanıt olarak kullanır; asla metrik uydurmaz.
4. **Canlı Sunumda Ekstra Araç İhtiyacını Kaldırır**: Sunum sırasında ekran üzerinde kalemle çizmek, önemli bir kelimeye tıklayarak altını çizmek, lazer tutmak, bir ekran görüntüsüne `2×` yakınlaşmak veya ikinci ekranda konuşmacı notlarını/süreyi görmek doğrudan sunum motorunun içindedir.

---

## 3. Kullanıcı Gözüyle Adım Adım Etkileşim Akışı

### Adım 1: Kendi Markasını (CVI) Oluşturma *(İlk Kurulum — 2 Dakika)*
- Kullanıcı üye olduğunda sabit bir şablonla değil, **"Kendi Marka Kimliğinizi (CVI) Oluşturun"** sihirbazıyla karşılaşır.
- Şirketinin `.pptx` / `.potx` / `.thmx` şablonunu, logosunu, kurumsal fontlarını veya web sitesi URL'sini yükler.
- Sistem; renk rollerini, tipografi ölçeğini, inch cinsinden şablon geometrisini ve *"asla gölge kullanma, logoyu sadece kapak ve son slayta koy"* kurallarını çıkarır.
- Kullanıcı ekranda kendi CVI'ı ile üretilmiş canlı **Bileşen Galerisi**ni görür ve onaylar.
- **Paket Kotaları**:
  - **Starter**: `2 CVI` hakkı · Günde `4 sunum` üretimi
  - **Pro**: `4 CVI` hakkı · Günde `20 sunum` üretimi
  - **Enterprise**: `16 CVI` hakkı · Günde `100 sunum` üretimi *(Dinamik olarak değiştirilebilir)*

### Adım 2: Sunum Üretme *(Her Sunumda — 1-2 Dakika)*
- **CVI Seçimi**: Kendi oluşturduğu CVI'lardan birini seçer.
- **Hedef Kitle Seçimi**:
  - *Yönetim*: Büyük KPI sayaçları, vurgulu bar grafikler, zaman çizelgesi (kod bloğu içermez).
  - *Geliştiriciler*: Canlı iz süren akış diyagramları (`trace dot`), satır satır yazılan kod blokları, sohbet dökümleri ve kontrol listeleri.
  - *Ürün Ekibi*: Kullanıcı yolculukları, yakınlaştırılabilir ekran görüntüleri, öncesi/sonrası karşılaştırmaları.
- **Görsel & Video Kanıtlar**: Ekran görüntülerini (`⌘V` veya sürükle-bırak) ve videoları ekler.
- **Kısa Konu Notu**: Sunumun amacını ve ham notları yazıp **Oluştur**'a basar.

### Adım 3: İnceleme ve Konuşarak veya Tek Tıkla Düzenleme
- 7–10 slaytlık, yalnızca başlıkları okunduğunda bile bütün hikayeyi anlatan, konuşmacı notları hazır sunum sahnede açılır.
- Kullanıcı ister doğal dille (*"4. slaytı daha basit yap"*, *"ikinci ekran görüntüsünü kapağa koy"*), ister **Slide Inspector** üzerinden ilgili slaytın başlığını/düzenini tek tıkla değiştirir; her değişiklikte otomatik kalite kontrolü tekrar çalışır.

### Adım 4: Canlı Sunum & Dışa Aktarım (ZIP / PDF / MCP)
- **Canlı Sunum**: Tam ekran klavye kontrolü, fare alt kenarda `~0.6s` dinlendiğinde açılan akıllı kontrol barı (lazer veya kalem seçildiğinde anında kapanır), ikinci ekran **Presenter View** (`S`).
- **Paylaşım**: Tek başına çevrimdışı (`file://`) çalışan **ZIP paketi**, **1600×900 yatay PDF**, ve dış AI asistanları (Claude, Copilot vb.) için **MCP Sunucusu**.

---

## 4. Hedef Teknik Mimari

1. **`backend-rs/` (Rust — Axum + Tokio + SQLite/PostgreSQL + Quick-XML + Zip)**:
   - Çok kiracılı (multi-tenant) ilişkisel veritabanı yönetimi (`organisations`, `brand_kits`, `decks`, `usage_telemetry`, `audit_logs`).
   - Yüksek hızlı `.pptx` / `.potx` / `.thmx` Office XML ayrıştırma ve `.zip` paketleme.
   - Kota kontrolü (`2/4/16` CVI ve `4/20/100` günlük sunum) ve birim maliyet (token + render süresi) telemetrisi.
2. **`src/public/` & `frontend/` (TypeScript — `.ts` / `.tsx`)**:
   - Sıfır marka ile başlayan kullanıcılar için **Kendi CVI'nı Oluşturma Sihirbazı**.
   - Ferah, sade **Warm Nordic Creative Studio** arayüzü.
3. **`src/engine/` (Bağımsız HTML/CSS/JS Sunum Motoru)**:
   - Hem uygulama içi önizlemede hem de dışa aktarılan `.zip` paketlerinde sıfır bağımlılıkla çalışan `1600×900` sunum çalışma zamanı.
4. **Headless Chromium Kalite Denetçisi (Playwright Worker)**:
   - Her slaytı gerçek tarayıcı DOM'unda 8 kritere göre (taşma, kırpılma, minimum 13px font, kırık medya, CVI renk paleti $\Delta E$, WCAG AA kontrastı, yasaklı efektler, güvenli bölgeler) denetleyen işçi servisi.
