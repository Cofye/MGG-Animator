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

async function fetchTextFile(url) {
  const res = await fetch(url + "?nocache=" + Date.now());
  if (!res.ok) throw new Error("No se pudo cargar " + url);
  return await res.text();
}

async function loadLangsFile() {
  if (Object.keys(langsCache).length) return langsCache;
  const text = await fetchTextFile("data/langs.txt");
  langsCache = parseSimpleTXT(text);
  return langsCache;
}

async function loadLocalisation(lang) {
  const key = lang || currentLang;
  if (localisationCache[key]) return localisationCache[key];
  const url = `https://s-beta.kobojo.com/mutants/gameconfig/localisation_${key}.txt`;
  const text = await fetchTextFile(url);
  localisationCache[key] = parseSimpleTXT(text);
  return localisationCache[key];
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

async function parseCustomTXT(path, lang = currentLang) {
  const [langsMap, localisationMap] = await Promise.all([
    loadLangsFile(),
    loadLocalisation(lang)
  ]);
  const text = await fetchTextFile(path);
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
