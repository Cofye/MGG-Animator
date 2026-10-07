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
  const hasAdd = t.rAdd > 0.001 || t.gAdd > 0.001 || t.bAdd > 0.001;
  const hasMul = Math.abs(t.rMul - 1) > 0.001 || Math.abs(t.gMul - 1) > 0.001 || Math.abs(t.bMul - 1) > 0.001;
  if (hasAdd) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgb(${(t.rAdd * 255) | 0},${(t.gAdd * 255) | 0},${(t.bAdd * 255) | 0})`;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  if (hasMul) {
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = `rgb(${(t.rMul * 255) | 0},${(t.gMul * 255) | 0},${(t.bMul * 255) | 0})`;
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
  ctx.save();
  ctx.translate(anchorX + shakeX, anchorY + shakeY);
  const sx = flipX ? -1 : 1;
  ctx.scale(sx * scale, scale);
  engine.renderNode(ctx, tree, true, cMul, cAdd, image);
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
  if (engine.isRivalVisible() && rivalTree) {
    renderCharacterWithEffects(
      ctx, rivalTree, engine.getRivalImage(), rivalScale,
      rivalConfig.flipX, rivalAnchorX, rivalAnchorY,
      targetTransform, targShake.x, targShake.y
    );
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

  ctx.restore();
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
  renderAll,
  clearCanvas,
  getScaleFromPositionY,
  getCharacterScale,
  getWorldY,
};

window.animationEngine.setRenderCallback(renderAll);