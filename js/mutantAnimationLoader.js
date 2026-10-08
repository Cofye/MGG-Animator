const BACKGROUND_URL = "https://s-beta.kobojo.com/mutants/assets/arenas/detroit_01.jpg";
let currentMutantCode = "";
let currentAnimationName = "stand";
let currentSkinName = "";
let availableSkins = [];
let currentBitmap = "";
let currentSpriteElement = null;
let mutantReady = false;
let mutantLoading = false;
let stateListeners = [];
let cachedBackground = null;
let externalLoadingCount = 0;
let backgroundLoading = false;
let currentBackgroundValue = null;
let cachedStandTree = null;
let cachedStandImage = null;
let cachedStandKey = null;

const backgroundCache = new Map();

function loadBackgroundImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const t = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      reject(new Error("timeout"));
    }, 15000);
    img.crossOrigin = "anonymous";
    img.onload = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => {
      clearTimeout(t);
      reject(new Error("load error"));
    };
    img.src = url;
  });
}

async function setBackgroundByValue(value) {
  if (!value) { currentBackgroundValue = null; window.sceneRenderer.setBackground(null); return; }
  if (backgroundCache.has(value)) {
    currentBackgroundValue = value;
    window.sceneRenderer.setBackground(backgroundCache.get(value));
    return;
  }
  backgroundLoading = true;
  notifyStateChange();
  try {
    const url = `https://s-beta.kobojo.com/mutants/assets/arenas/${value}.jpg`;
    const img = await loadBackgroundImage(url);
    backgroundCache.set(value, img);
    currentBackgroundValue = value;
    window.sceneRenderer.setBackground(img);
  } catch (e) {
    currentBackgroundValue = null;
    window.sceneRenderer.setBackground(null);
  } finally {
    backgroundLoading = false;
    notifyStateChange();
  }
}

function getCurrentBackground() { return currentBackgroundValue; }

async function ensureBackground() {
  if (cachedBackground) return cachedBackground;
  cachedBackground = await loadBackgroundImage(BACKGROUND_URL);
  return cachedBackground;
}

function notifyStateChange() {
  const isLoading = mutantLoading || backgroundLoading || externalLoadingCount > 0;
  for (const cb of stateListeners) { try { cb(isLoading, mutantReady); } catch (_) {} }
}
function pushLoadingHold() { externalLoadingCount++; notifyStateChange(); }
function popLoadingHold() { if (externalLoadingCount > 0) externalLoadingCount--; notifyStateChange(); }
function subscribeState(cb) {
  if (typeof cb !== "function") return;
  stateListeners.push(cb);
  try { cb(mutantLoading || externalLoadingCount > 0, mutantReady); } catch (_) {}
}

async function fetchText(url, timeoutMs = 15000, label = "texto") {
  const controller = new AbortController();
  const fullUrl = url + (url.indexOf("?") === -1 ? "?nocache=" + Date.now() : "");
  const tid = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(fullUrl, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
  } catch (e) {
    throw e;
  } finally {
    clearTimeout(tid);
  }
}

function loadSpritesheetImage(bitmap, skin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const base = bitmap.replace(/\.png$/i, "");
    const url = skin
      ? `https://s-beta.kobojo.com/mutants/assets/${base}_${skin}.png`
      : `https://s-beta.kobojo.com/mutants/assets/${base}.png`;
    const t = setTimeout(() => {
      img.onload = null;
      img.onerror = null;
      img.src = "";
      reject(new Error("timeout"));
    }, 15000);
    img.crossOrigin = "anonymous";
    img.onload = () => {
      clearTimeout(t);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(t);
      reject(new Error("image load error"));
    };
    img.src = url;
  });
}

function extractSkins(spriteEl) {
  const skins = [];
  for (const c of spriteEl.children) {
    if (c.tagName === "Skin") {
      const txt = (c.textContent || "").trim();
      if (txt) skins.push(txt);
    }
  }
  return skins;
}

function normalizeSkin(skin) {
  if (skin === undefined || skin === null) return currentSkinName;
  return String(skin).trim();
}

function normalizeAnimation(name) {
  if (name === undefined || name === null) return currentAnimationName || "stand";
  const s = String(name).trim();
  return s || (currentAnimationName || "stand");
}

function beginLoading(label = "") {
  mutantReady = false;
  mutantLoading = true;
  window.animationEngine.stopLoop();
  notifyStateChange();
}

function finishLoading(success, label = "") {
  mutantReady = !!success;
  mutantLoading = false;
  notifyStateChange();
}

async function loadMutantImage(mutantValue, animName, skin) {
  if (!mutantValue) return false;
  const effectiveAnim = normalizeAnimation(animName);
  const effectiveSkin = normalizeSkin(skin);
  beginLoading(`${mutantValue}/${effectiveAnim} skin=${effectiveSkin || "(none)"}`);
  const xmlPath = `data/mutants/${mutantValue}/${effectiveAnim}.xml`;
  try {
    const txt = await fetchText(xmlPath, 15000, "mutant XML");
    const xml = new DOMParser().parseFromString(txt, "application/xml");
    const spriteEl = xml.querySelector("Sprite");
    if (!spriteEl) throw new Error("XML sin <Sprite>");
    const bitmap = spriteEl.getAttribute("bitmap") || "";
    currentMutantCode = mutantValue;
    currentAnimationName = effectiveAnim;
    currentSkinName = effectiveSkin;
    currentBitmap = bitmap;
    currentSpriteElement = spriteEl;
    availableSkins = extractSkins(spriteEl);
    const img = await loadSpritesheetImage(bitmap, effectiveSkin);
    if (!img) throw new Error("spritesheet no cargó");
    window.animationEngine.setSpritesheet(img);
    const tree = window.xmlParser.parseSpriteElement(spriteEl, 1);
    window.animationEngine.setTree(tree);
    window.animationEngine.pause();
    finishLoading(true, `${mutantValue}/${effectiveAnim}`);
    return true;
  } catch (e) {
    finishLoading(false, `${mutantValue}/${effectiveAnim}`);
    return false;
  }
}

async function setSkin(skin) {
  if (!currentSpriteElement) return false;
  const effectiveSkin = skin === undefined || skin === null ? "" : String(skin).trim();
  beginLoading(`skin=${effectiveSkin || "(none)"}`);
  try {
    const img = await loadSpritesheetImage(currentBitmap, effectiveSkin);
    if (!img) throw new Error("spritesheet no cargó");
    window.animationEngine.setSpritesheet(img);
    currentSkinName = effectiveSkin;
    cachedStandKey = null;
    cachedStandTree = null;
    cachedStandImage = null;
    window.animationEngine.startLoop();
    window.sceneRenderer.renderAll();
    finishLoading(true, `skin=${effectiveSkin}`);
    return true;
  } catch (e) {
    window.animationEngine.startLoop();
    window.sceneRenderer.renderAll();
    finishLoading(false, `skin=${effectiveSkin}`);
    return false;
  }
}

async function setAnimation(animName) {
  if (!currentMutantCode) return;
  await loadMutantImage(currentMutantCode, animName, currentSkinName);
}

async function reload() {
  if (!currentMutantCode) return;
  await loadMutantImage(currentMutantCode, currentAnimationName, currentSkinName);
}

async function loadStandTreeForMutant(mutantValue, skin) {
  if (!mutantValue) return null;
  const effectiveSkin = (skin === undefined || skin === null)
    ? (currentSkinName || "")
    : String(skin).trim();
  const key = `${mutantValue}|${effectiveSkin}`;
  if (cachedStandTree && cachedStandKey === key) {
    return { tree: cachedStandTree, image: cachedStandImage };
  }
  try {
    const xmlPath = `data/mutants/${mutantValue}/stand.xml`;
    const txt = await fetchText(xmlPath, 15000, "stand XML");
    const xml = new DOMParser().parseFromString(txt, "application/xml");
    const spriteEl = xml.querySelector("Sprite");
    if (!spriteEl) return null;
    const bitmap = spriteEl.getAttribute("bitmap") || "";
    const img = await loadSpritesheetImage(bitmap, effectiveSkin);
    const tree = window.xmlParser.parseSpriteElement(spriteEl, 1);
    window.animationEngine.resetNodeState(tree, true);
    window.animationEngine.spriteUpdate(tree, 0);
    cachedStandTree = tree;
    cachedStandImage = img;
    cachedStandKey = key;
    return { tree, img };
  } catch (e) {
    return null;
  }
}

function isReady() { return mutantReady; }
function isLoading() { return mutantLoading || externalLoadingCount > 0; }
function getAvailableSkins() { return availableSkins.slice(); }
function getCurrentMutant() { return currentMutantCode; }
function getCurrentAnimation() { return currentAnimationName; }
function getCurrentSkin() { return currentSkinName; }

window.loadMutantImage = loadMutantImage;

window.mutantLoader = {
  loadMutantImage, setSkin, setAnimation, reload,
  getAvailableSkins, getCurrentMutant, getCurrentAnimation, getCurrentSkin,
  isReady, isLoading, subscribeState, pushLoadingHold, popLoadingHold,
  loadStandTreeForMutant,
  get mutantReady() { return mutantReady; },
  get mutantLoading() { return mutantLoading || externalLoadingCount > 0; },
  setBackgroundByValue, getCurrentBackground,
};