import { ExifTool } from "exiftool-vendored";

const GPS_TOLERANCE = 0.0001;
const DECIMAL_PLACES = 7;
const pad = (value) => String(value).padStart(2, "0");

// ExifTool's default treats (0, 0) as an "unset" location. A user-selected
// coordinate is still a valid coordinate, so keep zero values readable.
export const exiftool = new ExifTool({ ignoreZeroZeroLatLon: false });

export class MetadataError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetadataError";
  }
}

export class CoordinateError extends Error {
  constructor(message) {
    super(message);
    this.name = "CoordinateError";
  }
}

export class MetadataFieldError extends Error {
  constructor(message) {
    super(message);
    this.name = "MetadataFieldError";
  }
}

/**
 * Optional EXIF fields exposed by the panel and CLI. Values are normalized by
 * `parseAdvancedMetadata()` before they reach ExifTool.
 */
export const ADVANCED_FIELDS = Object.freeze({
  make: {
    label: "Kamera markası",
    tag: "EXIF:Make",
    type: "text",
    maxLength: 80,
  },
  model: {
    label: "Kamera modeli",
    tag: "EXIF:Model",
    type: "text",
    maxLength: 80,
  },
  lensModel: {
    label: "Lens modeli",
    tag: "EXIF:LensModel",
    type: "text",
    maxLength: 120,
  },
  software: {
    label: "Yazılım",
    tag: "EXIF:Software",
    type: "text",
    maxLength: 80,
  },
  artist: {
    label: "Fotoğrafçı",
    tag: "EXIF:Artist",
    type: "text",
    maxLength: 120,
  },
  copyright: {
    label: "Telif hakkı",
    tag: "EXIF:Copyright",
    type: "text",
    maxLength: 200,
  },
  imageDescription: {
    label: "Açıklama",
    tag: "EXIF:ImageDescription",
    type: "text",
    maxLength: 500,
  },
  userComment: {
    label: "Kullanıcı notu",
    tag: "EXIF:UserComment",
    type: "text",
    maxLength: 500,
  },
  iso: {
    label: "ISO",
    tag: "EXIF:ISO",
    type: "number",
    min: 1,
    max: 4_096_000,
    integer: true,
  },
  fNumber: {
    label: "Diyafram",
    tag: "EXIF:FNumber",
    type: "number",
    min: 0.5,
    max: 128,
  },
  exposureTime: {
    label: "Pozlama süresi",
    tag: "EXIF:ExposureTime",
    type: "exposure",
  },
  exposureCompensation: {
    label: "Pozlama telafisi",
    tag: "EXIF:ExposureCompensation",
    type: "number",
    min: -20,
    max: 20,
  },
  focalLength: {
    label: "Odak uzaklığı",
    tag: "EXIF:FocalLength",
    type: "number",
    min: 0.1,
    max: 5000,
  },
  focalLength35mm: {
    label: "35 mm karşılığı",
    tag: "EXIF:FocalLengthIn35mmFormat",
    type: "number",
    min: 1,
    max: 5000,
  },
  exposureProgram: {
    label: "Pozlama programı",
    tag: "EXIF:ExposureProgram",
    type: "enum",
    values: [
      "Not Defined",
      "Manual",
      "Program AE",
      "Aperture-priority AE",
      "Shutter speed priority AE",
      "Portrait",
      "Landscape",
    ],
  },
  whiteBalance: {
    label: "Beyaz dengesi",
    tag: "EXIF:WhiteBalance",
    type: "enum",
    values: ["Auto", "Manual"],
  },
  meteringMode: {
    label: "Ölçüm modu",
    tag: "EXIF:MeteringMode",
    type: "enum",
    values: [
      "Average",
      "Center-weighted average",
      "Spot",
      "Multi-segment",
      "Partial",
    ],
  },
  gpsAltitude: {
    label: "GPS irtifa",
    tag: "EXIF:GPSAltitude",
    type: "number",
    min: -12_000,
    max: 100_000,
  },
  gpsDirection: {
    label: "Kamera yönü",
    tag: "EXIF:GPSImgDirection",
    type: "number",
    min: 0,
    max: 360,
  },
});

/** EXIF expects local wall-clock time, without a timezone suffix. */
export function formatExifDate(date = new Date()) {
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join(
      ":",
    ) + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/** Example: +03:00 */
export function formatUtcOffset(date = new Date()) {
  const totalMinutes = -date.getTimezoneOffset();
  const sign = totalMinutes >= 0 ? "+" : "-";
  const absolute = Math.abs(totalMinutes);
  return `${sign}${pad(Math.floor(absolute / 60))}:${pad(absolute % 60)}`;
}

export function formatFileTimestamp(date = new Date()) {
  return (
    [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join("") +
    "-" +
    [pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join(
      "",
    )
  );
}

export function parseCoordinate(value, axis) {
  const raw = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!raw) {
    throw new CoordinateError(
      axis === "latitude" ? "Enlem gerekli." : "Boylam gerekli.",
    );
  }

  const parsed = Number(raw);
  const limit = axis === "latitude" ? 90 : 180;

  if (!Number.isFinite(parsed)) {
    throw new CoordinateError(
      axis === "latitude" ? "Enlem sayısal olmalı." : "Boylam sayısal olmalı.",
    );
  }
  if (parsed < -limit || parsed > limit) {
    throw new CoordinateError(
      axis === "latitude"
        ? "Enlem -90 ile 90 arasında olmalı."
        : "Boylam -180 ile 180 arasında olmalı.",
    );
  }

  const rounded =
    Math.round(parsed * 10 ** DECIMAL_PLACES) / 10 ** DECIMAL_PLACES;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Parses a local `YYYY-MM-DDTHH:mm:ss` value. No timezone suffix is accepted:
 * EXIF stores a wall-clock time, and the server's timezone supplies the offset.
 */
export function parseCapturedAt(value) {
  if (value == null || String(value).trim() === "") return new Date();

  const raw = String(value).trim();
  const match = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) {
    throw new MetadataFieldError(
      "Çekim tarihi YYYY-MM-DDTHH:mm:ss biçiminde olmalı.",
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] == null ? 0 : Number(match[6]);
  const date = new Date(year, month - 1, day, hour, minute, second, 0);
  const valid =
    year >= 1900 &&
    year <= 2999 &&
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute &&
    date.getSeconds() === second;

  if (!valid) throw new MetadataFieldError("Geçersiz çekim tarihi/saati.");
  return date;
}

function dateTagToString(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (
    Number.isFinite(value.year) &&
    Number.isFinite(value.month) &&
    Number.isFinite(value.day) &&
    Number.isFinite(value.hour) &&
    Number.isFinite(value.minute) &&
    Number.isFinite(value.second)
  ) {
    return `${value.year}:${pad(value.month)}:${pad(value.day)} ${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`;
  }
  if (typeof value.toExifString === "function")
    return value.toExifString() ?? String(value);
  return String(value);
}

function toFiniteNumber(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : null;
  const number = Number(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function toMeasurement(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number")
    return Number.isFinite(value) ? value : null;
  const number = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(number) ? number : null;
}

function normalizedText(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function decimalCoordinate(value, reference, positiveRef, negativeRef) {
  if (value == null) return null;
  const direction = String(reference ?? "")
    .toUpperCase()
    .startsWith(negativeRef)
    ? negativeRef
    : positiveRef;
  return `${Math.abs(value).toFixed(6)}° ${direction}`;
}

function tagsToMetadata(tags) {
  const latitude = toFiniteNumber(tags.GPSLatitude);
  const longitude = toFiniteNumber(tags.GPSLongitude);
  const latitudeRef = tags.GPSLatitudeRef
    ? String(tags.GPSLatitudeRef)
    : null;
  const longitudeRef = tags.GPSLongitudeRef
    ? String(tags.GPSLongitudeRef)
    : null;
  const altitude = toFiniteNumber(tags.GPSAltitude);
  const altitudeRef = tags.GPSAltitudeRef;
  const belowSeaLevel =
    typeof altitudeRef === "string"
      ? /below/i.test(altitudeRef)
      : Number(altitudeRef) === 1;
  const signedAltitude =
    altitude == null
      ? null
      : belowSeaLevel
        ? -Math.abs(altitude)
        : altitude;

  return {
    dateTimeOriginal: dateTagToString(tags.DateTimeOriginal),
    createDate: dateTagToString(tags.CreateDate),
    modifyDate: dateTagToString(tags.ModifyDate),
    offsetTimeOriginal: tags.OffsetTimeOriginal
      ? String(tags.OffsetTimeOriginal)
      : null,
    gpsLatitude: latitude,
    gpsLatitudeRef: latitudeRef,
    gpsLongitude: longitude,
    gpsLongitudeRef: longitudeRef,
    gpsPosition: tags.GPSPosition
      ? String(tags.GPSPosition)
      : latitude != null && longitude != null
        ? `${decimalCoordinate(latitude, latitudeRef, "N", "S")}, ${decimalCoordinate(longitude, longitudeRef, "E", "W")}`
        : null,
    gpsAltitude: signedAltitude,
    gpsAltitudeRef: altitudeRef ? String(altitudeRef) : null,
    gpsDirection: toFiniteNumber(tags.GPSImgDirection),
    gpsDirectionRef: tags.GPSImgDirectionRef
      ? String(tags.GPSImgDirectionRef)
      : null,
    width: toFiniteNumber(tags.ExifImageWidth ?? tags.ImageWidth),
    height: toFiniteNumber(tags.ExifImageHeight ?? tags.ImageHeight),
    fileType: tags.FileType ? String(tags.FileType) : null,
    make: normalizedText(tags.Make),
    model: normalizedText(tags.Model),
    lensModel: normalizedText(tags.LensModel),
    software: normalizedText(tags.Software),
    artist: normalizedText(tags.Artist),
    copyright: normalizedText(tags.Copyright),
    imageDescription: normalizedText(tags.ImageDescription),
    userComment: normalizedText(tags.UserComment),
    iso: toFiniteNumber(tags.ISO),
    fNumber: toFiniteNumber(tags.FNumber),
    exposureTime: normalizedText(tags.ExposureTime),
    exposureCompensation: toFiniteNumber(tags.ExposureCompensation),
    focalLength: toMeasurement(tags.FocalLength),
    focalLength35mm: toMeasurement(tags.FocalLengthIn35mmFormat),
    exposureProgram: normalizedText(tags.ExposureProgram),
    whiteBalance: normalizedText(tags.WhiteBalance),
    meteringMode: normalizedText(tags.MeteringMode),
    warnings: Array.isArray(tags.warnings) ? tags.warnings : [],
  };
}

function parseExposureSeconds(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  const match = raw.match(/^(\d+(?:\.\d+)?)(?:\/(\d+(?:\.\d+)?))?$/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = match[2] == null ? 1 : Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator))
    return null;
  if (denominator <= 0) return null;
  const seconds = numerator / denominator;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

export function parseAdvancedMetadata(input = {}) {
  if (input == null) return {};
  if (typeof input !== "object" || Array.isArray(input)) {
    throw new MetadataFieldError("Gelişmiş metadata nesnesi geçersiz.");
  }

  const result = {};

  for (const [key, spec] of Object.entries(ADVANCED_FIELDS)) {
    const value = input[key];
    if (value == null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (typeof value === "number" && !Number.isFinite(value)) continue;

    if (spec.type === "text") {
      const text = String(value).trim();
      if (!text) continue;
      if (text.length > spec.maxLength) {
        throw new MetadataFieldError(
          `${spec.label} en fazla ${spec.maxLength} karakter olabilir.`,
        );
      }
      result[key] = text;
      continue;
    }

    if (spec.type === "enum") {
      const text = String(value).trim();
      if (!text) continue;
      if (!spec.values.includes(text)) {
        throw new MetadataFieldError(
          `${spec.label} için geçersiz değer: ${text}`,
        );
      }
      result[key] = text;
      continue;
    }

    if (spec.type === "exposure") {
      const text = String(value).trim().replace(",", ".");
      const seconds = parseExposureSeconds(text);
      if (seconds == null || seconds > 3600) {
        throw new MetadataFieldError(
          `${spec.label} "1/250" veya "0.5" gibi geçerli bir değer olmalı.`,
        );
      }
      result[key] = text;
      continue;
    }

    const number = Number(String(value).trim().replace(",", "."));
    if (!Number.isFinite(number)) {
      throw new MetadataFieldError(`${spec.label} sayısal olmalı.`);
    }
    if (number < spec.min || number > spec.max) {
      throw new MetadataFieldError(
        `${spec.label} ${spec.min} ile ${spec.max} arasında olmalı.`,
      );
    }
    if (spec.integer && !Number.isInteger(number)) {
      throw new MetadataFieldError(`${spec.label} tam sayı olmalı.`);
    }
    result[key] = number;
  }

  return result;
}

function advancedToTags(values) {
  const tags = {};
  for (const [key, value] of Object.entries(values)) {
    const spec = ADVANCED_FIELDS[key];
    if (!spec) continue;

    if (key === "gpsAltitude") {
      tags["EXIF:GPSAltitude"] = Math.abs(value);
      tags["EXIF:GPSAltitudeRef"] =
        value < 0 ? "Below Sea Level" : "Above Sea Level";
      continue;
    }
    if (key === "gpsDirection") {
      tags["EXIF:GPSImgDirection"] = Math.abs(value);
      tags["EXIF:GPSImgDirectionRef"] = "True North";
      continue;
    }

    tags[spec.tag] = value;
  }
  return tags;
}

function verifyAdvanced(values, metadata) {
  const verified = [];
  const mismatches = [];

  for (const [key, expected] of Object.entries(values)) {
    const spec = ADVANCED_FIELDS[key];
    const actual = metadata[key];
    let matches = false;

    if (spec.type === "text" || spec.type === "enum") {
      matches = normalizedText(actual) === normalizedText(expected);
    } else if (spec.type === "exposure") {
      const left = parseExposureSeconds(actual);
      const right = parseExposureSeconds(expected);
      matches =
        left != null && right != null && Math.abs(left - right) <= 0.0000001;
    } else if (key === "fNumber") {
      matches = actual != null && Math.abs(Number(actual) - expected) <= 0.01;
    } else if (key === "gpsAltitude") {
      matches = actual != null && Math.abs(Number(actual) - expected) <= 0.25;
    } else if (key === "gpsDirection") {
      matches = actual != null && Math.abs(Number(actual) - expected) <= 0.01;
    } else if (key.startsWith("focalLength")) {
      matches = actual != null && Math.abs(Number(actual) - expected) <= 0.1;
    } else if (key === "exposureCompensation") {
      matches = actual != null && Math.abs(Number(actual) - expected) <= 0.01;
    } else {
      matches = actual != null && Math.abs(Number(actual) - expected) <= 0.0001;
    }

    if (matches) {
      verified.push(key);
    } else {
      mismatches.push(
        `${spec.label} (${spec.tag}) yazıldı ancak doğrulanamadı.`,
      );
    }
  }

  return { verified, mismatches };
}

function logMessage(onLog, level, message, detail = undefined) {
  if (typeof onLog === "function") onLog(level, message, detail);
}

function reportProgress(onProgress, value, label) {
  if (typeof onProgress === "function") onProgress(value, label);
}

export async function readPhotoMetadata(filePath) {
  return tagsToMetadata(await exiftool.read(filePath));
}

/**
 * Writes DateTimeOriginal (plus CreateDate/ModifyDate + offset companions),
 * GPS coordinates, and optional camera/personal EXIF fields into a photo.
 * The file is modified in place, so callers should work on a copy when the
 * original must be preserved.
 */
export async function writePhotoMetadata(
  filePath,
  {
    latitude,
    longitude,
    date = new Date(),
    advanced = {},
    onLog,
    onProgress,
  } = {},
) {
  const dateString = formatExifDate(date);
  const utcOffset = formatUtcOffset(date);

  logMessage(onLog, "info", "Kaynak fotoğrafın EXIF verisi okunuyor…");
  reportProgress(onProgress, 8, "Kaynak dosya okunuyor");

  const sourceTags = await exiftool.read(filePath);
  const source = tagsToMetadata(sourceTags);
  const sourceDetails = [];
  if (source.dateTimeOriginal)
    sourceDetails.push(`tarih ${source.dateTimeOriginal}`);
  if (source.make || source.model)
    sourceDetails.push(
      [source.make, source.model].filter(Boolean).join(" "),
    );
  if (source.gpsPosition) sourceDetails.push(`GPS ${source.gpsPosition}`);
  if (source.iso) sourceDetails.push(`ISO ${source.iso}`);
  if (source.exposureTime) sourceDetails.push(source.exposureTime);
  if (source.fNumber) sourceDetails.push(`f/${source.fNumber}`);

  logMessage(
    onLog,
    "info",
    sourceDetails.length
      ? `Mevcut veriler: ${sourceDetails.join(" · ")}`
      : "Kaynakta okunabilir EXIF bulunamadı; yeni alanlar oluşturulacak.",
    "ExifTool read",
  );
  reportProgress(onProgress, 18, "Mevcut metadata okundu");

  const advancedTags = advancedToTags(advanced);
  const advancedKeys = Object.keys(advanced);
  if (advancedKeys.length > 0) {
    logMessage(
      onLog,
      "info",
      `${advancedKeys.length} gelişmiş alan hazırlandı: ${advancedKeys
        .map((key) => ADVANCED_FIELDS[key]?.label ?? key)
        .join(", ")}`,
      Object.keys(advancedTags).join(" · "),
    );
  } else {
    logMessage(
      onLog,
      "info",
      "Gelişmiş alan seçilmedi; yalnızca tarih ve GPS işlenecek.",
    );
  }

  logMessage(
    onLog,
    "tag",
    `Tarih hazır: ${dateString} (${utcOffset})`,
    "EXIF:DateTimeOriginal · CreateDate · ModifyDate · OffsetTime*",
  );
  const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude);
  if (hasGps) {
    logMessage(
      onLog,
      "tag",
      `GPS hazır: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (${latitude >= 0 ? "N" : "S"}/${longitude >= 0 ? "E" : "W"})`,
      "EXIF:GPSLatitude · GPSLongitude",
    );
  } else {
    logMessage(
      onLog,
      "info",
      "GPS girilmedi; konum etiketleri eklenmeyecek.",
      source.gpsPosition ? "Mevcut GPS kaldırılacak" : "GPS yok",
    );
  }

  const tags = {
    "EXIF:DateTimeOriginal": dateString,
    "EXIF:CreateDate": dateString,
    "EXIF:ModifyDate": dateString,
    "EXIF:OffsetTime": utcOffset,
    "EXIF:OffsetTimeOriginal": utcOffset,
    "EXIF:OffsetTimeDigitized": utcOffset,
    ...advancedTags,
  };
  if (hasGps) {
    // Signed values let exiftool-vendored write the matching hemisphere refs
    // and a consistent GPSPosition composite. Passing an absolute value with
    // an explicit ref makes the library synthesize a positive GPSPosition,
    // which can flip southern/western coordinates back to N/E.
    tags.GPSLatitude = latitude;
    tags.GPSLongitude = longitude;
  }

  reportProgress(onProgress, 45, "ExifTool yazıyor");
  logMessage(
    onLog,
    "tag",
    `ExifTool ${Object.keys(tags).length} etiketi yazıyor…`,
    Object.keys(tags).join(" · "),
  );
  const startedAt = performance.now();
  const writeArgs = ["-overwrite_original"];
  if (!hasGps) writeArgs.push("-GPS:all=");
  const result = await exiftool.write(filePath, tags, writeArgs);
  const elapsed = Math.round(performance.now() - startedAt);
  logMessage(
    onLog,
    "success",
    `Etiketler yazıldı (${elapsed} ms).`,
    "overwrite_original",
  );
  reportProgress(onProgress, 68, "Yazma tamamlandı, doğrulanıyor");

  logMessage(onLog, "info", "Yazılan değerler geri okunuyor…");
  const tagsAfter = await exiftool.read(filePath);
  const metadata = tagsToMetadata(tagsAfter);

  if (metadata.dateTimeOriginal !== dateString) {
    logMessage(
      onLog,
      "error",
      `Tarih doğrulanamadı. Beklenen ${dateString}, okunan ${metadata.dateTimeOriginal ?? "—"}.`,
    );
    throw new MetadataError(
      "Tarih yazıldı ancak doğrulanamadı. Bu dosya biçimi DateTimeOriginal etiketini desteklemiyor olabilir.",
    );
  }
  if (
    hasGps &&
    (metadata.gpsLatitude == null ||
      Math.abs(metadata.gpsLatitude - latitude) > GPS_TOLERANCE ||
      metadata.gpsLongitude == null ||
      Math.abs(metadata.gpsLongitude - longitude) > GPS_TOLERANCE)
  ) {
    logMessage(
      onLog,
      "error",
      `GPS doğrulanamadı. Okunan: ${metadata.gpsPosition ?? "—"}.`,
    );
    throw new MetadataError(
      "Konum yazıldı ancak doğrulanamadı. Bu dosya biçimi GPS etiketlerini desteklemiyor olabilir.",
    );
  }
  if (
    !hasGps &&
    (metadata.gpsLatitude != null || metadata.gpsLongitude != null)
  ) {
    logMessage(
      onLog,
      "error",
      `GPS kaldırılamadı. Okunan: ${metadata.gpsPosition ?? "—"}.`,
    );
    throw new MetadataError(
      "Konum etiketleri kaldırılamadı. Bu dosya biçimi GPS etiketlerini desteklemiyor olabilir.",
    );
  }

  logMessage(
    onLog,
    "success",
    `Doğrulandı: ${metadata.dateTimeOriginal} · ${
      hasGps ? (metadata.gpsPosition ?? "GPS okundu") : "GPS kaldırıldı"
    }`,
    hasGps
      ? `GPS ${metadata.gpsLatitude?.toFixed(6)}, ${metadata.gpsLongitude?.toFixed(6)}`
      : "GPS yok",
  );

  const advancedVerification = verifyAdvanced(advanced, metadata);
  if (advancedVerification.verified.length > 0) {
    logMessage(
      onLog,
      "success",
      `${advancedVerification.verified.length} gelişmiş alan doğrulandı.`,
      advancedVerification.verified
        .map((key) => ADVANCED_FIELDS[key]?.tag ?? key)
        .join(" · "),
    );
  }
  for (const mismatch of advancedVerification.mismatches) {
    logMessage(onLog, "warn", mismatch);
  }

  reportProgress(onProgress, 88, "Metadata doğrulandı");

  const warnings = [
    ...new Set(
      [...(result.warnings ?? []), ...metadata.warnings]
        .map((warning) => String(warning).trim())
        .filter(Boolean),
    ),
  ];

  return {
    dateTimeOriginal: dateString,
    utcOffset,
    source,
    metadata,
    advanced: {
      values: advanced,
      verified: advancedVerification.verified,
      warnings: advancedVerification.mismatches,
    },
    warnings,
  };
}
