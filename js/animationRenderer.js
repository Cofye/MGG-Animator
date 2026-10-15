const tintCache = new Map();
const MAX_TINT_CACHE_PIXELS = 8 * 1024 * 1024;
let tintCachePixels = 0;

let DEBUG_SHOW_HIDDEN = false;
let DEBUG_SHOW_BOUNDS = false;
let DEBUG_BOUNDS_COLOR = "#00ff00";
let blurCanvas = null;

function normalizeHexColor(c) {
  let s = String(c == null ? "" : c).trim();
  if (!s) return "#00ff00";
  if (s[0] !== "#") s = "#" + s;
  if (s.length === 4) s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  if (s.length !== 7) return "#00ff00";
  return s;
}

function isValidSrc(img, sourceImage) {
  if (!sourceImage) return false;
  if (!img) return false;
  if (img.width <= 0 || img.height <= 0) return false;
  return true;
}

function getTintedSource(img, rMul, gMul, bMul, rAdd, gAdd, bAdd, sourceImage) {
  const hasTransform =
    Math.abs(rMul - 1) > 1e-4 || Math.abs(gMul - 1) > 1e-4 ||
    Math.abs(bMul - 1) > 1e-4 || Math.abs(rAdd) > 1e-4 ||
    Math.abs(gAdd) > 1e-4 || Math.abs(bAdd) > 1e-4;
  if (!hasTransform) return null;
  if (
    img.srcX < 0 || img.srcY < 0 ||
    img.srcX + img.width > sourceImage.width ||
    img.srcY + img.height > sourceImage.height
  ) return null;
  const key = (sourceImage.src || "") + "|" + [
    img.srcX, img.srcY, img.width, img.height, rMul, gMul, bMul, rAdd, gAdd, bAdd
  ].join("|");
  if (tintCache.has(key)) {
    const cached = tintCache.get(key);
    tintCache.delete(key);
    tintCache.set(key, cached);
    return cached;
  }
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(img.width));
  c.height = Math.max(1, Math.ceil(img.height));
  const cx = c.getContext("2d");
  cx.drawImage(sourceImage, img.srcX, img.srcY, img.width, img.height, 0, 0, img.width, img.height);
  const id = cx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i]     = Math.max(0, Math.min(255, (d[i]     / 255 * rMul + rAdd) * 255));
    d[i + 1] = Math.max(0, Math.min(255, (d[i + 1] / 255 * gMul + gAdd) * 255));
    d[i + 2] = Math.max(0, Math.min(255, (d[i + 2] / 255 * bMul + bAdd) * 255));
  }
  cx.putImageData(id, 0, 0);
  const pixelCount = c.width * c.height;
  if (pixelCount <= MAX_TINT_CACHE_PIXELS) {
    while (tintCachePixels + pixelCount > MAX_TINT_CACHE_PIXELS) {
      const oldest = tintCache.keys().next().value;
      const evicted = tintCache.get(oldest);
      tintCache.delete(oldest);
      tintCachePixels -= evicted.width * evicted.height;
    }
    tintCache.set(key, c);
    tintCachePixels += pixelCount;
  }
  return c;
}

function drawImageElement(ctx, img, rMul, gMul, bMul, rAdd, gAdd, bAdd, sourceImage) {
  if (!isValidSrc(img, sourceImage)) return;
  const hidden = img.visible === false;
  if (hidden && !DEBUG_SHOW_HIDDEN) return;
  ctx.save();
  ctx.translate(img.dstX, img.dstY);
  ctx.transform(img.a, img.b, img.c, img.d, 0, 0);
  if (img.alpha !== 1) ctx.globalAlpha *= img.alpha;
  const tinted = getTintedSource(img, rMul, gMul, bMul, rAdd, gAdd, bAdd, sourceImage);
  if (tinted) ctx.drawImage(tinted, 0, 0, img.width, img.height);
  else ctx.drawImage(sourceImage, img.srcX, img.srcY, img.width, img.height, 0, 0, img.width, img.height);
  if (DEBUG_SHOW_BOUNDS) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = DEBUG_BOUNDS_COLOR;
    ctx.strokeRect(0, 0, img.width, img.height);
  }
  ctx.restore();
}

function getBlurCanvas(w, h) {
  if (!blurCanvas) blurCanvas = document.createElement("canvas");
  if (blurCanvas.width < w) blurCanvas.width = w;
  if (blurCanvas.height < h) blurCanvas.height = h;
  return blurCanvas;
}

function getFrameBlur(node) {
  if (!node || node.type !== "Sprite") return null;
  const idx = node.currentFrame;
  if (idx < 0 || !node.frames || !node.frames[idx]) return null;
  const tags = node.frames[idx].tags;
  if (!tags || tags.length === 0) return null;
  let bx = 0, by = 0, found = false;
  for (let i = 0; i < tags.length; i++) {
    const t = tags[i];
    if (t.key === "blurX") { bx = parseFloat(t.value) || 0; found = true; }
    else if (t.key === "blurY") { by = parseFloat(t.value) || 0; found = true; }
  }
  if (!found) return null;
  if (bx <= 0.5 && by <= 0.5) return null;
  return { x: bx, y: by };
}

function matIdentity() { return [1, 0, 0, 1, 0, 0]; }

function matMul(m1, m2) {
  return [
    m1[0]*m2[0] + m1[2]*m2[1],
    m1[1]*m2[0] + m1[3]*m2[1],
    m1[0]*m2[2] + m1[2]*m2[3],
    m1[1]*m2[2] + m1[3]*m2[3],
    m1[0]*m2[4] + m1[2]*m2[5] + m1[4],
    m1[1]*m2[4] + m1[3]*m2[5] + m1[5],
  ];
}

function matComposite(node) {
  const cos = Math.cos(node.angle || 0);
  const sin = Math.sin(node.angle || 0);
  const sx = node.scaleX != null ? node.scaleX : 1;
  const sy = node.scaleY != null ? node.scaleY : 1;
  return [cos * sx, sin * sx, -sin * sy, cos * sy, node.x || 0, node.y || 0];
}

function matImage(img) {
  return [img.a, img.b, img.c, img.d, img.dstX, img.dstY];
}

function matApply(m, x, y) {
  return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
}

function expandBoundsByImage(acc, m, img) {
  const pts = [
    matApply(m, 0, 0),
    matApply(m, img.width, 0),
    matApply(m, 0, img.height),
    matApply(m, img.width, img.height),
  ];
  for (const [x, y] of pts) {
    if (!acc.any) {
      acc.minX = acc.maxX = x;
      acc.minY = acc.maxY = y;
      acc.any = true;
    } else {
      if (x < acc.minX) acc.minX = x;
      if (x > acc.maxX) acc.maxX = x;
      if (y < acc.minY) acc.minY = y;
      if (y > acc.maxY) acc.maxY = y;
    }
  }
}

function computeTreeBoundsAccurate(node, parentMatrix, acc) {
  if (!node) return acc;
  if (node.type === "Composite") {
    if (node.visible === false) return acc;
    const m = matMul(parentMatrix, matComposite(node));
    if (node.innerSprite) computeTreeBoundsAccurate(node.innerSprite, m, acc);
    return acc;
  }
  if (node.type === "Sprite") {
    if (node.images) {
      for (const img of node.images) {
        if (img.visible === false) continue;
        expandBoundsByImage(acc, matMul(parentMatrix, matImage(img)), img);
      }
    }
    if (node.currentFrame >= 0 && node.frames && node.frames[node.currentFrame]) {
      for (const img of node.frames[node.currentFrame].images) {
        if (img.visible === false) continue;
        expandBoundsByImage(acc, matMul(parentMatrix, matImage(img)), img);
      }
    }
    for (const child of node.children || []) {
      computeTreeBoundsAccurate(child, parentMatrix, acc);
    }
    return acc;
  }
  return acc;
}

function getTreeBounds(node) {
  const acc = { minX: 0, minY: 0, maxX: 0, maxY: 0, any: false };
  if (!node) return { minX: -80, minY: -300, maxX: 80, maxY: 0 };
  computeTreeBoundsAccurate(node, matIdentity(), acc);
  if (!acc.any) return { minX: -80, minY: -300, maxX: 80, maxY: 0 };
  return { minX: acc.minX, minY: acc.minY, maxX: acc.maxX, maxY: acc.maxY };
}

function renderSpriteWithBlur(ctx, node, parentVisible, cMul, cAdd, sourceImage, blur) {
  const acc = { minX: 0, minY: 0, maxX: 0, maxY: 0, any: false };
  computeTreeBoundsAccurate(node, matIdentity(), acc);
  if (!acc.any) return;
  const maxBlur = Math.max(blur.x, blur.y);
  const pad = Math.ceil(maxBlur) + 8;
  const w = Math.ceil(acc.maxX - acc.minX) + pad * 2;
  const h = Math.ceil(acc.maxY - acc.minY) + pad * 2;
  if (w <= 0 || h <= 0) return;
  if (w > 4096 || h > 4096) { renderNode(ctx, node, parentVisible, cMul, cAdd, sourceImage, true); return; }
  const callerAlpha = ctx.globalAlpha;
  const off = getBlurCanvas(w, h);
  const octx = off.getContext("2d");
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, off.width, off.height);
  octx.save();
  octx.globalAlpha = callerAlpha;
  octx.translate(-acc.minX + pad, -acc.minY + pad);
  renderNode(octx, node, parentVisible, cMul, cAdd, sourceImage, true);
  octx.restore();
  const ox = acc.minX - pad;
  const oy = acc.minY - pad;
  const N = Math.max(6, Math.min(16, Math.ceil(maxBlur / 3)));
  const stepAlpha = 1 / N;
  ctx.save();
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0 : (i / (N - 1)) - 0.5;
    ctx.globalAlpha = stepAlpha;
    ctx.drawImage(off, 0, 0, w, h, ox + t * blur.x, oy + t * blur.y, w, h);
  }
  ctx.restore();
}

function renderNode(ctx, node, parentVisible, cMul, cAdd, sourceImage, skipBlur) {
  if (!node) return;
  if (node.type === "Composite") {
    const isVisible = parentVisible && node.visible && node.alpha > 0.001;
    if (!isVisible && !DEBUG_SHOW_HIDDEN) return;
    const nMul = { r: cMul.r * node.colorMul.r, g: cMul.g * node.colorMul.g, b: cMul.b * node.colorMul.b };
    const nAdd = {
      r: cMul.r * node.colorAdd.r + cAdd.r,
      g: cMul.g * node.colorAdd.g + cAdd.g,
      b: cMul.b * node.colorAdd.b + cAdd.b
    };
    ctx.save();
    ctx.translate(node.x, node.y);
    ctx.rotate(node.angle);
    ctx.scale(node.scaleX, node.scaleY);
    if (node.alpha !== 1) ctx.globalAlpha *= node.alpha;
    if (node.innerSprite) renderNode(ctx, node.innerSprite, true, nMul, nAdd, sourceImage, skipBlur);
    ctx.restore();
    return;
  }
  if (!parentVisible && !DEBUG_SHOW_HIDDEN) return;
  if (!skipBlur) {
    const blur = getFrameBlur(node);
    if (blur) { renderSpriteWithBlur(ctx, node, parentVisible, cMul, cAdd, sourceImage, blur); return; }
  }
  const savedAlpha = ctx.globalAlpha;
  for (const img of node.images) drawImageElement(ctx, img, cMul.r, cMul.g, cMul.b, cAdd.r, cAdd.g, cAdd.b, sourceImage);
  if (node.currentFrame >= 0 && node.frames[node.currentFrame]) {
    for (const img of node.frames[node.currentFrame].images) drawImageElement(ctx, img, cMul.r, cMul.g, cMul.b, cAdd.r, cAdd.g, cAdd.b, sourceImage);
  }
  for (const child of node.children) renderNode(ctx, child, parentVisible, cMul, cAdd, sourceImage, skipBlur);
  ctx.globalAlpha = savedAlpha;
}

function setShowHidden(v) { DEBUG_SHOW_HIDDEN = !!v; }
function getShowHidden() { return DEBUG_SHOW_HIDDEN; }
function setShowBounds(v) { DEBUG_SHOW_BOUNDS = !!v; }
function getShowBounds() { return DEBUG_SHOW_BOUNDS; }
function setBoundsColor(c) { DEBUG_BOUNDS_COLOR = normalizeHexColor(c); }
function getBoundsColor() { return DEBUG_BOUNDS_COLOR; }
function clearTintCache() {
  tintCache.clear();
  tintCachePixels = 0;
}

window.animationRenderer = {
  renderNode,
  getTreeBounds,
  clearTintCache,
  setShowHidden, getShowHidden,
  setShowBounds, getShowBounds,
  setBoundsColor, getBoundsColor,
};