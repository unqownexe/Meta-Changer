# MetaChanger

Fotoğrafların **çekim tarihini**, **GPS konumunu** ve **kamera/EXIF bilgilerini**
tarayıcıdan değiştirmenizi sağlayan, tamamen kendi bilgisayarınızda çalışan bir
panel.

Fotoğrafı panele bırakın, tarih ve konum seçin, isterseniz kamera bilgilerini
düzenleyin ve tek düğmeyle yeni bir kopya oluşturun. Orijinal dosyanıza hiçbir
şey olmaz; sonuç `exported/` klasörüne yazılır. İşlem bittiğinde telefonla
indirmek için QR kod da üretilir.

> Bu araç test, geliştirme ve kişisel arşiv düzenleme içindir. EXIF tarih/konum
> bilgisini değiştirmek fotoğrafın kanıt değerini etkileyebilir. Yalnızca sahibi
> olduğunuz veya izin verilen görsellerde kullanın.

## Neler yapabilir?

- Sürükle-bırak, dosya seçici veya **Ctrl/Cmd + V** ile panodan fotoğraf alma
- Çekim tarihini elle girme veya hazır şablonlarla kaydırma
  (−1 saat, −3 saat, −1 gün, −1 hafta, rastgele)
- Haritadan tıklayarak ya da iğneyi sürükleyerek konum seçme
- Ülke/şehir listesinden hızlı seçim, rastgele ülke/şehir ve tarayıcı konumu;
  GPS isteğe bağlı (boş bırakılırsa çıktıya eklenmez)
- 19 isteğe bağlı EXIF alanı: kamera, lens, ISO, diyafram, pozlama, odak,
  fotoğrafçı, telif, açıklama, GPS irtifa/yön ve daha fazlası
- Apple, Samsung, Xiaomi ve fotoğraf makineleri için hazır kamera profilleri
- İşlem adımlarını canlı gösteren EXIF günlüğü ve ilerleme çubuğu
- Sonuç için QR kod, bağlantı kopyalama, yeni sekmede açma ve indirme
- Son 8 çıktıyı önizleme; tekrar düzenlemek için geri yükleme ve tek tek silme

## Gereksinimler

- [Node.js](https://nodejs.org/) **20 veya üzeri** (npm ile birlikte gelir)
- İnternet bağlantısı (yalnızca `npm install` sırasında)

ExifTool'u ayrıca kurmanız gerekmez; gerekli çalıştırılabilir dosya
`exiftool-vendored` paketiyle birlikte gelir.

## Kurulum

```bash
git clone https://github.com/KULLANICI_ADINIZ/MetaChanger.git
cd MetaChanger
npm install
```

## Çalıştırma

```bash
npm start
```

Terminalde şuna benzer iki adres görürsünüz:

```text
Panel  : http://localhost:3000
Telefon: http://192.168.1.102:3000
```

Bilgisayarınızda `http://localhost:3000` adresini açın. Telefondan kullanmak
için aynı Wi-Fi ağına bağlanıp paneldeki QR kodu okutun veya ikinci adresi
telefonun tarayıcısına yazın.

Geliştirme sırasında dosya değişikliklerinde otomatik yeniden başlatma:

```bash
npm run dev
```

### İsteğe bağlı ayarlar

Yalnızca kendi bilgisayarınızdan erişim (güvenilmeyen ağlarda önerilir):

```bash
BIND_HOST=127.0.0.1 npm start
```

Farklı port:

```bash
PORT=4000 npm start
```

`BIND_HOST` önceliklidir. `HOST` da desteklenir, ancak zsh gibi kabuklar bu
değişkeni otomatik doldurabildiği için `BIND_HOST` daha güvenilirdir.

> Panel varsayılan olarak yerel ağa açıktır. Aynı ağdaki kişiler panele dosya
> yükleyebilir. Güvenmediğiniz ağlarda `BIND_HOST=127.0.0.1` kullanın.

## Kullanım

1. Fotoğrafı panele sürükleyin, seçin veya **Ctrl/Cmd + V** ile yapıştırın.
2. **Çekim tarihini** girin ya da hazır şablonlardan birini seçin.
3. Konum için haritaya tıklayın, iğneyi sürükleyin, ülke/şehir seçin veya
   koordinatları elle yazın. Boş bırakırsanız çıktıya GPS eklenmez.
4. İsterseniz **Gelişmiş metadata** bölümünden bir kamera profili uygulayın
   veya alanları tek tek doldurun. Boş alanlar mevcut değerleri korur.
5. **EXIF'i güncelle ve dışa aktar** düğmesine basın. Adımlar **EXIF günlüğü**
   bölümünde canlı görünür.
6. Sonuç kartından fotoğrafı indirin, yeni sekmede açın veya QR kodu okutun.

Yeni çıktılar `exported/` klasörüne benzersiz adlarla yazılır. Panelin altındaki
**Son çıktılar** bölümünden eski çıktıları açabilir veya yeniden düzenlemeye
yükleyebilirsiniz.

### Desteklenen biçimler

JPEG, HEIC/HEIF, TIFF, PNG, WebP ve AVIF. Tarayıcı bir biçimi önizleyemese bile
dosya işlenir ve indirilebilir. PNG ve AVIF gibi biçimler tüm EXIF etiketlerini
desteklemeyebilir; bu durumda işlem durmaz, uyarı gösterilir.

Araç yalnızca EXIF grubunu günceller. Dosyada mevcut XMP/IPTC etiketleri olduğu
gibi korunur.

## Komut satırından kullanım

Paneli açmadan tek fotoğraf işlemek için:

```bash
npm run exif -- fotograf.jpg --lat 41.0082 --lon 28.9784
```

Daha fazla seçenek:

```bash
node scripts/update-exif.js --help
```
