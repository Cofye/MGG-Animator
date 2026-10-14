function extractGeneFromSpecimen(specimenCode) {
  const m = String(specimenCode || "").match(/_([A-Fa-f])/);
  return m ? m[1].toUpperCase() : "A";
}

async function loadDeathSplatterFor(gene) {
  const name = `fx_splatter_${gene}`;
  const asset = await window.fxManager.loadSpriteFxAsset(name);
  if (!asset) return null;
  const tree = window.fxManager.cloneTree(asset.tree);
  return { tree, image: asset.img };
}

function getRivalCountForAnimation(animValue) {
  if (!multipleRivalsEnabled) return 1;
  const val = animValue || (selectedAnimation ? (selectedAnimation.value || "") : "");
  if (!ATTACK_PATTERN.test(val)) return 1;
  const m = val.match(/^attack(.+)$/i);
  if (!m) return 1;
  const tagKey = "atk" + m[1].toLowerCase();
  const mutantValue = (selectedValues.mutant || "").toLowerCase();
  if (!mutantValue) return 1;
  const data = mutantAttackData[mutantValue];
  if (!data || !data[tagKey]) return 1;
  return data[tagKey].isAOE ? 3 : 1;
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

async function loadRivalData(mutantValue) {
  allRivalSkins = [];
  if (!mutantValue) return;
  try {
    const parsed = await parseCustomTXT(`data/mutants/${mutantValue}/data.txt?nocache=${Date.now()}`, currentLang);
    allRivalSkins = parsed.filter(p => p.type === "skin");
  } catch { allRivalSkins = []; }
}

function updateStatsButton(mutantValue) {
  if (!btnStats) return;
  if (!mutantValue) { btnStats.classList.add("hidden"); btnStats.setAttribute("href", ""); return; }
  const code = String(mutantValue).replace(/^specimen_/i, "").toUpperCase();
  btnStats.setAttribute("href", `https://m3guide.github.io/statscalc.html#${code}`);
  btnStats.classList.remove("hidden");
}

async function selectCharacter(context, mutant) {
  if (!canViewMutant(mutant.value)) return;
  const icon = document.querySelector(`#${context}Select img`);
  const text = document.querySelector(`#${context}Select span`);
  icon.src = mutant.image;
  text.textContent = mutant.name;
  selectedValues[context] = mutant.value;
  if (context === "mutant") {
    updateStatsButton(mutant.value);
    updateHashForMutant(mutant.value);
  }
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
      const isDeath = DEATH_PATTERN.test(anim);
      const isAttack = ATTACK_PATTERN.test(anim);
      const animToLoad = isDeath ? "stand" : anim;
      window.fxManager.setFxSkin(skin);
      window.animationEngine.setAutoRestart(loopEnabled && (COMBAT_PATTERN.test(anim) || isDeath));
      window.sceneRenderer.setCharMode(isAttack ? "other" : "stand");
      window.animationEngine.setAttackSpeedMultiplier(isAttack ? ATTACK_SPEED_MULTIPLIER : 1);
      window.fxManager.clear();
      window.soundManager.stopAllSounds();
      window.animationEngine.stopDeath();
      window.mutantLoader.pushLoadingHold();
      window.animationEngine.pause();
      let splatterAssets = null;
      let loaded = false;
      try {
        const fxPromise = (async () => {
          const attacks = await window.fxManager.loadFxForMutant(mutant.value);
          window.fxManager.setAttacksTable(attacks);
          window.fxManager.setCurrentAnimation(animToLoad, attacks);
          if (!isDeath) await window.fxManager.preloadForCurrentAttack();
        })();
        const standPromise = isAttack
          ? window.mutantLoader.loadStandTreeForMutant(mutant.value, skin)
          : Promise.resolve(null);
        const deathSoundPromise = isDeath
          ? window.soundManager.preloadSounds(['mutant_death'])
          : Promise.resolve(null);
        const [loadedResult, , standAssets] = await Promise.all([
          loadMutantImage(mutant.value, animToLoad, skin),
          fxPromise,
          standPromise,
          deathSoundPromise,
        ]);
        loaded = loadedResult;
        window._standAssets = standAssets;
        window.animationEngine.pause();
        buildSoundSchedule();
        await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
        if (isDeath) {
          if (deathShaderReadyPromise) await deathShaderReadyPromise;
          const gene = extractGeneFromSpecimen(mutant.value);
          splatterAssets = await loadDeathSplatterFor(gene);
        }
      } finally {
        window.mutantLoader.popLoadingHold();
      }
      if (!loaded) return;
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
      await buildTransportSchedule();
      applyRivalVisibility(anim);
      if (isDeath) {
        if (splatterAssets) {
          window.animationEngine.setDeathSplatter(splatterAssets.tree, splatterAssets.image);
        }
        window.animationEngine.startDeath(mutant.value);
      }
    }
  } else if (context === "rival") {
    const wasPaused = window.animationEngine.isPaused();
    window.mutantLoader.pushLoadingHold();
    window.animationEngine.pause();
    window.soundManager.stopAllSounds();
    try {
      await loadRivalData(mutant.value);
      const previousSkinValue = selectedRivalSkin ? (selectedRivalSkin.value || null) : null;
      selectedRivalSkin = allRivalSkins.find(s => (s.value || "") === (previousSkinValue || "")) || allRivalSkins[0] || null;
      updateRivalSkinButton();
      await loadRivalStand(mutant.value, selectedRivalSkin ? (selectedRivalSkin.value || "") : "");
    } finally {
      window.mutantLoader.popLoadingHold();
      if (!wasPaused) {
        const tick = window.animationEngine.getInfo().tickPosition || 0;
        playResumeSoundForTick(tick);
        window.animationEngine.play();
      }
    }
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    applyRivalVisibility(anim);
  }
}

function applyRivalVisibility(animValue) {
  const isAttack = ATTACK_PATTERN.test(animValue || "");
  window.animationEngine.setRivalVisible(isAttack && showRivalEnabled && !!currentRivalStandTree);
  const count = getRivalCountForAnimation(animValue);
  if (window.sceneRenderer.getRivalCount() !== count) {
    window.sceneRenderer.setRivalCount(count);
  }
}

async function loadRivalAnimationAssets(mutantValue, animName, skin) {
  const xmlPath = `data/mutants/${mutantValue}/${animName}.xml?nocache=${Date.now()}`;
  const txt = await fetch(xmlPath).then(r => r.text());
  const xml = new DOMParser().parseFromString(txt, "application/xml");
  const spriteEl = xml.querySelector("Sprite");
  if (!spriteEl) throw new Error();
  const bitmap = spriteEl.getAttribute("bitmap") || "";
  const base = bitmap.replace(/\.png$/i, "");
  const skinSuffix = skin ? `_${skin}` : "";
  const url = `data/sprites/${base}${skinSuffix}.png`;
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

async function ensureRivalAssets(mutantValue, skin) {
  if (!mutantValue) return null;
  const key = `${mutantValue}|${skin || ""}`;
  if (rivalAnimationCache.has(key)) return rivalAnimationCache.get(key);
  const [stand, hit] = await Promise.all([
    loadRivalAnimationAssets(mutantValue, "stand", skin),
    loadRivalAnimationAssets(mutantValue, "hit", skin).catch(() => null)
  ]);
  const assets = { stand, hit };
  rivalAnimationCache.set(key, assets);
  return assets;
}

async function loadRivalStand(mutantValue, skin) {
  if (!mutantValue) {
    currentRivalStandTree = null; currentRivalStandImage = null; currentRivalAssets = null;
    rivalHitPlaying = false;
    window.animationEngine.setRivalTree(null);
    window.animationEngine.setRivalVisible(false);
    return;
  }
  const applyAssets = (assets) => {
    currentRivalAssets = assets;
    currentRivalStandTree = assets.stand.tree;
    currentRivalStandImage = assets.stand.img;
    rivalHitPlaying = false;
    window.animationEngine.setRivalSpritesheet(assets.stand.img);
    window.animationEngine.setRivalTree(assets.stand.tree);
    window.animationEngine.precomputeTimeline();
  };
  try {
    const assets = await ensureRivalAssets(mutantValue, skin);
    if (!assets || !assets.stand) throw new Error();
    applyAssets(assets);
  } catch (_) {
    if (skin) {
      try {
        const assets = await ensureRivalAssets(mutantValue, "");
        if (assets && assets.stand) { applyAssets(assets); return; }
      } catch (_) {}
    }
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
  if (!canViewMutant(mutantValue)) return;
  const found = allMutants.find(m => m.value === mutantValue);
  if (!found) return;
  const icon = document.querySelector("#rivalSelect img");
  const text = document.querySelector("#rivalSelect span");
  if (icon) icon.src = found.image;
  if (text) text.textContent = found.name;
  selectedValues.rival = found.value;
  await loadRivalData(found.value);
  selectedRivalSkin = allRivalSkins[0] || null;
  updateRivalSkinButton();
  await loadRivalStand(found.value, selectedRivalSkin ? (selectedRivalSkin.value || "") : "");
  const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
  applyRivalVisibility(anim);
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

async function updateRivalSkinButton() {
  const icon = document.querySelector("#rivalSkinSelect img");
  const span = document.querySelector("#rivalSkinSelect span");
  if (!icon || !span) return;
  if (!selectedRivalSkin) {
    icon.src = "images/icons/icon_cancel.png";
    span.setAttribute("data-lang", "none");
    const langsMap = await loadLangsFile();
    span.textContent = langsMap[`none-${currentLang}`] || langsMap["none"] || "";
    return;
  }
  icon.src = selectedRivalSkin.image;
  span.removeAttribute("data-lang");
  span.textContent = selectedRivalSkin.name;
}

async function selectSkin(skin) {
  selectedSkin = skin;
  updateSkinButton();
  window.fxManager.setFxSkin(skin ? (skin.value || "") : "");
  closeItemList(); closeCharacterList();
  clickToClose.classList.add("hidden");
  scaleContainerLayer.classList.add("hidden");
  hideStatic();
  if (!window.mutantLoader || typeof window.mutantLoader.setSkin !== "function") return;
  const wasPaused = window.animationEngine.isPaused();
  const savedTick = window.animationEngine.getInfo().tickPosition || 0;
  window.mutantLoader.pushLoadingHold();
  window.animationEngine.pause();
  window.soundManager.stopAllSounds();
  updatePlayButtonIcon();
  try {
    await window.mutantLoader.setSkin(skin.value || "");
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    if (ATTACK_PATTERN.test(anim) && selectedValues.mutant) {
      const standAssets = await window.mutantLoader.loadStandTreeForMutant(
        selectedValues.mutant,
        skin.value || ""
      );
      window._standAssets = standAssets;
      if (standAssets) {
        window.animationEngine.updateAttackTailAssets(standAssets.tree, standAssets.image);
      }
    }
  } finally {
    window.mutantLoader.popLoadingHold();
  }
  if (!wasPaused) {
    playResumeSoundForTick(savedTick);
    window.animationEngine.play();
    fxLastTick = savedTick;
    lastSeenTick = savedTick;
  }
  updatePlayButtonIcon();
}

async function selectAnimation(anim) {
  selectedAnimation = anim;
  updateAnimationButton();
  closeItemList(); closeCharacterList();
  clickToClose.classList.add("hidden"); scaleContainerLayer.classList.add("hidden"); hideStatic();
  const value = anim.value || "stand";
  const isDeath = DEATH_PATTERN.test(value);
  const isAttack = ATTACK_PATTERN.test(value);
  const animToLoad = isDeath ? "stand" : value;
  window.animationEngine.setAutoRestart(loopEnabled && (COMBAT_PATTERN.test(value) || isDeath));
  window.sceneRenderer.setCharMode(isAttack ? "other" : "stand");
  window.animationEngine.setAttackSpeedMultiplier(isAttack ? ATTACK_SPEED_MULTIPLIER : 1);
  window.fxManager.clear();
  window.soundManager.stopAllSounds();
  window.animationEngine.stopDeath();
  const hasMutant = !!selectedValues.mutant;
  const hasLoader = window.mutantLoader && typeof window.mutantLoader.setAnimation === "function";
  if (hasMutant && hasLoader) {
    window.mutantLoader.pushLoadingHold();
    window.animationEngine.pause();
    let loaded = false;
    let splatterAssets = null;
    try {
      const fxPromise = (async () => {
        const attacks = await window.fxManager.loadFxForMutant(selectedValues.mutant);
        window.fxManager.setAttacksTable(attacks);
        window.fxManager.setCurrentAnimation(animToLoad, attacks);
        if (!isDeath) await window.fxManager.preloadForCurrentAttack();
      })();
      const standPromise = isAttack
        ? window.mutantLoader.loadStandTreeForMutant(
            selectedValues.mutant,
            window.mutantLoader.getCurrentSkin()
          )
        : Promise.resolve(null);
      const deathSoundPromise = isDeath
        ? window.soundManager.preloadSounds(['mutant_death'])
        : Promise.resolve(null);
      const [loadedResult, , standAssets] = await Promise.all([
        window.mutantLoader.setAnimation(animToLoad),
        fxPromise,
        standPromise,
        deathSoundPromise,
      ]);
      loaded = loadedResult !== false;
      window._standAssets = standAssets;
      window.animationEngine.pause();
      buildSoundSchedule();
      await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
      if (isDeath) {
        if (deathShaderReadyPromise) await deathShaderReadyPromise;
        const gene = extractGeneFromSpecimen(selectedValues.mutant);
        splatterAssets = await loadDeathSplatterFor(gene);
      }
    } finally {
      window.mutantLoader.popLoadingHold();
    }
    if (!loaded) return;
    fxLastTick = -0.001;
    lastSeenTick = 0;
    window.animationEngine.play();
    updatePlayButtonIcon();
    if (isDeath) {
      if (splatterAssets) {
        window.animationEngine.setDeathSplatter(splatterAssets.tree, splatterAssets.image);
      }
      window.animationEngine.startDeath(selectedValues.mutant);
    }
  } else if (hasLoader) {
    window.animationEngine.pause();
    await window.mutantLoader.setAnimation(animToLoad);
    window.animationEngine.pause();
    buildSoundSchedule();
    await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
    fxLastTick = -0.001;
    lastSeenTick = 0;
    window.animationEngine.play();
    updatePlayButtonIcon();
    if (isDeath && selectedValues.mutant) {
      if (deathShaderReadyPromise) await deathShaderReadyPromise;
      const gene = extractGeneFromSpecimen(selectedValues.mutant);
      const splatter = await loadDeathSplatterFor(gene);
      if (splatter) {
        window.animationEngine.setDeathSplatter(splatter.tree, splatter.image);
      }
      window.animationEngine.startDeath(selectedValues.mutant);
    }
  } else if (hasMutant) {
    const attacks = await window.fxManager.loadFxForMutant(selectedValues.mutant);
    window.fxManager.setAttacksTable(attacks);
    window.fxManager.setCurrentAnimation(animToLoad, attacks);
    if (!isDeath) await window.fxManager.preloadForCurrentAttack();
    buildSoundSchedule();
    await window.soundManager.preloadSounds(soundSchedule.map(s => s.name));
    fxLastTick = -0.001;
    lastSeenTick = 0;
    if (isDeath) {
      if (deathShaderReadyPromise) await deathShaderReadyPromise;
      const gene = extractGeneFromSpecimen(selectedValues.mutant);
      const splatter = await loadDeathSplatterFor(gene);
      if (splatter) {
        window.animationEngine.setDeathSplatter(splatter.tree, splatter.image);
      }
      window.animationEngine.startDeath(selectedValues.mutant);
    }
  }
  await buildTransportSchedule();
  applyRivalVisibility(value);
}

async function selectRivalSkin(skin) {
  selectedRivalSkin = skin;
  updateRivalSkinButton();
  closeItemList(); closeCharacterList();
  clickToClose.classList.add("hidden");
  scaleContainerLayer.classList.add("hidden");
  hideStatic();
  if (selectedValues.rival) {
    const wasPaused = window.animationEngine.isPaused();
    window.mutantLoader.pushLoadingHold();
    window.animationEngine.pause();
    window.soundManager.stopAllSounds();
    try {
      await loadRivalStand(selectedValues.rival, skin ? (skin.value || "") : "");
    } finally {
      window.mutantLoader.popLoadingHold();
      if (!wasPaused) {
        const tick = window.animationEngine.getInfo().tickPosition || 0;
        playResumeSoundForTick(tick);
        window.animationEngine.play();
      }
    }
    const anim = selectedAnimation ? (selectedAnimation.value || "stand") : "stand";
    applyRivalVisibility(anim);
  }
}

function getHashMutantValue() {
  const hash = String(window.location.hash || "");
  if (!hash) return null;
  const m = hash.match(/[#&]mutant=([^&]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch (_) {
    return m[1];
  }
}

function updateHashForMutant(mutantValue) {
  if (!mutantValue) return;
  const stripped = String(mutantValue).replace(/^specimen_/i, "");
  const desired = `#mutant=${stripped}`;
  if (window.location.hash === desired) return;
  history.replaceState(null, "", desired);
}

function findMutantByValue(value) {
  if (!value) return null;
  const norm = String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm) return null;
  for (const m of allMutants) {
    const mv = String(m.value || "");
    const stripped = mv.replace(/^specimen_/i, "");
    if (String(stripped).toLowerCase().replace(/[^a-z0-9]/g, "") === norm) return m;
    if (String(mv).toLowerCase().replace(/[^a-z0-9]/g, "") === norm) return m;
  }
  return null;
}

async function applyHashMutant() {
  const value = getHashMutantValue();
  if (!value) return false;
  const mutant = findMutantByValue(value);
  if (!mutant) return false;
  if (!canViewMutant(mutant.value)) return false;
  await selectCharacter("mutant", mutant);
  return true;
}