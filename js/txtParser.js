let langsCache = {};
let localisationCache = {};

function sanitizeText(text) {
  if (text == null) return "";
  return String(text)
    .replace(/\\n/g, "")
    .replace(/\\r/g, "")
    .replace(/\\t/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getFromMap(map, key) {
  if (!map || key == null) return undefined;
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  const lower = String(key).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(map, lower)) return map[lower];
  for (const k of Object.keys(map)) {
    if (k.toLowerCase() === lower) return map[k];
  }
  return undefined;
}

async function fetchTextFile(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url + (url.indexOf("?") === -1 ? "?nocache=" + Date.now() : ""), { signal: controller.signal });
    if (!res.ok) throw new Error("No se pudo cargar " + url);
    return await res.text();
  } finally {
    clearTimeout(tid);
  }
}

let langsPromise = null;
async function loadLangsFile() {
  if (Object.keys(langsCache).length) return langsCache;
  if (langsPromise) return langsPromise;
  langsPromise = (async () => {
    try {
      const text = await fetchTextFile("data/langs.txt");
      langsCache = parseSimpleTXT(text);
    } catch (_) { langsCache = {}; }
    langsPromise = null;
    return langsCache;
  })();
  return langsPromise;
}

let localisationPromises = {};
async function loadLocalisation(lang) {
  const key = lang || currentLang;
  if (localisationCache[key]) return localisationCache[key];
  if (localisationPromises[key]) return localisationPromises[key];
  localisationPromises[key] = (async () => {
    try {
      const url = `https://s-beta.kobojo.com/mutants/gameconfig/localisation_${key}.txt`;
      const text = await fetchTextFile(url, 6000);
      localisationCache[key] = parseSimpleTXT(text);
    } catch (_) { localisationCache[key] = {}; }
    localisationPromises[key] = null;
    return localisationCache[key];
  })();
  return localisationPromises[key];
}

async function parseCustomTXT(path, lang = currentLang) {
  const [langsMap, localisationMap, text] = await Promise.all([
    loadLangsFile(),
    loadLocalisation(lang),
    fetchTextFile(path)
  ]);
  const lines = text.split(/\r?\n/);
  const result = [];
  for (const line of lines) {
    if (!line || line.startsWith("//")) continue;
    const [type, nameRaw = "", imageRaw = "", valueRaw = ""] = line.split(";");
    let name = nameRaw.trim();
    if (name.startsWith("[") && name.endsWith("]")) {
      const key = name.slice(1, -1);
      name = getFromMap(localisationMap, key) || key;
    }
    else if (name.startsWith("#")) {
      const key = name.slice(1);
      name = getFromMap(langsMap, `${key}-${lang}`)
          || getFromMap(langsMap, key)
          || key;
    }
    name = sanitizeText(name);
    let image = imageRaw.trim();
    if (image.startsWith("$$")) {
      image = "https://s-beta.kobojo.com/mutants/assets/" + image.slice(2);
    } else if (image.startsWith("&&")) {
      image = "." + image.slice(2);
    }
    let value = valueRaw.trim();
    if (value.includes("§")) {
      value = value.replace("§", "*");
    }
    result.push({
      type: type.trim(),
      name,
      image: image || null,
      value: value || null
    });
  }
  return result;
}

function parseSimpleTXT(text) {
  const map = {};
  text.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith("//")) return;
    const [key, val] = line.split(";");
    if (key && val) map[key.trim()] = sanitizeText(val);
  });
  return map;
}
