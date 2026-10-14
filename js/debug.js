function loadColorTexture() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "images/ui/circle_color.png";
  });
}

function tintTexture(baseImg, color) {
  const c = document.createElement("canvas");
  c.width = baseImg.naturalWidth;
  c.height = baseImg.naturalHeight;
  const cx = c.getContext("2d");
  cx.drawImage(baseImg, 0, 0);
  cx.globalCompositeOperation = "multiply";
  cx.fillStyle = color;
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = "destination-in";
  cx.drawImage(baseImg, 0, 0);
  return c.toDataURL("image/png");
}

function updateToggleIcon(button, enabled) {
  const icon = button.querySelector(".activeIcon");
  if (!icon) return;
  const desired = enabled ? "images/icons/icon_on.png" : "images/icons/icon_off.png";
  if (icon.src.indexOf(desired) === -1) icon.src = desired;
}

function setBgButtonsBlocked(blocked) {
  for (const btn of bgButtonsForBlock) {
    if (!btn) continue;
    btn.classList.toggle("selectBlocked", blocked);
  }
}

function setupBackgroundControls() {
  const btnNone = document.getElementById("btnNone");
  bindGated(btnNone, async () => {
    if (window.mutantLoader && typeof window.mutantLoader.setBackgroundByValue === "function") {
      await window.mutantLoader.setBackgroundByValue(null);
    }
  });
  bgButtonsForBlock.length = 0;
  if (btnNone) bgButtonsForBlock.push(btnNone);
  for (const { id, type } of BG_BUTTONS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    bgButtonsForBlock.push(btn);
    btn.addEventListener("click", () => openBgList(type));
  }
}

async function setupDebugControls() {
  const btnBounds = document.getElementById("btnBounds");
  const btnColor = document.getElementById("btnColor");
  const btnShowRival = document.getElementById("btnShowRival");
  const btnMultiple = document.getElementById("btnMultiple");
  const colorPicker = document.getElementById("colorPicker");
  const btnEffects = document.getElementById("btnEffects");
  const btnLights = document.getElementById("btnLights");
  const btnHiddenMutants = document.getElementById("btnHiddenMutants");
  const btnHiddenBg = document.getElementById("btnHiddenBg");
  const btnFrames = document.getElementById("btnFrames");
  const btnChangeBg = document.getElementById("btnChangeBg");
  if (!btnBounds || !btnColor || !colorPicker) return;
  let boundsEnabled = false;
  let currentColor = colorPicker.value || "#00ff00";
  window.animationEngine.setShowBounds(boundsEnabled);
  window.animationEngine.setBoundsColor(currentColor);
  updateToggleIcon(btnBounds, boundsEnabled);
  if (btnShowRival) updateToggleIcon(btnShowRival, showRivalEnabled);
  if (btnMultiple) updateToggleIcon(btnMultiple, multipleRivalsEnabled);
  if (btnEffects) {
    window.fxManager.setEffectsEnabled(true);
    updateToggleIcon(btnEffects, true);
  }
  if (btnLights) {
    if (typeof window.fxManager.setLightsEnabled === "function") {
      window.fxManager.setLightsEnabled(true);
    }
    updateToggleIcon(btnLights, true);
  }
  if (btnHiddenMutants) updateToggleIcon(btnHiddenMutants, showHiddenMutants);
  if (btnHiddenBg) updateToggleIcon(btnHiddenBg, showHiddenBg);
  if (btnChangeBg) updateToggleIcon(btnChangeBg, backgroundFromEventEnabled);
  let framesEnabled = false;
  if (btnFrames) updateToggleIcon(btnFrames, framesEnabled);
  window.sceneRenderer.setFrameCounterEnabled(framesEnabled);
  const colorImg = btnColor.querySelector("img");
  const colorTexture = await loadColorTexture();
  if (colorTexture && colorImg) colorImg.src = tintTexture(colorTexture, currentColor);
  bindGated(btnBounds, () => {
    boundsEnabled = !boundsEnabled;
    window.animationEngine.setShowBounds(boundsEnabled);
    updateToggleIcon(btnBounds, boundsEnabled);
  });
  bindGated(btnShowRival, () => {
    showRivalEnabled = !showRivalEnabled;
    updateToggleIcon(btnShowRival, showRivalEnabled);
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    applyRivalVisibility(anim);
  });
  bindGated(btnMultiple, () => {
    multipleRivalsEnabled = !multipleRivalsEnabled;
    updateToggleIcon(btnMultiple, multipleRivalsEnabled);
    window.sceneRenderer.setMultipleRivalsEnabled(multipleRivalsEnabled);
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    applyRivalVisibility(anim);
    window.sceneRenderer.renderAll();
  });
  bindGated(btnEffects, () => {
    const next = !window.fxManager.isEffectsEnabled();
    window.fxManager.setEffectsEnabled(next);
    updateToggleIcon(btnEffects, next);
    window.sceneRenderer.renderAll();
  });
  bindGated(btnLights, () => {
    if (typeof window.fxManager.isLightsEnabled !== "function" ||
        typeof window.fxManager.setLightsEnabled !== "function") return;
    const next = !window.fxManager.isLightsEnabled();
    window.fxManager.setLightsEnabled(next);
    updateToggleIcon(btnLights, next);
    window.sceneRenderer.renderAll();
  });
  bindGated(btnHiddenMutants, () => {
    showHiddenMutants = !showHiddenMutants;
    updateToggleIcon(btnHiddenMutants, showHiddenMutants);
    reRenderOpenLists();
  });
  bindGated(btnHiddenBg, () => {
    showHiddenBg = !showHiddenBg;
    updateToggleIcon(btnHiddenBg, showHiddenBg);
    reRenderOpenLists();
  });
  bindGated(btnFrames, () => {
    framesEnabled = !framesEnabled;
    window.sceneRenderer.setFrameCounterEnabled(framesEnabled);
    updateToggleIcon(btnFrames, framesEnabled);
  });
  bindGated(btnColor, () => {
    colorPicker.value = currentColor;
    colorPicker.click();
  });
  bindGated(btnChangeBg, () => {
    backgroundFromEventEnabled = !backgroundFromEventEnabled;
    updateToggleIcon(btnChangeBg, backgroundFromEventEnabled);
    applyEventBackground();
  });
  colorPicker.addEventListener("input", () => {
    currentColor = colorPicker.value;
    if (colorTexture && colorImg) colorImg.src = tintTexture(colorTexture, currentColor);
    window.animationEngine.setBoundsColor(currentColor);
  });
}