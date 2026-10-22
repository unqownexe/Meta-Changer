import {
  COUNTRIES,
  countryFlag,
  sortedCountries,
} from "./locations.js";
import { PROFILE_GROUPS, PROFILES, filterProfiles } from "./profiles.js";

const $ = (id) => document.getElementById(id);

const elements = {
  processForm: $("processForm"),
  dropzone: $("dropzone"),
  fileInput: $("fileInput"),
  dropEmpty: $("dropEmpty"),
  filePreview: $("filePreview"),
  previewImage: $("previewImage"),
  previewFallback: $("previewFallback"),
  fileName: $("fileName"),
  fileMeta: $("fileMeta"),
  removeFile: $("removeFile"),
  maxSizeLabel: $("maxSizeLabel"),
  captureDate: $("captureDate"),
  captureSummary: $("captureSummary"),
  serverNow: $("serverNow"),
  serverDateLabel: $("serverDateLabel"),
  timeZoneBadge: $("timeZoneBadge"),
  latitude: $("latitude"),
  longitude: $("longitude"),
  coordHint: $("coordHint"),
  locateButton: $("locateButton"),
  locateLabel: $("locateLabel"),
  mapDetails: $("mapDetails"),
  map: $("map"),
  mapReadout: $("mapReadout"),
  mapTileNotice: $("mapTileNotice"),
  countrySelect: $("countrySelect"),
  citySelect: $("citySelect"),
  countryTrigger: $("countryTrigger"),
  countryValue: $("countryValue"),
  countryFlagLabel: $("countryFlagLabel"),
  countryMenu: $("countryMenu"),
  countrySearch: $("countrySearch"),
  countryOptions: $("countryOptions"),
  countryEmpty: $("countryEmpty"),
  cityTrigger: $("cityTrigger"),
  cityValue: $("cityValue"),
  cityMenu: $("cityMenu"),
  citySearch: $("citySearch"),
  cityOptions: $("cityOptions"),
  cityEmpty: $("cityEmpty"),
  randomCountryButton: $("randomCountryButton"),
  randomCityButton: $("randomCityButton"),
  randomTimeButton: $("randomTimeButton"),
  profilePicker: $("profilePicker"),
  profileTrigger: $("profileTrigger"),
  profileTriggerLabel: $("profileTriggerLabel"),
  profileTriggerMeta: $("profileTriggerMeta"),
  profileMenu: $("profileMenu"),
  profileFilters: $("profileFilters"),
  profileSearch: $("profileSearch"),
  profileOptions: $("profileOptions"),
  profileCount: $("profileCount"),
  profileEmpty: $("profileEmpty"),
  clearAdvanced: $("clearAdvanced"),
  advancedCount: $("advancedCount"),
  formError: $("formError"),
  submitButton: $("submitButton"),
  logSection: $("logSection"),
  logStatus: $("logStatus"),
  processProgress: $("processProgress"),
  progressFill: $("progressFill"),
  logConsole: $("logConsole"),
  clearLogButton: $("clearLogButton"),
  resultSection: $("resultSection"),
  resultImage: $("resultImage"),
  resultFallback: $("resultFallback"),
  resultTitle: $("resultTitle"),
  resultSubtitle: $("resultSubtitle"),
  resultDate: $("resultDate"),
  resultOffset: $("resultOffset"),
  resultGps: $("resultGps"),
  resultDimensions: $("resultDimensions"),
  resultAdvanced: $("resultAdvanced"),
  resultWarnings: $("resultWarnings"),
  downloadButton: $("downloadButton"),
  openButton: $("openButton"),
  mapButton: $("mapButton"),
  newPhotoButton: $("newPhotoButton"),
  qrImage: $("qrImage"),
  shareHint: $("shareHint"),
  shareUrlText: $("shareUrlText"),
  copyShareButton: $("copyShareButton"),
  clearLocationButton: $("clearLocationButton"),
  recentSection: $("recentSection"),
  recentList: $("recentList"),
  recentCount: $("recentCount"),
  refreshButton: $("refreshButton"),
  networkBadge: $("networkBadge"),
  toast: $("toast"),
};

const state = {
  file: null,
  previewUrl: null,
  loading: false,
  maxUploadMb: 40,
  clockOffsetMs: 0,
  clockTimeZone: undefined,
  clockTimer: null,
  captureInitialized: false,
  captureTouched: false,
  dragDepth: 0,
  map: null,
  marker: null,
  markerIcon: null,
  mapSyncTimer: null,
  resultFileName: null,
  toastTimer: null,
  lastErrorLogged: false,
  advancedInputs: [],
  advancedByKey: new Map(),
  profileId: null,
  profileCategory: "all",
  profileMenuOpen: false,
};

const customSelects = [];
let countryPicker = null;
let cityPicker = null;

const SUPPORTED_EXTENSIONS = new Set([
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

const MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/tiff": "tiff",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
};

const CAMERA_KEYS = [
  "make",
  "model",
  "lensModel",
  "software",
  "iso",
  "fNumber",
  "exposureTime",
  "exposureCompensation",
  "focalLength",
  "focalLength35mm",
  "exposureProgram",
  "whiteBalance",
  "meteringMode",
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

const TOTAL_PROFILES = PROFILE_GROUPS.reduce(
  (total, group) => total + group.profiles.length,
  0,
);
const DEFAULT_COUNTRY_CODE = "TR";
const DEFAULT_CITY_NAME = "İstanbul";
const LOCATION_MATCH_KM = 45;
const COUNTRY_BY_CODE = new Map(
  COUNTRIES.map((country) => [country.code, country]),
);

function countryByCode(code) {
  return COUNTRY_BY_CODE.get(code) ?? COUNTRY_BY_CODE.get(DEFAULT_COUNTRY_CODE);
}

function cityDistanceKm(latitudeA, longitudeA, latitudeB, longitudeB) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(latitudeB - latitudeA);
  const deltaLongitude = toRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(toRadians(latitudeA)) *
      Math.cos(toRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestCity(latitude, longitude) {
  let nearest = null;
  for (const country of COUNTRIES) {
    for (const city of country.cities) {
      const distanceKm = cityDistanceKm(
        latitude,
        longitude,
        city.latitude,
        city.longitude,
      );
      if (!nearest || distanceKm < nearest.distanceKm) {
        nearest = { country, city, distanceKm };
      }
    }
  }
  return nearest;
}

function normalizeSelectSearch(value) {
  return String(value ?? "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/\s+/g, " ")
    .trim();
}

function createCustomSelect({
  root,
  select,
  trigger,
  valueLabel,
  flagLabel = null,
  menu,
  search,
  options,
  empty,
  placeholder = "Seçim yap",
}) {
  let isOpen = false;
  document.body.append(menu);

  const containsNode = (node) => root.contains(node) || menu.contains(node);

  function sync() {
    const option = select.selectedOptions[0];
    const text = option?.textContent?.trim() || "";
    valueLabel.textContent = text || placeholder;
    if (flagLabel) {
      const flag = option?.dataset.flag || "";
      flagLabel.textContent = flag;
      flagLabel.hidden = !flag;
    }
    trigger.title = text || placeholder;
    trigger.classList.toggle("is-empty", !text);
  }

  function optionElements() {
    return Array.from(options.querySelectorAll(".custom-select-option"));
  }

  function renderOptions(filter = "") {
    const query = normalizeSelectSearch(filter);
    const fragment = document.createDocumentFragment();
    let count = 0;

    for (const option of select.options) {
      const label = option.textContent.trim();
      if (query && !normalizeSelectSearch(label).includes(query)) continue;

      count += 1;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "custom-select-option";
      button.dataset.value = option.value;
      button.setAttribute("role", "option");
      const selected = option.value === select.value;
      button.setAttribute("aria-selected", String(selected));
      if (selected) button.classList.add("is-selected");
      if (option.dataset.custom) button.classList.add("is-custom");

      const flag = option.dataset.flag || "";
      if (flag) {
        const flagNode = document.createElement("span");
        flagNode.className = "custom-select-option-flag";
        flagNode.textContent = flag;
        flagNode.setAttribute("aria-hidden", "true");
        button.append(flagNode);
      }

      const labelNode = document.createElement("span");
      labelNode.className = "custom-select-option-label";
      labelNode.textContent = label;
      button.append(labelNode);

      fragment.append(button);
    }

    options.replaceChildren(fragment);
    options.scrollTop = 0;
    empty.hidden = count > 0;
    menu.classList.toggle("is-empty", count === 0);
  }

  function positionMenu() {
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 14;
    const spaceAbove = rect.top - 14;
    const openUp = spaceBelow < 230 && spaceAbove > spaceBelow;
    const available = Math.max(
      168,
      Math.min(330, (openUp ? spaceAbove : spaceBelow) - 8),
    );

    menu.style.left = `${Math.round(rect.left)}px`;
    menu.style.width = `${Math.round(rect.width)}px`;
    menu.style.maxHeight = `${available}px`;
    if (openUp) {
      menu.style.top = "auto";
      menu.style.bottom = `${Math.round(window.innerHeight - rect.top + 6)}px`;
    } else {
      menu.style.bottom = "auto";
      menu.style.top = `${Math.round(rect.bottom + 6)}px`;
    }
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  function openMenu() {
    if (isOpen) return;
    for (const picker of customSelects) {
      if (picker !== api) picker.close();
    }
    isOpen = true;
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    renderOptions("");
    positionMenu();
    menu.hidden = false;
    window.requestAnimationFrame(() => {
      search.focus({ preventScroll: true });
      search.select();
    });
  }

  function choose(value) {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    sync();
    closeMenu({ restoreFocus: true });
  }

  trigger.addEventListener("click", () => {
    if (isOpen) closeMenu({ restoreFocus: true });
    else openMenu();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  });

  search.addEventListener("input", () => {
    renderOptions(search.value);
  });

  search.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      optionElements()[0]?.click();
    }
  });

  options.addEventListener("click", (event) => {
    const option = event.target.closest(".custom-select-option");
    if (!option) return;
    choose(option.dataset.value);
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const items = optionElements();
      if (!items.length) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement);
      let next;
      if (current === -1) {
        next = event.key === "ArrowDown" ? 0 : items.length - 1;
      } else {
        next =
          (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) %
          items.length;
      }
      items[next].focus();
      items[next].scrollIntoView({ block: "nearest" });
      return;
    }

    if (
      (event.key === "Home" || event.key === "End") &&
      document.activeElement?.classList.contains("custom-select-option")
    ) {
      event.preventDefault();
      const items = optionElements();
      const target = event.key === "Home" ? items[0] : items[items.length - 1];
      target?.focus();
      target?.scrollIntoView({ block: "nearest" });
    }
  });

  root.addEventListener("focusout", (event) => {
    if (!isOpen) return;
    if (!event.relatedTarget) return;
    if (containsNode(event.relatedTarget)) return;
    window.setTimeout(() => {
      if (!containsNode(document.activeElement)) closeMenu();
    }, 0);
  });

  const api = {
    root,
    menu,
    sync,
    close: closeMenu,
    isOpen: () => isOpen,
    reposition() {
      if (!isOpen) return;
      const rect = trigger.getBoundingClientRect();
      if (rect.bottom < 8 || rect.top > window.innerHeight - 8) {
        closeMenu();
        return;
      }
      positionMenu();
    },
  };
  customSelects.push(api);
  return api;
}

function addCustomCityOption() {
  if (elements.citySelect.querySelector('option[value="__custom"]')) return;
  const option = document.createElement("option");
  option.value = "__custom";
  option.textContent = "Haritadan seçilen konum";
  option.dataset.custom = "true";
  elements.citySelect.prepend(option);
  cityPicker?.sync();
}

function populateCountrySelect() {
  const fragment = document.createDocumentFragment();
  for (const country of sortedCountries()) {
    const option = document.createElement("option");
    option.value = country.code;
    option.textContent = country.name;
    option.dataset.flag = countryFlag(country.code);
    fragment.append(option);
  }
  elements.countrySelect.replaceChildren(fragment);
  countryPicker?.sync();
}

function populateCitySelect(countryCode, selectedName) {
  const country = countryByCode(countryCode);
  const fragment = document.createDocumentFragment();
  for (const city of country.cities) {
    const option = document.createElement("option");
    option.value = city.name;
    option.textContent = city.name;
    fragment.append(option);
  }
  elements.citySelect.replaceChildren(fragment);
  const target = country.cities.some((city) => city.name === selectedName)
    ? selectedName
    : country.defaultCity;
  elements.citySelect.value = target;
  cityPicker?.sync();
}

function selectedCity() {
  const country = countryByCode(elements.countrySelect.value);
  const cityName = elements.citySelect.value;
  if (!cityName || cityName === "__custom") return null;
  return country.cities.find((city) => city.name === cityName) ?? null;
}

function syncLocationSelectors(latitude, longitude) {
  if (!elements.countrySelect.options.length) return;
  const nearest = findNearestCity(latitude, longitude);
  if (nearest && nearest.distanceKm <= LOCATION_MATCH_KM) {
    if (elements.countrySelect.value !== nearest.country.code) {
      elements.countrySelect.value = nearest.country.code;
      countryPicker?.sync();
      populateCitySelect(nearest.country.code, nearest.city.name);
    } else {
      elements.citySelect.value = nearest.city.name;
      cityPicker?.sync();
    }
    return;
  }
  addCustomCityOption();
  elements.citySelect.value = "__custom";
  cityPicker?.sync();
}

function applyLocationFromSelectors({ fly = false } = {}) {
  const country = countryByCode(elements.countrySelect.value);
  const city = selectedCity();
  if (!city) return;
  changeCoordinates(city.latitude, city.longitude, { fly });
  showToast(`${country.name} · ${city.name}`);
}

function initLocationControls() {
  populateCountrySelect();
  elements.countrySelect.value = DEFAULT_COUNTRY_CODE;
  countryPicker?.sync();
  populateCitySelect(DEFAULT_COUNTRY_CODE, DEFAULT_CITY_NAME);

  const coords = currentCoordinates();
  if (!coords) {
    updateCoordinateHint();
    return;
  }

  const nearest = findNearestCity(coords.latitude, coords.longitude);
  if (nearest && nearest.distanceKm <= 150) {
    elements.countrySelect.value = nearest.country.code;
    countryPicker?.sync();
    populateCitySelect(nearest.country.code, nearest.city.name);
  }
  syncLocationSelectors(coords.latitude, coords.longitude);
}

function fileExtension(name) {
  const parts = String(name || "").split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`;
}

function formatExifForDisplay(value) {
  const match = String(value ?? "").match(
    /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/,
  );
  if (!match) return value || "—";
  return `${match[3]}.${match[2]}.${match[1]} · ${match[4]}:${match[5]}:${match[6]}`;
}

function formatCoordinates(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "—";
  const latRef = latitude >= 0 ? "N" : "S";
  const lonRef = longitude >= 0 ? "E" : "W";
  return `${Math.abs(latitude).toFixed(6)}° ${latRef}, ${Math.abs(longitude).toFixed(6)}° ${lonRef}`;
}

function parseClientCoordinate(input, axis) {
  const raw = input.value.trim().replace(",", ".");
  if (!raw) return null;
  const value = Number(raw);
  const limit = axis === "latitude" ? 90 : 180;
  if (!Number.isFinite(value) || value < -limit || value > limit) return null;
  return value;
}

function currentCoordinates() {
  const latitude = parseClientCoordinate(elements.latitude, "latitude");
  const longitude = parseClientCoordinate(elements.longitude, "longitude");
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude };
}

function showError(message) {
  elements.formError.textContent = message;
  elements.formError.hidden = false;
}

function clearError() {
  elements.formError.hidden = true;
  elements.formError.textContent = "";
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  state.toastTimer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2800);
}

function scrollToSection(element, { block = "start" } = {}) {
  if (!element) return;
  const reveal = () => {
    element.scrollIntoView({ behavior: "smooth", block });
    element.classList.remove("scroll-highlight");
    void element.offsetWidth;
    element.classList.add("scroll-highlight");
    window.clearTimeout(element.highlightTimer);
    element.highlightTimer = window.setTimeout(() => {
      element.classList.remove("scroll-highlight");
    }, 1700);
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(reveal));
}

function scrollLogToEnd() {
  if (!elements.logConsole) return;
  window.requestAnimationFrame(() => {
    elements.logConsole.scrollTop = elements.logConsole.scrollHeight;
  });
}

function updateSubmitState() {
  const hasFile = Boolean(state.file);
  const hasDate = Boolean(parseDateValue(elements.captureDate.value));
  elements.submitButton.disabled = state.loading || !hasFile || !hasDate;
}

function updateCoordinateHint() {
  const latitudeRaw = elements.latitude.value.trim();
  const longitudeRaw = elements.longitude.value.trim();
  const coords = currentCoordinates();
  if (coords) {
    elements.coordHint.textContent = `${formatCoordinates(
      coords.latitude,
      coords.longitude,
    )} olarak yazılacak.`;
  } else if (!latitudeRaw && !longitudeRaw) {
    elements.coordHint.textContent =
      "GPS eklenmeyecek. Enlem ve boylam girerek ekleyebilirsin.";
  } else {
    elements.coordHint.textContent =
      "Enlem ve boylamı birlikte ve geçerli aralıkta gir.";
  }
  if (elements.clearLocationButton) {
    elements.clearLocationButton.disabled = !latitudeRaw && !longitudeRaw;
  }
  updateMapReadout();
}

function saveCoordinates() {
  const coords = currentCoordinates();
  try {
    if (!coords) {
      localStorage.removeItem("metachanger.coordinates");
      return;
    }
    localStorage.setItem(
      "metachanger.coordinates",
      JSON.stringify({ ...coords, savedAt: Date.now() }),
    );
  } catch {
    /* Storage can be unavailable in private browsing contexts. */
  }
}

function restoreCoordinates() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("metachanger.coordinates") || "null",
    );
    if (
      Number.isFinite(saved?.latitude) &&
      Number.isFinite(saved?.longitude) &&
      Math.abs(saved.latitude) <= 90 &&
      Math.abs(saved.longitude) <= 180
    ) {
      elements.latitude.value = saved.latitude.toFixed(6);
      elements.longitude.value = saved.longitude.toFixed(6);
      updateCoordinateHint();
    }
  } catch {
    /* Ignore malformed or unavailable local storage. */
  }
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function serverNow() {
  return new Date(Date.now() + state.clockOffsetMs);
}

function partsInZone(date) {
  const options = {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };
  if (state.clockTimeZone) options.timeZone = state.clockTimeZone;

  try {
    const parts = new Intl.DateTimeFormat("en-CA", options).formatToParts(date);
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );
    return {
      year: Number(values.year),
      month: Number(values.month),
      day: Number(values.day),
      hour: Number(values.hour),
      minute: Number(values.minute),
      second: Number(values.second),
    };
  } catch {
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    };
  }
}

function dateValueFromParts(parts) {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function dateValueFromDate(date) {
  return dateValueFromParts(partsInZone(date));
}

function nowDateValue() {
  return dateValueFromDate(serverNow());
}

function parseDateValue(value) {
  const match = String(value ?? "").match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] == null ? 0 : Number(match[6]);
  if (year < 1900 || year > 2999) return null;

  const milliseconds = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(milliseconds);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }

  return { year, month, day, hour, minute, second, milliseconds };
}

function shiftDateValue(value, minutes) {
  const parts = parseDateValue(value);
  if (!parts) return nowDateValue();
  const shifted = new Date(parts.milliseconds + minutes * 60_000);
  return dateValueFromParts({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  });
}

function relativeDateLabel(value) {
  const selected = parseDateValue(value);
  const now = parseDateValue(nowDateValue());
  if (!selected || !now) return "";

  const difference = Math.round((selected.milliseconds - now.milliseconds) / 60_000);
  if (Math.abs(difference) < 1) return "şimdi";

  const absolute = Math.abs(difference);
  const suffix = difference < 0 ? "önce" : "sonra";
  let amount;
  if (absolute < 60) amount = `${absolute} dk`;
  else if (absolute < 1440) amount = `${Math.round(absolute / 60)} saat`;
  else if (absolute < 43_200) amount = `${Math.round(absolute / 1440)} gün`;
  else if (absolute < 525_600) amount = `${Math.round(absolute / 43_200)} ay`;
  else amount = `${(absolute / 525_600).toFixed(1)} yıl`;
  return `${amount} ${suffix}`;
}

function updateCaptureSummary() {
  const value = elements.captureDate.value;
  const parts = parseDateValue(value);
  if (!parts) {
    elements.captureSummary.textContent = "Geçerli bir tarih ve saat seç.";
    return;
  }

  const display = `${pad(parts.day)}.${pad(parts.month)}.${parts.year} · ${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
  const relative = relativeDateLabel(value);
  elements.captureSummary.textContent = relative
    ? `${display} · ${relative}`
    : display;
  updatePresetButtons();
}

function updatePresetButtons() {
  const selected = parseDateValue(elements.captureDate.value);
  const now = parseDateValue(nowDateValue());
  if (!selected || !now) return;
  const difference = Math.round((selected.milliseconds - now.milliseconds) / 60_000);

  for (const button of document.querySelectorAll("[data-shift]")) {
    const shift = Number(button.dataset.shift);
    const active =
      shift === 0 ? Math.abs(difference) < 1 : Math.abs(difference - shift) < 1;
    button.classList.toggle("is-active", active);
  }
}

function setCaptureValue(value) {
  elements.captureDate.value = value;
  updateCaptureSummary();
  updateSubmitState();
}

function applyTimeShift(minutes) {
  const base = parseDateValue(elements.captureDate.value)
    ? elements.captureDate.value
    : nowDateValue();
  state.captureTouched = minutes !== 0;
  setCaptureValue(minutes === 0 ? nowDateValue() : shiftDateValue(base, minutes));
  clearError();
}

function randomCaptureValue() {
  const span = 5 * 365 * 24 * 60 * 60 * 1000;
  const random = Date.now() + state.clockOffsetMs - Math.random() * span;
  return dateValueFromDate(new Date(random));
}

function formatClock(date) {
  const options = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  };
  const dateOptions = { day: "numeric", month: "short", year: "numeric" };
  if (state.clockTimeZone) {
    options.timeZone = state.clockTimeZone;
    dateOptions.timeZone = state.clockTimeZone;
  }

  try {
    return {
      clock: new Intl.DateTimeFormat("tr-TR", options).format(date),
      date: new Intl.DateTimeFormat("tr-TR", dateOptions).format(date),
    };
  } catch {
    return {
      clock: date.toLocaleTimeString("tr-TR"),
      date: date.toLocaleDateString("tr-TR"),
    };
  }
}

function updateClock() {
  const now = serverNow();
  const formatted = formatClock(now);
  elements.serverNow.textContent = formatted.clock;
  elements.serverDateLabel.textContent = formatted.date;

  if (!state.captureInitialized) return;
  if (!state.captureTouched) {
    const current = nowDateValue();
    if (elements.captureDate.value !== current) setCaptureValue(current);
    else updateCaptureSummary();
    return;
  }
  if (elements.captureDate.value) updateCaptureSummary();
}

function startClock() {
  updateClock();
  if (!state.clockTimer) {
    state.clockTimer = window.setInterval(updateClock, 1000);
  }
}

async function loadStatus() {
  try {
    const response = await fetch("/api/status", { cache: "no-store" });
    if (!response.ok) throw new Error("Durum alınamadı.");
    const status = await response.json();

    state.maxUploadMb = status.maxUploadMb || state.maxUploadMb;
    state.clockOffsetMs = Date.parse(status.serverTime) - Date.now();
    state.clockTimeZone = status.timeZone || undefined;

    elements.maxSizeLabel.textContent = ` · maks. ${state.maxUploadMb} MB`;
    elements.timeZoneBadge.textContent = status.utcOffset || "—";
    elements.timeZoneBadge.title = status.timeZone || "";

    if (status.share?.phoneReachable) {
      try {
        const host = new URL(status.share.origin).host;
        elements.networkBadge.textContent = `Telefon · ${host}`;
        elements.networkBadge.title = (status.share.addresses || []).join(" · ");
        elements.networkBadge.hidden = false;
      } catch {
        elements.networkBadge.hidden = true;
      }
    } else {
      elements.networkBadge.hidden = true;
    }

    if (!state.captureInitialized) {
      state.captureTouched = false;
      setCaptureValue(nowDateValue());
      state.captureInitialized = true;
    }
    startClock();
  } catch {
    state.clockOffsetMs = 0;
    state.clockTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    elements.maxSizeLabel.textContent = ` · maks. ${state.maxUploadMb} MB`;
    elements.timeZoneBadge.textContent = "yerel";
    elements.timeZoneBadge.title = state.clockTimeZone;
    if (!state.captureInitialized) {
      state.captureTouched = false;
      setCaptureValue(nowDateValue());
      state.captureInitialized = true;
    }
    startClock();
  }
}

function normalizePastedFile(file) {
  const extension = fileExtension(file.name);
  if (SUPPORTED_EXTENSIONS.has(extension)) return file;

  const mapped = MIME_EXTENSIONS[file.type];
  if (!mapped) return file;
  return new File([file], `yapistirilan-gorsel.${mapped}`, {
    type: file.type,
    lastModified: file.lastModified || Date.now(),
  });
}

function clearPreviewUrl() {
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = null;
  }
}

function resetFile({ hideResult = false } = {}) {
  clearPreviewUrl();
  state.file = null;
  elements.fileInput.value = "";
  elements.previewImage.removeAttribute("src");
  elements.previewImage.hidden = false;
  elements.previewFallback.hidden = true;
  elements.filePreview.hidden = true;
  elements.dropEmpty.hidden = false;
  elements.dropzone.classList.remove("has-file", "is-dragging");
  if (hideResult) {
    elements.resultSection.hidden = true;
    elements.logSection.hidden = true;
    state.resultFileName = null;
    resetLog();
  }
  updateSubmitState();
}

function setFile(file, { source = "picker" } = {}) {
  if (state.loading) return;
  const normalized = normalizePastedFile(file);
  const extension = fileExtension(normalized.name);

  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    showError(
      "Desteklenmeyen dosya biçimi. JPEG, HEIC, TIFF, PNG, WebP veya AVIF seçin.",
    );
    return;
  }
  if (normalized.size > state.maxUploadMb * 1024 * 1024) {
    showError(
      `Fotoğraf çok büyük. En fazla ${state.maxUploadMb} MB yükleyebilirsiniz.`,
    );
    return;
  }

  clearError();
  clearPreviewUrl();
  state.file = normalized;
  state.previewUrl = URL.createObjectURL(normalized);

  elements.fileName.textContent = normalized.name;
  elements.fileMeta.textContent = `${formatBytes(normalized.size)} · ${
    normalized.type || extension.toUpperCase() || "görsel"
  }`;
  elements.previewImage.hidden = false;
  elements.previewFallback.hidden = true;
  elements.previewImage.src = state.previewUrl;
  elements.dropEmpty.hidden = true;
  elements.filePreview.hidden = false;
  elements.dropzone.classList.add("has-file");
  updateSubmitState();

  if (source === "paste") {
    showToast("Panodaki görsel alındı.");
    elements.dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
    elements.dropzone.focus({ preventScroll: true });
  }
}

function setLoading(loading) {
  state.loading = loading;
  elements.submitButton.querySelector(".button-text").textContent = loading
    ? "İşleniyor…"
    : "EXIF'i güncelle ve dışa aktar";
  elements.submitButton.querySelector(".spinner").hidden = !loading;
  elements.submitButton.querySelector(".button-arrow").hidden = loading;
  elements.removeFile.disabled = loading;
  elements.clearLogButton.disabled = loading;
  elements.dropzone.setAttribute("aria-busy", String(loading));
  for (const button of document.querySelectorAll(".chip-button")) {
    button.disabled = loading;
  }
  updateSubmitState();
}

function setLogStatus(text, stateName = "") {
  elements.logStatus.textContent = text;
  if (stateName) elements.logStatus.dataset.state = stateName;
  else delete elements.logStatus.dataset.state;
}

function setProgress(value, label = "") {
  const progress = clamp(Math.round(Number(value) || 0), 0, 100);
  elements.progressFill.style.width = `${progress}%`;
  elements.processProgress.setAttribute("aria-valuenow", String(progress));
  if (label) setLogStatus(label, "working");
}

function resetLog() {
  elements.logConsole.replaceChildren();
  setLogStatus("Bekliyor");
  setProgress(0);
  state.lastErrorLogged = false;
}

function logTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const LOG_LEVELS = {
  info: "BİLGİ",
  success: "TAMAM",
  warn: "UYARI",
  tag: "ETİKET",
  error: "HATA",
  debug: "DEBUG",
};

function addLog(level, message, detail = "", at = "") {
  const item = document.createElement("li");
  item.className = "log-line";
  item.dataset.level = LOG_LEVELS[level] ? level : "info";

  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = logTimestamp(at);

  const severity = document.createElement("span");
  severity.className = "log-level";
  severity.textContent = LOG_LEVELS[level] || "BİLGİ";

  const text = document.createElement("span");
  text.className = "log-message";
  text.textContent = message;
  if (detail) {
    const detailNode = document.createElement("span");
    detailNode.className = "log-detail";
    detailNode.textContent = detail;
    text.append(detailNode);
  }

  item.append(time, severity, text);
  const stick = elements.logConsole.scrollHeight - elements.logConsole.scrollTop - elements.logConsole.clientHeight < 50;
  elements.logConsole.append(item);
  if (stick) elements.logConsole.scrollTop = elements.logConsole.scrollHeight;
}

function collectAdvancedFields() {
  const values = {};
  for (const input of state.advancedInputs) {
    const raw = input.value.trim();
    if (!raw) continue;
    if (!input.checkValidity()) {
      const label =
        input.closest(".input-field")?.querySelector("span:first-child")
          ?.textContent.trim() || "Gelişmiş alan";
      showError(`${label} için geçerli bir değer gir.`);
      input.focus();
      return null;
    }
    values[input.dataset.metadata] = raw.replace(",", ".");
  }
  return values;
}

function updateAdvancedCount() {
  const count = state.advancedInputs.filter((input) => input.value.trim()).length;
  elements.advancedCount.textContent = `${count} alan`;
}

function updateProfileTrigger(profile, { custom = false } = {}) {
  if (profile) {
    elements.profileTriggerLabel.textContent = profile.label;
    elements.profileTriggerMeta.textContent = `${profile.group.label} · ${profile.summary}`;
    elements.profilePicker.dataset.selected = "true";
    return;
  }

  elements.profileTriggerLabel.textContent = custom
    ? "Özel ayarlar"
    : "Hazır profil seç";
  elements.profileTriggerMeta.textContent = custom
    ? "Alanlar elle düzenlendi"
    : "Kamera ve çekim bilgileri";
  delete elements.profilePicker.dataset.selected;
}

function closeProfileMenu({ restoreFocus = false } = {}) {
  if (!state.profileMenuOpen) return;
  state.profileMenuOpen = false;
  elements.profileMenu.hidden = true;
  elements.profileTrigger.setAttribute("aria-expanded", "false");
  if (restoreFocus) elements.profileTrigger.focus();
}

function renderProfileFilters() {
  const categories = [
    { id: "all", label: "Tümü", count: TOTAL_PROFILES },
    ...PROFILE_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      count: group.profiles.length,
    })),
  ];
  const fragment = document.createDocumentFragment();

  for (const category of categories) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-filter";
    button.dataset.profileCategory = category.id;
    const active = state.profileCategory === category.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));

    const label = document.createElement("span");
    label.textContent = category.label;
    const count = document.createElement("small");
    count.textContent = String(category.count);
    button.append(label, count);
    fragment.append(button);
  }

  elements.profileFilters.replaceChildren(fragment);
}

function syncProfileFilters() {
  for (const button of elements.profileFilters.querySelectorAll(
    "[data-profile-category]",
  )) {
    const active = state.profileCategory === button.dataset.profileCategory;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
}

function renderProfileMenu(query = "") {
  const groups = filterProfiles(query).filter(
    (group) =>
      state.profileCategory === "all" || group.id === state.profileCategory,
  );
  const fragment = document.createDocumentFragment();
  let count = 0;

  for (const group of groups) {
    const section = document.createElement("section");
    section.className = "profile-group";
    section.setAttribute("role", "group");
    section.setAttribute("aria-label", group.label);

    const heading = document.createElement("div");
    heading.className = "profile-group-head";
    const title = document.createElement("span");
    title.className = "profile-group-title";
    title.textContent = group.label;
    heading.append(title);
    section.append(heading);

    for (const profile of group.profiles) {
      count += 1;
      const option = document.createElement("button");
      option.type = "button";
      option.className = "profile-option";
      option.dataset.profileId = profile.id;
      option.setAttribute("role", "option");
      option.setAttribute(
        "aria-selected",
        String(state.profileId === profile.id),
      );
      option.tabIndex = -1;
      if (state.profileId === profile.id) option.classList.add("is-selected");

      const copy = document.createElement("span");
      copy.className = "profile-option-copy";
      const name = document.createElement("strong");
      name.textContent = profile.label;
      const summary = document.createElement("small");
      summary.textContent = profile.summary;
      copy.append(name, summary);

      const tag = document.createElement("span");
      tag.className = "profile-option-tag";
      tag.textContent = profile.tag;

      option.append(copy, tag);
      section.append(option);
    }

    fragment.append(section);
  }

  elements.profileOptions.replaceChildren(fragment);
  elements.profileEmpty.hidden = count > 0;
  elements.profileEmpty.textContent = query.trim()
    ? "Eşleşen profil bulunamadı."
    : "Bu kategoride profil yok.";
  elements.profileCount.textContent = query.trim()
    ? `${count} sonuç`
    : `${count} profil`;
}

function openProfileMenu() {
  if (state.profileMenuOpen) return;
  state.profileMenuOpen = true;
  renderProfileFilters();
  renderProfileMenu(elements.profileSearch.value);
  elements.profileMenu.hidden = false;
  elements.profileTrigger.setAttribute("aria-expanded", "true");
  elements.profileMenu.classList.remove("profile-menu-up");
  elements.profileMenu.style.removeProperty("--profile-menu-max-height");
  const triggerRect = elements.profileTrigger.getBoundingClientRect();
  const desiredHeight = elements.profileMenu.offsetHeight;
  const spaceBelow = window.innerHeight - triggerRect.bottom - 16;
  const spaceAbove = triggerRect.top - 16;
  const openUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
  const available = Math.max(
    200,
    Math.min(440, openUp ? spaceAbove : spaceBelow),
  );
  elements.profileMenu.style.setProperty(
    "--profile-menu-max-height",
    `${available}px`,
  );
  elements.profileMenu.classList.toggle("profile-menu-up", openUp);
  window.requestAnimationFrame(() => {
    elements.profileSearch.focus();
    elements.profileSearch.select();
    elements.profileOptions
      .querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  });
}

function focusProfileOption(step) {
  const options = Array.from(
    elements.profileOptions.querySelectorAll(".profile-option"),
  );
  if (!options.length) return;
  const current = options.indexOf(document.activeElement);
  const index =
    current === -1
      ? step > 0
        ? 0
        : options.length - 1
      : (current + step + options.length) % options.length;
  options[index].focus();
}

function applyProfile(profileId) {
  const profile = PROFILES[profileId];
  if (!profile) return;

  for (const key of CAMERA_KEYS) {
    const input = state.advancedByKey.get(key);
    if (input) input.value = "";
  }
  for (const key of CAMERA_KEYS) {
    const input = state.advancedByKey.get(key);
    if (!input || profile[key] == null) continue;
    input.value = String(profile[key]);
  }

  state.profileId = profile.id;
  updateProfileTrigger(profile);
  updateAdvancedCount();
  renderProfileMenu(elements.profileSearch.value);
  closeProfileMenu({ restoreFocus: true });
  showToast(`${profile.label} profili uygulandı.`);
}

function markProfileAsCustom() {
  const hasValues = state.advancedInputs.some((input) => input.value.trim());
  state.profileId = null;
  updateProfileTrigger(null, { custom: hasValues });
}

function clearAdvancedFields({ notify = true } = {}) {
  for (const input of state.advancedInputs) input.value = "";
  state.profileId = null;
  updateProfileTrigger(null);
  updateAdvancedCount();
  renderProfileMenu(elements.profileSearch.value);
  if (notify) showToast("Gelişmiş alanlar temizlendi.");
}

function updateMapReadout() {
  if (!elements.mapReadout) return;
  const coords = currentCoordinates();
  elements.mapReadout.textContent = coords
    ? `${formatCoordinates(coords.latitude, coords.longitude)} · haritadan seçebilirsin`
    : "Harita hazır olduğunda bir noktaya tıkla.";
}

function markerIcon() {
  if (state.markerIcon) return state.markerIcon;
  state.markerIcon = window.L.divIcon({
    className: "map-pin",
    html: "<span></span>",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
  return state.markerIcon;
}

function ensureMapMarker(latitude, longitude) {
  if (!state.map) return null;
  if (state.marker) {
    state.marker.setLatLng([latitude, longitude]);
    return state.marker;
  }
  state.marker = window.L.marker([latitude, longitude], {
    icon: markerIcon(),
    draggable: true,
    keyboard: true,
    title: "Seçili konum",
  }).addTo(state.map);
  state.marker.on("dragend", () => {
    const position = state.marker.getLatLng();
    changeCoordinates(position.lat, position.lng);
  });
  return state.marker;
}

function removeMapMarker() {
  if (!state.map || !state.marker) return;
  state.map.removeLayer(state.marker);
  state.marker = null;
}

function clearLocation() {
  const hadLocation = Boolean(
    elements.latitude.value.trim() || elements.longitude.value.trim(),
  );
  elements.latitude.value = "";
  elements.longitude.value = "";
  removeMapMarker();
  saveCoordinates();
  updateCoordinateHint();
  updateSubmitState();
  clearError();
  if (hadLocation) showToast("Konum temizlendi; GPS eklenmeyecek.");
}

function changeCoordinates(latitude, longitude, { fly = false } = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
  elements.latitude.value = latitude.toFixed(6);
  elements.longitude.value = longitude.toFixed(6);
  updateCoordinateHint();
  saveCoordinates();
  updateSubmitState();

  if (state.map) {
    ensureMapMarker(latitude, longitude);
    if (fly) {
      state.map.flyTo([latitude, longitude], 12, { duration: 0.7 });
    }
  }

  syncLocationSelectors(latitude, longitude);
}

function openMapTo(latitude, longitude) {
  if (!elements.mapDetails.open) elements.mapDetails.open = true;
  window.setTimeout(() => {
    initMap();
    if (!state.map) return;
    state.map.invalidateSize();
    state.map.setView([latitude, longitude], 12, { animate: true });
  }, 120);
}

function initMap() {
  if (state.map) return;
  if (!window.L) {
    showError("Harita kütüphanesi yüklenemedi. Koordinatları elle girebilirsin.");
    return;
  }

  const selected = selectedCity();
  const fallback = selected
    ? { latitude: selected.latitude, longitude: selected.longitude }
    : { latitude: 41.0082, longitude: 28.9784 };
  const coords = currentCoordinates() || fallback;
  state.map = window.L.map(elements.map, {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView([coords.latitude, coords.longitude], 11);

  const tiles = window.L.tileLayer("/api/tiles/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
  }).addTo(state.map);

  window.L.control.scale({ imperial: false }).addTo(state.map);

  if (currentCoordinates()) {
    ensureMapMarker(coords.latitude, coords.longitude);
  }

  state.map.on("click", (event) => {
    changeCoordinates(event.latlng.lat, event.latlng.lng);
  });

  tiles.on("tileerror", () => {
    if (elements.mapTileNotice) elements.mapTileNotice.hidden = false;
    elements.mapReadout.textContent =
      "Harita karoları yüklenemedi; koordinatları elle girebilirsin.";
  });

  tiles.on("load", () => {
    if (elements.mapTileNotice) elements.mapTileNotice.hidden = true;
    updateMapReadout();
  });

  updateMapReadout();
}

function scheduleMapSync() {
  if (!state.map) return;
  window.clearTimeout(state.mapSyncTimer);
  state.mapSyncTimer = window.setTimeout(() => {
    const coords = currentCoordinates();
    if (!coords) {
      removeMapMarker();
      return;
    }
    ensureMapMarker(coords.latitude, coords.longitude);
    state.map.setView([coords.latitude, coords.longitude], state.map.getZoom(), {
      animate: true,
    });
  }, 350);
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showError("Bu tarayıcı konum servisini desteklemiyor.");
    return;
  }

  elements.locateButton.disabled = true;
  elements.locateLabel.textContent = "Konum alınıyor…";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      changeCoordinates(position.coords.latitude, position.coords.longitude, {
        fly: true,
      });
      if (!elements.mapDetails.open) elements.mapDetails.open = true;
      elements.locateButton.disabled = false;
      elements.locateLabel.textContent = "Konumumu kullan";
      clearError();
    },
    (error) => {
      elements.locateButton.disabled = false;
      elements.locateLabel.textContent = "Konumumu kullan";
      const message =
        error.code === error.PERMISSION_DENIED
          ? "Konum izni verilmedi. Koordinatları elle girebilirsin."
          : "Konum alınamadı. Koordinatları elle girebilirsin.";
      showError(message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
  );
}

function formatAdvancedSummary(result) {
  const metadata = result.metadata || {};
  const pieces = [];
  if (metadata.make || metadata.model) {
    pieces.push([metadata.make, metadata.model].filter(Boolean).join(" "));
  }
  if (metadata.lensModel) pieces.push(metadata.lensModel);
  if (metadata.iso) pieces.push(`ISO ${metadata.iso}`);
  if (metadata.fNumber) pieces.push(`f/${metadata.fNumber}`);
  if (metadata.exposureTime) pieces.push(`${metadata.exposureTime} sn`);
  if (metadata.focalLength) pieces.push(`${metadata.focalLength} mm`);
  if (metadata.gpsAltitude != null) pieces.push(`${metadata.gpsAltitude} m irtifa`);
  if (metadata.gpsDirection != null) pieces.push(`${metadata.gpsDirection}° yön`);
  if (metadata.artist) pieces.push(metadata.artist);
  if (metadata.copyright) pieces.push(metadata.copyright);
  if (metadata.software) pieces.push(metadata.software);
  if (result.advanced?.verified?.length) {
    pieces.push(`${result.advanced.verified.length} alan doğrulandı`);
  }
  return pieces.join(" · ");
}

function showResult(result) {
  const metadata = result.metadata;
  const coords = result.lookup;
  const dimensions =
    metadata.width && metadata.height
      ? `${Math.round(metadata.width)} × ${Math.round(metadata.height)} px${
          metadata.fileType ? ` · ${metadata.fileType}` : ""
        }`
      : metadata.fileType || "—";

  state.resultFileName = result.file.name;
  elements.resultTitle.textContent = "Fotoğraf hazır.";
  elements.resultSubtitle.textContent = `${result.file.name} · ${formatBytes(
    result.file.size,
  )} · ./exported${
    result.processingMs ? ` · ${result.processingMs} ms` : ""
  }.`;
  elements.resultDate.textContent = formatExifForDisplay(
    metadata.dateTimeOriginal,
  );
  elements.resultOffset.textContent =
    metadata.offsetTimeOriginal || result.lookup.offset || "—";
  const gpsLatitude = metadata.gpsLatitude ?? coords?.latitude;
  const gpsLongitude = metadata.gpsLongitude ?? coords?.longitude;
  const hasGps =
    Number.isFinite(gpsLatitude) && Number.isFinite(gpsLongitude);
  elements.resultGps.textContent = hasGps
    ? formatCoordinates(gpsLatitude, gpsLongitude)
    : "GPS eklenmedi";
  elements.resultDimensions.textContent = dimensions;

  const advancedSummary = formatAdvancedSummary(result);
  elements.resultAdvanced.textContent = advancedSummary;
  elements.resultAdvanced.hidden = !advancedSummary;

  const warnings = [
    ...new Set((result.warnings || []).map(String).filter(Boolean)),
  ];
  if (warnings.length > 0) {
    elements.resultWarnings.textContent = `ExifTool notu: ${warnings
      .slice(0, 5)
      .join(" · ")}`;
    elements.resultWarnings.hidden = false;
  } else {
    elements.resultWarnings.hidden = true;
    elements.resultWarnings.textContent = "";
  }

  elements.resultImage.hidden = false;
  elements.resultFallback.hidden = true;
  elements.resultImage.src = result.file.url;
  elements.resultImage.alt = `${result.file.name} önizlemesi`;

  elements.downloadButton.href = result.file.downloadUrl;
  elements.downloadButton.download = result.file.name;
  elements.openButton.href = result.file.url;
  if (hasGps) {
    elements.mapButton.href = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(
      gpsLatitude,
    )}&mlon=${encodeURIComponent(gpsLongitude)}#map=16/${encodeURIComponent(
      gpsLatitude,
    )}/${encodeURIComponent(gpsLongitude)}`;
    elements.mapButton.hidden = false;
  } else {
    elements.mapButton.removeAttribute("href");
    elements.mapButton.hidden = true;
  }

  const share = result.share || {};
  const shareReady = Boolean(share.reachable && share.url);
  const qrFrame = elements.qrImage.closest(".qr-frame");
  const hasQr = Boolean(share.qrDataUrl && shareReady);
  if (qrFrame) qrFrame.hidden = !hasQr;
  if (hasQr) {
    elements.qrImage.src = share.qrDataUrl;
    elements.qrImage.hidden = false;
  } else {
    elements.qrImage.removeAttribute("src");
  }
  elements.shareHint.textContent = shareReady
    ? "Aynı Wi-Fi ağında okut."
    : share.note || "Telefon paylaşımı kapalı.";
  elements.shareUrlText.textContent = shareReady ? share.url : "";
  elements.shareUrlText.title = shareReady ? share.url : "";
  elements.shareUrlText.hidden = !shareReady;
  elements.copyShareButton.dataset.url = shareReady ? share.url : "";
  elements.copyShareButton.disabled = !shareReady;
  elements.copyShareButton.hidden = !shareReady;

  elements.resultSection.hidden = false;
  scrollToSection(elements.resultSection);
}

async function reopenExport(item, button) {
  if (state.loading) {
    showError("İşlem sürerken başka bir fotoğraf yükleyemezsin.");
    return;
  }

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Yükleniyor…";

  try {
    const response = await fetch(item.url, { cache: "no-store" });
    if (!response.ok) throw new Error("Çıktı dosyası yüklenemedi.");
    const blob = await response.blob();
    if (!blob.size) throw new Error("Çıktı dosyası boş.");

    const extension = fileExtension(item.name);
    const file = new File([blob], item.name, {
      type: blob.type || "application/octet-stream",
      lastModified: Date.parse(item.modifiedAt) || Date.now(),
    });
    if (!extension) throw new Error("Çıktı dosyasının uzantısı okunamadı.");

    const previousFile = state.file;
    setFile(file, { source: "recent" });
    if (state.file !== previousFile) {
      elements.dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
      elements.dropzone.focus({ preventScroll: true });
      showToast("Çıktı düzenlemeye yüklendi.");
    }
  } catch (error) {
    showError(
      error instanceof Error
        ? error.message
        : "Çıktı dosyası düzenlemeye yüklenemedi.",
    );
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function deleteExport(item, button) {
  if (state.loading) {
    showError("İşlem sürerken çıktı silinemez.");
    return;
  }
  if (!window.confirm(`"${item.name}" dosyası silinsin mi?`)) return;

  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = "Siliniyor…";

  try {
    const response = await fetch(
      `/api/exports/${encodeURIComponent(item.name)}`,
      {
        method: "DELETE",
        headers: { Accept: "application/json" },
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Çıktı dosyası silinemedi.");
    }

    if (state.resultFileName === item.name) {
      elements.resultSection.hidden = true;
      state.resultFileName = null;
    }
    await loadExports();
    showToast("Çıktı dosyası silindi.");
  } catch (error) {
    showError(
      error instanceof Error ? error.message : "Çıktı dosyası silinemedi.",
    );
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

function buildRecentItem(item) {
  const card = document.createElement("article");
  card.className = "recent-item";
  card.title = item.name;

  const link = document.createElement("a");
  link.className = "recent-thumb";
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `${item.name} dosyasını aç`);

  const image = document.createElement("img");
  image.src = item.url;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";

  const fallback = document.createElement("span");
  fallback.className = "recent-fallback";
  fallback.textContent = "DOSYA";
  fallback.hidden = true;

  image.addEventListener("error", () => {
    image.remove();
    fallback.hidden = false;
  });

  link.append(image, fallback);

  const copy = document.createElement("div");
  copy.className = "recent-copy";

  const name = document.createElement("strong");
  name.textContent = item.name;

  const details = document.createElement("span");
  const date = new Date(item.modifiedAt);
  details.textContent = `${formatBytes(item.size)} · ${date.toLocaleTimeString(
    "tr-TR",
    { hour: "2-digit", minute: "2-digit" },
  )}`;

  copy.append(name, details);

  const actions = document.createElement("div");
  actions.className = "recent-actions";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "recent-edit";
  edit.textContent = "Düzenle";
  edit.title = `${item.name} dosyasını düzenle`;
  edit.addEventListener("click", () => reopenExport(item, edit));

  const open = document.createElement("a");
  open.className = "recent-open";
  open.href = item.url;
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "Aç";

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "recent-delete";
  remove.textContent = "Sil";
  remove.title = `${item.name} dosyasını sil`;
  remove.addEventListener("click", () => deleteExport(item, remove));

  actions.append(edit, open, remove);
  card.append(link, copy, actions);
  return card;
}

function showRecentEmpty(message) {
  const empty = document.createElement("p");
  empty.className = "recent-empty";
  empty.textContent = message;
  elements.recentList.replaceChildren(empty);
}

async function loadExports() {
  try {
    const response = await fetch("/api/exports", { cache: "no-store" });
    if (!response.ok) throw new Error("Çıktılar alınamadı.");
    const data = await response.json();
    const files = Array.isArray(data.files) ? data.files : [];

    elements.recentCount.textContent = `${files.length} dosya`;
    if (files.length === 0) {
      showRecentEmpty("Henüz çıktı yok.");
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const item of files) {
      fragment.append(buildRecentItem(item));
    }
    elements.recentList.replaceChildren(fragment);
  } catch {
    elements.recentCount.textContent = "—";
    showRecentEmpty("Çıktılar yüklenemedi.");
  }
}

function legacyCopy(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy command failed.");
}

async function copyShareUrl() {
  const url = elements.copyShareButton.dataset.url;
  if (!url) return;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url);
      } catch {
        legacyCopy(url);
      }
    } else {
      legacyCopy(url);
    }
    showToast("Telefon bağlantısı kopyalandı.");
  } catch {
    showToast("Bağlantı kopyalanamadı; adres kutusundan seçebilirsin.");
  }
}

function handleProcessEvent(event) {
  if (event.type === "log") {
    addLog(event.level || "info", event.message || "", event.detail, event.at);
    return;
  }
  if (event.type === "progress") {
    setProgress(event.progress, event.label);
    return;
  }
  if (event.type === "error") {
    state.lastErrorLogged = true;
    throw new Error(event.message || "Fotoğraf işlenemedi.");
  }
}

async function consumeStream(response) {
  if (!response.body) {
    const text = await response.text();
    let result = null;
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "result") result = event;
      handleProcessEvent(event);
    }
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          continue;
        }
        if (event.type === "result") result = event;
        handleProcessEvent(event);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      if (event.type === "result") result = event;
      handleProcessEvent(event);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock?.();
  }

  return result;
}

async function processPhoto(event) {
  if (event) event.preventDefault();
  if (state.loading) return;
  clearError();

  if (!state.file) {
    showError("Önce bir fotoğraf seçin.");
    return;
  }

  const coords = currentCoordinates();
  const hasAnyCoordinate = Boolean(
    elements.latitude.value.trim() || elements.longitude.value.trim(),
  );
  if (hasAnyCoordinate && !coords) {
    showError(
      "Enlem ve boylamı birlikte gir. Enlem -90..90, boylam -180..180 aralığında olmalı. GPS eklemek istemiyorsan ikisini de boş bırak.",
    );
    elements.latitude.focus();
    return;
  }

  const dateParts = parseDateValue(elements.captureDate.value);
  if (!dateParts) {
    showError("Geçerli bir çekim tarihi ve saati seç.");
    elements.captureDate.focus();
    return;
  }

  const advanced = collectAdvancedFields();
  if (advanced == null) return;

  const body = new FormData();
  body.append("photo", state.file, state.file.name);
  if (coords) {
    body.append("latitude", String(coords.latitude));
    body.append("longitude", String(coords.longitude));
  }
  body.append("capturedAt", dateValueFromParts(dateParts));
  if (Object.keys(advanced).length > 0) {
    body.append("metadata", JSON.stringify(advanced));
  }

  setLoading(true);
  document.body.classList.add("is-exporting");
  resetLog();
  elements.logSection.hidden = false;
  setLogStatus("Çalışıyor…", "working");
  setProgress(2, "İstek hazırlanıyor");
  addLog(
    "info",
    "İşlem başlatıldı.",
    coords
      ? `${state.file.name} · ${formatCoordinates(coords.latitude, coords.longitude)}`
      : `${state.file.name} · GPS eklenmeyecek`,
  );
  scrollLogToEnd();
  scrollToSection(elements.logSection);

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      body,
      headers: { Accept: "application/x-ndjson" },
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(
        payload.error || `Sunucu isteği reddetti (${response.status}).`,
      );
    }

    const result = await consumeStream(response);
    if (!result) throw new Error("Sunucu yanıtı tamamlanmadı.");

    setProgress(100, "Tamamlandı");
    setLogStatus("Tamamlandı", "success");
    showResult(result);
    saveCoordinates();
    loadExports();
    showToast("Fotoğraf ./exported içine aktarıldı.");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Beklenmeyen bir hata oluştu. Tekrar dene.";
    if (!state.lastErrorLogged) addLog("error", message);
    setLogStatus("Hata", "error");
    showError(message);
  } finally {
    document.body.classList.remove("is-exporting");
    setLoading(false);
  }
}

elements.previewImage.addEventListener("load", () => {
  elements.previewFallback.hidden = true;
  elements.previewImage.hidden = false;
});

elements.previewImage.addEventListener("error", () => {
  if (!state.file) return;
  elements.previewImage.hidden = true;
  elements.previewFallback.hidden = false;
});

elements.resultImage.addEventListener("error", () => {
  elements.resultImage.hidden = true;
  elements.resultFallback.hidden = false;
});

elements.dropzone.addEventListener("click", (event) => {
  if (state.loading) return;
  if (event.target.closest("button")) return;
  elements.fileInput.click();
});

elements.dropzone.addEventListener("keydown", (event) => {
  if (state.loading) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});

elements.fileInput.addEventListener("change", () => {
  const [file] = elements.fileInput.files;
  if (file) setFile(file);
});

window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => event.preventDefault());

elements.dropzone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  state.dragDepth += 1;
  if (!state.loading) elements.dropzone.classList.add("is-dragging");
});

elements.dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
});

elements.dropzone.addEventListener("dragleave", (event) => {
  event.preventDefault();
  state.dragDepth = Math.max(0, state.dragDepth - 1);
  if (state.dragDepth === 0) {
    elements.dropzone.classList.remove("is-dragging");
  }
});

elements.dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  state.dragDepth = 0;
  elements.dropzone.classList.remove("is-dragging");
  if (state.loading) return;

  const [file] = event.dataTransfer?.files ?? [];
  if (file) setFile(file);
});

window.addEventListener("paste", (event) => {
  const clipboard = event.clipboardData;
  if (!clipboard) return;

  let file = Array.from(clipboard.files || []).find((candidate) =>
    candidate.type.startsWith("image/"),
  );
  if (!file) {
    for (const item of Array.from(clipboard.items || [])) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
      file = item.getAsFile();
      if (file) break;
    }
  }
  if (!file) return;

  event.preventDefault();
  if (state.loading) {
    showError("İşlem sürerken yeni fotoğraf yükleyemezsin.");
    return;
  }
  setFile(file, { source: "paste" });
});

elements.removeFile.addEventListener("click", (event) => {
  event.stopPropagation();
  if (!state.loading) resetFile();
});

elements.newPhotoButton.addEventListener("click", () => {
  resetFile({ hideResult: true });
  elements.dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
  elements.dropzone.focus({ preventScroll: true });
});

elements.captureDate.addEventListener("input", () => {
  state.captureTouched = true;
  clearError();
  updateCaptureSummary();
  updatePresetButtons();
  updateSubmitState();
});

elements.captureDate.addEventListener("change", () => {
  state.captureTouched = true;
});

for (const button of document.querySelectorAll("[data-shift]")) {
  button.addEventListener("click", () => {
    applyTimeShift(Number(button.dataset.shift));
    showToast(button.textContent.trim());
  });
}

elements.randomTimeButton.addEventListener("click", () => {
  state.captureTouched = true;
  setCaptureValue(randomCaptureValue());
  clearError();
  showToast("Rastgele bir çekim zamanı seçildi.");
});

for (const input of [elements.latitude, elements.longitude]) {
  input.addEventListener("input", () => {
    clearError();
    updateCoordinateHint();
    updateSubmitState();
    scheduleMapSync();
  });
  input.addEventListener("change", () => {
    saveCoordinates();
    const coords = currentCoordinates();
    if (coords) syncLocationSelectors(coords.latitude, coords.longitude);
  });
}

elements.coordHint.textContent =
  "GPS eklenmeyecek. Enlem ve boylam girerek ekleyebilirsin.";

elements.locateButton.addEventListener("click", useCurrentLocation);
elements.clearLocationButton.addEventListener("click", clearLocation);

elements.mapDetails.addEventListener("toggle", () => {
  if (!elements.mapDetails.open) return;
  window.setTimeout(() => {
    initMap();
    if (!state.map) return;
    state.map.invalidateSize();
    const coords = currentCoordinates();
    if (coords) {
      ensureMapMarker(coords.latitude, coords.longitude);
      state.map.setView([coords.latitude, coords.longitude], 11);
    }
  }, 80);
});

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function setLocationChoice(country, city, { fly = false } = {}) {
  elements.countrySelect.value = country.code;
  countryPicker?.sync();
  populateCitySelect(country.code, city.name);
  changeCoordinates(city.latitude, city.longitude, { fly });
  openMapTo(city.latitude, city.longitude);
}

elements.randomCountryButton.addEventListener("click", () => {
  const country = randomItem(COUNTRIES);
  const city = randomItem(country.cities);
  setLocationChoice(country, city, { fly: true });
  showToast(`Rastgele ülke: ${country.name} · ${city.name}`);
});

elements.randomCityButton.addEventListener("click", () => {
  const country = countryByCode(elements.countrySelect.value);
  const city = randomItem(country.cities);
  setLocationChoice(country, city, { fly: true });
  showToast(`Rastgele şehir: ${city.name}, ${country.name}`);
});

elements.countrySelect.addEventListener("change", () => {
  const country = countryByCode(elements.countrySelect.value);
  populateCitySelect(country.code, country.defaultCity);
  applyLocationFromSelectors({ fly: elements.mapDetails.open });
});

elements.citySelect.addEventListener("change", () => {
  if (elements.citySelect.value === "__custom") return;
  clearError();
  applyLocationFromSelectors({ fly: elements.mapDetails.open });
});

state.advancedInputs = Array.from(
  document.querySelectorAll("[data-metadata]"),
);
for (const input of state.advancedInputs) {
  state.advancedByKey.set(input.dataset.metadata, input);
  input.addEventListener("input", () => {
    markProfileAsCustom();
    updateAdvancedCount();
  });
  input.addEventListener("change", updateAdvancedCount);
}

elements.profileTrigger.addEventListener("click", () => {
  if (state.profileMenuOpen) {
    closeProfileMenu({ restoreFocus: true });
  } else {
    openProfileMenu();
  }
});

elements.profileSearch.addEventListener("input", () => {
  if (elements.profileSearch.value.trim() && state.profileCategory !== "all") {
    state.profileCategory = "all";
    syncProfileFilters();
  }
  renderProfileMenu(elements.profileSearch.value);
  elements.profileOptions.scrollTop = 0;
});

elements.profileFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-profile-category]");
  if (!button) return;
  state.profileCategory = button.dataset.profileCategory || "all";
  syncProfileFilters();
  renderProfileMenu(elements.profileSearch.value);
  elements.profileOptions.scrollTop = 0;
});

elements.profileOptions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-profile-id]");
  if (!option) return;
  applyProfile(option.dataset.profileId);
});

elements.profileMenu.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeProfileMenu({ restoreFocus: true });
    return;
  }

  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    focusProfileOption(event.key === "ArrowDown" ? 1 : -1);
    return;
  }

  const activeOption = document.activeElement?.classList.contains(
    "profile-option",
  );
  if (activeOption && (event.key === "Home" || event.key === "End")) {
    event.preventDefault();
    const options = elements.profileOptions.querySelectorAll(".profile-option");
    const target = event.key === "Home" ? options[0] : options[options.length - 1];
    target?.focus();
    return;
  }

  if (event.key === "Enter" && event.target === elements.profileSearch) {
    event.preventDefault();
    const first = elements.profileOptions.querySelector(".profile-option");
    first?.click();
  }
});

elements.profilePicker.addEventListener("focusout", (event) => {
  if (!state.profileMenuOpen) return;
  if (elements.profilePicker.contains(event.relatedTarget)) return;
  window.setTimeout(() => {
    if (!elements.profilePicker.contains(document.activeElement)) {
      closeProfileMenu();
    }
  }, 0);
});

document.addEventListener("pointerdown", (event) => {
  if (!state.profileMenuOpen) return;
  if (!elements.profilePicker.contains(event.target)) closeProfileMenu();
});

elements.clearAdvanced.addEventListener("click", () => {
  clearAdvancedFields();
});

elements.clearLogButton.addEventListener("click", () => {
  if (state.loading) return;
  resetLog();
  showToast("Günlük temizlendi.");
});

elements.copyShareButton.addEventListener("click", copyShareUrl);

elements.refreshButton.addEventListener("click", async () => {
  elements.refreshButton.disabled = true;
  const original = elements.refreshButton.textContent;
  elements.refreshButton.textContent = "Yükleniyor…";
  await loadExports();
  elements.refreshButton.disabled = false;
  elements.refreshButton.textContent = original;
});

elements.processForm.addEventListener("submit", processPhoto);

window.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (!state.loading) elements.processForm.requestSubmit();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (!state.loading) return;
  event.preventDefault();
  event.returnValue = "";
});

countryPicker = createCustomSelect({
  root: elements.countryTrigger.closest("[data-custom-select]"),
  select: elements.countrySelect,
  trigger: elements.countryTrigger,
  valueLabel: elements.countryValue,
  flagLabel: elements.countryFlagLabel,
  menu: elements.countryMenu,
  search: elements.countrySearch,
  options: elements.countryOptions,
  empty: elements.countryEmpty,
  placeholder: "Ülke seç",
});

cityPicker = createCustomSelect({
  root: elements.cityTrigger.closest("[data-custom-select]"),
  select: elements.citySelect,
  trigger: elements.cityTrigger,
  valueLabel: elements.cityValue,
  menu: elements.cityMenu,
  search: elements.citySearch,
  options: elements.cityOptions,
  empty: elements.cityEmpty,
  placeholder: "Şehir seç",
});

function closeCustomSelectMenus() {
  for (const picker of customSelects) picker.close();
}

function repositionCustomSelectMenus() {
  for (const picker of customSelects) picker.reposition();
}

document.addEventListener("pointerdown", (event) => {
  for (const picker of customSelects) {
    if (
      picker.isOpen() &&
      !picker.root.contains(event.target) &&
      !picker.menu.contains(event.target)
    ) {
      picker.close();
    }
  }
});

document.addEventListener(
  "scroll",
  (event) => {
    if (customSelects.some((picker) => picker.menu.contains(event.target))) {
      return;
    }
    repositionCustomSelectMenus();
  },
  true,
);

window.addEventListener("resize", repositionCustomSelectMenus);

restoreCoordinates();
initLocationControls();
updateCoordinateHint();
updateAdvancedCount();
updateProfileTrigger(null);
renderProfileFilters();
renderProfileMenu();
updateSubmitState();
loadStatus();
loadExports();
