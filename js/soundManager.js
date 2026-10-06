const soundBufferCache = new Map();
const soundReverseCache = new Map();
let audioCtx = null;
let masterGain = null;
let soundEnabled = true;
let playbackRate = 1;
const activeSources = new Set();
let pausedSnapshot = [];

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
    try {
      const res = await fetch(`data/sounds/${name}.wav`);
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
  const snapshot = Array.from(activeSources);
  activeSources.clear();
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