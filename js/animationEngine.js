const UNIVERSAL_FPS = 30;
const FRAME_TIME_MS = 1000 / UNIVERSAL_FPS;

let loadedImage = null;
let rivalImage = null;
let animationTree = null;
let rivalTree = null;
let animationTime = 0;
let lastTimeMs = 0;
let accumulatorMs = 0;
let loopRunning = false;
let loopId = null;
let paused = false;
let currentSpeedFactor = 1;
let attackSpeedMultiplier = 1;
let stopAtEnd = false;
let autoRestart = false;
let rivalVisible = false;
let DEBUG_SHOW_HIDDEN = false;
let DEBUG_SHOW_BOUNDS = false;
let DEBUG_BOUNDS_COLOR = "#00ff00";
let transportOffsetX = 0;
let transportOffsetY = 0;
let renderCallback = null;
let precomputedSnapshots = null;
let precomputedTotalTicks = 0;
let postTree = null;
let postImage = null;
let postStartTick = -1;
let tailEndTick = -1;

let deathState = {
  active: false,
  progress: 0,
  elapsed: 0,
  duration: 1.2,
  fireColor: [1, 1, 1, 1]
};
let deathSplatterTree = null;
let deathSplatterImage = null;

function startDeath(specimenCode) {
  deathState.active = true;
  deathState.progress = 0;
  deathState.elapsed = 0;
  deathState.specimenCode = specimenCode;
  deathState.fireColor = window.deathFxManager.getGeneColor(specimenCode);
  triggerRender();
}

function stopDeath() {
  deathState.active = false;
  deathState.progress = 0;
  deathState.elapsed = 0;
  deathSplatterTree = null;
  deathSplatterImage = null;
  triggerRender();
}

function isDying() { return deathState.active; }
function getDeathProgress() { return deathState.progress; }
function getDeathFireColor() { return deathState.fireColor; }

function setDeathSplatter(tree, image) {
  deathSplatterTree = tree || null;
  deathSplatterImage = image || null;
  if (deathSplatterTree) {
    resetNodeState(deathSplatterTree, true);
    forceLoopDisabled(deathSplatterTree);
    spriteUpdate(deathSplatterTree, 0);
  }
}

function getDeathSplatter() {
  if (!deathSplatterTree || !deathSplatterImage) return null;
  return { tree: deathSplatterTree, image: deathSplatterImage };
}

const tintCache = new Map();
let backupTimer = null;

function startBackupLoop() {
  if (backupTimer !== null) return;
  backupTimer = setInterval(() => {
    if (!loopRunning || !document.hidden) return;
    const now = performance.now();
    const deltaMs = Math.min(1000, now - lastTimeMs);
    lastTimeMs = now;
    if (!paused) {
      accumulatorMs += deltaMs;
      while (accumulatorMs >= FRAME_TIME_MS) {
        accumulatorMs -= FRAME_TIME_MS;
        updateTick(1 / UNIVERSAL_FPS);
      }
    } else {
      accumulatorMs = 0;
    }
  }, 1000);
}

function stopBackupLoop() {
  if (backupTimer !== null) { clearInterval(backupTimer); backupTimer = null; }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) startBackupLoop();
  else { stopBackupLoop(); lastTimeMs = performance.now(); accumulatorMs = 0; }
});

function setRenderCallback(cb) { renderCallback = typeof cb === "function" ? cb : null; }
function triggerRender() { if (renderCallback) renderCallback(); }
function setAutoRestart(v) { autoRestart = !!v; }
function getAutoRestart() { return autoRestart; }
function setStopAtEnd(v) { stopAtEnd = !!v; }
function getStopAtEnd() { return stopAtEnd; }

function isAtEnd() {
  if (deathState.active) return deathState.progress >= 1;
  if (!animationTree) return false;
  const limit = tailEndTick > 0 ? tailEndTick : (precomputedSnapshots ? precomputedTotalTicks : animationTree.totalFrames);
  return animationTime >= limit - 1;
}

function play() { paused = false; lastTimeMs = performance.now(); accumulatorMs = 0; }
function pause() { paused = true; }
function togglePause() { if (paused) play(); else pause(); }
function isPaused() { return paused; }

function setSpeed(s) {
  const n = Number(s);
  currentSpeedFactor = Number.isFinite(n) && n >= 0 ? n : 1;
}
function setAttackSpeedMultiplier(m) {
  const n = Number(m);
  attackSpeedMultiplier = Number.isFinite(n) && n > 0 ? n : 1;
}
function getAttackSpeedMultiplier() { return attackSpeedMultiplier; }

function updateAttackTailAssets(tree, image) {
  if (tailEndTick <= 0) return;
  postTree = tree || null;
  postImage = image || null;
  if (postTree) {
    resetNodeState(postTree, true);
    spriteUpdate(postTree, 0);
  }
}

function setAttackTail(endTick, tree, img, startTick) {
  tailEndTick = endTick > 0 ? endTick : -1;
  postTree = tree || null;
  postImage = img || null;
  postStartTick = startTick >= 0 ? startTick : -1;
  if (postTree) {
    resetNodeState(postTree, true);
    spriteUpdate(postTree, 0);
  }
}

function clearAttackTail() {
  tailEndTick = -1;
  postTree = null;
  postImage = null;
  postStartTick = -1;
}

function getRenderTree() {
  if (postTree && postStartTick >= 0 && animationTime >= postStartTick) return postTree;
  return animationTree;
}

function getRenderImage() {
  if (postImage && postStartTick >= 0 && animationTime >= postStartTick) return postImage;
  return loadedImage;
}

function getTailEndTick() { return tailEndTick; }

function setFrame(node, newFrame) {
  if (newFrame === node.currentFrame && node.currentFrame !== -1) return false;
  node.currentFrame = newFrame;
  node.frameTicksElapsed = 0;
  return true;
}

function forceFrame(node, frame) {
  setFrame(node, frame);
  node.delayCounter = 0;
  node.frameTicksElapsed = 0;
}

function simulateSpriteTicks(node, ticks) {
  if (!node || node.type !== "Sprite") return;
  const total = node.totalFrames;
  if (total <= 0 || ticks === 0) return;
  const framerate = node.framerate;
  if (framerate <= 0) return;
  const sign = ticks < 0 ? -1 : 1;
  let remaining = Math.abs(ticks);
  let fc = node.frameCounter;
  let cf = node.currentFrame < 0 ? 0 : node.currentFrame;
  while (remaining > 0) {
    if (sign > 0) {
      const toNext = framerate - fc;
      if (remaining < toNext) { fc += remaining; remaining = 0; }
      else {
        remaining -= toNext;
        fc = 0;
        cf++;
        if (cf >= total) {
          if (node.loopEnabled) cf = node.loopFrame;
          else { cf = total - 1; remaining = 0; }
        }
      }
    } else {
      if (fc === 0) {
        cf--;
        if (cf < 0) {
          if (node.loopEnabled) cf = total - 1;
          else { cf = 0; remaining = 0; continue; }
        }
        fc = framerate - 1;
        remaining--;
      } else {
        const canGoBack = Math.min(remaining, fc);
        fc -= canGoBack;
        remaining -= canGoBack;
      }
    }
  }
  node.currentFrame = cf;
  node.frameCounter = fc;
  node.frameAccumulator = 0;
  node.delayCounter = 0;
  node.hasLoopedThisFrame = false;
  node.parentFramePos = Math.min(Math.max(0, cf), total - 0.001);
  node.frameTicksElapsed = 0;
}

function stepTree(node, ticks) {
  if (!node) return;
  if (node.type === "Sprite") {
    simulateSpriteTicks(node, ticks);
    for (const child of node.children) stepTree(child, ticks);
  } else if (node.type === "Composite") {
    if (node.innerSprite) stepTree(node.innerSprite, ticks);
  }
}

function refreshComposites(node) {
  if (!node) return;
  if (node.type === "Sprite") {
    for (const child of node.children) {
      if (child.type === "Composite") compositeUpdate(child, node.parentFramePos, 0);
      else if (child.type === "Sprite") refreshComposites(child);
    }
  } else if (node.type === "Composite") {
    if (node.innerSprite) refreshComposites(node.innerSprite);
  }
}

function updateChildren(node, dtSeconds) {
  for (const child of node.children) {
    if (child.type === "Composite") compositeUpdate(child, node.parentFramePos, dtSeconds);
    else if (child.type === "Sprite") {
      spriteUpdate(child, dtSeconds);
      for (const sub of child.children) {
        if (sub.type === "Composite") compositeUpdate(sub, child.parentFramePos, dtSeconds);
      }
    }
  }
}

function spriteUpdate(node, dtSeconds) {
  if (!node) return;
  node.frameAccumulator += dtSeconds * UNIVERSAL_FPS;
  let fullSteps = Math.floor(node.frameAccumulator);
  node.frameAccumulator -= fullSteps;
  node.hasLoopedThisFrame = false;
  if (node.currentFrame === -1) setFrame(node, 0);
  while (fullSteps > 0) {
    fullSteps--;
    node.frameTicksElapsed = (node.frameTicksElapsed || 0) + 1;
    if (node.delayCounter < 1) {
      if (node.framerate !== 0) node.frameCounter = (node.frameCounter + 1) % node.framerate;
      else node.frameCounter = node.frameCounter + 1;
      if (node.frameCounter === 0) {
        let nextFrame = node.currentFrame + 1;
        if (nextFrame >= node.totalFrames) {
          const inTail = tailEndTick > 0 && animationTime < tailEndTick;
          if (autoRestart && node === animationTree && !inTail) {
            resetNodeState(animationTree, true);
            if (rivalTree) resetNodeState(rivalTree, true);
            animationTime = 0;
            accumulatorMs = 0;
            transportOffsetX = 0;
            transportOffsetY = 0;
            spriteUpdate(animationTree, 0);
            if (rivalTree) spriteUpdate(rivalTree, 0);
            node.hasLoopedThisFrame = true;
            return;
          }
          if (stopAtEnd && node === animationTree && !inTail) {
            resetNodeState(animationTree, true);
            if (rivalTree) resetNodeState(rivalTree, true);
            animationTime = 0;
            accumulatorMs = 0;
            transportOffsetX = 0;
            transportOffsetY = 0;
            spriteUpdate(animationTree, 0);
            if (rivalTree) spriteUpdate(rivalTree, 0);
            paused = true;
            break;
          }
          if (inTail && node === animationTree) return;
          node.hasLoopedThisFrame = true;
          if (node.loopEnabled) nextFrame = node.loopFrame;
          else { nextFrame = node.totalFrames - 1; node.frameAccumulator = 0; }
        }
        setFrame(node, nextFrame);
        if (node.loopEnabled) {
          if (node.currentFrame === node.loopFrame) {
            if (node.rndDelay < 1) node.delayCounter = 0;
            else node.delayCounter = node.minDelay + Math.floor(Math.random() * node.rndDelay);
          }
          const fd = node.frames[node.currentFrame];
          if (fd && fd.delay > 0) node.delayCounter += fd.delay;
        }
      }
    } else {
      node.delayCounter--;
    }
  }
  if (node.delayCounter >= 1) node.parentFramePos = node.currentFrame;
  else node.parentFramePos = node.currentFrame + node.frameAccumulator;
  if (node.parentFramePos > node.totalFrames - 0.001) node.parentFramePos = node.totalFrames - 0.001;
  updateChildren(node, dtSeconds);
}

function compositeUpdate(node, parentFramePos, dtSeconds) {
  if (!node) return;
  const keys = node.keys;
  if (keys.length === 0) {
    node.x = 0; node.y = 0; node.angle = 0;
    node.scaleX = 1; node.scaleY = 1;
    node.colorMul.r = 1; node.colorMul.g = 1; node.colorMul.b = 1;
    node.colorAdd.r = 0; node.colorAdd.g = 0; node.colorAdd.b = 0;
    node.alpha = 1; node.visible = true;
  } else if (keys.length === 1) {
    const k = keys[0];
    if (parentFramePos < k.frame) {
      node.visible = false; node.alpha = 0;
      if (node.needsUpdate) return;
    } else {
      node.x = k.x; node.y = k.y; node.angle = k.angle;
      node.scaleX = k.scaleX; node.scaleY = k.scaleY;
      node.colorMul.r = k.rMul; node.colorMul.g = k.gMul; node.colorMul.b = k.bMul;
      node.colorAdd.r = k.rAdd; node.colorAdd.g = k.gAdd; node.colorAdd.b = k.bAdd;
      node.alpha = k.alpha; node.visible = k.visible;
    }
  } else {
    if (parentFramePos < keys[0].frame) { node.visible = false; node.alpha = 0; return; }
    let prev = null, next = null;
    for (const k of keys) {
      if (k.frame <= parentFramePos && (!prev || k.frame > prev.frame)) prev = k;
      if (k.frame >= parentFramePos && !next) next = k;
    }
    if (!prev) prev = keys[0];
    if (!next) {
      const srcKey = node.autoLoop ? keys[0] : keys[keys.length - 1];
      next = {
        frame: node.totalFrames,
        x: srcKey.x, y: srcKey.y, angle: srcKey.angle,
        scaleX: srcKey.scaleX, scaleY: srcKey.scaleY,
        rMul: srcKey.rMul, gMul: srcKey.gMul, bMul: srcKey.bMul,
        rAdd: srcKey.rAdd, gAdd: srcKey.gAdd, bAdd: srcKey.bAdd,
        alpha: srcKey.alpha, visible: srcKey.visible
      };
    }
    const posInt = Math.trunc(parentFramePos);
    if (prev.visible === false && posInt !== prev.frame && posInt !== next.frame) {
      node.visible = false;
      node.prevKey = prev; node.nextKey = next;
      return;
    }
    const span = next.frame - prev.frame;
    const t = span > 0 ? Math.min((parentFramePos - prev.frame) / span, 1) : 0;
    node.x = prev.x + (next.x - prev.x) * t;
    node.y = prev.y + (next.y - prev.y) * t;
    node.angle = prev.angle + (next.angle - prev.angle) * t;
    node.scaleX = prev.scaleX + (next.scaleX - prev.scaleX) * t;
    node.scaleY = prev.scaleY + (next.scaleY - prev.scaleY) * t;
    if (node.hasColorChange) {
      node.colorMul.r = prev.rMul + (next.rMul - prev.rMul) * t;
      node.colorMul.g = prev.gMul + (next.gMul - prev.gMul) * t;
      node.colorMul.b = prev.bMul + (next.bMul - prev.bMul) * t;
      node.colorAdd.r = prev.rAdd + (next.rAdd - prev.rAdd) * t;
      node.colorAdd.g = prev.gAdd + (next.gAdd - prev.gAdd) * t;
      node.colorAdd.b = prev.bAdd + (next.bAdd - prev.bAdd) * t;
    } else {
      node.colorMul.r = 1; node.colorMul.g = 1; node.colorMul.b = 1;
      node.colorAdd.r = 0; node.colorAdd.g = 0; node.colorAdd.b = 0;
    }
    node.alpha = prev.alpha + (next.alpha - prev.alpha) * t;
    node.visible = true;
    node.prevKey = prev; node.nextKey = next;
  }
  if (node.innerSprite) {
    if (node.synch) {
      const inner = node.innerSprite;
      const innerTotal = inner.totalFrames;
      if (innerTotal > 0) {
        const parentInt = Math.floor(parentFramePos);
        let innerFrame = parentInt % innerTotal;
        if (innerFrame < 0) innerFrame += innerTotal;
        forceFrame(inner, innerFrame);
        const fractional = parentFramePos - parentInt;
        inner.parentFramePos = innerFrame + fractional;
        for (const sub of inner.children) {
          if (sub.type === "Composite") compositeUpdate(sub, inner.parentFramePos, dtSeconds);
        }
      }
    } else {
      spriteUpdate(node.innerSprite, dtSeconds);
    }
  }
}

function updateTick(dtSeconds) {
  if (!animationTree) return;
  const tickDelta = dtSeconds * UNIVERSAL_FPS * currentSpeedFactor * attackSpeedMultiplier;
  animationTime += tickDelta;
  const limit = tailEndTick > 0 ? tailEndTick : precomputedTotalTicks;
  if (limit > 0 && animationTime >= limit) {
    if (autoRestart) {
      animationTime = 0;
      resetNodeState(animationTree, true);
      if (rivalTree) resetNodeState(rivalTree, true);
      if (postTree) resetNodeState(postTree, true);
      spriteUpdate(animationTree, 0);
      if (rivalTree) spriteUpdate(rivalTree, 0);
      if (postTree) spriteUpdate(postTree, 0);
      accumulatorMs = 0;
      transportOffsetX = 0;
      transportOffsetY = 0;
    } else if (stopAtEnd) {
      animationTime = 0;
      resetNodeState(animationTree, true);
      if (rivalTree) resetNodeState(rivalTree, true);
      if (postTree) resetNodeState(postTree, true);
      spriteUpdate(animationTree, 0);
      if (rivalTree) spriteUpdate(rivalTree, 0);
      if (postTree) spriteUpdate(postTree, 0);
      accumulatorMs = 0;
      transportOffsetX = 0;
      transportOffsetY = 0;
      paused = true;
      return;
    } else {
      animationTime = animationTime - limit;
    }
  }
  if (deathState.active) {
    const speed = Math.max(0.0001, currentSpeedFactor || 1);
    const shaderSeconds = Math.max(0.0001, deathState.duration / speed);

    if (deathState.progress < 1) {
      deathState.progress = Math.min(1, deathState.progress + dtSeconds / shaderSeconds);
    }
    deathState.elapsed += dtSeconds * speed;

    const totalTicks = getDeathTickDuration();
    const totalSeconds = totalTicks / UNIVERSAL_FPS;

    if (deathState.elapsed >= totalSeconds) {
      if (autoRestart) {
        deathState.progress = 0;
        deathState.elapsed = 0;
        animationTime = 0;
        resetNodeState(animationTree, true);
        if (rivalTree) resetNodeState(rivalTree, true);
        if (postTree) resetNodeState(postTree, true);
        spriteUpdate(animationTree, 0);
        if (rivalTree) spriteUpdate(rivalTree, 0);
        if (postTree) spriteUpdate(postTree, 0);
        accumulatorMs = 0;
        transportOffsetX = 0;
        transportOffsetY = 0;
        if (deathSplatterTree) {
          resetNodeState(deathSplatterTree, true);
          forceLoopDisabled(deathSplatterTree);
          spriteUpdate(deathSplatterTree, 0);
        }
      } else {
        deathState.elapsed = totalSeconds;
      }
    }
  }

  const attackDt = dtSeconds * currentSpeedFactor * attackSpeedMultiplier;
  const normalDt = dtSeconds * currentSpeedFactor;
  spriteUpdate(animationTree, attackDt);
  if (rivalVisible && rivalTree) spriteUpdate(rivalTree, attackDt);
  if (postTree && postStartTick >= 0 && animationTime >= postStartTick) {
    spriteUpdate(postTree, normalDt);
  }
  if (deathState.active && deathSplatterTree) {
    const splatDone =
      deathSplatterTree.currentFrame >= deathSplatterTree.totalFrames - 1 &&
      deathSplatterTree.frameCounter >= deathSplatterTree.framerate - 1 &&
      !deathSplatterTree.loopEnabled;
    if (!splatDone) {
      spriteUpdate(deathSplatterTree, normalDt);
    }
  }
}

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
  if (tintCache.has(key)) return tintCache.get(key);
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
  tintCache.set(key, c);
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
  if (hidden) ctx.globalAlpha *= 0.5;
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

let blurCanvas = null;
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

function computeBoundsFast(node, offsetX, offsetY, acc) {
  if (!node) return acc;
  if (node.type === "Composite") {
    const nx = offsetX + (node.x || 0);
    const ny = offsetY + (node.y || 0);
    if (node.innerSprite) computeBoundsFast(node.innerSprite, nx, ny, acc);
    return acc;
  }
  const addImg = (img) => {
    if (!img) return;
    const x1 = offsetX + img.dstX, y1 = offsetY + img.dstY;
    const x2 = x1 + img.width, y2 = y1 + img.height;
    if (!acc.any) { acc.minX = x1; acc.minY = y1; acc.maxX = x2; acc.maxY = y2; acc.any = true; }
    else {
      if (x1 < acc.minX) acc.minX = x1;
      if (y1 < acc.minY) acc.minY = y1;
      if (x2 > acc.maxX) acc.maxX = x2;
      if (y2 > acc.maxY) acc.maxY = y2;
    }
  };
  if (node.images) node.images.forEach(addImg);
  if (node.currentFrame >= 0 && node.frames && node.frames[node.currentFrame]) node.frames[node.currentFrame].images.forEach(addImg);
  if (node.children) for (const child of node.children) computeBoundsFast(child, offsetX, offsetY, acc);
  return acc;
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
    if (!isVisible) ctx.globalAlpha *= 0.5;
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
  if (!parentVisible && DEBUG_SHOW_HIDDEN) ctx.globalAlpha *= 0.5;
  for (const img of node.images) drawImageElement(ctx, img, cMul.r, cMul.g, cMul.b, cAdd.r, cAdd.g, cAdd.b, sourceImage);
  if (node.currentFrame >= 0 && node.frames[node.currentFrame]) {
    for (const img of node.frames[node.currentFrame].images) drawImageElement(ctx, img, cMul.r, cMul.g, cMul.b, cAdd.r, cAdd.g, cAdd.b, sourceImage);
  }
  for (const child of node.children) renderNode(ctx, child, parentVisible, cMul, cAdd, sourceImage, skipBlur);
  ctx.globalAlpha = savedAlpha;
}

function mainLoop(now) {
  if (!loopRunning) return;
  loopId = requestAnimationFrame(mainLoop);
  const deltaMs = Math.min(1000, now - lastTimeMs);
  lastTimeMs = now;
  if (!paused) {
    accumulatorMs += deltaMs;
    while (accumulatorMs >= FRAME_TIME_MS) {
      accumulatorMs -= FRAME_TIME_MS;
      updateTick(1 / UNIVERSAL_FPS);
    }
  } else accumulatorMs = 0;
  triggerRender();
}

function startLoop() {
  if (loopRunning) return;
  loopRunning = true;
  lastTimeMs = performance.now();
  accumulatorMs = 0;
  loopId = requestAnimationFrame(mainLoop);
}

function stopLoop() {
  loopRunning = false;
  if (loopId !== null) { cancelAnimationFrame(loopId); loopId = null; }
}

function resetNodeState(node, startAtZero = false) {
  if (!node) return;
  if (node.type === "Sprite") {
    node.frameAccumulator = 0;
    node.frameCounter = 0;
    node.currentFrame = startAtZero ? 0 : -1;
    node.delayCounter = 0;
    node.hasLoopedThisFrame = false;
    node.loopEnabled = true;
    node.parentFramePos = 0;
    node.frameTicksElapsed = 0;
  } else if (node.type === "Composite") {
    node.x = 0; node.y = 0; node.angle = 0;
    node.scaleX = 1; node.scaleY = 1;
    node.colorMul = { r: 1, g: 1, b: 1 };
    node.colorAdd = { r: 0, g: 0, b: 0 };
    node.alpha = 1; node.visible = true;
    node.prevKey = null; node.nextKey = null;
    node.cachedFrame = -1;
  }
  if (node.children) for (const c of node.children) resetNodeState(c, startAtZero);
  if (node.type === "Composite" && node.innerSprite) resetNodeState(node.innerSprite, startAtZero);
}

function forceLoopEnabled(node) {
  if (!node) return;
  if (node.type === "Sprite") {
    node.loopEnabled = true;
    for (const c of node.children) forceLoopEnabled(c);
  } else if (node.type === "Composite") {
    if (node.innerSprite) forceLoopEnabled(node.innerSprite);
  }
}

function forceLoopDisabled(node) {
  if (!node) return;
  if (node.type === "Sprite") {
    node.loopEnabled = false;
    for (const c of node.children) forceLoopDisabled(c);
  } else if (node.type === "Composite") {
    if (node.innerSprite) forceLoopDisabled(node.innerSprite);
  }
}

function resetRuntime() {
  animationTime = 0;
  accumulatorMs = 0;
  transportOffsetX = 0;
  transportOffsetY = 0;
  if (animationTree) resetNodeState(animationTree);
  if (rivalTree) resetNodeState(rivalTree);
  if (animationTree) spriteUpdate(animationTree, 0);
  if (rivalTree) spriteUpdate(rivalTree, 0);
  triggerRender();
}

function captureTreeState(node) {
  if (!node) return null;
  if (node.type === "Sprite") {
    return {
      cf: node.currentFrame, fc: node.frameCounter, dc: node.delayCounter,
      fte: node.frameTicksElapsed, fa: node.frameAccumulator, pfp: node.parentFramePos,
      ch: node.children.map(captureTreeState),
    };
  }
  if (node.type === "Composite") {
    return {
      x: node.x, y: node.y, a: node.angle,
      sx: node.scaleX, sy: node.scaleY,
      al: node.alpha, v: node.visible ? 1 : 0,
      mr: node.colorMul.r, mg: node.colorMul.g, mb: node.colorMul.b,
      ar: node.colorAdd.r, ag: node.colorAdd.g, ab: node.colorAdd.b,
      in: node.innerSprite ? captureTreeState(node.innerSprite) : null,
    };
  }
  return null;
}

function restoreTreeState(node, snap) {
  if (!node || !snap) return;
  if (node.type === "Sprite") {
    node.currentFrame = snap.cf;
    node.frameCounter = snap.fc;
    node.delayCounter = snap.dc;
    node.frameTicksElapsed = snap.fte;
    node.frameAccumulator = snap.fa;
    node.parentFramePos = snap.pfp;
    for (let i = 0; i < node.children.length; i++) restoreTreeState(node.children[i], snap.ch[i]);
  } else if (node.type === "Composite") {
    node.x = snap.x; node.y = snap.y; node.angle = snap.a;
    node.scaleX = snap.sx; node.scaleY = snap.sy;
    node.alpha = snap.al; node.visible = !!snap.v;
    node.colorMul.r = snap.mr; node.colorMul.g = snap.mg; node.colorMul.b = snap.mb;
    node.colorAdd.r = snap.ar; node.colorAdd.g = snap.ag; node.colorAdd.b = snap.ab;
    if (node.innerSprite) restoreTreeState(node.innerSprite, snap.in);
  }
}

function precomputeTimeline() {
  if (!animationTree) { precomputedSnapshots = null; precomputedTotalTicks = 0; return; }
  if (loopRunning) return;
  const savedSpeed = currentSpeedFactor;
  const savedAutoRestart = autoRestart;
  const savedStopAtEnd = stopAtEnd;
  const savedPaused = paused;
  currentSpeedFactor = 1;
  autoRestart = false;
  stopAtEnd = false;
  paused = false;
  try {
    resetNodeState(animationTree);
    spriteUpdate(animationTree, 0);
    const baseTotal = getTotalTickDuration(animationTree);
    const MAX_SNAPSHOTS = 2000;
    const MAX_ITER = Math.min(MAX_SNAPSHOTS, baseTotal + 200);
    const snapshots = new Array(MAX_ITER);
    let length = 0;
    snapshots[length++] = { tree: captureTreeState(animationTree) };
    const randBackup = Math.random;
    let seed = 0x12345678;
    Math.random = function () {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed & 0x7fffffff) / 0x7fffffff;
    };
    try {
      for (let t = 1; t < MAX_ITER; t++) {
        spriteUpdate(animationTree, 1 / UNIVERSAL_FPS);
        snapshots[length++] = { tree: captureTreeState(animationTree) };
        if (animationTree.hasLoopedThisFrame) break;
      }
    } finally { Math.random = randBackup; }
    snapshots.length = length;
    precomputedSnapshots = snapshots;
    precomputedTotalTicks = length;
    resetNodeState(animationTree);
    spriteUpdate(animationTree, 0);
  } finally {
    currentSpeedFactor = savedSpeed;
    autoRestart = savedAutoRestart;
    stopAtEnd = savedStopAtEnd;
    paused = savedPaused;
  }
}

function restoreTick(tick) {
  if (!animationTree) return;
  if (deathState.active) {
    const total = getDeathTickDuration();
    let t = Math.trunc(tick);
    if (t < 0) t = 0;
    if (t >= total) t = total - 1;

    deathState.elapsed = t / UNIVERSAL_FPS;
    const shaderSeconds = Math.max(0.0001, deathState.duration);
    deathState.progress = Math.min(1, deathState.elapsed / shaderSeconds);

    if (precomputedSnapshots && precomputedTotalTicks > 0) {
      const standTotal = precomputedTotalTicks;
      let st = t % standTotal;
      if (st < 0) st += standTotal;
      const snap = precomputedSnapshots[st];
      if (snap) restoreTreeState(animationTree, snap.tree);
      animationTime = st;
    } else {
      resetNodeState(animationTree);
      const savedSpeed = currentSpeedFactor;
      currentSpeedFactor = 1;
      spriteUpdate(animationTree, t / UNIVERSAL_FPS);
      currentSpeedFactor = savedSpeed;
      refreshComposites(animationTree);
      animationTime = t;
    }
    if (deathSplatterTree) {
      resetNodeState(deathSplatterTree, true);
      forceLoopDisabled(deathSplatterTree);
      spriteUpdate(deathSplatterTree, t / UNIVERSAL_FPS);
    }
    triggerRender();
    return;
  }
  let t = Math.trunc(tick);
  if (t < 0) t = 0;
  const attackTotal = precomputedTotalTicks > 0 ? precomputedTotalTicks : animationTree.totalFrames;
  const limit = tailEndTick > 0 ? tailEndTick : attackTotal;
  if (t >= limit) t = limit - 1;
  const inTail = tailEndTick > 0 && postTree && postStartTick >= 0 && t >= postStartTick;
  if (precomputedSnapshots && precomputedTotalTicks > 0) {
    const st = Math.min(t, precomputedTotalTicks - 1);
    const snap = precomputedSnapshots[st];
    if (snap) restoreTreeState(animationTree, snap.tree);
  } else {
    resetNodeState(animationTree);
    const savedSpeed = currentSpeedFactor;
    currentSpeedFactor = 1;
    spriteUpdate(animationTree, Math.min(t, attackTotal - 1) / UNIVERSAL_FPS);
    currentSpeedFactor = savedSpeed;
    refreshComposites(animationTree);
  }
  if (inTail) {
    resetNodeState(postTree, true);
    const tailTicks = t - postStartTick;
    if (tailTicks > 0) spriteUpdate(postTree, tailTicks / UNIVERSAL_FPS);
    else spriteUpdate(postTree, 0);
  }
  animationTime = t;
  triggerRender();
}

function setSpritesheet(image) { loadedImage = image || null; tintCache.clear(); }

function setTree(root) {
  animationTree = root || null;
  paused = false;
  clearAttackTail();
  resetRuntime();
  if (animationTree) { precomputeTimeline(); resetRuntime(); }
  if (animationTree && !loopRunning) startLoop();
}

function setRivalSpritesheet(image) { rivalImage = image || null; tintCache.clear(); }

function setRivalTree(root, loop = true) {
  rivalTree = root || null;
  if (rivalTree) {
    resetNodeState(rivalTree);
    if (loop) forceLoopEnabled(rivalTree);
    spriteUpdate(rivalTree, 0);
  }
}
function setRivalVisible(v) { rivalVisible = !!v; triggerRender(); }

function setTransportOffset(x, y) { transportOffsetX = Number(x) || 0; transportOffsetY = Number(y) || 0; }

function getTransportOffset() { return { x: transportOffsetX, y: transportOffsetY }; }

function getDataPoint(name) {
  if (!animationTree || !animationTree.dataPoints) return null;
  const dp = animationTree.dataPoints.find(d => d.name === name);
  return dp ? { x: dp.x, y: dp.y, name: dp.name } : null;
}

function getDataPoints() {
  if (!animationTree || !animationTree.dataPoints) return [];
  return animationTree.dataPoints.map(d => ({ x: d.x, y: d.y, name: d.name }));
}

function scanAnimationLabels() {
  if (!animationTree || !animationTree.frames) return {};
  const result = {};
  for (let i = 0; i < animationTree.frames.length; i++) {
    const fd = animationTree.frames[i];
    if (!fd || !fd.tags) continue;
    for (const tag of fd.tags) {
      if (tag.key === "label" && !(tag.value in result)) result[tag.value] = i;
    }
  }
  return result;
}

function scanAnimationSounds() {
  if (!animationTree || !animationTree.frames) return [];
  const result = [];
  const fr = Math.max(1, animationTree.framerate || 1);
  let acc = 0;
  let prevSound = null;
  for (let i = 0; i < animationTree.frames.length; i++) {
    const fd = animationTree.frames[i];
    let sound = null;
    if (fd && fd.tags) {
      for (const tag of fd.tags) {
        if (tag.key === "sound") { sound = tag.value; break; }
      }
    }
    if (sound && sound !== prevSound) result.push({ tick: acc, name: sound });
    prevSound = sound;
    acc += fr + ((fd && fd.delay) || 0);
  }
  return result;
}

function stepFrames(delta) {
  if (!animationTree) return;
  const d = Math.trunc(delta);
  if (d === 0) return;
  const rootFramerate = Math.max(1, animationTree.framerate);
  const ticks = d * rootFramerate;
  stepTree(animationTree, ticks);
  refreshComposites(animationTree);
  triggerRender();
}
function gotoTreeTick(targetTick) { restoreTick(targetTick); }

function gotoFrame(n) {
  if (!animationTree) return;
  const total = animationTree.totalFrames;
  if (total <= 0) return;
  let target = Math.trunc(Number(n));
  if (!Number.isFinite(target)) return;
  target = Math.max(0, Math.min(total - 1, target));
  const base = animationTree.currentFrame < 0 ? 0 : animationTree.currentFrame;
  stepFrames(target - base);
}

function getFrameTickDuration(node, frameIndex) {
  if (!node.frames || frameIndex < 0 || frameIndex >= node.frames.length) return 1;
  const fr = Math.max(1, node.framerate);
  const d = node.frames[frameIndex].delay || 0;
  return fr + d;
}

function getTotalTickDuration(node) {
  if (!node || !node.frames) return 1;
  if (node === animationTree && precomputedTotalTicks > 0) {
    return tailEndTick > 0 ? tailEndTick : precomputedTotalTicks;
  }
  let total = 0;
  for (let i = 0; i < node.frames.length; i++) total += getFrameTickDuration(node, i);
  return Math.max(1, total);
}

function getTickPosition(node) {
  if (!node || !node.frames) return 0;
  if (node === animationTree && precomputedSnapshots) {
    const limit = tailEndTick > 0 ? tailEndTick : precomputedTotalTicks;
    return Math.min(animationTime, limit - 1);
  }
  const n = Math.max(0, node.currentFrame);
  let acc = 0;
  for (let i = 0; i < n && i < node.frames.length; i++) acc += getFrameTickDuration(node, i);
  const curDur = getFrameTickDuration(node, n);
  const inFrame = Math.min(node.frameTicksElapsed || 0, curDur);
  return acc + inFrame;
}

function getDeathTickDuration() {
  const shaderTicks = Math.max(1, Math.round((deathState.duration || 1.7) * UNIVERSAL_FPS));
  let splatTicks = 0;
  if (deathSplatterTree && deathSplatterTree.frames) {
    for (let i = 0; i < deathSplatterTree.frames.length; i++) {
      splatTicks += getFrameTickDuration(deathSplatterTree, i);
    }
  }
  let soundTicks = 0;
  const sm = window.soundManager;
  if (sm && sm.getSoundBuffer) {
    const buf = sm.getSoundBuffer('mutant_death');
    if (buf && !(buf instanceof Promise)) {
      soundTicks = Math.ceil(buf.duration * UNIVERSAL_FPS);
    }
  }
  return Math.max(shaderTicks, splatTicks, soundTicks, 1);
}

function getInfo() {
  if (deathState.active) {
    const total = getDeathTickDuration();
    const pos = deathState.elapsed * UNIVERSAL_FPS;
    return {
      currentFrame: animationTree ? Math.max(0, animationTree.currentFrame) : 0,
      totalFrames: animationTree ? animationTree.totalFrames : 0,
      tickPosition: pos,
      tickDuration: total,
      delayCounter: animationTree ? animationTree.delayCounter : 0,
      paused,
      speed: currentSpeedFactor,
      ticks: pos,
    };
  }
  if (!animationTree) {
    return { currentFrame: 0, totalFrames: 0, tickPosition: 0, tickDuration: 1, paused, speed: currentSpeedFactor };
  }
  return {
    currentFrame: Math.max(0, animationTree.currentFrame),
    totalFrames: animationTree.totalFrames,
    tickPosition: getTickPosition(animationTree),
    tickDuration: getTotalTickDuration(animationTree),
    delayCounter: animationTree.delayCounter,
    paused,
    speed: currentSpeedFactor,
    ticks: animationTime,
  };
}

function setShowHidden(v) { DEBUG_SHOW_HIDDEN = !!v; triggerRender(); }

function setShowBounds(v) { DEBUG_SHOW_BOUNDS = !!v; triggerRender(); }

function setBoundsColor(c) { DEBUG_BOUNDS_COLOR = normalizeHexColor(c); triggerRender(); }

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

window.animationEngine = {
  setSpritesheet, setTree, setRivalSpritesheet, setRivalTree,
  getTree: () => animationTree,
  getRivalTree: () => rivalTree,
  getLoadedImage: () => loadedImage,
  getRivalImage: () => rivalImage,
  getRenderTree, getRenderImage,
  setAttackTail, clearAttackTail, getTailEndTick, updateAttackTailAssets,
  setRivalVisible, isRivalVisible: () => rivalVisible,
  startLoop, stopLoop, play, pause, togglePause, isPaused,
  setSpeed, setAttackSpeedMultiplier, getAttackSpeedMultiplier,
  setAutoRestart, getAutoRestart, setStopAtEnd, getStopAtEnd,
  isAtEnd, stepFrames, gotoFrame, gotoTick: gotoTreeTick, updateTick,
  reset: resetRuntime,
  getDataPoint, getDataPoints, scanAnimationLabels,
  setTransportOffset, getTransportOffset,
  getInfo, getTime: () => animationTime,
  getTreeTickDuration: getTotalTickDuration,
  setShowHidden, setShowBounds, setBoundsColor,
  getShowBounds: () => DEBUG_SHOW_BOUNDS,
  getBoundsColor: () => DEBUG_BOUNDS_COLOR,
  renderNode, setRenderCallback, getTreeBounds,
  spriteUpdate, resetNodeState, precomputeTimeline, restoreTick, scanAnimationSounds,
  startDeath, stopDeath, isDying, getDeathProgress, getDeathFireColor,
  setDeathSplatter, getDeathSplatter,
  startDeath, stopDeath, isDying, getDeathProgress, getDeathFireColor,
  setDeathSplatter, getDeathSplatter, getDeathTickDuration,
};