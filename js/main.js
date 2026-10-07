const DEFAULT_BG_VALUE = "detroit_01";
const canvasLoad = document.getElementById("canvasLoad");
const btn_menu = document.querySelectorAll(".btn.menu");
const btnDebug = document.getElementById("btnDebug");
const btnMenu = document.getElementById("btnMenu");
const menuContent = document.querySelectorAll(".menuContent");
const infoClose = document.getElementById("infoClose");
const infoLayer = document.getElementById("infoLayer");
const clickBlocker = document.getElementById("clickBlocker");
const clickToClose = document.getElementById("clickToClose");
const loadingScreen = document.getElementById("loadingScreen");
const scaleContainerLayer = document.getElementById("scale-container-layer");
const coverContainer = document.getElementById("cover-container");
const mutantSelect = document.getElementById("mutantSelect");
const rivalSelect = document.getElementById("rivalSelect");
const skinSelect = document.getElementById("skinSelect");
const animationSelect = document.getElementById("animationSelect");
const btnLang = document.getElementById("btnLang");
const langLayer = document.getElementById("langLayer");
const logoManu = document.getElementById("logoManu");
const btnStats = document.getElementById("btnStats");
const btnPlay = document.getElementById("btnPlay");
const btnBack = document.getElementById("btnBack");
const btnForward = document.getElementById("btnForward");
const btnStop = document.getElementById("btnStop");
const btnSpeed = document.getElementById("btnSpeed");
const btnLoop = document.getElementById("btnLoop");
const btnFullscreen = document.getElementById("btnFullscreen");
const playerTimeline = document.getElementById("playerTimeline");
const playerLine = document.getElementById("playerLine");
const playerBar = document.getElementById("playerBar");
const btnSound = document.getElementById("btnSound");
const btnScreenshot = document.getElementById("btnScreenshot");
const COMBAT_PATTERN = /^(attack|hit)/i;
const ATTACK_PATTERN = /^attack/i;
const ATTACK_SPEED_MULTIPLIER = 1.5;
const rivalAnimationCache = new Map();
const listControllers = {};
const MID_WATERMARK_PATH = "images/ui/logo_manu.png";
const MID_WATERMARK_OPACITY = 0.25;
const MID_WATERMARK_WIDTH_RATIO = 1.0;

const BG_BUTTONS = [
  { id: "btnCampaign", type: "bg_cmp" },
  { id: "btnPve", type: "bg_pve" },
  { id: "btnRaid", type: "bg_rid" },
  { id: "btnValentines", type: "bg_val" },
  { id: "btnEaster", type: "bg_eas" },
  { id: "btnAnniversary", type: "bg_anv" },
  { id: "btnHalloween", type: "bg_hal" },
  { id: "btnXmas", type: "bg_xms" }
];
const playerButtons = [btnPlay, btnBack, btnForward, btnStop, btnSpeed, btnLoop, btnSound, btnScreenshot];

let availableLangs = [];
let currentLang = localStorage.getItem("selectedLang") || "en";
let currentScale = 1;
let allMutants = [];
let currentFilters = { mutant: "default_", rival: "default_" };
let selectedValues = { mutant: null, rival: null };
let selectedGenes = { mutant: "all", rival: "all" };
let allSkins = [];
let allAnimations = [];
let selectedSkin = null;
let selectedAnimation = null;
let itemListMode = null;
let allBackgrounds = [];
let currentBgFilter = null;
let availableSpeeds = [];
let currentSpeedIndex = 0;
let timelineDragging = false;
let timelineDraggingPaused = false;
let timelineLastFrame = -1;
let timelineRafId = null;
let loopEnabled = true;
let savedAncestorStyles = [];
let cameraDragging = false;
let cameraDragLastX = 0;
let cameraDragLastY = 0;
let watermarkEnabled = true;
let currentRivalStandTree = null;
let currentRivalStandImage = null;
let transportSchedule = null;
let watermarkImage = null;
let showRivalEnabled = true;
let currentRivalAssets = null;
let rivalHitPlaying = false;
let rivalHitTicksElapsed = 0;
let rivalHitDurationTicks = 0;
let lastAnimationTime = 0;
let lastSeenTick = 0;
let midWatermarkImage = null;
let midWatermarkLoaded = false;
let firstMutantLoaded = false;
let fxLastTick = -0.001;
let momentIdx = {};
let soundSchedule = [];

document.querySelectorAll("button:not([type])").forEach(btn => btn.setAttribute("type", "button"));

function showStatic() { coverContainer.classList.remove("hidden"); clickBlocker.classList.remove("hidden"); }
function hideStatic() { coverContainer.classList.add("hidden"); clickBlocker.classList.add("hidden"); }
function showLoading() {
  loadingScreen.classList.remove("hidden");
  scaleContainerLayer.classList.remove("hidden");
  showStatic();
}
function hideLoading() {
  loadingScreen.classList.add("hidden");
  scaleContainerLayer.classList.add("hidden");
  hideStatic();
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\t/g, " ")
    .toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,;:!?¿¡'"`´]/g, "").replace(/\s+/g, " ").trim();
}

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

async function setupDebugControls() {
  const btnBounds = document.getElementById("btnBounds");
  const btnColor = document.getElementById("btnColor");
  const btnWatermark = document.getElementById("btnWatermark");
  const btnShowRival = document.getElementById("btnShowRival");
  const colorPicker = document.getElementById("colorPicker");
  const btnEffects = document.getElementById("btnEffects");
  if (!btnBounds || !btnColor || !colorPicker) return;
  let boundsEnabled = false;
  let currentColor = colorPicker.value || "#00ff00";
  window.animationEngine.setShowBounds(boundsEnabled);
  window.animationEngine.setBoundsColor(currentColor);
  updateToggleIcon(btnBounds, boundsEnabled);
  if (btnShowRival) updateToggleIcon(btnShowRival, showRivalEnabled);
  if (btnWatermark) updateToggleIcon(btnWatermark, watermarkEnabled);
  if (btnEffects) { window.fxManager.setEffectsEnabled(true); updateToggleIcon(btnEffects, true); }
  const colorImg = btnColor.querySelector("img");
  const colorTexture = await loadColorTexture();
  if (colorTexture && colorImg) colorImg.src = tintTexture(colorTexture, currentColor);
  btnBounds.addEventListener("click", () => {
    boundsEnabled = !boundsEnabled;
    window.animationEngine.setShowBounds(boundsEnabled);
    updateToggleIcon(btnBounds, boundsEnabled);
  });
  if (btnShowRival) btnShowRival.addEventListener("click", async () => {
    if (!await window.discordIntegration.requireGuildMembership()) return;
    showRivalEnabled = !showRivalEnabled;
    updateToggleIcon(btnShowRival, showRivalEnabled);
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    applyRivalVisibility(anim);
  });
  if (btnEffects) btnEffects.addEventListener("click", async () => {
    if (!await window.discordIntegration.requireGuildMembership()) return;
    const next = !window.fxManager.isEffectsEnabled();
    window.fxManager.setEffectsEnabled(next);
    updateToggleIcon(btnEffects, next);
    window.sceneRenderer.renderAll();
  });
  if (btnWatermark) btnWatermark.addEventListener("click", async () => {
    if (!await window.discordIntegration.requireGuildMembership()) return;
    watermarkEnabled = !watermarkEnabled;
    updateToggleIcon(btnWatermark, watermarkEnabled);
  });
  btnColor.addEventListener("click", async () => {
    if (!await window.discordIntegration.requireGuildMembership()) return;
    colorPicker.value = currentColor;
    colorPicker.click();
  });
  colorPicker.addEventListener("input", () => {
    currentColor = colorPicker.value;
    if (colorTexture && colorImg) colorImg.src = tintTexture(colorTexture, currentColor);
    window.animationEngine.setBoundsColor(currentColor);
  });
}

function smoothScroll(element, target, duration) {
  const start = element.scrollTop;
  const distance = target - start;
  const startTime = performance.now();
  function animate(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    element.scrollTop = start + distance * ease;
    for (const c of Object.values(listControllers)) { if (c.container === element) { c.updateScrollUI(); break; } }
    if (progress < 1) requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

function createListController(name) {
  const container = document.getElementById(`${name}ListContainer`);
  const bg = document.getElementById(`${name}ListBg`);
  const layer = document.getElementById(`${name}ListLayer`);
  const search = document.getElementById(`${name}Search`);
  if (!container || !bg || !layer) return null;
  const up = document.createElement("img");
  const down = document.createElement("img");
  const line = document.createElement("img");
  const thumb = document.createElement("div");
  up.src = "images/ui/btn_arrow.png";
  up.className = "mutantScroll-arrow up hidden";
  down.src = "images/ui/btn_arrow.png";
  down.className = "mutantScroll-arrow down hidden";
  line.src = "images/ui/scroll_line_vertical.png";
  line.className = "mutantScroll-line";
  thumb.className = "mutantScroll-thumb";
  container.parentElement.appendChild(up);
  container.parentElement.appendChild(down);
  container.parentElement.appendChild(line);
  container.parentElement.appendChild(thumb);
  const state = { name, container, bg, layer, search, up, down, line, thumb, dragging: false, startY: 0, startScroll: 0 };
  state.updateScrollUI = () => {
    line.classList.remove("hidden");
    const trackHeight = line.offsetHeight;
    const maxScroll = container.scrollHeight - container.clientHeight;
    const scrollTop = container.scrollTop;
    if (maxScroll <= 0 || trackHeight <= 0) {
      up.classList.add("hidden"); down.classList.add("hidden");
      line.classList.add("hidden"); thumb.classList.add("hidden");
      return;
    }
    up.classList.remove("hidden"); down.classList.remove("hidden"); thumb.classList.remove("hidden");
    up.classList.toggle("hidden", scrollTop <= 1);
    down.classList.toggle("hidden", scrollTop >= maxScroll - 1);
    const minThumbHeight = 17 + 25 + 8;
    const ratio = container.clientHeight / container.scrollHeight;
    let thumbHeight = Math.round(trackHeight * ratio);
    if (thumbHeight < minThumbHeight) thumbHeight = minThumbHeight;
    if (thumbHeight > trackHeight) thumbHeight = trackHeight;
    const thumbMax = Math.max(1, trackHeight - thumbHeight);
    const scrollRatio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.top = `${scrollRatio * thumbMax}px`;
  };
  const setupArrow = (arrow, dir) => {
    let interval = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(() => { container.scrollTop += dir * 6; state.updateScrollUI(); }, 16);
    };
    const stop = () => { clearInterval(interval); interval = null; };
    arrow.addEventListener("mousedown", start);
    arrow.addEventListener("mouseup", stop);
    arrow.addEventListener("mouseleave", stop);
    arrow.addEventListener("touchstart", start);
    arrow.addEventListener("touchend", stop);
    arrow.addEventListener("dblclick", () => smoothScroll(container, dir < 0 ? 0 : container.scrollHeight, 400));
  };
  setupArrow(up, -1);
  setupArrow(down, 1);
  thumb.addEventListener("mousedown", (e) => {
    state.dragging = true; state.startY = e.clientY; state.startScroll = container.scrollTop;
    document.body.style.userSelect = "none"; e.preventDefault();
  });
  container.addEventListener("scroll", state.updateScrollUI);
  container.addEventListener("wheel", () => setTimeout(state.updateScrollUI, 50));
  listControllers[name] = state;
  return state;
}

document.addEventListener("mousemove", (e) => {
  for (const state of Object.values(listControllers)) {
    if (!state.dragging) continue;
    const trackHeight = state.line.offsetHeight;
    const thumbHeight = state.thumb.offsetHeight;
    const thumbMax = Math.max(1, trackHeight - thumbHeight);
    const maxScroll = state.container.scrollHeight - state.container.clientHeight;
    const deltaY = (e.clientY - state.startY) / currentScale;
    const scrollRatio = maxScroll / thumbMax;
    state.container.scrollTop = Math.max(0, Math.min(maxScroll, state.startScroll + deltaY * scrollRatio));
    state.updateScrollUI();
  }
});
document.addEventListener("mouseup", () => {
  for (const state of Object.values(listControllers)) {
    if (state.dragging) { state.dragging = false; document.body.style.userSelect = ""; }
  }
});

function setupListSearch(name, getFilteredItems, renderOne) {
  const state = listControllers[name];
  if (!state || !state.search) return;
  state.search.addEventListener("input", () => {
    const q = normalizeText(state.search.value);
    const items = getFilteredItems(q);
    state.container.innerHTML = "";
    items.forEach(item => state.container.appendChild(renderOne(item)));
    state.updateScrollUI();
  });
}

function activateMenuButton(btn) {
  btn_menu.forEach(b => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
  btn.classList.add("active"); btn.setAttribute("aria-pressed", "true");
  menuContent.forEach(sec => sec.classList.remove("active"));
  const target = document.getElementById(btn.dataset.target);
  if (target) target.classList.add("active");
}

function setupMainMenu() {
  btn_menu.forEach(btn => { if (btn === btnDebug) return; btn.addEventListener("click", () => activateMenuButton(btn)); });
}

function setupInfoPopups() {
  logoManu.addEventListener("click", () => {
    scaleContainerLayer.classList.remove("hidden"); infoLayer.classList.remove("hidden"); showStatic();
  });
  infoClose.addEventListener("click", () => {
    scaleContainerLayer.classList.add("hidden"); infoLayer.classList.add("hidden"); hideStatic();
  });
}

async function loadAvailableLanguages() {
  const langs = await parseCustomTXT("data/options.txt", currentLang);
  availableLangs = langs.filter(l => l.type === "langs");
  renderLangMenu();
  updateFlagLang();
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
    langLayer.classList.remove("hidden"); clickToClose.classList.remove("hidden");
    scaleContainerLayer.classList.remove("hidden"); showStatic();
  } else {
    langLayer.classList.add("hidden"); clickToClose.classList.add("hidden");
    scaleContainerLayer.classList.add("hidden"); hideStatic();
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
    } else if (value) el.textContent = value;
  });
}
async function loadMutants() {
  const parsed = await parseCustomTXT(`data/characters.txt?nocache=${Date.now()}`, currentLang);
  allMutants = parsed.filter(p => p.type && p.type.startsWith("default"));
}
async function loadBackgrounds() {
  const parsed = await parseCustomTXT(`data/options.txt?nocache=${Date.now()}`, currentLang);
  allBackgrounds = parsed.filter(p => p.type && p.type.startsWith("bg_"));
}
async function applyDefaultBackground() {
  if (!window.mutantLoader || typeof window.mutantLoader.setBackgroundByValue !== "function") return;
  let bg = allBackgrounds.find(b => b.value === DEFAULT_BG_VALUE);
  if (!bg) bg = allBackgrounds.find(b => b.name === "Detroit Rock City");
  if (bg) await window.mutantLoader.setBackgroundByValue(bg.value);
}
async function reloadMutantNames() {
  const parsed = await parseCustomTXT(`data/characters.txt?nocache=${Date.now()}`, currentLang);
  allMutants = parsed.filter(p => p.type && p.type.startsWith("default"));
  if (selectedValues.mutant) {
    const found = allMutants.find(m => m.value === selectedValues.mutant);
    if (found) document.querySelector("#mutantSelect span").textContent = found.name;
    await loadMutantData(selectedValues.mutant);
    const skinVal = selectedSkin ? selectedSkin.value : null;
    const animVal = selectedAnimation ? selectedAnimation.value : null;
    selectedSkin = allSkins.find(s => (s.value || "") === (skinVal || "")) || allSkins[0] || null;
    selectedAnimation = allAnimations.find(a => (a.value || "") === (animVal || "")) || allAnimations[0] || null;
    updateSkinButton();
    updateAnimationButton();
  }
  if (selectedValues.rival) {
    const found = allMutants.find(m => m.value === selectedValues.rival);
    if (found) document.querySelector("#rivalSelect span").textContent = found.name;
  }
}
async function loadMutantData(mutantValue) {
  allSkins = [];
  allAnimations = [];
  if (!mutantValue) return;
  try {
    const parsed = await parseCustomTXT(`data/mutants/${mutantValue}/data.txt?nocache=${Date.now()}`, currentLang);
    allSkins = parsed.filter(p => p.type === "skin");
    allAnimations = parsed.filter(p => p.type === "animation");
  } catch { allSkins = []; allAnimations = []; }
}
function mutantListLayerContext() { return listControllers.mutant?.layer.getAttribute("data-context") || "mutant"; }

function renderCharacterList(context = "mutant", searchQuery = "") {
  const state = listControllers.mutant;
  if (!state) return;
  state.container.innerHTML = "";
  const filter = currentFilters[context];
  let filtered = allMutants.filter(m => m.type === filter || filter === "default_");
  if (searchQuery) {
    const q = normalizeText(searchQuery);
    filtered = filtered.filter(m => normalizeText(m.name).includes(q));
  }
  filtered.forEach(mutant => {
    const item = document.createElement("div");
    item.className = "mutant-item";
    item.innerHTML = `<div class="mutant"><img class="mutant_bg" src="images/ui/mutant_background.png"><img class="mutant_icon" src="${mutant.image}"></div><span class="text">${mutant.name}</span>`;
    item.addEventListener("click", () => selectCharacter(context, mutant));
    state.container.appendChild(item);
  });
  setTimeout(state.updateScrollUI, 50);
}
function setupMutantSearch() {
  const state = listControllers.mutant;
  if (!state || !state.search) return;
  state.search.addEventListener("input", () => {
    renderCharacterList(mutantListLayerContext(), state.search.value);
    state.updateScrollUI();
  });
}
function openCharacterList(context) {
  const state = listControllers.mutant;
  if (!state) return;
  state.bg.classList.remove("hidden"); state.layer.classList.remove("hidden");
  clickToClose.classList.remove("hidden"); scaleContainerLayer.classList.remove("hidden");
  state.layer.setAttribute("data-context", context); showStatic();
  renderCharacterList(context, state.search ? state.search.value : "");
}
function closeCharacterList() {
  const state = listControllers.mutant;
  if (!state) return;
  state.bg.classList.add("hidden"); state.layer.classList.add("hidden");
  clickToClose.classList.add("hidden"); state.layer.removeAttribute("data-context");
  scaleContainerLayer.classList.add("hidden"); hideStatic();
}
function updateStatsButton(mutantValue) {
  if (!btnStats) return;
  if (!mutantValue) { btnStats.classList.add("hidden"); btnStats.setAttribute("href", ""); return; }
  const code = String(mutantValue).replace(/^specimen_/i, "").toUpperCase();
  btnStats.setAttribute("href", `https://m3guide.github.io/statscalc.html#${code}`);
  btnStats.classList.remove("hidden");
}

async function selectCharacter(context, mutant) {
  const icon = document.querySelector(`#${context}Select img`);
  const text = document.querySelector(`#${context}Select span`);
  icon.src = mutant.image;
  text.textContent = mutant.name;
  selectedValues[context] = mutant.value;
  if (context === "mutant") updateStatsButton(mutant.value);
  closeCharacterList();
  if (context === "mutant") {
    await loadMutantData(mutant.value);
    const previousSkinValue = selectedSkin ? (selectedSkin.value || "") : null;
    const previousAnimValue = selectedAnimation ? (selectedAnimation.value || "") : null;
    selectedSkin = allSkins.find(s => (s.value || "") === (previousSkinValue || "")) || allSkins[0] || null;
    selectedAnimation = allAnimations.find(a => (a.value || "") === (previousAnimValue || "")) || allAnimations[0] || null;
    updateSkinButton();
    updateAnimationButton();
    if (typeof loadMutantImage === "function") {
      const skin = selectedSkin ? (selectedSkin.value || "") : "";
      const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
      const isAttack = ATTACK_PATTERN.test(anim);
      window.animationEngine.setAutoRestart(loopEnabled && COMBAT_PATTERN.test(anim));
      window.sceneRenderer.setCharMode(isAttack ? "other" : "stand");
      window.animationEngine.setAttackSpeedMultiplier(isAttack ? ATTACK_SPEED_MULTIPLIER : 1);
      window.fxManager.clear();
      window.soundManager.stopAllSounds();
      window.mutantLoader.pushLoadingHold();
      window.animationEngine.pause();
      try {
        const fxPromise = (async () => {
          const attacks = await window.fxManager.loadFxForMutant(mutant.value);
          window.fxManager.setAttacksTable(attacks);
          window.fxManager.setCurrentAnimation(anim, attacks);
          await window.fxManager.preloadForCurrentAttack();
        })();
        const standPromise = isAttack
          ? window.mutantLoader.loadStandTreeForMutant(mutant.value)
          : Promise.resolve(null);
        const [, , standAssets] = await Promise.all([
          loadMutantImage(mutant.value, anim, skin),
          fxPromise,
          standPromise,
        ]);
        window._standAssets = standAssets;
        window.animationEngine.pause();
        buildSoundSchedule();
        await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
      } finally {
        window.mutantLoader.popLoadingHold();
      }
      fxLastTick = -0.001;
      lastSeenTick = 0;
      window.animationEngine.play();
      updatePlayButtonIcon();
      if (!firstMutantLoaded) {
        window.sceneRenderer.setCameraEnabled(true);
        window.sceneRenderer.resetCamera();
        firstMutantLoaded = true;
      }
      enablePlayerButtons();
      buildTransportSchedule();
      applyRivalVisibility(anim);
    }
  } else if (context === "rival") {
    await loadRivalStand(mutant.value);
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    applyRivalVisibility(anim);
  }
}

function applyRivalVisibility(animValue) {
  const isAttack = ATTACK_PATTERN.test(animValue || "");
  window.animationEngine.setRivalVisible(isAttack && showRivalEnabled && !!currentRivalStandTree);
}

async function loadRivalAnimationAssets(mutantValue, animName) {
  const xmlPath = `data/mutants/${mutantValue}/${animName}.xml?nocache=${Date.now()}`;
  const txt = await fetch(xmlPath).then(r => r.text());
  const xml = new DOMParser().parseFromString(txt, "application/xml");
  const spriteEl = xml.querySelector("Sprite");
  if (!spriteEl) throw new Error();
  const bitmap = spriteEl.getAttribute("bitmap") || "";
  const base = bitmap.replace(/\.png$/i, "");
  const url = `https://s-beta.kobojo.com/mutants/assets/${base}.png`;
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error());
    i.src = url;
  });
  const tree = window.xmlParser.parseSpriteElement(spriteEl, 1);
  return { tree, img };
}
async function ensureRivalAssets(mutantValue) {
  if (!mutantValue) return null;
  if (rivalAnimationCache.has(mutantValue)) return rivalAnimationCache.get(mutantValue);
  const [stand, hit] = await Promise.all([
    loadRivalAnimationAssets(mutantValue, "stand"),
    loadRivalAnimationAssets(mutantValue, "hit").catch(() => null)
  ]);
  const assets = { stand, hit };
  rivalAnimationCache.set(mutantValue, assets);
  return assets;
}
async function loadRivalStand(mutantValue) {
  if (!mutantValue) {
    currentRivalStandTree = null; currentRivalStandImage = null; currentRivalAssets = null;
    rivalHitPlaying = false;
    window.animationEngine.setRivalTree(null);
    window.animationEngine.setRivalVisible(false);
    return;
  }
  try {
    const assets = await ensureRivalAssets(mutantValue);
    if (!assets || !assets.stand) throw new Error();
    currentRivalAssets = assets;
    currentRivalStandTree = assets.stand.tree;
    currentRivalStandImage = assets.stand.img;
    rivalHitPlaying = false;
    window.animationEngine.setRivalSpritesheet(assets.stand.img);
    window.animationEngine.setRivalTree(assets.stand.tree);
    window.animationEngine.precomputeTimeline();
  } catch (_) {
    currentRivalStandTree = null; currentRivalStandImage = null; currentRivalAssets = null;
    rivalHitPlaying = false;
    window.animationEngine.setRivalTree(null);
  }
}
function restoreRivalStand() {
  rivalHitPlaying = false; rivalHitTicksElapsed = 0;
  if (currentRivalAssets && currentRivalAssets.stand) {
    window.animationEngine.setRivalSpritesheet(currentRivalAssets.stand.img);
    window.animationEngine.setRivalTree(currentRivalAssets.stand.tree);
  }
}
async function setDefaultRival(mutantValue) {
  const found = allMutants.find(m => m.value === mutantValue);
  if (!found) return;
  const icon = document.querySelector("#rivalSelect img");
  const text = document.querySelector("#rivalSelect span");
  if (icon) icon.src = found.image;
  if (text) text.textContent = found.name;
  selectedValues.rival = found.value;
  await loadRivalStand(found.value);
  const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
  applyRivalVisibility(anim);
}

function createBgItem(bg) {
  const item = document.createElement("div");
  item.className = "bg-item";
  item.innerHTML = `<div class="bg"><img class="bg_bg" src="images/ui/bg_background.png"><img class="bg_icon" src="${bg.image}"></div><span class="text">${bg.name}</span>`;
  item.addEventListener("click", () => selectBg(bg));
  return item;
}
function renderBgList(query = "") {
  const state = listControllers.bg;
  if (!state) return;
  state.container.innerHTML = "";
  const q = normalizeText(query);
  let filtered = allBackgrounds.filter(b => b.type === currentBgFilter);
  if (q) filtered = filtered.filter(b => normalizeText(b.name).includes(q));
  filtered.forEach(bg => state.container.appendChild(createBgItem(bg)));
  setTimeout(state.updateScrollUI, 50);
}
function openBgList(type) {
  const state = listControllers.bg;
  if (!state) return;
  currentBgFilter = type;
  state.bg.classList.remove("hidden"); state.layer.classList.remove("hidden");
  clickToClose.classList.remove("hidden"); scaleContainerLayer.classList.remove("hidden");
  state.layer.setAttribute("data-context", type); showStatic();
  renderBgList(state.search ? state.search.value : "");
}
function closeBgList() {
  const state = listControllers.bg;
  if (!state) return;
  state.bg.classList.add("hidden"); state.layer.classList.add("hidden");
  state.layer.removeAttribute("data-context");
}
async function selectBg(bg) {
  closeBgList(); closeCharacterList(); closeItemList();
  clickToClose.classList.add("hidden"); scaleContainerLayer.classList.add("hidden"); hideStatic();
  if (window.mutantLoader && typeof window.mutantLoader.setBackgroundByValue === "function") {
    await window.mutantLoader.setBackgroundByValue(bg.value || null);
  }
}
function setupBackgroundControls() {
  const btnNone = document.getElementById("btnNone");
  if (btnNone) btnNone.addEventListener("click", async () => {
    if (!await window.discordIntegration.requireLogin()) return;
    if (window.mutantLoader && typeof window.mutantLoader.setBackgroundByValue === "function") {
      await window.mutantLoader.setBackgroundByValue(null);
    }
  });
  for (const { id, type } of BG_BUTTONS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    btn.addEventListener("click", () => openBgList(type));
  }
}

async function updateSkinButton() {
  const icon = document.querySelector("#skinSelect img");
  const span = document.querySelector("#skinSelect span");
  if (!icon || !span) return;
  if (!selectedSkin) {
    icon.src = "images/icons/icon_cancel.png";
    span.setAttribute("data-lang", "none");
    const langsMap = await loadLangsFile();
    span.textContent = langsMap[`none-${currentLang}`] || langsMap["none"] || "";
    return;
  }
  icon.src = selectedSkin.image;
  span.removeAttribute("data-lang");
  span.textContent = selectedSkin.name;
}
async function updateAnimationButton() {
  const icon = document.querySelector("#animationSelect img");
  const span = document.querySelector("#animationSelect span");
  if (!icon || !span) return;
  if (!selectedAnimation) {
    icon.src = "images/icons/icon_cancel.png";
    span.setAttribute("data-lang", "none");
    const langsMap = await loadLangsFile();
    span.textContent = langsMap[`none-${currentLang}`] || langsMap["none"] || "";
    return;
  }
  icon.src = selectedAnimation.image;
  span.removeAttribute("data-lang");
  span.textContent = selectedAnimation.name;
}

function createSkinItem(skin) {
  const item = document.createElement("div");
  item.className = "skin-item";
  item.innerHTML = `<div class="skin"><img class="skin_bg" src="images/ui/skin_background.png"><img class="skin_icon" src="${skin.image}"></div><span class="text">${skin.name}</span>`;
  item.addEventListener("click", () => selectSkin(skin));
  return item;
}
function createAnimationItem(anim) {
  const item = document.createElement("div");
  item.className = "skin-item";
  item.innerHTML = `<div class="skin"><img class="skin_icon" src="${anim.image}"></div><span class="text">${anim.name}</span>`;
  item.addEventListener("click", () => selectAnimation(anim));
  return item;
}
function renderItemList() {
  const state = listControllers.skin;
  if (!state || !itemListMode) return;
  state.container.innerHTML = "";
  const items = itemListMode === "animation" ? allAnimations : allSkins;
  const createFn = itemListMode === "animation" ? createAnimationItem : createSkinItem;
  items.forEach(item => state.container.appendChild(createFn(item)));
  setTimeout(state.updateScrollUI, 50);
}
function openItemList(mode) {
  const state = listControllers.skin;
  if (!state) return;
  const items = mode === "animation" ? allAnimations : allSkins;
  if (items.length <= 1) return;
  itemListMode = mode;
  state.bg.classList.remove("hidden"); state.layer.classList.remove("hidden");
  clickToClose.classList.remove("hidden"); scaleContainerLayer.classList.remove("hidden");
  state.layer.setAttribute("data-context", mode); showStatic();
  renderItemList();
}
function closeItemList() {
  const state = listControllers.skin;
  if (state) {
    state.bg.classList.add("hidden"); state.layer.classList.add("hidden");
    state.layer.removeAttribute("data-context");
  }
  itemListMode = null;
}
async function selectSkin(skin) {
  selectedSkin = skin;
  updateSkinButton();
  closeItemList(); closeCharacterList();
  clickToClose.classList.add("hidden"); scaleContainerLayer.classList.add("hidden"); hideStatic();
  if (window.mutantLoader && typeof window.mutantLoader.setSkin === "function") {
    await window.mutantLoader.setSkin(skin.value || "");
  }
}

async function selectAnimation(anim) {
  selectedAnimation = anim;
  updateAnimationButton();
  closeItemList(); closeCharacterList();
  clickToClose.classList.add("hidden"); scaleContainerLayer.classList.add("hidden"); hideStatic();

  const value = anim.value || "stand";
  const isAttack = ATTACK_PATTERN.test(value);

  window.animationEngine.setAutoRestart(loopEnabled && COMBAT_PATTERN.test(value));
  window.sceneRenderer.setCharMode(isAttack ? "other" : "stand");
  window.animationEngine.setAttackSpeedMultiplier(isAttack ? ATTACK_SPEED_MULTIPLIER : 1);
  window.fxManager.clear();
  window.soundManager.stopAllSounds();

  const hasMutant = !!selectedValues.mutant;
  const hasLoader = window.mutantLoader && typeof window.mutantLoader.setAnimation === "function";

  if (hasMutant && hasLoader) {
    window.mutantLoader.pushLoadingHold();
    window.animationEngine.pause();
    try {
      const fxPromise = (async () => {
        const attacks = await window.fxManager.loadFxForMutant(selectedValues.mutant);
        window.fxManager.setAttacksTable(attacks);
        window.fxManager.setCurrentAnimation(value, attacks);
        await window.fxManager.preloadForCurrentAttack();
      })();
      const standPromise = isAttack
        ? window.mutantLoader.loadStandTreeForMutant(selectedValues.mutant)
        : Promise.resolve(null);
      const [_, , standAssets] = await Promise.all([
        window.mutantLoader.setAnimation(value),
        fxPromise,
        standPromise,
      ]);
      window._standAssets = standAssets;
      window.animationEngine.pause();
      buildSoundSchedule();
      await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
    } finally {
      window.mutantLoader.popLoadingHold();
    }
    fxLastTick = -0.001;
    lastSeenTick = 0;
    window.animationEngine.play();
    updatePlayButtonIcon();
  } else if (hasLoader) {
    window.animationEngine.pause();
    await window.mutantLoader.setAnimation(value);
    window.animationEngine.pause();
    buildSoundSchedule();
    await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
    fxLastTick = -0.001;
    lastSeenTick = 0;
    window.animationEngine.play();
    updatePlayButtonIcon();
  } else if (hasMutant) {
    const attacks = await window.fxManager.loadFxForMutant(selectedValues.mutant);
    window.fxManager.setAttacksTable(attacks);
    window.fxManager.setCurrentAnimation(value, attacks);
    await window.fxManager.preloadForCurrentAttack();
    buildSoundSchedule();
    await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
    fxLastTick = -0.001;
    lastSeenTick = 0;
  }

  buildTransportSchedule();
  applyRivalVisibility(value);
}

function closeAnyList() {
  closeCharacterList(); closeItemList(); closeBgList();
  clickToClose.classList.add("hidden"); scaleContainerLayer.classList.add("hidden"); hideStatic();
}

function updatePlayButtonIcon() {
  const img = btnPlay.querySelector("img");
  if (!img) return;
  const desired = window.animationEngine.isPaused() ? "images/icons/players/player_play.png" : "images/icons/players/player_pause.png";
  if (img.src.indexOf(desired) === -1) img.src = desired;
}
function updateLoopButtonIcon() {
  const img = btnLoop.querySelector("img");
  if (!img) return;
  const desired = loopEnabled ? "images/icons/players/player_loop.png" : "images/icons/players/player_noloop.png";
  if (img.src.indexOf(desired) === -1) img.src = desired;
}
function updateSoundButtonIcon() {
  const img = btnSound.querySelector("img");
  if (!img) return;
  const v = window.soundManager.getSoundVolume();
  const name = v >= 0.99 ? "player_sound_100.png"
             : v >= 0.49 ? "player_sound_50.png"
             : "player_sound_off.png";
  const desired = `images/icons/players/${name}`;
  if (img.src.indexOf(desired) === -1) img.src = desired;
}
function setupSoundControl() {
  btnSound.addEventListener("click", () => {
    window.soundManager.cycleSoundVolume();
    updateSoundButtonIcon();
  });
  updateSoundButtonIcon();
}

function bindHoldButton(button, onPress, repeatMs = 100, initialDelayMs = 300) {
  let initialTimeout = null;
  let repeatInterval = null;
  let holding = false;
  const start = (e) => {
    if (e) e.preventDefault();
    if (holding) return;
    holding = true;
    onPress();
    initialTimeout = setTimeout(() => { repeatInterval = setInterval(onPress, repeatMs); }, initialDelayMs);
  };
  const stop = () => {
    if (!holding) return;
    holding = false;
    clearTimeout(initialTimeout); clearInterval(repeatInterval);
    initialTimeout = null; repeatInterval = null;
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", stop);
  button.addEventListener("pointerleave", stop);
  button.addEventListener("pointercancel", stop);
  button.addEventListener("contextmenu", (e) => e.preventDefault());
}

function setupLoopControl() {
  btnLoop.addEventListener("click", () => {
    loopEnabled = !loopEnabled;
    window.animationEngine.setStopAtEnd(!loopEnabled);
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    const isCombat = COMBAT_PATTERN.test(anim);
    window.animationEngine.setAutoRestart(loopEnabled && isCombat);
    updateLoopButtonIcon();
  });
  window.animationEngine.setStopAtEnd(!loopEnabled);
  updateLoopButtonIcon();
}

function setupPlaybackControls() {
  btnPlay.addEventListener("click", () => {
    const wasPaused = window.animationEngine.isPaused();
    const info = window.animationEngine.getInfo();

    if (wasPaused) {
      const tick = info.tickPosition || 0;
      if (window.animationEngine.isAtEnd() || tick < 0.5) {
        window.animationEngine.gotoTick(0);
        fxLastTick = 0;
        lastSeenTick = 0;
        momentIdx = {};
        playResumeSoundForTick(0);
      } else {
        fxLastTick = tick;
        lastSeenTick = tick;
        playResumeSoundForTick(tick);
      }
      window.animationEngine.play();
    } else {
      window.animationEngine.pause();
      window.soundManager.stopAllSounds();
    }
    updatePlayButtonIcon();
  });
  bindHoldButton(btnBack, () => {
    if (!window.animationEngine.isPaused()) { window.animationEngine.pause(); updatePlayButtonIcon(); }
    stepTimeline(-1);
  });
  bindHoldButton(btnForward, () => {
    if (!window.animationEngine.isPaused()) { window.animationEngine.pause(); updatePlayButtonIcon(); }
    stepTimeline(1);
  });
  btnStop.addEventListener("click", () => {
    applyTickToAll(0);
    window.animationEngine.pause();
    timelineLastFrame = -1;
    updateTimelineBar();
    updatePlayButtonIcon();
  });
  updatePlayButtonIcon();
}

const selectButtons = [mutantSelect, rivalSelect, skinSelect, animationSelect];
function setSelectButtonsBlocked(blocked) {
  selectButtons.forEach(btn => { if (!btn) return; btn.classList.toggle("selectBlocked", blocked); });
}

function setPlayerButtonEnabled(btn, enabled) {
  if (!btn) return;
  if (enabled) {
    btn.classList.remove("btnPlayerOff");
    btn.classList.add("btn", "btnPlayer");
    btn.disabled = false;
  } else {
    btn.classList.remove("btn", "btnPlayer");
    btn.classList.add("btnPlayerOff");
    btn.disabled = true;
  }
}

function updateSoundButtonState() {
  if (!btnSound) return;
  const playerReady = !btnPlay.disabled;
  const hasSounds = soundSchedule && soundSchedule.length > 0;
  setPlayerButtonEnabled(btnSound, playerReady && hasSounds);
  if (!btnSound.disabled) updateSoundButtonIcon();
}

function enablePlayerButtons() {
  const canvas = document.getElementById("mutantCanvas");
  if (canvas && firstMutantLoaded) canvas.style.cursor = "grab";
  playerButtons.forEach(btn => {
    if (!btn || btn === btnSound) return;
    setPlayerButtonEnabled(btn, true);
  });
  updateSoundButtonState();
}

async function loadAvailableSpeeds() {
  const parsed = await parseCustomTXT("data/options.txt", currentLang);
  availableSpeeds = parsed.filter(p => p.type === "speed");
  const idx = availableSpeeds.findIndex(s => parseFloat(s.value) === 1);
  currentSpeedIndex = idx >= 0 ? idx : 0;
}
function applyCurrentSpeed() {
  if (availableSpeeds.length === 0) return;
  const speed = availableSpeeds[currentSpeedIndex];
  const span = btnSpeed.querySelector("span");
  if (span) span.textContent = speed.name;
  const value = parseFloat(speed.value);
  const factor = Number.isFinite(value) ? value : 1;
  window.animationEngine.setSpeed(factor);
  window.soundManager.setPlaybackRate(factor);
}
function setupSpeedControl() {
  btnSpeed.addEventListener("click", () => {
    if (availableSpeeds.length === 0) return;
    currentSpeedIndex = (currentSpeedIndex + 1) % availableSpeeds.length;
    applyCurrentSpeed();
  });
  applyCurrentSpeed();
}

function getTimelineGeometry() {
  const rect = playerTimeline.getBoundingClientRect();
  const localWidth = playerTimeline.offsetWidth;
  const scale = localWidth > 0 ? rect.width / localWidth : 1;
  const lineStart = playerLine.offsetLeft;
  const lineWidth = playerLine.offsetWidth;
  const barWidth = playerBar.offsetWidth;
  const range = Math.max(1, lineWidth - barWidth);
  return { rect, scale, lineStart, lineWidth, barWidth, range };
}

function updateTimelineBar() {
  const info = window.animationEngine.getInfo();
  if (info.totalFrames <= 0) return;
  const { lineStart, range } = getTimelineGeometry();
  if (timelineDragging) {
    playerBar.style.left = `${lineStart + timelineLastFrame * range}px`;
    return;
  }
  const dur = info.tickDuration || 1;
  const pos = info.tickPosition || 0;
  const ratio = Math.max(0, Math.min(1, pos / dur));
  if (Math.abs(ratio - timelineLastFrame) < 0.0001) return;
  timelineLastFrame = ratio;
  playerBar.style.left = `${lineStart + ratio * range}px`;
}

function updateMomentIdxForTick(targetTick) {
  if (!transportSchedule || !transportSchedule.moments) return;
  for (const name of Object.keys(transportSchedule.moments)) {
    const list = transportSchedule.moments[name];
    let idx = 0;
    while (idx < list.length && list[idx] <= targetTick) idx++;
    momentIdx[name] = idx;
  }
}
function rebuildFxForTick(targetTick) {
  window.fxManager.clear();
  if (!transportSchedule || !transportSchedule.moments) return;
  const events = [];
  for (const name of Object.keys(transportSchedule.moments)) {
    for (const tk of transportSchedule.moments[name]) {
      if (tk <= targetTick) events.push({ name, tick: tk });
    }
  }
  if (events.length === 0) return;
  events.sort((a, b) => a.tick - b.tick);
  let prevTick = 0;
  for (const ev of events) {
    if (ev.tick > prevTick) { window.fxManager.advanceTicks(ev.tick - prevTick); prevTick = ev.tick; }
    window.fxManager.onLabelMoment(ev.name);
  }
  if (targetTick > prevTick) window.fxManager.advanceTicks(targetTick - prevTick);
}
function restoreRivalHitForTick(targetTick) {
  const impactTicks = transportSchedule && transportSchedule.moments && transportSchedule.moments.impact;
  if (!impactTicks || impactTicks.length === 0 || !currentRivalAssets || !currentRivalAssets.hit) {
    if (rivalHitPlaying) { restoreRivalStand(); rivalHitPlaying = false; }
    return;
  }
  let lastImpact = -1;
  for (const tk of impactTicks) { if (tk <= targetTick) lastImpact = tk; else break; }
  if (lastImpact < 0) {
    if (rivalHitPlaying) { restoreRivalStand(); rivalHitPlaying = false; }
    return;
  }
  const hitDuration = rivalHitDurationTicks || window.animationEngine.getTreeTickDuration(currentRivalAssets.hit.tree);
  const elapsed = targetTick - lastImpact;
  if (elapsed < hitDuration) {
    const hitTree = currentRivalAssets.hit.tree;
    window.animationEngine.setRivalSpritesheet(currentRivalAssets.hit.img);
    window.animationEngine.setRivalTree(hitTree);
    const savedSpeed = window.animationEngine.getInfo().speed;
    window.animationEngine.setSpeed(1);
    window.animationEngine.spriteUpdate(hitTree, elapsed / 30);
    window.animationEngine.setSpeed(savedSpeed);
    rivalHitPlaying = true;
    rivalHitTicksElapsed = elapsed;
    rivalHitDurationTicks = hitDuration;
  } else if (rivalHitPlaying) {
    restoreRivalStand();
    rivalHitPlaying = false;
  }
}

function applyTickToAll(targetTick, opts = {}) {
  const { silent = false } = opts;
  const prevTick = fxLastTick;
  window.animationEngine.gotoTick(targetTick);
  rebuildFxForTick(targetTick);
  updateMomentIdxForTick(targetTick);
  restoreRivalHitForTick(targetTick);
  window.soundManager.stopAllSounds();
  if (!silent) checkSoundCrossings(prevTick, targetTick, null);
  fxLastTick = targetTick;
  lastSeenTick = targetTick;
  lastAnimationTime = window.animationEngine.getTime();
  updateTransport();
}

function stepTimeline(direction) {
  const info = window.animationEngine.getInfo();
  const dur = info.tickDuration || 1;
  if (dur <= 0) return;
  const stepTicks = Math.max(1, Math.round(dur / 100));
  const current = info.tickPosition || 0;
  let target = current + direction * stepTicks;
  if (target < 0) target += dur;
  if (target >= dur) target -= dur;
  target = Math.max(0, Math.min(dur - 1, target));
  applyTickToAll(target);
  timelineLastFrame = -1;
  updateTimelineBar();
}

function playResumeSoundForTick(targetTick) {
  if (!soundSchedule || soundSchedule.length === 0) return;
  let best = null;
  for (const s of soundSchedule) {
    if (s.tick <= targetTick) {
      if (!best || s.tick > best.tick) best = s;
    }
  }
  if (!best) return;
  const animValue = selectedAnimation ? (selectedAnimation.value || "") : "";
  const isAttack = ATTACK_PATTERN.test(animValue);
  const mult = isAttack ? ATTACK_SPEED_MULTIPLIER : 1;
  const elapsedTicks = targetTick - best.tick;
  const offsetSeconds = elapsedTicks / (30 * mult);
  const buffer = window.soundManager.getSoundBuffer(best.name);
  if (!buffer) return;
  if (offsetSeconds >= buffer.duration) return;
  window.soundManager.playSoundAtOffset(best.name, offsetSeconds);
}

function computeSoundTailEndTick() {
  if (!soundSchedule || soundSchedule.length === 0) return 0;
  let maxEnd = 0;
  for (const s of soundSchedule) {
    const buf = window.soundManager.getSoundBuffer(s.name);
    const dur = buf ? buf.duration : 2;
    const end = s.tick + dur * 30 * ATTACK_SPEED_MULTIPLIER;
    if (end > maxEnd) maxEnd = end;
  }
  return maxEnd;
}

function seekTimeline(clientX) {
  const info = window.animationEngine.getInfo();
  const dur = info.tickDuration || 1;
  if (info.totalFrames <= 0 || dur <= 0) return;
  const { rect, scale, lineStart, barWidth, range } = getTimelineGeometry();
  const localX = (clientX - rect.left) / scale;
  const relative = localX - lineStart - barWidth / 2;
  const ratio = Math.max(0, Math.min(1, relative / range));
  const target = Math.round(ratio * (dur - 1));
  applyTickToAll(target, { silent: true });
  timelineLastFrame = ratio;
  playerBar.style.left = `${lineStart + ratio * range}px`;
}

function startTimelineDrag(clientX) {
  timelineDragging = true;
  timelineDraggingPaused = window.animationEngine.isPaused();
  window.animationEngine.pause();
  window.soundManager.stopAllSounds();
  updatePlayButtonIcon();
  playerTimeline.classList.add("dragging");
  seekTimeline(clientX);
}

function endTimelineDrag() {
  if (!timelineDragging) return;
  timelineDragging = false;
  playerTimeline.classList.remove("dragging");
  timelineLastFrame = -1;
  updateTimelineBar();

  const tick = window.animationEngine.getInfo().tickPosition || 0;

  if (!timelineDraggingPaused) {
    window.soundManager.stopAllSounds();
    playResumeSoundForTick(tick);
    window.animationEngine.play();
    fxLastTick = tick;
    lastSeenTick = tick;
    updatePlayButtonIcon();
  } else {
    fxLastTick = tick;
    lastSeenTick = tick;
  }
}

function setupTimeline() {
  playerTimeline.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    startTimelineDrag(e.clientX);
  });

  window.addEventListener("pointermove", (e) => {
    if (timelineDragging) seekTimeline(e.clientX);
  });

  window.addEventListener("pointerup", () => {
    if (timelineDragging) endTimelineDrag();
  });

  window.addEventListener("pointercancel", () => {
    if (timelineDragging) endTimelineDrag();
  });

  const timelineLoop = () => {
    timelineRafId = requestAnimationFrame(timelineLoop);
    updateTimelineBar();
    updatePlayButtonIcon();
    updateTransport();
    updateRivalHitProgress();

    const info = window.animationEngine.getInfo();
    const tick = info.tickPosition || 0;
    const dur = info.tickDuration || 1;

    if (info.paused) {
      fxLastTick = tick;
      return;
    }

    const prevTick = fxLastTick;
    const delta = tick - prevTick;

    if (delta > 0.0001 && delta < 15) {
      window.fxManager.advanceTicks(delta);
      checkMomentTicks();
      checkSoundCrossings(prevTick, tick, 15);
      fxLastTick = tick;
      return;
    }

    if (Math.abs(delta) < 0.0001) return;

    const isLoop = prevTick > tick && prevTick >= dur - 5;
    rebuildFxForTick(tick);
    updateMomentIdxForTick(tick);

    if (isLoop) {
      window.soundManager.stopAllSounds();
      checkSoundCrossings(-0.001, tick, null);
    } else {
      checkSoundCrossings(prevTick, tick, null);
    }

    fxLastTick = tick;
    lastSeenTick = tick;
  };
  timelineLoop();
}

function animTickAtFrame(animTree, frameIndex) {
  if (!animTree || !animTree.frames) return 0;
  const n = Math.max(0, Math.min(frameIndex, animTree.frames.length - 1));
  const fr = Math.max(1, animTree.framerate || 1);
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const d = (animTree.frames[i] && animTree.frames[i].delay) || 0;
    acc += fr + d;
  }
  return acc;
}
function collectLabelEntryTicks(animTree, labelName) {
  if (!animTree || !animTree.frames) return [];
  const ticks = [];
  const fr = Math.max(1, animTree.framerate || 1);
  let acc = 0;
  let prevHad = false;
  for (let i = 0; i < animTree.frames.length; i++) {
    const fd = animTree.frames[i];
    let has = false;
    if (fd && fd.tags) {
      for (const tag of fd.tags) {
        if (tag.key === "label" && tag.value === labelName) { has = true; break; }
      }
    }
    if (has && !prevHad) ticks.push(acc);
    prevHad = has;
    acc += fr + ((fd && fd.delay) || 0);
  }
  return ticks;
}

function buildTransportSchedule() {
  const engine = window.animationEngine;
  const scene = window.sceneRenderer;
  const info = engine.getInfo();
  const total = info.totalFrames;
  lastSeenTick = 0;
  momentIdx = {};
  fxLastTick = -0.001;
  restoreRivalStand();
  window.fxManager.clear();
  window.soundManager.stopAllSounds();
  engine.clearAttackTail();
  if (total <= 0) { transportSchedule = null; return; }
  const animValue = selectedAnimation ? (selectedAnimation.value || "") : "";
  if (!ATTACK_PATTERN.test(animValue)) { transportSchedule = null; return; }
  const animTree = engine.getTree();
  if (!animTree) { transportSchedule = null; return; }

  const labels = engine.scanAnimationLabels();
  const moments = {};
  for (const labelName of Object.keys(labels)) {
    const ticks = collectLabelEntryTicks(animTree, labelName);
    if (ticks.length > 0) moments[labelName] = ticks;
  }
  for (const k of Object.keys(moments)) momentIdx[k] = 0;

  let targetDeltaX = 0;
  let hasArrivalPhase = false;
  let hasReturnPhase = false;
  let startTick = 0, arrivedTick = 0, returnTick = 0, backTick = 0;
  const allDps = engine.getDataPoints();
  const dp = allDps.length > 0 ? allDps[0] : null;
  const hasArrived = labels.arrived !== undefined;
  const hasReturn = labels.return !== undefined;
  if (dp && (hasArrived || hasReturn)) {
    hasArrivalPhase = hasArrived;
    hasReturnPhase = hasReturn;
    const startFrame = labels.start !== undefined ? labels.start : 0;
    const arrivedFrame = labels.arrived !== undefined ? labels.arrived : (total - 1);
    const returnFrame = labels.return !== undefined ? labels.return : (total - 1);
    const backFrame = labels.back !== undefined ? labels.back : (total - 1);
    startTick = animTickAtFrame(animTree, startFrame);
    arrivedTick = animTickAtFrame(animTree, arrivedFrame);
    returnTick = animTickAtFrame(animTree, returnFrame);
    backTick = animTickAtFrame(animTree, backFrame);
    const selfCfg = scene.getCharConfig("other");
    const rivalCfg = scene.getRivalTransform();
    const dx = rivalCfg.x - selfCfg.x;
    const scale = scene.getCharacterScale("other");
    targetDeltaX = dx - (scale * dp.x);
  }
  transportSchedule = { startTick, arrivedTick, returnTick, backTick, moments, targetDeltaX, hasArrivalPhase, hasReturnPhase };

  const attackEnd = info.tickDuration;
  const fxEnd = window.fxManager.computeTailEndTick(moments);
  const soundEnd = computeSoundTailEndTick();
  const tailEnd = Math.max(attackEnd, fxEnd, soundEnd);
  if (tailEnd > attackEnd && window._standAssets) {
    engine.setAttackTail(tailEnd, window._standAssets.tree, window._standAssets.image, attackEnd);
  }
}

function buildSoundSchedule() {
  soundSchedule = window.animationEngine.scanAnimationSounds() || [];
  updateSoundButtonState();
}

function updateTransport() {
  if (!transportSchedule) { window.animationEngine.setTransportOffset(0, 0); return; }
  const { startTick, arrivedTick, returnTick, backTick, targetDeltaX, hasArrivalPhase, hasReturnPhase } = transportSchedule;
  const tick = window.animationEngine.getInfo().tickPosition || 0;
  let x = 0;
  if (hasArrivalPhase && hasReturnPhase) {
    if (tick <= startTick) x = 0;
    else if (tick < arrivedTick) x = targetDeltaX * ((tick - startTick) / (arrivedTick - startTick));
    else if (tick < returnTick) x = targetDeltaX;
    else if (tick < backTick) x = targetDeltaX * (1 - (tick - returnTick) / (backTick - returnTick));
    else x = 0;
  } else if (hasArrivalPhase) {
    if (tick <= startTick) x = 0;
    else if (tick < arrivedTick) x = targetDeltaX * ((tick - startTick) / (arrivedTick - startTick));
    else x = targetDeltaX;
  } else if (hasReturnPhase) {
    if (tick < returnTick) x = targetDeltaX;
    else if (tick < backTick) x = targetDeltaX * (1 - (tick - returnTick) / (backTick - returnTick));
    else x = 0;
  }
  window.animationEngine.setTransportOffset(x, 0);
}

function triggerRivalHit() {
  if (!currentRivalAssets || !currentRivalAssets.hit) return;
  const engine = window.animationEngine;
  engine.setRivalSpritesheet(currentRivalAssets.hit.img);
  engine.setRivalTree(currentRivalAssets.hit.tree);
  rivalHitPlaying = true;
  rivalHitTicksElapsed = 0;
  rivalHitDurationTicks = engine.getTreeTickDuration(currentRivalAssets.hit.tree);
}
function checkMomentTicks() {
  if (!transportSchedule || !transportSchedule.moments) return;
  const tick = window.animationEngine.getInfo().tickPosition || 0;
  if (tick < lastSeenTick) for (const k of Object.keys(momentIdx)) momentIdx[k] = 0;
  lastSeenTick = tick;
  for (const name of Object.keys(transportSchedule.moments)) {
    const list = transportSchedule.moments[name];
    let idx = momentIdx[name] || 0;
    while (idx < list.length && tick >= list[idx]) {
      if (name === "impact" && currentRivalAssets && currentRivalAssets.hit) triggerRivalHit();
      window.fxManager.onLabelMoment(name);
      idx++;
    }
    momentIdx[name] = idx;
  }
}

async function loadOptions() {
  const parsed = await parseCustomTXT("data/options.txt", currentLang);
  availableLangs = parsed.filter(l => l.type === "langs");
  availableSpeeds = parsed.filter(p => p.type === "speed");
  allBackgrounds = parsed.filter(p => p.type && p.type.startsWith("bg_"));
  const idx = availableSpeeds.findIndex(s => Math.abs(parseFloat(s.value) - 1) < 0.001);
  currentSpeedIndex = idx >= 0 ? idx : 0;
  renderLangMenu();
  updateFlagLang();
}

function checkSoundCrossings(prevTick, currTick, maxDelta = 5) {
  if (!soundSchedule || soundSchedule.length === 0) return;
  const delta = currTick - prevTick;
  if (delta <= 0.0001) return;
  if (maxDelta !== null && delta > maxDelta) return;
  for (const s of soundSchedule) {
    if (s.tick > prevTick && s.tick <= currTick) {
      window.soundManager.playSound(s.name);
    }
  }
}

function updateRivalHitProgress() {
  const engine = window.animationEngine;
  const current = engine.getTime();
  const delta = current - lastAnimationTime;
  lastAnimationTime = current;
  if (!rivalHitPlaying) return;
  if (delta <= 0) return;
  rivalHitTicksElapsed += delta;
  if (rivalHitTicksElapsed >= rivalHitDurationTicks) {
    rivalHitPlaying = false;
    if (currentRivalAssets && currentRivalAssets.stand) {
      engine.setRivalSpritesheet(currentRivalAssets.stand.img);
      engine.setRivalTree(currentRivalAssets.stand.tree);
    }
  }
}

function disableAncestorTransforms() {
  savedAncestorStyles = [];
  const wrapper = document.getElementById("canvasWrapper");
  if (!wrapper) return;
  let el = wrapper.parentElement;
  while (el && el !== document.documentElement) {
    const computed = getComputedStyle(el).transform;
    if (computed && computed !== "none") {
      savedAncestorStyles.push({ el, transform: el.style.transform, left: el.style.left, top: el.style.top });
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
  const desired = document.fullscreenElement ? "images/icons/players/player_minimised.png" : "images/icons/players/player_fullscreen.png";
  if (img.src.indexOf(desired) === -1) img.src = desired;
}
function setupFullscreen() {
  btnFullscreen.addEventListener("click", async () => {
    const wrapper = document.getElementById("canvasWrapper");
    if (!wrapper) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await wrapper.requestFullscreen();
    } catch (_) {}
  });
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) {
      disableAncestorTransforms(); updateFullscreenLayout();
      requestAnimationFrame(updateFullscreenLayout);
    } else {
      clearFullscreenLayout(); restoreAncestorTransforms();
      if (typeof scaleSite === "function") scaleSite();
      if (typeof scaleCover === "function") scaleCover();
      requestAnimationFrame(() => {
        if (typeof scaleSite === "function") scaleSite();
        if (typeof scaleCover === "function") scaleCover();
      });
    }
    updateFullscreenIcon();
    updateTimelineBar();
  });
  window.addEventListener("resize", () => { if (document.fullscreenElement) updateFullscreenLayout(); });
  updateFullscreenIcon();
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
    cameraDragLastX = e.clientX; cameraDragLastY = e.clientY;
    canvas.style.cursor = "grabbing"; e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    if (!cameraDragging) return;
    const dx = e.clientX - cameraDragLastX;
    const dy = e.clientY - cameraDragLastY;
    cameraDragLastX = e.clientX; cameraDragLastY = e.clientY;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
    const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
    window.sceneRenderer.panCamera(dx * scaleX, dy * scaleY);
  });
  window.addEventListener("pointerup", () => {
    if (!cameraDragging) return;
    cameraDragging = false; canvas.style.cursor = "grab";
  });
  window.addEventListener("pointercancel", () => {
    if (!cameraDragging) return;
    cameraDragging = false; canvas.style.cursor = "grab";
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
  loadWatermark(); loadMidWatermark();
  btnScreenshot.addEventListener("click", async () => {
    if (!selectedValues.mutant) return;
    let filename = "screenshot";
    const found = allMutants.find(m => m.value === selectedValues.mutant);
    filename = (found && found.name) ? found.name : selectedValues.mutant;
    filename = filename.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
    try {
      const out = document.createElement("canvas");
      out.width = canvas.width; out.height = canvas.height;
      const octx = out.getContext("2d");
      const session = await window.discordIntegration.getSession();
      const showMidLayer = !session;
      if (showMidLayer) { window.sceneRenderer.setIncludeMidLayer(true); window.sceneRenderer.renderAll(); }
      octx.drawImage(canvas, 0, 0);
      if (showMidLayer) { window.sceneRenderer.setIncludeMidLayer(false); window.sceneRenderer.renderAll(); }
      if (watermarkEnabled) {
        const logo = watermarkImage || await loadWatermark();
        if (logo && logo.complete && logo.naturalWidth > 0) {
          const targetW = Math.round(out.width * 0.2);
          const targetH = Math.round(logo.naturalHeight * (targetW / logo.naturalWidth));
          const margin = Math.round(out.width * 0.02);
          octx.drawImage(logo, out.width - targetW - margin, out.height - targetH - margin, targetW, targetH);
        }
      }
      const dataUrl = out.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = dataUrl; link.download = `${filename}.png`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (_) {}
  });
}

function setupGeneFilters() {
  document.querySelectorAll(".geneFilter").forEach(group => {
    const groupKey = group.id.replace("Filter", "");
    group.querySelectorAll(".btnGene").forEach(btn => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".btnGene").forEach(b => { b.classList.remove("active"); b.setAttribute("aria-pressed", "false"); });
        btn.classList.add("active"); btn.setAttribute("aria-pressed", "true");
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
  document.querySelectorAll("#rivalFilter .btnGene").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#rivalFilter .btnGene").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilters.rival = btn.dataset.value;
    });
  });
}

function initEventListeners() {
  setupMainMenu();
  setupInfoPopups();
  setupPlaybackControls();
  setupLoopControl();
  setupSpeedControl();
  setupSoundControl();
  setupTimeline();
  setupFullscreen();
  setupCameraControls();
  setupBackgroundControls();
  setupScreenshot();
  setupDebugControls();
  window.discordIntegration.setupDiscordAuth();
  updateMidWatermark();
  window.discordIntegration.setupUserDropdown();
  btnLang.addEventListener("click", () => toggleLangMenu(true));
  clickToClose.addEventListener("click", () => toggleLangMenu(false));
  setupGeneFilters();
  setupGeneFilterEvents();
  mutantSelect.addEventListener("click", () => openCharacterList("mutant"));
  rivalSelect.addEventListener("click", () => openCharacterList("rival"));
  skinSelect.addEventListener("click", () => openItemList("skin"));
  animationSelect.addEventListener("click", () => openItemList("animation"));
  clickToClose.addEventListener("click", closeAnyList);
  setupListSearch("bg", (q) => {
    let filtered = allBackgrounds.filter(b => b.type === currentBgFilter);
    if (q) filtered = filtered.filter(b => normalizeText(b.name).includes(q));
    return filtered;
  }, createBgItem);
  setupMutantSearch();
  if (window.mutantLoader && typeof window.mutantLoader.subscribeState === "function") {
    window.mutantLoader.subscribeState((loading) => {
      if (loading) canvasLoad.classList.remove("hidden");
      else canvasLoad.classList.add("hidden");
      setSelectButtonsBlocked(loading);
      updatePlayButtonIcon();
      timelineLastFrame = -1;
      updateTimelineBar();
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const t0 = performance.now();
  const tlog = (label) => console.log(`[boot] ${label}: ${(performance.now() - t0).toFixed(0)}ms`);
  playerButtons.forEach(btn => setPlayerButtonEnabled(btn, false));
  window.sceneRenderer.setCameraEnabled(false);
  showLoading();
  try {
    tlog("start");
    await Promise.all([loadOptions(), loadMutants()]);
    tlog("options+mutants");
    await applyLanguage();
    tlog("language");
    await applyDefaultBackground();
    tlog("background");
    createListController("mutant");
    createListController("skin");
    createListController("bg");
    initEventListeners();
    tlog("listeners");
    await setDefaultRival("specimen_a_01");
    tlog("rival");
  } finally {
    hideLoading();
    tlog("hideLoading");
  }
});