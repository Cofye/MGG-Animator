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
const backgroundCache = new Map();

function loadBackgroundImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error());
    img.src = url;
  });
}

async function setBackgroundByValue(value) {
  if (!value) {
    currentBackgroundValue = null;
    window.sceneRenderer.setBackground(null);
    return;
  }
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
  } catch (_) {
    currentBackgroundValue = null;
    window.sceneRenderer.setBackground(null);
  } finally {
    backgroundLoading = false;
    notifyStateChange();
  }
}

function getCurrentBackground() {
  return currentBackgroundValue;
}

async function ensureBackground() {
  if (cachedBackground) return cachedBackground;
  cachedBackground = await loadBackgroundImage(BACKGROUND_URL);
  return cachedBackground;
}

function notifyStateChange() {
  const isLoading = mutantLoading || backgroundLoading || externalLoadingCount > 0;
  for (const cb of stateListeners) {
    try { cb(isLoading, mutantReady); } catch (_) {}
  }
}

function pushLoadingHold() {
  externalLoadingCount++;
  notifyStateChange();
}

function popLoadingHold() {
  if (externalLoadingCount > 0) externalLoadingCount--;
  notifyStateChange();
}

function subscribeState(cb) {
  if (typeof cb !== "function") return;
  stateListeners.push(cb);
  try { cb(mutantLoading || externalLoadingCount > 0, mutantReady); } catch (_) {}
}

async function fetchText(url) {
  const res = await fetch(url + (url.indexOf("?") === -1 ? "?nocache=" + Date.now() : ""));
  if (!res.ok) throw new Error();
  return await res.text();
}

function loadSpritesheetImage(bitmap, skin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const base = bitmap.replace(/\.png$/i, "");
    img.src = skin
      ? `https://s-beta.kobojo.com/mutants/assets/${base}_${skin}.png`
      : `https://s-beta.kobojo.com/mutants/assets/${base}.png`;
    img.onload = () => resolve(img);
    img.onerror = () => reject();
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

function beginLoading() {
  mutantReady = false;
  mutantLoading = true;
  window.animationEngine.stopLoop();
  window.sceneRenderer.clearCanvas();
  notifyStateChange();
}

function finishLoading(success) {
  mutantReady = !!success;
  mutantLoading = false;
  notifyStateChange();
}

async function loadMutantImage(mutantValue, animName, skin) {
  if (!mutantValue) return;
  beginLoading();
  const effectiveAnim = normalizeAnimation(animName);
  const effectiveSkin = normalizeSkin(skin);
  const xmlPath = `data/mutants/${mutantValue}/${effectiveAnim}.xml`;
  try {
    const txt = await fetchText(xmlPath);
    const xml = new DOMParser().parseFromString(txt, "application/xml");
    const spriteEl = xml.querySelector("Sprite");
    if (!spriteEl) throw new Error();
    const bitmap = spriteEl.getAttribute("bitmap") || "";
    currentMutantCode = mutantValue;
    currentAnimationName = effectiveAnim;
    currentSkinName = effectiveSkin;
    currentBitmap = bitmap;
    currentSpriteElement = spriteEl;
    availableSkins = extractSkins(spriteEl);
    const img = await loadSpritesheetImage(bitmap, effectiveSkin);
    window.animationEngine.setSpritesheet(img);
    const tree = window.xmlParser.parseSpriteElement(spriteEl, 1);
    window.animationEngine.setTree(tree);
    window.animationEngine.pause();   // ← nuevo
    finishLoading(true);
  } catch (_) {
    finishLoading(false);
  }
}

async function setSkin(skin) {
  if (!currentSpriteElement) return;
  beginLoading();
  const effectiveSkin = skin === undefined || skin === null ? "" : String(skin).trim();
  try {
    const img = await loadSpritesheetImage(currentBitmap, effectiveSkin);
    window.animationEngine.setSpritesheet(img);
    currentSkinName = effectiveSkin;
    window.animationEngine.startLoop();
    window.sceneRenderer.renderAll();
    finishLoading(true);
  } catch (_) {
    window.animationEngine.startLoop();
    window.sceneRenderer.renderAll();
    finishLoading(false);
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

function isReady() { return mutantReady; }
function isLoading() { return mutantLoading || externalLoadingCount > 0; }
function getAvailableSkins() { return availableSkins.slice(); }
function getCurrentMutant() { return currentMutantCode; }
function getCurrentAnimation() { return currentAnimationName; }
function getCurrentSkin() { return currentSkinName; }

window.loadMutantImage = loadMutantImage;

window.mutantLoader = {
  loadMutantImage,
  setSkin,
  setAnimation,
  reload,
  getAvailableSkins,
  getCurrentMutant,
  getCurrentAnimation,
  getCurrentSkin,
  isReady,
  isLoading,
  subscribeState,
  pushLoadingHold,
  popLoadingHold,
  get mutantReady() { return mutantReady; },
  get mutantLoading() { return mutantLoading || externalLoadingCount > 0; },
  setBackgroundByValue,
  getCurrentBackground,
};