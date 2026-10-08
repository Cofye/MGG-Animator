let _lastPhysW = -1;
let _lastPhysH = -1;
let _lastOccW = -1;
let _lastOccH = -1;
let _recalcTimer = null;

const DEBOUNCE_MS = 150;
const PHYS_TOLERANCE = 30;
const OCC_TOLERANCE = 0.02;

function getSignals() {
  const dpr = window.devicePixelRatio || 1;
  const physW = Math.round(window.innerWidth * dpr);
  const physH = Math.round(window.innerHeight * dpr);
  let occW = null, occH = null;
  const s = window.screen;
  if (s) {
    const sw = s.availWidth || s.width;
    const sh = s.availHeight || s.height;
    if (sw && sh) {
      occW = window.innerWidth / sw;
      occH = window.innerHeight / sh;
    }
  }
  return { physW, physH, occW, occH };
}

function shouldRecalc() {
  const s = getSignals();
  if (_lastPhysW === -1) {
    _lastPhysW = s.physW; _lastPhysH = s.physH;
    if (s.occW != null) { _lastOccW = s.occW; _lastOccH = s.occH; }
    return true;
  }
  const physChanged =
    Math.abs(s.physW - _lastPhysW) > PHYS_TOLERANCE ||
    Math.abs(s.physH - _lastPhysH) > PHYS_TOLERANCE;
  let occChanged = false;
  if (s.occW != null && _lastOccW !== -1) {
    occChanged =
      Math.abs(s.occW - _lastOccW) > OCC_TOLERANCE ||
      Math.abs(s.occH - _lastOccH) > OCC_TOLERANCE;
  }
  if (physChanged && occChanged) {
    _lastPhysW = s.physW; _lastPhysH = s.physH;
    _lastOccW  = s.occW;  _lastOccH  = s.occH;
    return true;
  }
  return false;
}

function scaleSite() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const container = document.getElementById("scale-container");
  const containerLayer = document.getElementById("scale-container-layer");
  if (!container || !containerLayer) return;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const scale = Math.min(windowWidth / baseWidth, windowHeight / baseHeight) * dpr;
  currentScale = scale;
  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;
  const offsetX = (windowWidth - scaledWidth) / 2;
  const offsetY = (windowHeight - scaledHeight) / 2;
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = "top left";
  container.style.position = "absolute";
  container.style.left = `${offsetX}px`;
  container.style.top = `${offsetY}px`;
  containerLayer.style.transform = `scale(${scale})`;
  containerLayer.style.transformOrigin = "top left";
  containerLayer.style.position = "absolute";
  containerLayer.style.left = `${offsetX}px`;
  containerLayer.style.top = `${offsetY}px`;
  document.documentElement.style.overflowX = "auto";
  document.documentElement.style.overflowY = "auto";
  document.body.style.margin = "0";
  document.body.style.width = `${windowWidth}px`;
  document.body.style.height = `${windowHeight}px`;
}

function scaleCover() {
  const baseWidth = 1920;
  const baseHeight = 1080;
  const container = document.getElementById("cover-container");
  if (!container) return;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const scale = Math.max(windowWidth / baseWidth, windowHeight / baseHeight);
  const scaledWidth = baseWidth * scale;
  const scaledHeight = baseHeight * scale;
  const offsetX = (windowWidth - scaledWidth) / 2;
  const offsetY = (windowHeight - scaledHeight) / 2;
  container.style.transform = `scale(${scale})`;
  container.style.transformOrigin = "top left";
  container.style.position = "fixed";
  container.style.left = `${offsetX}px`;
  container.style.top = `${offsetY}px`;
  container.style.width = `${baseWidth}px`;
  container.style.height = `${baseHeight}px`;
}

function recenterOnly() {
  const container = document.getElementById("scale-container");
  const containerLayer = document.getElementById("scale-container-layer");
  if (!container || !containerLayer) return;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const scaledWidth = 1920 * currentScale;
  const scaledHeight = 1080 * currentScale;
  const offsetX = (windowWidth - scaledWidth) / 2;
  const offsetY = (windowHeight - scaledHeight) / 2;
  container.style.left = `${offsetX}px`;
  container.style.top = `${offsetY}px`;
  containerLayer.style.left = `${offsetX}px`;
  containerLayer.style.top = `${offsetY}px`;
  document.body.style.width = `${windowWidth}px`;
  document.body.style.height = `${windowHeight}px`;
}

function applyLayout() {
  if (shouldRecalc()) {
    scaleSite();
  }
  scaleCover();
}

function onResize() {
  clearTimeout(_recalcTimer);
  _recalcTimer = setTimeout(() => applyLayout(false), DEBOUNCE_MS);
}

window.addEventListener("load", () => applyLayout(true));
window.addEventListener("resize", onResize);

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    recenterOnly();
    scaleCover();
  });
}