#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { fileTypeFromFile } from "file-type";

import {
  CoordinateError,
  MetadataError,
  MetadataFieldError,
  exiftool,
  formatFileTimestamp,
  formatUtcOffset,
  parseAdvancedMetadata,
  parseCoordinate,
  writePhotoMetadata,
} from "../lib/metadata.js";

const SUPPORTED = new Set([
  "jpg",
  "jpeg",
  "heic",
  "heif",
  "tif",
  "tiff",
  "png",
  "webp",
  "avif",
]);

function printHelp() {
  console.log(`
MetaChanger CLI — EXIF zaman, konum ve kamera güncelleme

Kullanım:
  node scripts/update-exif.js <fotoğraf> --lat <enlem> --lon <boylam> [seçenekler]

Temel seçenekler:
  -i, --input <dosya>        Girdi fotoğrafı (konumsal argüman yerine)
  -o, --output <dosya>       Çıktı dosyası (varsayılan: ./exported/<ad>-exif-<zaman>.<uzantı>)
      --lat <derece>         Enlem, -90..90 (zorunlu)
      --lon <derece>         Boylam, -180..180 (zorunlu)
      --date <zaman>         Yerel zaman: YYYY-MM-DDTHH:mm:ss (varsayılan: şu an)
      --hours-back <saat>    Seçilen tarihten saat çıkar (ör. 3)
  -v, --verbose              EXIF yazma adımlarını canlı yazdır
  -f, --force                Varsa çıktı dosyasının üzerine yaz
  -h, --help                 Bu yardımı göster

Kamera seçenekleri:
      --make <marka>         Ör. Fujifilm
      --model <model>        Ör. X100V
      --lens <model>         Ör. 23mm f/2
      --software <ad>        Ör. MetaChanger
      --iso <sayı>           Ör. 400
      --f-number <sayı>      Diyafram, ör. 1.8
      --exposure <değer>     Pozlama, ör. 1/250
      --exposure-comp <EV>   Pozlama telafisi, ör. -0.3
      --focal-length <mm>    Odak uzaklığı, ör. 35
      --focal-35mm <mm>      35 mm karşılığı, ör. 52
      --program <mod>        Manual | Program AE | Aperture-priority AE |
                             Shutter speed priority AE | Portrait | Landscape |
                             Not Defined
      --white-balance <mod>  Auto | Manual
      --metering <mod>       Average | Center-weighted average | Spot |
                             Multi-segment | Partial

Kişisel / konum seçenekleri:
      --artist <ad>          Fotoğrafçı
      --copyright <metin>    Telif hakkı
      --description <metin>  ImageDescription
      --comment <metin>      UserComment (Türkçe karakter destekler)
      --altitude <metre>     GPS irtifa; negatif değer deniz altı demektir
      --direction <derece>   Kamera yönü, 0..360 (gerçek kuzey)

Örnek:
  node scripts/update-exif.js fotograf.jpg --lat 41.0082 --lon 28.9784 \\
    --hours-back 3 --make Fujifilm --model X100V --iso 400 --f-number 2 \\
    --exposure 1/250 --artist "Çağrı Şen" --verbose
`);
}

function fail(message) {
  console.error(`Hata: ${message}`);
  process.exitCode = 1;
}

function parseLocalDate(value) {
  if (!value) return new Date();

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) {
    throw new Error("Tarih biçimi YYYY-MM-DDTHH:mm:ss olmalı.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = match[4] == null ? 0 : Number(match[4]);
  const minute = match[5] == null ? 0 : Number(match[5]);
  const second = match[6] == null ? 0 : Number(match[6]);
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  const valid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second;

  if (!valid) throw new Error("Geçersiz tarih/saat girdisi.");
  return date;
}

function normalizeArgs(argv) {
  const normalized = [];
  const signedValues = new Set([
    "--lat",
    "--lon",
    "--altitude",
    "--exposure-comp",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (signedValues.has(value) && next != null && /^-?\d/.test(next)) {
      normalized.push(`${value}=${next}`);
      index += 1;
    } else {
      normalized.push(value);
    }
  }
  return normalized;
}

function safeBase(filePath) {
  return (
    path
      .basename(filePath, path.extname(filePath))
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[ıİ]/g, "i")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/-{2,}/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 60) || "foto"
  );
}

function advancedFromValues(values) {
  return parseAdvancedMetadata({
    make: values.make,
    model: values.model,
    lensModel: values.lens,
    software: values.software,
    artist: values.artist,
    copyright: values.copyright,
    imageDescription: values.description,
    userComment: values.comment,
    iso: values.iso,
    fNumber: values["f-number"],
    exposureTime: values.exposure,
    exposureCompensation: values["exposure-comp"],
    focalLength: values["focal-length"],
    focalLength35mm: values["focal-35mm"],
    exposureProgram: values.program,
    whiteBalance: values["white-balance"],
    meteringMode: values.metering,
    gpsAltitude: values.altitude,
    gpsDirection: values.direction,
  });
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    args: normalizeArgs(process.argv.slice(2)),
    options: {
      input: { type: "string", short: "i" },
      output: { type: "string", short: "o" },
      lat: { type: "string" },
      lon: { type: "string" },
      date: { type: "string" },
      "hours-back": { type: "string" },
      verbose: { type: "boolean", short: "v", default: false },
      force: { type: "boolean", short: "f", default: false },
      help: { type: "boolean", short: "h", default: false },

      make: { type: "string" },
      model: { type: "string" },
      lens: { type: "string" },
      software: { type: "string" },
      artist: { type: "string" },
      copyright: { type: "string" },
      description: { type: "string" },
      comment: { type: "string" },
      iso: { type: "string" },
      "f-number": { type: "string" },
      exposure: { type: "string" },
      "exposure-comp": { type: "string" },
      "focal-length": { type: "string" },
      "focal-35mm": { type: "string" },
      program: { type: "string" },
      "white-balance": { type: "string" },
      metering: { type: "string" },
      altitude: { type: "string" },
      direction: { type: "string" },
    },
  });

  if (values.help) {
    printHelp();
    return;
  }

  const input = path.resolve(values.input ?? positionals[0] ?? "");
  if (!values.input && !positionals[0]) {
    printHelp();
    throw new Error("Girdi fotoğrafı belirtilmedi.");
  }

  if (values.lat == null || values.lon == null) {
    printHelp();
    throw new Error("--lat ve --lon zorunlu.");
  }

  const latitude = parseCoordinate(values.lat, "latitude");
  const longitude = parseCoordinate(values.lon, "longitude");
  let date = parseLocalDate(values.date);

  if (values["hours-back"] != null) {
    const hours = Number(values["hours-back"]);
    if (!Number.isFinite(hours) || hours < 0 || hours > 2400) {
      throw new Error("--hours-back 0 ile 2400 arasında bir saat olmalı.");
    }
    date = new Date(date.getTime() - hours * 60 * 60 * 1000);
  }

  const advanced = advancedFromValues(values);
  const stats = await fs.stat(input);
  if (!stats.isFile()) throw new Error("Girdi yolu bir dosya değil.");

  const detected = await fileTypeFromFile(input);
  if (!detected || !SUPPORTED.has(detected.ext)) {
    throw new Error(
      "Desteklenmeyen dosya biçimi. JPEG, HEIC, TIFF, PNG, WebP veya AVIF kullanın.",
    );
  }

  const extension = detected.ext === "jpeg" ? "jpg" : detected.ext;
  const stamp = formatFileTimestamp(date);
  const output = path.resolve(
    values.output ??
      path.join("exported", `${safeBase(input)}-exif-${stamp}.${extension}`),
  );

  if (input === output) {
    throw new Error(
      "Girdi ve çıktı aynı dosya olamaz. Önce bir kopya oluşturulmalı.",
    );
  }

  await fs.mkdir(path.dirname(output), { recursive: true });

  if (!values.force && (await fs.access(output).then(() => true, () => false))) {
    throw new Error(
      `Çıktı zaten var: ${output}\nÜzerine yazmak için --force kullanın.`,
    );
  }

  const tempOutput = path.join(
    path.dirname(output),
    `.metachanger-${process.pid}-${Date.now()}.${extension}`,
  );

  try {
    await fs.copyFile(input, tempOutput);
    const result = await writePhotoMetadata(tempOutput, {
      latitude,
      longitude,
      date,
      advanced,
      onLog: values.verbose
        ? (level, message, detail) => {
            const prefix =
              level === "error"
                ? "!"
                : level === "warn"
                  ? "?"
                  : level === "success"
                    ? "✓"
                    : level === "tag"
                      ? "#"
                      : "·";
            console.log(`${prefix} ${message}${detail ? ` [${detail}]` : ""}`);
          }
        : undefined,
      onProgress: values.verbose
        ? (progress, label) => console.log(`  ${progress}% ${label}`)
        : undefined,
    });
    await fs.rename(tempOutput, output);

    console.log("");
    console.log("EXIF güncellendi");
    console.log(`  Girdi            : ${input}`);
    console.log(`  Çıktı            : ${output}`);
    console.log(`  DateTimeOriginal : ${result.dateTimeOriginal}`);
    console.log(`  UTC ofset        : ${formatUtcOffset(date)}`);
    console.log(
      `  GPS              : ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
    );
    console.log(`  GPS (EXIF)       : ${result.metadata.gpsPosition ?? "—"}`);
    if (Object.keys(advanced).length > 0) {
      console.log(
        `  Gelişmiş alan    : ${result.advanced.verified.length}/${Object.keys(advanced).length} doğrulandı`,
      );
    }
    if (result.warnings.length > 0) {
      console.log("");
      console.log("Uyarılar:");
      for (const warning of result.warnings) console.log(`  - ${warning}`);
    }
    console.log("");
  } finally {
    await fs.rm(tempOutput, { force: true }).catch(() => {});
  }
}

main()
  .catch((error) => {
    if (
      error instanceof CoordinateError ||
      error instanceof MetadataError ||
      error instanceof MetadataFieldError
    ) {
      fail(error.message);
    } else if (error?.code === "ENOENT") {
      fail(`Dosya bulunamadı: ${error.path ?? ""}`);
    } else {
      fail(error instanceof Error ? error.message : String(error));
    }
  })
  .finally(async () => {
    await exiftool.end().catch(() => {});
  });
