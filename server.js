import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import QRCode from "qrcode";

import {
  ADVANCED_FIELDS,
  CoordinateError,
  MetadataError,
  MetadataFieldError,
  exiftool,
  formatExifDate,
  formatFileTimestamp,
  formatUtcOffset,
  parseAdvancedMetadata,
  parseCapturedAt,
  parseCoordinate,
  writePhotoMetadata,
} from "./lib/metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const EXPORT_DIR = path.join(__dirname, "exported");
const TEMP_DIR = path.join(__dirname, ".tmp");
const TILE_CACHE_DIR = path.join(__dirname, ".cache", "tiles");
const LEAFLET_DIR = path.join(__dirname, "node_modules", "leaflet", "dist");
const TILE_UPSTREAM = "https://tile.openstreetmap.org";
// OpenStreetMap, uygulama kimliğini açıkça belirten istekleri kabul eder.
const TILE_USER_AGENT =
  process.env.TILE_USER_AGENT ??
  "MetaChanger/2.0 (local EXIF photo panel; map tile cache)";
const TILE_TIMEOUT_MS = 9_000;
const TILE_MAX_ZOOM = 19;
const TILE_MAX_BYTES = 1_500_000;
const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);
// zsh sets HOST to the machine hostname automatically. Only treat HOST as an
// explicit bind override when it differs from that shell-provided value.
const REQUESTED_HOST = process.env.BIND_HOST ?? process.env.HOST;
const HOST =
  !REQUESTED_HOST || REQUESTED_HOST === os.hostname()
    ? "0.0.0.0"
    : REQUESTED_HOST;
const SHARE_ENABLED = !isLoopbackHostname(HOST);
const MAX_UPLOAD_MB = Math.min(
  100,
  Math.max(1, Number.parseInt(process.env.MAX_UPLOAD_MB ?? "40", 10) || 40),
);
const MAX_METADATA_JSON = 30_000;

const SUPPORTED_IMAGES = new Map([
  ["jpg", "JPEG"],
  ["jpeg", "JPEG"],
  ["heic", "HEIC"],
  ["heif", "HEIF"],
  ["tif", "TIFF"],
  ["tiff", "TIFF"],
  ["png", "PNG"],
  ["webp", "WebP"],
  ["avif", "AVIF"],
]);

await fs.mkdir(EXPORT_DIR, { recursive: true });
await fs.mkdir(TEMP_DIR, { recursive: true });
await fs.mkdir(TILE_CACHE_DIR, { recursive: true });

const app = express();
app.disable("x-powered-by");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    fields: 10,
    parts: 12,
  },
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const pad = (value) => String(value).padStart(2, "0");

function isLoopbackHostname(hostname) {
  const value = String(hostname ?? "")
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  return (
    value === "localhost" ||
    value === "::1" ||
    value.startsWith("127.")
  );
}

function lanAddresses() {
  const preferred = [];
  const fallback = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== "IPv4" || address.internal) continue;
      if (address.address.startsWith("169.254.")) continue;
      if (/^(en|wl|eth)/i.test(name)) preferred.push(address.address);
      else fallback.push(address.address);
    }
  }
  return [...new Set([...preferred, ...fallback])];
}

function shareInfo(req) {
  const addresses = lanAddresses().map(
    (address) => `http://${address}:${PORT}`,
  );
  const requestHost = req.get("host") ?? `localhost:${PORT}`;
  const requestHostname = req.hostname || requestHost.split(":")[0];
  let origin;

  if (!isLoopbackHostname(requestHostname)) {
    origin = `${req.protocol}://${requestHost}`;
  } else if (addresses.length > 0) {
    origin = addresses[0];
  } else {
    origin = `${req.protocol}://${requestHost}`;
  }

  let phoneReachable = false;
  try {
    phoneReachable = SHARE_ENABLED && !isLoopbackHostname(new URL(origin).hostname);
  } catch {
    phoneReachable = false;
  }

  return {
    enabled: SHARE_ENABLED,
    origin,
    addresses,
    host: requestHost,
    phoneReachable,
    note: phoneReachable
      ? "Telefon aynı Wi-Fi ağında olmalı."
      : "Telefon paylaşımı kapalı. Sunucuyu BIND_HOST=0.0.0.0 ile başlatın.",
  };
}

function shareUrlFor(req, filename) {
  return `${shareInfo(req).origin}/exported/${encodeURIComponent(filename)}`;
}

function safeFileBase(originalName) {
  const withoutExtension = path.basename(
    originalName || "foto",
    path.extname(originalName || ""),
  );
  const base = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ıİ]/g, "i")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 60);

  return base || "foto";
}

function humanBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseAdvancedPayload(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw !== "string") {
    throw new MetadataFieldError("Gelişmiş metadata biçimi geçersiz.");
  }
  if (raw.length > MAX_METADATA_JSON) {
    throw new MetadataFieldError("Gelişmiş metadata çok büyük.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MetadataFieldError("Gelişmiş metadata okunamadı.");
  }
  return parseAdvancedMetadata(parsed);
}

let tileFailureLoggedAt = 0;

function logTileFailure(message) {
  const now = Date.now();
  if (now - tileFailureLoggedAt < 30_000) return;
  tileFailureLoggedAt = now;
  console.warn("[metachanger] Harita karosu alınamadı:", message);
}

function parseTileIndex(value, label, max) {
  if (!/^\d{1,7}$/.test(String(value ?? ""))) {
    throw new HttpError(400, `Geçersiz harita karosu ${label} değeri.`);
  }
  const number = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(number) || number < 0 || number > max) {
    throw new HttpError(400, `Harita karosu ${label} değeri sınırın dışında.`);
  }
  return number;
}

function isPng(buffer) {
  return (
    buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function publicError(error) {
  if (
    error instanceof CoordinateError ||
    error instanceof MetadataError ||
    error instanceof MetadataFieldError ||
    error instanceof HttpError
  ) {
    return { status: error.status ?? 400, message: error.message };
  }
  console.error("[metachanger]", error);
  return {
    status: 500,
    message: "İşlem tamamlanamadı. Sunucu günlüklerini kontrol edin.",
  };
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  );
  next();
});

app.use(express.static(PUBLIC_DIR, { index: "index.html", maxAge: 0 }));
app.use(
  "/vendor/leaflet",
  express.static(LEAFLET_DIR, {
    index: false,
    maxAge: "1h",
    setHeaders(res) {
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  }),
);

app.get("/api/status", (req, res) => {
  const now = new Date();
  res.setHeader("Cache-Control", "no-store");
  res.json({
    serverTime: now.toISOString(),
    exifDate: formatExifDate(now),
    utcOffset: formatUtcOffset(now),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    maxUploadMb: MAX_UPLOAD_MB,
    exportDirectory: "./exported",
    formats: [...new Set(SUPPORTED_IMAGES.values())],
    advancedFields: Object.keys(ADVANCED_FIELDS),
    share: shareInfo(req),
  });
});

app.get("/api/tiles/:z/:x/:y.png", async (req, res) => {
  let zoom;
  let tileX;
  let tileY;

  try {
    zoom = parseTileIndex(req.params.z, "z", TILE_MAX_ZOOM);
    const maxIndex = 2 ** zoom - 1;
    tileX = parseTileIndex(req.params.x, "x", maxIndex);
    tileY = parseTileIndex(req.params.y, "y", maxIndex);
  } catch (error) {
    const message =
      error instanceof HttpError ? error.message : "Geçersiz harita karosu.";
    res
      .status(400)
      .setHeader("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .send(message);
    return;
  }

  const cachePath = path.join(
    TILE_CACHE_DIR,
    String(zoom),
    String(tileX),
    `${tileY}.png`,
  );

  try {
    const cached = await fs.readFile(cachePath);
    if (isPng(cached)) {
      res.setHeader("Cache-Control", "public, max-age=86400, immutable");
      res.type("png").send(cached);
      return;
    }
    await fs.rm(cachePath, { force: true }).catch(() => {});
  } catch (error) {
    if (error.code !== "ENOENT") {
      logTileFailure(`önbellek okunamadı: ${error.message}`);
    }
  }

  let upstream;
  try {
    upstream = await fetch(
      `${TILE_UPSTREAM}/${zoom}/${tileX}/${tileY}.png`,
      {
        headers: {
          "User-Agent": TILE_USER_AGENT,
          Accept: "image/png,image/*;q=0.8,*/*;q=0.1",
          "Accept-Language": "tr,en;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(TILE_TIMEOUT_MS),
      },
    );
  } catch (error) {
    logTileFailure(`${zoom}/${tileX}/${tileY}: ${error.message}`);
    res
      .status(502)
      .setHeader("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .send("Harita karosu şu anda yüklenemedi.");
    return;
  }

  const contentType = upstream.headers.get("content-type") ?? "";
  const contentLength = Number.parseInt(
    upstream.headers.get("content-length") ?? "0",
    10,
  );
  const blocked = upstream.headers.has("x-blocked");

  if (
    !upstream.ok ||
    blocked ||
    !contentType.toLowerCase().startsWith("image/png") ||
    (Number.isFinite(contentLength) && contentLength > TILE_MAX_BYTES)
  ) {
    await upstream.body?.cancel().catch(() => {});
    logTileFailure(
      `${zoom}/${tileX}/${tileY}: HTTP ${upstream.status}${blocked ? " (x-blocked)" : ""} ${contentType || "içerik türü yok"}`,
    );
    res
      .status(502)
      .setHeader("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .send("Harita karosu şu anda yüklenemedi.");
    return;
  }

  let buffer;
  try {
    buffer = Buffer.from(await upstream.arrayBuffer());
  } catch (error) {
    logTileFailure(`${zoom}/${tileX}/${tileY}: gövde okunamadı: ${error.message}`);
    res
      .status(502)
      .setHeader("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .send("Harita karosu şu anda yüklenemedi.");
    return;
  }

  if (buffer.length < 100 || buffer.length > TILE_MAX_BYTES || !isPng(buffer)) {
    logTileFailure(`${zoom}/${tileX}/${tileY}: geçersiz PNG gövdesi`);
    res
      .status(502)
      .setHeader("Cache-Control", "no-store")
      .type("text/plain; charset=utf-8")
      .send("Harita karosu şu anda yüklenemedi.");
    return;
  }

  try {
    await fs.mkdir(path.dirname(cachePath), { recursive: true });
    const temporaryPath = `${cachePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryPath, buffer, { mode: 0o600 });
    await fs.rename(temporaryPath, cachePath);
  } catch (error) {
    logTileFailure(`önbelleğe yazılamadı: ${error.message}`);
  }

  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  res.type("png").send(buffer);
});

app.get("/api/exports", async (req, res) => {
  const entries = await fs.readdir(EXPORT_DIR, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const fullPath = path.join(EXPORT_DIR, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          url: `/exported/${encodeURIComponent(entry.name)}`,
        };
      }),
  );

  files.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  res.setHeader("Cache-Control", "no-store");
  res.json({ files: files.slice(0, 8) });
});

app.delete("/api/exports/:name", async (req, res) => {
  const name = String(req.params.name ?? "");
  if (!name || name !== path.basename(name) || name.startsWith(".")) {
    throw new HttpError(400, "Geçersiz dosya adı.");
  }

  const targetPath = path.join(EXPORT_DIR, name);
  if (path.dirname(targetPath) !== EXPORT_DIR) {
    throw new HttpError(400, "Geçersiz dosya yolu.");
  }

  let stats;
  try {
    stats = await fs.lstat(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new HttpError(404, "Çıktı dosyası bulunamadı.");
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new HttpError(400, "Yalnızca çıktı dosyaları silinebilir.");
  }

  await fs.unlink(targetPath);
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, name });
});

app.post("/api/process", upload.single("photo"), async (req, res, next) => {
  let tempPath = null;
  let streamStarted = false;
  let streamClosed = false;

  const send = (event) => {
    if (streamClosed || res.writableEnded) return;
    res.write(`${JSON.stringify(event)}\n`);
  };
  const log = (level, message, detail) =>
    send({
      type: "log",
      level,
      message,
      ...(detail ? { detail } : {}),
      at: new Date().toISOString(),
    });

  try {
    if (!req.file) {
      throw new HttpError(400, "Önce bir fotoğraf seçin.");
    }

    const latitudeInput = String(req.body.latitude ?? "").trim();
    const longitudeInput = String(req.body.longitude ?? "").trim();
    const hasLatitude = latitudeInput !== "";
    const hasLongitude = longitudeInput !== "";
    if (hasLatitude !== hasLongitude) {
      throw new HttpError(
        400,
        "Enlem ve boylam birlikte girilmeli. GPS eklemek istemiyorsan ikisini de boş bırak.",
      );
    }
    const latitude = hasLatitude
      ? parseCoordinate(latitudeInput, "latitude")
      : null;
    const longitude = hasLongitude
      ? parseCoordinate(longitudeInput, "longitude")
      : null;
    const capturedAt = parseCapturedAt(req.body.capturedAt);
    const advanced = parseAdvancedPayload(req.body.metadata);
    const detectedType = await fileTypeFromBuffer(req.file.buffer);

    if (!detectedType || !SUPPORTED_IMAGES.has(detectedType.ext)) {
      throw new HttpError(
        415,
        "Desteklenmeyen dosya biçimi. JPEG, HEIC, TIFF, PNG, WebP veya AVIF yükleyin.",
      );
    }

    const extension = detectedType.ext === "jpeg" ? "jpg" : detectedType.ext;
    const base = safeFileBase(req.file.originalname);
    let filename = `${base}-${formatFileTimestamp(capturedAt)}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
    let outputPath = path.join(EXPORT_DIR, filename);

    while (await fileExists(outputPath)) {
      filename = `${base}-${formatFileTimestamp(capturedAt)}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
      outputPath = path.join(EXPORT_DIR, filename);
    }

    tempPath = path.join(TEMP_DIR, `${crypto.randomUUID()}.${extension}`);
    await fs.writeFile(tempPath, req.file.buffer, { flag: "wx", mode: 0o600 });

    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    res.socket?.setNoDelay(true);
    streamStarted = true;

    const startedAt = performance.now();
    send({
      type: "start",
      file: {
        originalName: req.file.originalname,
        size: req.file.size,
        mime: detectedType.mime,
      },
      serverTime: new Date().toISOString(),
      capturedAt: formatExifDate(capturedAt),
    });

    log(
      "info",
      `Dosya alındı: ${req.file.originalname} · ${humanBytes(req.file.size)} · ${detectedType.mime}`,
      `${detectedType.ext.toUpperCase()} · ${filename}`,
    );
    log(
      "info",
      `Hedef zaman: ${formatExifDate(capturedAt)} (UTC${formatUtcOffset(capturedAt)})`,
      latitude != null && longitude != null
        ? `Hedef konum: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
        : "GPS eklenmeyecek.",
    );
    log(
      "info",
      advanced && Object.keys(advanced).length > 0
        ? `Gelişmiş metadata: ${Object.keys(advanced).length} alan`
        : "Gelişmiş metadata kullanılmayacak.",
    );

    const result = await writePhotoMetadata(tempPath, {
      latitude,
      longitude,
      date: capturedAt,
      advanced,
      onLog: log,
      onProgress: (progress, label) =>
        send({ type: "progress", progress, label }),
    });

    log("info", "Dosya ./exported klasörüne taşınıyor…");
    await fs.rename(tempPath, outputPath);
    tempPath = null;
    await fs.chmod(outputPath, 0o644);
    const stats = await fs.stat(outputPath);
    log(
      "success",
      `Dışa aktarıldı: ${filename}`,
      `./exported/${filename} · ${humanBytes(stats.size)}`,
    );

    const share = shareInfo(req);
    const phoneUrl = `${share.origin}/exported/${encodeURIComponent(filename)}`;
    let qrDataUrl = null;
    try {
      send({ type: "progress", progress: 94, label: "QR kod hazırlanıyor" });
      qrDataUrl = await QRCode.toDataURL(phoneUrl, {
        width: 360,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0a0c0b", light: "#f3f5ec" },
      });
      log(
        share.phoneReachable ? "success" : "warn",
        share.phoneReachable
          ? "Telefon bağlantısı ve QR kod hazır."
          : "QR kod hazır ancak telefon erişimi kapalı.",
        phoneUrl,
      );
    } catch (error) {
      log("warn", "QR kod üretilemedi; indirme bağlantısı kullanılabilir.");
      console.error("[metachanger] QR", error);
    }

    send({ type: "progress", progress: 100, label: "Tamamlandı" });
    const elapsed = Math.round(performance.now() - startedAt);
    log("success", `İşlem ${elapsed} ms içinde tamamlandı.`);

    send({
      type: "result",
      ok: true,
      file: {
        name: filename,
        originalName: req.file.originalname,
        mimeType: detectedType.mime,
        size: stats.size,
        url: `/exported/${encodeURIComponent(filename)}`,
        downloadUrl: `/exported/${encodeURIComponent(filename)}`,
      },
      lookup: {
        latitude,
        longitude,
        date: formatExifDate(capturedAt),
        offset: formatUtcOffset(capturedAt),
      },
      source: result.source,
      metadata: result.metadata,
      advanced: result.advanced,
      warnings: result.warnings,
      processingMs: elapsed,
      share: {
        url: phoneUrl,
        qrDataUrl,
        reachable: share.phoneReachable,
        origin: share.origin,
        note: share.note,
      },
    });

    streamClosed = true;
    res.end();
  } catch (error) {
    if (tempPath) {
      await fs.rm(tempPath, { force: true }).catch(() => {});
      tempPath = null;
    }
    const mapped = publicError(error);

    if (!streamStarted) {
      next(
        error instanceof HttpError ||
          error instanceof CoordinateError ||
          error instanceof MetadataError ||
          error instanceof MetadataFieldError
          ? error
          : Object.assign(new Error(mapped.message), { status: mapped.status }),
      );
      return;
    }

    send({
      type: "error",
      message: mapped.message,
      status: mapped.status,
    });
    streamClosed = true;
    res.end();
  }
});

app.use("/api", (req, res) => {
  res.status(404).json({ error: "API uç noktası bulunamadı." });
});

app.use(
  "/exported",
  express.static(EXPORT_DIR, {
    index: false,
    dotfiles: "deny",
    maxAge: 0,
    setHeaders(res) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    },
  }),
);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: `Fotoğraf çok büyük. En fazla ${MAX_UPLOAD_MB} MB yükleyebilirsiniz.`,
      });
    }
    return res.status(400).json({ error: "Yükleme isteği geçersiz." });
  }

  if (
    error instanceof CoordinateError ||
    error instanceof MetadataFieldError
  ) {
    return res.status(400).json({ error: error.message });
  }

  if (error instanceof MetadataError) {
    return res.status(422).json({ error: error.message });
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }

  console.error("[metachanger]", error);
  return res.status(500).json({
    error: "İşlem tamamlanamadı. Sunucu günlüklerini kontrol edin.",
  });
});

const server = app.listen(PORT, HOST, () => {
  const displayHost = isLoopbackHostname(HOST) ? HOST : "localhost";
  console.log("");
  console.log("  MetaChanger hazır");
  console.log(`  Panel  : http://${displayHost}:${PORT}`);
  if (SHARE_ENABLED) {
    const addresses = lanAddresses();
    if (addresses.length > 0) {
      for (const address of addresses) {
        console.log(`  Telefon: http://${address}:${PORT}`);
      }
    } else {
      console.log("  Telefon: LAN IPv4 adresi bulunamadı");
    }
  } else {
    console.log("  Telefon: kapalı (BIND_HOST=127.0.0.1)");
  }
  console.log(`  Çıktı  : ${EXPORT_DIR}`);
  console.log("");
});

server.on("error", (error) => {
  console.error("[metachanger] Sunucu başlatılamadı:", error.message);
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${signal} alındı, kapatılıyor...`);
  server.close(async () => {
    await exiftool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
