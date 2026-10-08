const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ARENA_W = 1195;
const ARENA_H = 672;
const FLOOR_Y = 252;
const REFERENCE_HEIGHT = 672;

let charConfigs = {
  stand: { x: 0, y: 0, scale: 0.80 },
  other: { x: -300, y: 0, scale: 0.60 }
};
let currentMode = "stand";
let rivalConfig = { x: 300, y: 0, flipX: true, flipY: false, scale: 0.60 };
let backgroundImage = null;
let bgX = 0, bgY = 0, bgW = 0, bgH = 0;
let cameraZoom = 1;
let cameraX = 0;
let cameraY = 0;
let cameraEnabled = false;
let midLayerImage = null;
let midLayerOpacity = 0.25;
let midLayerWidthRatio = 1.0;
let includeMidLayer = false;

let characterVisible = true;
function setCharacterVisible(v) {
  characterVisible = !!v;
  renderAll();
}

let frameCounterEnabled = true;
function setFrameCounterEnabled(v) {
  frameCounterEnabled = !!v;
  renderAll();
}

let deathOffscreen = null;
function getDeathOffscreenCanvas(w, h) {
  if (!deathOffscreen) deathOffscreen = document.createElement("canvas");
  if (deathOffscreen.width !== w) deathOffscreen.width = w;
  if (deathOffscreen.height !== h) deathOffscreen.height = h;
  return deathOffscreen;
}

function ensureCameraInit() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas) return false;
  if (bgW <= 0 || bgH <= 0) {
    bgX = 0; bgY = 0; bgW = canvas.width; bgH = canvas.height;
    cameraZoom = 1; cameraX = 0; cameraY = 0;
  }
  return true;
}

function computeBackgroundRect() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas || !backgroundImage) return;
  const scale = Math.max(canvas.width / backgroundImage.width, canvas.height / backgroundImage.height);
  bgW = backgroundImage.width * scale;
  bgH = backgroundImage.height * scale;
  bgX = (canvas.width - bgW) / 2;
  bgY = (canvas.height - bgH) / 2;
}

function clampCamera() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas || bgW <= 0 || bgH <= 0) return;
  const viewW = canvas.width / cameraZoom;
  const viewH = canvas.height / cameraZoom;
  if (viewW >= bgW) cameraX = bgX + (bgW - viewW) / 2;
  else cameraX = Math.max(bgX, Math.min(cameraX, bgX + bgW - viewW));
  if (viewH >= bgH) cameraY = bgY + (bgH - viewH) / 2;
  else cameraY = Math.max(bgY, Math.min(cameraY, bgY + bgH - viewH));
}

function resetCamera() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas) return;
  if (!backgroundImage) {
    bgX = 0; bgY = 0; bgW = canvas.width; bgH = canvas.height;
  }
  cameraZoom = 1;
  cameraX = bgX + bgW / 2 - canvas.width / 2;
  cameraY = bgY + bgH / 2 - canvas.height / 2;
  clampCamera();
}

function setBackground(img) {
  backgroundImage = img || null;
  computeBackgroundRect();
  resetCamera();
  renderAll();
}

function setCameraEnabled(value) {
  cameraEnabled = !!value;
}

function panCameraBy(dxCanvas, dyCanvas) {
  if (!cameraEnabled) return;
  cameraX -= dxCanvas / cameraZoom;
  cameraY -= dyCanvas / cameraZoom;
  clampCamera();
}

function zoomCameraAt(canvasX, canvasY, factor) {
  if (!cameraEnabled) return;
  const oldZoom = cameraZoom;
  let newZoom = oldZoom * factor;
  newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  if (Math.abs(newZoom - oldZoom) < 1e-6) return;
  const worldX = cameraX + canvasX / oldZoom;
  const worldY = cameraY + canvasY / oldZoom;
  cameraZoom = newZoom;
  cameraX = worldX - canvasX / newZoom;
  cameraY = worldY - canvasY / newZoom;
  clampCamera();
}

function getCamera() {
  return { zoom: cameraZoom, x: cameraX, y: cameraY };
}

function getScaleFromPositionY(gameY) {
  return (gameY * 0.5) / REFERENCE_HEIGHT + 0.3;
}

function getWorldY() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas) return 0;
  return bgY + bgH / 2 - canvas.height / 2 + canvas.height / 1.3;
}

function getCharacterScale(mode) {
  const cfg = charConfigs[mode || currentMode] || charConfigs.stand;
  return cfg.scale;
}

function setCharConfig(mode, cfg) {
  if (!charConfigs[mode]) charConfigs[mode] = { x: 0, y: 0, scale: 0.80 };
  if (!cfg) return;
  if (cfg.x !== undefined) charConfigs[mode].x = Number(cfg.x) || 0;
  if (cfg.y !== undefined) charConfigs[mode].y = Number(cfg.y) || 0;
  if (cfg.scale !== undefined && Number(cfg.scale) > 0) charConfigs[mode].scale = Number(cfg.scale);
  renderAll();
}

function getCharConfig(mode) {
  return { ...charConfigs[mode || currentMode] };
}

function setCharMode(mode) {
  if (charConfigs[mode]) currentMode = mode;
  renderAll();
}

function getCharMode() {
  return currentMode;
}

function setRivalTransform(cfg) {
  if (!cfg) return;
  if (cfg.x !== undefined) rivalConfig.x = Number(cfg.x) || 0;
  if (cfg.y !== undefined) rivalConfig.y = Number(cfg.y) || 0;
  if (cfg.flipX !== undefined) rivalConfig.flipX = !!cfg.flipX;
  if (cfg.flipY !== undefined) rivalConfig.flipY = !!cfg.flipY;
  if (cfg.scale !== undefined && Number(cfg.scale) > 0) rivalConfig.scale = Number(cfg.scale);
  renderAll();
}

function getRivalTransform() {
  return { ...rivalConfig };
}

function setMidLayerImage(img, opacity, widthRatio) {
  midLayerImage = img || null;
  if (opacity !== undefined && Number.isFinite(opacity)) {
    midLayerOpacity = Math.max(0, Math.min(1, opacity));
  }
  if (widthRatio !== undefined && Number.isFinite(widthRatio)) {
    midLayerWidthRatio = Math.max(0, widthRatio);
  }
  renderAll();
}

function setIncludeMidLayer(value) {
  includeMidLayer = !!value;
}

function drawMidLayer(ctx) {
  if (!includeMidLayer || !midLayerImage) return;
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas) return;
  const targetW = canvas.width * midLayerWidthRatio;
  const targetH = midLayerImage.height * (targetW / midLayerImage.width);
  const x = (canvas.width - targetW) / 2;
  const y = (canvas.height - targetH) / 2;
  ctx.save();
  ctx.globalAlpha = midLayerOpacity;
  ctx.drawImage(midLayerImage, x, y, targetW, targetH);
  ctx.restore();
}

function drawBackgroundTint(ctx, x, y, w, h) {
  const t = window.fxManager?.getObjectTransform?.("background");
  if (!t) return;
  const hasMul = Math.abs(t.rMul - 1) > 0.001 ||
                 Math.abs(t.gMul - 1) > 0.001 ||
                 Math.abs(t.bMul - 1) > 0.001;
  const hasAdd = t.rAdd > 0.001 || t.gAdd > 0.001 || t.bAdd > 0.001;
  if (hasMul) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(${(t.rMul * 255) | 0},${(t.gMul * 255) | 0},${(t.bMul * 255) | 0})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (hasAdd) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgb(${(t.rAdd * 255) | 0},${(t.gAdd * 255) | 0},${(t.bAdd * 255) | 0})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
}

function renderCharacterWithEffects(ctx, tree, image, scale, flipX, anchorX, anchorY, colorTransform, shakeX, shakeY) {
  const engine = window.animationEngine;
  if (!tree || !image) return;
  const cMul = {
    r: colorTransform ? colorTransform.rMul : 1,
    g: colorTransform ? colorTransform.gMul : 1,
    b: colorTransform ? colorTransform.bMul : 1,
  };
  const cAdd = {
    r: colorTransform ? colorTransform.rAdd : 0,
    g: colorTransform ? colorTransform.gAdd : 0,
    b: colorTransform ? colorTransform.bAdd : 0,
  };
  const useDeath =
    engine.isDying() &&
    !flipX &&
    window.deathFxManager &&
    window.deathFxManager.isInitialized();
  if (useDeath) {
    const b = engine.getTreeBounds(tree);
    const pad = 8;
    const w = Math.ceil(b.maxX - b.minX) + pad * 2;
    const h = Math.ceil(b.maxY - b.minY) + pad * 2;
    if (w > 0 && h > 0 && w < 2048 && h < 2048) {
      const off = getDeathOffscreenCanvas(w, h);
      const octx = off.getContext("2d");
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.clearRect(0, 0, w, h);
      octx.save();
      octx.translate(-b.minX + pad, -b.minY + pad);
      engine.renderNode(octx, tree, true, cMul, cAdd, image);
      octx.restore();
      ctx.save();
      ctx.translate(anchorX + shakeX, anchorY + shakeY);
      const sx = flipX ? -1 : 1;
      ctx.scale(sx * scale, scale);
      ctx.translate(b.minX - pad, b.minY - pad);
      window.deathFxManager.applyToCanvas(
        ctx,
        off,
        engine.getDeathProgress(),
        engine.getDeathFireColor()
      );
      ctx.restore();
      return;
    }
  }
  ctx.save();
  ctx.translate(anchorX + shakeX, anchorY + shakeY);
  const sx = flipX ? -1 : 1;
  ctx.scale(sx * scale, scale);
  engine.renderNode(ctx, tree, true, cMul, cAdd, image);
  ctx.restore();
}

function drawAnchorMarker(ctx, x, y, color) {
  const r = 7;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = color || "#00ff00";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  const d = r * 0.7;
  ctx.beginPath();
  ctx.moveTo(x - d, y - d);
  ctx.lineTo(x + d, y + d);
  ctx.moveTo(x + d, y - d);
  ctx.lineTo(x - d, y + d);
  ctx.stroke();
  ctx.restore();
}

function renderAll() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas) return;
  const engine = window.animationEngine;
  if (!engine) return;
  ensureCameraInit();
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const animTree = engine.getRenderTree();
  const animImage = engine.getRenderImage();
  const rivalTree = engine.getRivalTree();
  if (!backgroundImage && !animTree && !rivalTree && !midLayerImage) return;
  ctx.save();
  ctx.translate(-cameraX * cameraZoom, -cameraY * cameraZoom);
  ctx.scale(cameraZoom, cameraZoom);
  const bgShake = window.fxManager?.getShakeOffset?.("background") || { x: 0, y: 0 };
  if (backgroundImage) {
    ctx.drawImage(backgroundImage, bgX + bgShake.x, bgY + bgShake.y, bgW, bgH);
    drawBackgroundTint(ctx, bgX + bgShake.x, bgY + bgShake.y, bgW, bgH);
  }
  ctx.save();
  ctx.translate(cameraX, cameraY);
  ctx.scale(1 / cameraZoom, 1 / cameraZoom);
  drawMidLayer(ctx);
  ctx.restore();
  const worldX = bgX + bgW / 2;
  const worldY = getWorldY();
  const attackerCfg = charConfigs[currentMode] || charConfigs.stand;
  const attackerScale = attackerCfg.scale;
  const rivalScale = rivalConfig.scale;
  const selfShake = window.fxManager?.getShakeOffset?.("self") || { x: 0, y: 0 };
  const targShake = window.fxManager?.getShakeOffset?.("target") || { x: 0, y: 0 };
  const offsets = animTree ? engine.getTransportOffset() : { x: 0, y: 0 };
  const selfAnchorX = worldX + attackerCfg.x + offsets.x;
  const selfAnchorY = worldY + attackerCfg.y + offsets.y;
  const rivalAnchorX = worldX + rivalConfig.x;
  const rivalAnchorY = worldY + rivalConfig.y;
  const selfTransform = window.fxManager?.getObjectTransform?.("self") || null;
  const targetTransform = window.fxManager?.getObjectTransform?.("target") || null;
  if (characterVisible) {
    if (engine.isRivalVisible() && rivalTree) {
      renderCharacterWithEffects(
        ctx, rivalTree, engine.getRivalImage(), rivalScale,
        rivalConfig.flipX, rivalAnchorX, rivalAnchorY,
        targetTransform, targShake.x, targShake.y
      );
    }
    if (engine.isDying()) {
      const splatter = engine.getDeathSplatter();
      if (splatter) {
        ctx.save();
        ctx.translate(selfAnchorX, selfAnchorY);
        ctx.scale(attackerScale, attackerScale);
        engine.renderNode(
          ctx, splatter.tree, true,
          { r: 1, g: 1, b: 1 }, { r: 0, g: 0, b: 0 },
          splatter.image
        );
        ctx.restore();
      }
    }
    if (animTree) {
      renderCharacterWithEffects(
        ctx, animTree, animImage, attackerScale,
        false, selfAnchorX, selfAnchorY,
        selfTransform, selfShake.x, selfShake.y
      );
    }
    window.fxManager?.render?.(ctx, {
      self: {
        x: selfAnchorX - 100,
        y: selfAnchorY - 300,
        w: 200,
        h: 300,
        scale: attackerScale,
        flipX: false,
      },
      target: {
        x: rivalAnchorX - 100,
        y: rivalAnchorY - 300,
        w: 200,
        h: 300,
        scale: rivalScale,
        flipX: rivalConfig.flipX,
      },
      background: { x: bgX, y: bgY, w: bgW, h: bgH },
    });
    if (engine.getShowBounds && engine.getShowBounds()) {
      const color = engine.getBoundsColor ? engine.getBoundsColor() : "#00ff00";
      drawAnchorMarker(ctx, selfAnchorX, selfAnchorY, color);
      if (engine.isRivalVisible() && rivalTree) {
        drawAnchorMarker(ctx, rivalAnchorX, rivalAnchorY, color);
      }
    }
  }
  ctx.restore();
  if (frameCounterEnabled) {
    const info = engine.getInfo();
    const total = Math.max(1, Math.floor(info.tickDuration));
    const current = Math.min(total, Math.max(0, Math.floor(info.tickPosition)));
    const text = `${current}/${total}`;
    const rect = canvas.getBoundingClientRect();
    const cssScale = rect.width > 0 ? rect.width / canvas.width : 1;
    const screenX = Math.max(12, rect.left + 12 * cssScale);
    const screenY = Math.max(12, rect.top + 12 * cssScale);
    const cbX = (screenX - rect.left) / cssScale;
    const cbY = (screenY - rect.top) / cssScale;
    ctx.save();
    ctx.translate(cbX, cbY);
    ctx.scale(1 / cssScale, 1 / cssScale);
    ctx.font = "bold 22px Bahnschrift, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const padding = 8;
    const metrics = ctx.measureText(text);
    const boxW = metrics.width + padding * 2;
    const boxH = 32;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, 0, boxW, boxH);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, padding, padding - 2);
    ctx.restore();
  }
}

function clearCanvas() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

window.sceneRenderer = {
  setBackground,
  resetCamera,
  panCamera: panCameraBy,
  zoomCamera: zoomCameraAt,
  getCamera,
  setCharConfig,
  getCharConfig,
  setCharMode,
  getCharMode,
  setRivalTransform,
  getRivalTransform,
  setMidLayerImage,
  setIncludeMidLayer,
  setCameraEnabled,
  setCharacterVisible,
  setFrameCounterEnabled,
  renderAll,
  clearCanvas,
  getScaleFromPositionY,
  getCharacterScale,
  getWorldY,
};

window.animationEngine.setRenderCallback(renderAll);