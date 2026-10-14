function activateMenuButton(btn) {
  btn_menu.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
  btn.classList.add("active"); btn.setAttribute("aria-pressed", "true");
  menuContent.forEach(sec => sec.classList.remove("active"));
  const target = document.getElementById(btn.dataset.target);
  if (target) target.classList.add("active");
}

function setupMainMenu() {
  btn_menu.forEach(btn => {
    if (btn === btnDebug) return;
    btn.addEventListener("click", () => activateMenuButton(btn));
  });
}

function setupInfoPopups() {
  logoManu.addEventListener("click", () => {
    scaleContainerLayer.classList.remove("hidden");
    infoLayer.classList.remove("hidden");
    showStatic();
  });
  infoClose.addEventListener("click", () => {
    scaleContainerLayer.classList.add("hidden");
    infoLayer.classList.add("hidden");
    hideStatic();
  });
}

function renderLangMenu() {
  langLayer.innerHTML = "";
  availableLangs.forEach(lang => {
    const item = document.createElement("div");
    item.className = "lang-item";
    item.innerHTML = `<img src="${lang.image}" class="lang-flag"><span class="lang-name">${lang.name}</span>`;
    item.addEventListener("click", () => selectLanguage(lang.value));
    langLayer.appendChild(item);
  });
}

function updateFlagLang() {
  const selected = availableLangs.find(l => l.value === currentLang);
  const flagImg = document.querySelector("#btnLang img.flag");
  if (selected && flagImg) flagImg.src = selected.image;
}

function toggleLangMenu(show) {
  if (show) {
    langLayer.classList.remove("hidden");
    clickToClose.classList.remove("hidden");
    scaleContainerLayer.classList.remove("hidden");
    showStatic();
  } else {
    langLayer.classList.add("hidden");
    clickToClose.classList.add("hidden");
    scaleContainerLayer.classList.add("hidden");
    hideStatic();
  }
}

async function selectLanguage(langCode) {
  toggleLangMenu(false);
  showLoading();
  currentLang = langCode;
  localStorage.setItem("selectedLang", langCode);
  window.currentLang = langCode;
  updateFlagLang();
  await applyLanguage();
  await reloadMutantNames();
  await loadBackgrounds();
  if (!listControllers.mutant?.layer.classList.contains("hidden")) renderCharacterList(mutantListLayerContext());
  if (!listControllers.skin?.layer.classList.contains("hidden")) renderItemList();
  if (!listControllers.bg?.layer.classList.contains("hidden")) renderBgList();
  hideLoading();
}

async function applyLanguage() {
  const langsMap = await loadLangsFile();
  document.querySelectorAll("[data-lang]").forEach(el => {
    const key = el.getAttribute("data-lang");
    const langKey = `${key}-${currentLang}`;
    const value = langsMap[langKey] || langsMap[key];
    if (el.tagName === "INPUT" && el.hasAttribute("placeholder")) {
      el.setAttribute("placeholder", value || el.getAttribute("placeholder"));
    } else if (value) {
      el.textContent = value;
    }
  });
}

function swapBodyBackground(url) {
  const layers = [
    document.getElementById("bodyBgA"),
    document.getElementById("bodyBgB"),
  ];
  if (!layers[0] || !layers[1]) return;
  const nextIdx = 1 - currentBgLayer;
  const nextEl = layers[nextIdx];
  const curEl = layers[currentBgLayer];
  nextEl.style.backgroundImage = url;
  nextEl.style.opacity = "0.5";
  curEl.style.opacity = "0";
  currentBgLayer = nextIdx;
}

function applyEventBackground() {
  const bgValue = window.mutantLoader && typeof window.mutantLoader.getCurrentBackground === "function"
    ? window.mutantLoader.getCurrentBackground()
    : null;
  const fallback = 'url("images/ui/background.png")';
  if (!backgroundFromEventEnabled || !bgValue) {
    swapBodyBackground(fallback);
    return;
  }
  const cached = window.mutantLoader && typeof window.mutantLoader.getScreenUrlFor === "function"
    ? window.mutantLoader.getScreenUrlFor(bgValue)
    : null;
  if (cached) {
    swapBodyBackground(`url("${cached}")`);
    return;
  }
  const urlRaw = `https://s-beta.kobojo.com/mutants/assets/pveeventcontent/screen_${bgValue}.jpg`;
  const testImg = new Image();
  testImg.onload = () => swapBodyBackground(`url("${urlRaw}")`);
  testImg.onerror = () => swapBodyBackground(fallback);
  testImg.src = urlRaw;
}

function setupGeneFilters() {
  document.querySelectorAll(".geneFilter").forEach(group => {
    const groupKey = group.id.replace("Filter", "");
    group.querySelectorAll(".btnGene").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".btnGene").forEach(b => {
          b.classList.remove("active");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-pressed", "true");
        selectedGenes[groupKey] = btn.dataset.value;
      });
    });
  });
}

function setupGeneFilterEvents() {
  document.querySelectorAll("#mutantFilter .btnGene").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#mutantFilter .btnGene").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilters.mutant = btn.dataset.value;
    });
  });
}

function disableAncestorTransforms() {
  if (savedAncestorStyles.length > 0) return;
  savedAncestorStyles = [];
  const wrapper = document.getElementById("canvasWrapper");
  if (!wrapper) return;
  let el = wrapper.parentElement;
  while (el && el !== document.documentElement) {
    const computed = getComputedStyle(el).transform;
    if (computed && computed !== "none") {
      savedAncestorStyles.push({
        el,
        transform: el.style.transform,
        left: el.style.left,
        top: el.style.top
      });
      el.style.setProperty("transform", "none", "important");
      el.style.setProperty("left", "0", "important");
      el.style.setProperty("top", "0", "important");
    }
    el = el.parentElement;
  }
}

function restoreAncestorTransforms() {
  for (const s of savedAncestorStyles) {
    s.el.style.removeProperty("transform");
    s.el.style.removeProperty("left");
    s.el.style.removeProperty("top");
    if (s.transform) s.el.style.transform = s.transform;
    if (s.left) s.el.style.left = s.left;
    if (s.top) s.el.style.top = s.top;
  }
  savedAncestorStyles = [];
}

function updateFullscreenLayout() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas || !document.fullscreenElement) return;
  const vw = window.innerWidth, vh = window.innerHeight;
  const bw = canvas.width, bh = canvas.height;
  const scale = Math.max(vw / bw, vh / bh);
  canvas.style.setProperty("width", Math.round(bw * scale) + "px", "important");
  canvas.style.setProperty("height", Math.round(bh * scale) + "px", "important");
  canvas.style.setProperty("position", "absolute", "important");
  canvas.style.setProperty("top", "50%", "important");
  canvas.style.setProperty("left", "50%", "important");
  canvas.style.setProperty("transform", "translate(-50%, -50%)", "important");
  canvas.style.setProperty("margin", "0", "important");
  canvas.style.setProperty("padding", "0", "important");
  canvas.style.setProperty("max-width", "none", "important");
  canvas.style.setProperty("max-height", "none", "important");
  canvas.style.setProperty("background-color", "#222", "important");
}

function clearFullscreenLayout() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas) return;
  for (const prop of ["width","height","position","top","left","transform","margin","padding","max-width","max-height","background-color"]) {
    canvas.style.removeProperty(prop);
  }
}

function updateFullscreenIcon() {
  const img = btnFullscreen.querySelector("img");
  if (!img) return;
  const desired = document.fullscreenElement
    ? "images/icons/players/player_minimised.png"
    : "images/icons/players/player_fullscreen.png";
  if (img.src.indexOf(desired) === -1) img.src = desired;
}

function moveTimelineIntoFullscreen() {
  const wrapper = document.getElementById("canvasWrapper");
  const timeline = document.getElementById("playerTimeline");
  if (!wrapper || !timeline) return;
  if (timeline.parentElement === wrapper) return;
  timelinePlaceholder = document.createComment("playerTimeline-home");
  timeline.parentNode.insertBefore(timelinePlaceholder, timeline);
  wrapper.appendChild(timeline);
  timeline.classList.add("in-fullscreen");
  requestAnimationFrame(() => requestAnimationFrame(updateTimelineBar));
}

function moveTimelineBack() {
  const timeline = document.getElementById("playerTimeline");
  if (!timeline || !timelinePlaceholder) return;
  timeline.classList.remove("in-fullscreen");
  timelinePlaceholder.parentNode.insertBefore(timeline, timelinePlaceholder);
  timelinePlaceholder.parentNode.removeChild(timelinePlaceholder);
  timelinePlaceholder = null;
  requestAnimationFrame(() => { updateTimelineBar(); });
}

function setupFullscreen() {
  btnFullscreen.addEventListener("pointerdown", async (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    if (fullscreenLocked) return;
    fullscreenLocked = true;
    clearTimeout(fullscreenLockTimer);
    fullscreenLockTimer = setTimeout(() => { fullscreenLocked = false; }, 1500);
    const wrapper = document.getElementById("canvasWrapper");
    if (!wrapper) { fullscreenLocked = false; return; }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        disableAncestorTransforms();
        await wrapper.requestFullscreen();
      }
    } catch (_) {
      restoreAncestorTransforms();
      fullscreenLocked = false;
    }
  });
  btnFullscreen.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
  });
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      requestAnimationFrame(() => {
        updateFullscreenLayout();
        moveTimelineIntoFullscreen();
        requestAnimationFrame(updateTimelineBar);
      });
    } else {
      moveTimelineBack();
      clearFullscreenLayout();
      restoreAncestorTransforms();
      if (typeof scaleSite === "function") scaleSite();
      if (typeof scaleCover === "function") scaleCover();
      requestAnimationFrame(() => {
        if (typeof scaleSite === "function") scaleSite();
        if (typeof scaleCover === "function") scaleCover();
        updateTimelineBar();
      });
    }
    updateFullscreenIcon();
    updateTimelineBar();
  });
  window.addEventListener("resize", () => {
    if (document.fullscreenElement) updateFullscreenLayout();
  });
  updateFullscreenIcon();
}

function setupFullscreenKeyboard() {
  window.addEventListener("keydown", (e) => {
    if (!document.fullscreenElement) return;
    const t = e.target;
    const tag = (t && t.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (e.code === "Space" || e.key === " ") {
      e.preventDefault();
      if (!btnPlay.disabled) btnPlay.click();
      return;
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      if (btnForward.disabled) return;
      if (!window.animationEngine.isPaused()) {
        window.animationEngine.pause();
        updatePlayButtonIcon();
      }
      stepTimeline(1);
      return;
    }
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      if (btnBack.disabled) return;
      if (!window.animationEngine.isPaused()) {
        window.animationEngine.pause();
        updatePlayButtonIcon();
      }
      stepTimeline(-1);
      return;
    }
  });
}

function setupCameraControls() {
  const canvas = document.getElementById("mutantCanvas");
  if (!canvas || !window.animationEngine) return;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.style.cursor = "default";
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (!selectedValues.mutant) return;
    cameraDragging = true;
    cameraDragLastX = e.clientX;
    cameraDragLastY = e.clientY;
    canvas.style.cursor = "grabbing";
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    if (!cameraDragging) return;
    const dx = e.clientX - cameraDragLastX;
    const dy = e.clientY - cameraDragLastY;
    cameraDragLastX = e.clientX;
    cameraDragLastY = e.clientY;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    window.sceneRenderer.panCamera(dx * scaleX, dy * scaleY);
  });
  window.addEventListener("pointerup", () => {
    if (!cameraDragging) return;
    cameraDragging = false;
    canvas.style.cursor = "grab";
  });
  window.addEventListener("pointercancel", () => {
    if (!cameraDragging) return;
    cameraDragging = false;
    canvas.style.cursor = "grab";
  });
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!selectedValues.mutant) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    const canvasX = (e.clientX - rect.left) * scaleX;
    const canvasY = (e.clientY - rect.top) * scaleY;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    window.sceneRenderer.zoomCamera(canvasX, canvasY, factor);
  }, { passive: false });
}

function loadMidWatermark() {
  if (midWatermarkLoaded) return Promise.resolve(midWatermarkImage);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { midWatermarkImage = img; midWatermarkLoaded = true; resolve(img); };
    img.onerror = () => { midWatermarkLoaded = true; resolve(null); };
    img.src = MID_WATERMARK_PATH;
  });
}

async function updateMidWatermark() {
  const img = await loadMidWatermark();
  if (!img) return;
  window.sceneRenderer.setMidLayerImage(img, MID_WATERMARK_OPACITY, MID_WATERMARK_WIDTH_RATIO);
}

function loadWatermark() {
  if (watermarkImage) return Promise.resolve(watermarkImage);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => { watermarkImage = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = "images/ui/logo_manu.png";
  });
}

function setupScreenshot() {
  const canvas = document.getElementById("mutantCanvas");
  if (!btnScreenshot || !canvas) return;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  loadWatermark();
  loadMidWatermark();
  btnScreenshot.addEventListener("click", async () => {
    if (!selectedValues.mutant) return;
    let baseName = "screenshot";
    const found = allMutants.find(m => m.value === selectedValues.mutant);
    baseName = (found && found.name) ? found.name : selectedValues.mutant;
    baseName = baseName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
    if (!baseName) baseName = "screenshot";
    const filename = getVersionedFilename(baseName, ".jpg");
    const SCALE = 3;
    const origW = canvas.width;
    const origH = canvas.height;
    const wasPaused = window.animationEngine.isPaused();
    window.animationEngine.pause();
    const prevVisibility = canvas.style.visibility;
    canvas.style.visibility = "hidden";
    let blob = null;
    try {
      window.sceneRenderer.resizeCanvasTo(origW * SCALE, origH * SCALE);
      const out = document.createElement("canvas");
      out.width = canvas.width;
      out.height = canvas.height;
      const octx = out.getContext("2d");
      octx.fillStyle = "#000";
      octx.fillRect(0, 0, out.width, out.height);
      const session = await window.discordIntegration.getSession();
      const showMidLayer = !session;
      if (showMidLayer) {
        window.sceneRenderer.setIncludeMidLayer(true);
        window.sceneRenderer.renderAll();
      }
      octx.drawImage(canvas, 0, 0);
      if (showMidLayer) {
        window.sceneRenderer.setIncludeMidLayer(false);
        window.sceneRenderer.renderAll();
      }
      if (!currentUserExempt) {
        const logo = watermarkImage || await loadWatermark();
        if (logo && logo.complete && logo.naturalWidth > 0) {
          const targetW = Math.round(out.width * 0.2);
          const targetH = Math.round(logo.naturalHeight * (targetW / logo.naturalWidth));
          const margin = Math.round(out.width * 0.02);
          octx.drawImage(
            logo,
            out.width - targetW - margin,
            out.height - targetH - margin,
            targetW, targetH
          );
        }
      }
      blob = await new Promise(resolve =>
        out.toBlob(resolve, "image/jpeg", SCREENSHOT_JPEG_QUALITY)
      );
    } finally {
      window.sceneRenderer.resizeCanvasTo(origW, origH);
      canvas.style.visibility = prevVisibility || "";
      if (!wasPaused) window.animationEngine.play();
    }
    if (!blob) return;
    downloadBlob(blob, filename);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function getVersionedFilename(baseName, ext) {
  const key = `screenshotCount_${baseName}${ext}`;
  let count = parseInt(localStorage.getItem(key) || "0", 10);
  if (!Number.isFinite(count) || count < 0) count = 0;
  count++;
  try { localStorage.setItem(key, String(count)); } catch (_) {}
  if (count === 1) return `${baseName}${ext}`;
  return `${baseName} (${count - 1})${ext}`;
}