function attrInt(el, name, def, min = -Infinity) {
  if (!el || !el.hasAttribute(name)) return def;
  const v = Number(el.getAttribute(name));
  return Number.isFinite(v) ? Math.max(min, Math.trunc(v)) : def;
}

function attrFloat(el, name, def) {
  if (!el || !el.hasAttribute(name)) return def;
  const v = Number(el.getAttribute(name));
  return Number.isFinite(v) ? v : def;
}

function attrBool(el, name, def) {
  if (!el || !el.hasAttribute(name)) return def;
  const v = String(el.getAttribute(name)).trim().toLowerCase();
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return def;
}

function tagValue(el, key) {
  for (const c of el.children) {
    if (c.tagName === "Tag" && c.getAttribute("key") === key) {
      return c.getAttribute("value");
    }
  }
  return null;
}

function parseKeyElement(el) {
  return {
    frame: Math.max(0, attrInt(el, "frame", 0, 0)),
    x: attrFloat(el, "x", 0),
    y: attrFloat(el, "y", 0),
    angle: attrFloat(el, "angle", 0) * Math.PI / 180,
    scaleX: attrFloat(el, "scaleX", 1),
    scaleY: attrFloat(el, "scaleY", 1),
    rMul: attrFloat(el, "rMul", 1),
    gMul: attrFloat(el, "gMul", 1),
    bMul: attrFloat(el, "bMul", 1),
    rAdd: attrFloat(el, "rAdd", 0),
    gAdd: attrFloat(el, "gAdd", 0),
    bAdd: attrFloat(el, "bAdd", 0),
    alpha: attrFloat(el, "alpha", 1),
    visible: attrBool(el, "visible", true)
  };
}

function parseImageElement(el) {
  return {
    srcX: attrFloat(el, "srcX", 0),
    srcY: attrFloat(el, "srcY", 0),
    dstX: attrFloat(el, "dstX", 0),
    dstY: attrFloat(el, "dstY", 0),
    width: Math.max(1, attrFloat(el, "width", 1)),
    height: Math.max(1, attrFloat(el, "height", 1)),
    a: attrFloat(el, "a", 1),
    b: attrFloat(el, "b", 0),
    c: attrFloat(el, "c", 0),
    d: attrFloat(el, "d", 1),
    alpha: attrFloat(el, "alpha", 1),
    visible: attrBool(el, "visible", true)
  };
}

function parseFrameElement(el) {
  const images = [];
  for (const c of el.children) {
    if (c.tagName === "Image") images.push(parseImageElement(c));
  }
  const delay = Math.max(0, attrInt(el, "delay", 0, 0));
  const rep = Math.max(0, attrInt(el, "rep", 0, 0));
  const tags = [];
  for (const c of el.children) {
    if (c.tagName === "Tag") {
      tags.push({ key: c.getAttribute("key"), value: c.getAttribute("value") });
    }
  }
  return { images, delay, rep, tags };
}

function expandFrames(frameNodes) {
  const out = [];
  for (const node of frameNodes) {
    const fd = parseFrameElement(node);
    for (let i = 0; i <= fd.rep; i++) {
      out.push(fd);
    }
  }
  return out;
}

function parseSpriteElement(el, parentTotalFrames) {
  const frameNodes = [];
  for (const c of el.children) if (c.tagName === "Frame") frameNodes.push(c);
  const frames = expandFrames(frameNodes);
  const hasOwnFrames = frames.length > 0;
  const totalFrames = hasOwnFrames ? frames.length : Math.max(1, parentTotalFrames);
  const framerate = attrInt(el, "framerate", 1);
  const minDelay = Math.max(0, attrInt(el, "minDelay", 0, 0));
  const rndDelay = Math.max(0, attrInt(el, "rndDelay", 0, 0));
  const autoLoop = attrBool(el, "autoLoop", false);
  const loopFrame = attrInt(el, "loopFrame", 0);
  const images = [];
  for (const c of el.children) if (c.tagName === "Image") images.push(parseImageElement(c));
  const frameDurations = frames.map(f => framerate + f.delay);
  const cycleDuration = Math.max(1, frameDurations.reduce((a, b) => a + b, 0));
  const children = [];
  for (const c of el.children) {
    if (c.tagName === "Composite") {
      children.push(parseCompositeElement(c, totalFrames, autoLoop));
    } else if (c.tagName === "Sprite") {
      children.push(parseSpriteElement(c, totalFrames));
    }
  }
  const dataPoints = [];
  for (const c of el.children) {
    if (c.tagName === "DataPoint") {
      dataPoints.push({
        name: c.getAttribute("name") || "",
        x: parseFloat(c.getAttribute("x")) || 0,
        y: parseFloat(c.getAttribute("y")) || 0
      });
    }
  }
  return {
    type: "Sprite",
    id: el.getAttribute("id") || null,
    bitmap: el.getAttribute("bitmap") || "",
    framerate,
    minDelay,
    rndDelay,
    autoLoop,
    loopFrame,
    hasOwnFrames,
    totalFrames,
    cycleDuration,
    frames,
    frameDurations,
    images,
    children,
    dataPoints,

    frameAccumulator: 0,
    frameCounter: 0,
    currentFrame: -1,
    delayCounter: 0,
    hasLoopedThisFrame: false,
    loopEnabled: true,
    parentFramePos: 0
  };
}

function parseCompositeElement(el, parentTotalFrames, parentAutoLoop) {
  const keys = [];
  for (const c of el.children) {
    if (c.tagName === "Key") keys.push(parseKeyElement(c));
  }
  keys.sort((a, b) => a.frame - b.frame);
  let innerSprite = null;
  let synch = false;
  for (const c of el.children) {
    if (c.tagName === "Sprite") {
      innerSprite = parseSpriteElement(c, parentTotalFrames);
      if (tagValue(c, "synch") === "parent") synch = true;
      break;
    }
  }
  let hasColorChange = false;
  for (const k of keys) {
    if (k.rMul !== 1 || k.gMul !== 1 || k.bMul !== 1 ||
        k.rAdd !== 0 || k.gAdd !== 0 || k.bAdd !== 0) {
      hasColorChange = true;
      break;
    }
  }
  const needsUpdate = keys.length >= 2 || (keys.length === 1 && keys[0].frame > 0);
  return {
    type: "Composite",
    keys,
    innerSprite,
    totalFrames: parentTotalFrames,
    synch,
    hasColorChange,
    autoLoop: !!parentAutoLoop,
    needsUpdate,
    firstKeyFrame: keys.length ? keys[0].frame : 0,
    x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1,
    colorMul: { r: 1, g: 1, b: 1 },
    colorAdd: { r: 0, g: 0, b: 0 },
    alpha: 1,
    visible: true,
    prevKey: null,
    nextKey: null,
    cachedFrame: -1
  };
}

window.xmlParser = {
  parseSpriteElement,
  parseCompositeElement,
  parseFrameElement,
  parseImageElement,
  parseKeyElement
};