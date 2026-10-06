const soundBufferCache = new Map();
const soundReverseCache = new Map();
let audioCtx = null;
let masterGain = null;
let soundEnabled = true;
let playbackRate = 1;
const activeSources = new Set();
let pausedSnapshot = [];   // ← sonidos que quedaron en pausa para reanudar

function ensureAudioCtx() {
  if (!audioCtx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.7;
      masterGain.connect(audioCtx.destination);
    } catch (_) {
      audioCtx = null;
      return null;
    }
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

async function loadSound(name) {
  if (!name) return null;
  if (soundBufferCache.has(name)) return soundBufferCache.get(name);

  const promise = (async () => {
    const ctx = ensureAudioCtx();
    if (!ctx) return null;
    const localUrl  = `../data/sounds/${name}.wav`;
    const remoteUrl = `https://s-beta.kobojo.com/mutants/assets/sound_mb/${name}.wav`;
    try {
      const res = await fetch(localUrl);
      if (res.ok) {
        const ab = await res.arrayBuffer();
        return await ctx.decodeAudioData(ab);
      }
    } catch (_) {}
    try {
      const res = await fetch(remoteUrl);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return await ctx.decodeAudioData(ab);
    } catch (_) {
      return null;
    }
  })();

  soundBufferCache.set(name, promise);
  const parsed = await promise;
  soundBufferCache.set(name, parsed);
  return parsed;
}

function getReverseBuffer(name, buffer) {
  if (soundReverseCache.has(name)) return soundReverseCache.get(name);
  const ctx = ensureAudioCtx();
  if (!ctx) return null;
  const rev = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = rev.getChannelData(ch);
    const len = src.length;
    for (let i = 0; i < len; i++) dst[i] = src[len - 1 - i];
  }
  soundReverseCache.set(name, rev);
  return rev;
}

async function preloadSounds(names) {
  const unique = [...new Set((names || []).filter(n => n))];
  await Promise.all(unique.map(n => loadSound(n)));
}

function playBuffer(buffer, reverse, name, offsetSeconds = 0) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const source = ctx.createBufferSource();
  const buf = reverse ? getReverseBuffer(name, buffer) : buffer;
  if (!buf) return;
  source.buffer = buf;
  source.playbackRate.value = playbackRate;
  source.connect(masterGain);
  try {
    source.start(0, offsetSeconds);
    source._soundInfo = {
      name, buffer: buf, reverse,
      startedAt: ctx.currentTime - offsetSeconds / playbackRate,
    };
    activeSources.add(source);
    source.onended = () => activeSources.delete(source);
  } catch (_) {}
}

function playSound(name, reverse = false, offsetSeconds = 0) {
  if (!name) return;
  const cached = soundBufferCache.get(name);
  if (cached instanceof Promise) {
    cached.then(buffer => {
      if (buffer) playBuffer(buffer, reverse, name, offsetSeconds);
    });
    return;
  }
  if (!cached) return;
  playBuffer(cached, reverse, name, offsetSeconds);
}

function playSoundAtOffset(name, offsetSeconds) {
  if (!name) return false;
  const cached = soundBufferCache.get(name);
  if (cached instanceof Promise) {
    cached.then(buffer => {
      if (buffer && offsetSeconds < buffer.duration) {
        playBuffer(buffer, false, name, offsetSeconds);
      }
    });
    return true;
  }
  if (!cached) return false;
  if (offsetSeconds >= cached.duration) return false;
  playBuffer(cached, false, name, offsetSeconds);
  return true;
}

function setSoundEnabled(v) {
  soundEnabled = !!v;
  const ctx = ensureAudioCtx();
  if (ctx && masterGain) {
    masterGain.gain.value = soundEnabled ? 0.7 : 0;
  }
}

function isSoundEnabled() { return soundEnabled; }

function getSoundBuffer(name) {
  const cached = soundBufferCache.get(name);
  if (!cached || cached instanceof Promise) return null;
  return cached;
}

/** Detiene TODO sin guardar nada. Se usa al cambiar de animación/mutante. */
function stopAllSounds() {
  for (const src of activeSources) {
    try { src.stop(); } catch (_) {}
  }
  activeSources.clear();
  pausedSnapshot = [];
}

function pauseAllSounds() {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  pausedSnapshot = [];
  const snapshot = Array.from(activeSources);   // ← copia primero
  activeSources.clear();                        // ← limpia ya
  for (const src of snapshot) {
    const info = src._soundInfo;
    if (info) {
      const elapsed = (ctx.currentTime - info.startedAt) * playbackRate;
      if (elapsed < info.buffer.duration) {
        pausedSnapshot.push({ ...info, offset: elapsed });
      }
    }
    try { src.stop(); } catch (_) {}
  }
}

/** Vuelve a lanzar los sonidos que quedaron pausados, desde su offset. */
function resumeAllSounds() {
  if (!soundEnabled || pausedSnapshot.length === 0) {
    pausedSnapshot = [];
    return;
  }
  const snapshot = pausedSnapshot;
  pausedSnapshot = [];
  for (const s of snapshot) {
    playBuffer(s.buffer, s.reverse, s.name, s.offset);
  }
}

function isSoundEnabled() { return soundEnabled; }

function setPlaybackRate(r) {
  const n = Number(r);
  playbackRate = Number.isFinite(n) && n > 0 ? n : 1;
  for (const src of activeSources) {
    try { src.playbackRate.value = playbackRate; } catch (_) {}
  }
}

function getPlaybackRate() { return playbackRate; }

window.soundManager = {
  loadSound,
  preloadSounds,
  playSound,
  stopAllSounds,
  pauseAllSounds,
  resumeAllSounds,
  setSoundEnabled,
  isSoundEnabled,
  setPlaybackRate,
  getPlaybackRate,
  getSoundBuffer,
  playSoundAtOffset,
};