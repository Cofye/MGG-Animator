function smoothScroll(element, target, duration) {
  const start = element.scrollTop;
  const distance = target - start;
  const startTime = performance.now();
  function animate(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    element.scrollTop = start + distance * ease;
    for (const c of Object.values(listControllers)) {
      if (c.container === element) { c.updateScrollUI(); break; }
    }
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

function mutantListLayerContext() {
  return listControllers.mutant?.layer.getAttribute("data-context") || "mutant";
}

function renderCharacterList(context = "mutant", searchQuery = "") {
  const state = listControllers.mutant;
  if (!state) return;
  state.container.innerHTML = "";
  const filter = currentFilters[context];
  let filtered = allMutants.filter(m => m.type === filter || filter === "default_");
  filtered = filtered.filter(m => canViewMutant(m.value));
  filtered = filterByQuery(filtered, searchQuery, m => m.name);
  const fragment = document.createDocumentFragment();
  filtered.forEach(mutant => {
    const item = document.createElement("div");
    item.className = "mutant-item";
    item.innerHTML = `
    <div class="mutant">
      <img class="mutant_bg" src="images/ui/mutant_background.png">
      <img class="mutant_icon" src="${mutant.image}">
    </div>
    ${accessRules.newMutants.has(normalizeAccessKey(mutant.value)) ? '<img class="tag" src="images/ui/tag_new.png">' : ""}
    <span class="text">${mutant.name}</span>
    `;
    item.addEventListener("click", () => selectCharacter(context, mutant));
    fragment.appendChild(item);
  });
  state.container.appendChild(fragment);
  setTimeout(state.updateScrollUI, 50);
}

function setupMutantSearch() {
  const state = listControllers.mutant;
  if (!state || !state.search) return;
  const btnDeleteImg = btnDelete ? btnDelete.querySelector("img") : null;
  const updateSearchIcon = () => {
    if (!btnDeleteImg) return;
    const hasText = state.search.value.length > 0;
    const desired = hasText ? "images/ui/icons/icon_delete.png" : "images/ui/icons/icon_search.png";
    if (btnDeleteImg.src.indexOf(desired) === -1) btnDeleteImg.src = desired;
  };
  state.search.addEventListener("input", () => {
    renderCharacterList(mutantListLayerContext(), state.search.value);
    state.updateScrollUI();
    updateSearchIcon();
  });
  if (btnDelete) {
    btnDelete.addEventListener("click", () => {
      if (state.search.value.length === 0) return;
      state.search.value = "";
      renderCharacterList(mutantListLayerContext(), "");
      state.updateScrollUI();
      updateSearchIcon();
      state.search.focus();
    });
  }
  updateSearchIcon();
}

function openCharacterList(context) {
  const state = listControllers.mutant;
  if (!state) return;
  preloadThumbnails();
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

function createBgItem(bg) {
  const item = document.createElement("div");
  item.className = "bg-item";
  item.innerHTML = `
    <div class="bg">
      <img class="bg_icon" src="${bg.image}">
    </div>
    ${accessRules.newBackgrounds.has(normalizeAccessKey(bg.value)) ? '<img class="tag" src="images/ui/tag_new.png">' : ""}
    <span class="text">${bg.name}</span>
    `;
  item.addEventListener("click", () => selectBg(bg));
  return item;
}

function renderBgList(query = "") {
  const state = listControllers.bg;
  if (!state) return;
  state.container.innerHTML = "";
  let filtered = allBackgrounds.filter(b => b.type === currentBgFilter);
  filtered = filtered.filter(b => canViewBackground(b.value));
  filtered = filterByQuery(filtered, query, b => b.name);
  const fragment = document.createDocumentFragment();
  filtered.forEach(bg => fragment.appendChild(createBgItem(bg)));
  state.container.appendChild(fragment);
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

function createSkinItem(skin) {
  const item = document.createElement("div");
  item.className = "skin-item";
  const skinKey = normalizeAccessKey(`${selectedValues.mutant}_${skin.value || ""}`);
  item.innerHTML = `
    <div class="skin">
      <img class="skin_bg" src="images/ui/skin_background.png">
      <img class="skin_icon" src="${skin.image}">
    </div>
    ${accessRules.newSkins.has(skinKey) ? '<img class="tag" src="images/ui/tag_skin.png">' : ""}
    <span class="text">${skin.name}</span>`;
  item.addEventListener("click", () => selectSkin(skin));
  return item;
}

function createRivalSkinItem(skin) {
  const item = document.createElement("div");
  item.className = "skin-item";
  const skinKey = normalizeAccessKey(`${selectedValues.rival}_${skin.value || ""}`);
  item.innerHTML = `
    <div class="skin">
      <img class="skin_bg" src="images/ui/skin_background.png">
      <img class="skin_icon" src="${skin.image}">
    </div>
    ${accessRules.newSkins.has(skinKey) ? '<img class="tag" src="images/ui/tag_skin.png">' : ""}
    <span class="text">${skin.name}</span>
    `;
  item.addEventListener("click", () => selectRivalSkin(skin));
  return item;
}

function createAnimationItem(anim) {
  const item = document.createElement("div");
  item.className = "skin-item";
  item.innerHTML = `
    <div class="skin">
      <img class="skin_bg" src="images/ui/animation_background.png">
      <img class="skin_icon" src="${anim.image}">
    </div>
    <span class="text">${anim.name}</span>
    `;
  item.addEventListener("click", () => selectAnimation(anim));
  return item;
}

function renderItemList() {
  const state = listControllers.skin;
  if (!state || !itemListMode) return;
  state.container.innerHTML = "";
  let items;
  let createFn;
  if (itemListMode === "animation") {
    items = allAnimations;
    createFn = createAnimationItem;
  } else if (itemListMode === "rivalSkin") {
    items = allRivalSkins.filter(s => canViewSkin(selectedValues.rival, s.value || ""));
    createFn = createRivalSkinItem;
  } else {
    items = allSkins.filter(s => canViewSkin(selectedValues.mutant, s.value || ""));
    createFn = createSkinItem;
  }
  const fragment = document.createDocumentFragment();
  items.forEach(item => fragment.appendChild(createFn(item)));
  state.container.appendChild(fragment);
  setTimeout(state.updateScrollUI, 50);
}

function openItemList(mode) {
  const state = listControllers.skin;
  if (!state) return;
  const items = mode === "animation" ? allAnimations
              : mode === "rivalSkin" ? allRivalSkins
              : allSkins;
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

function closeAnyList() {
  closeCharacterList(); closeItemList(); closeBgList();
  clickToClose.classList.add("hidden"); scaleContainerLayer.classList.add("hidden"); hideStatic();
}

function preloadThumbnails() {
  if (thumbnailQueueRunning) return;
  const pending = allMutants
    .map(m => m.image)
    .filter(url => url && !preloadedThumbnails.has(url));
  if (pending.length === 0) return;
  thumbnailQueueRunning = true;
  let index = 0;
  let active = 0;
  const next = () => {
    while (active < THUMBNAIL_CONCURRENCY && index < pending.length) {
      const url = pending[index++];
      if (preloadedThumbnails.has(url)) continue;
      preloadedThumbnails.add(url);
      active++;
      const img = new Image();
      img.decoding = "async";
      const done = () => {
        active--;
        if (index >= pending.length && active === 0) {
          thumbnailQueueRunning = false;
        } else {
          next();
        }
      };
      img.onload = done;
      img.onerror = done;
      img.src = url;
    }
  };
  next();
}

function setSelectButtonsBlocked(blocked) {
  const selectButtons = [mutantSelect, rivalSelect, skinSelect, animationSelect, rivalSkinSelect];
  selectButtons.forEach(btn => { if (!btn) return; btn.classList.toggle("selectBlocked", blocked); });
}