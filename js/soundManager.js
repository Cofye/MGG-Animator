const soundBufferCache = new Map();
let audioCtx = null;
let masterGain = null;
let soundVolume = 1;
let playbackRate = 1;
const activeSources = new Set();
const MASTER_GAIN = 0.7;

function ensureAudioCtx() {
  if (!audioCtx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = MASTER_GAIN * soundVolume;
      masterGain.connect(audioCtx.destination);
    } catch (_) { audioCtx = null; return null; }
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
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`data/sounds/${name}.wav`, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) return null;
      const ab = await res.arrayBuffer();
      return await ctx.decodeAudioData(ab);
    } catch (_) { return null; }
  })();
  soundBufferCache.set(name, promise);
  const parsed = await promise;
  soundBufferCache.set(name, parsed);
  return parsed;
}

async function preloadSounds(names) {
  const unique = [...new Set((names || []).filter(n => n))];
  if (unique.length === 0) return;
  await Promise.race([
    Promise.all(unique.map(n => loadSound(n))),
    new Promise(r => setTimeout(r, 15000)),
  ]);
}

function playBuffer(buffer, name, offsetSeconds = 0) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  source.connect(masterGain);
  try {
    source.start(0, offsetSeconds);
    source._soundInfo = { name, buffer, startedAt: ctx.currentTime - offsetSeconds / playbackRate };
    activeSources.add(source);
    source.onended = () => activeSources.delete(source);
  } catch (_) {}
}

function playSound(name, offsetSeconds = 0) {
  if (!name) return;
  const cached = soundBufferCache.get(name);
  if (cached instanceof Promise) {
    cached.then(buffer => { if (buffer) playBuffer(buffer, name, offsetSeconds); });
    return;
  }
  if (!cached) return;
  playBuffer(cached, name, offsetSeconds);
}

function playSoundAtOffset(name, offsetSeconds) { playSound(name, offsetSeconds); }

function setSoundVolume(v) {
  const n = Number(v);
  soundVolume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
  const ctx = ensureAudioCtx();
  if (ctx && masterGain) masterGain.gain.value = MASTER_GAIN * soundVolume;
}
function getSoundVolume() { return soundVolume; }

function cycleSoundVolume() {
  if (soundVolume >= 0.99) setSoundVolume(0.5);
  else if (soundVolume >= 0.49) setSoundVolume(0);
  else setSoundVolume(1);
  return soundVolume;
}

function setSoundEnabled(v) { setSoundVolume(v ? 1 : 0); }

function isSoundEnabled() { return soundVolume > 0; }

function getSoundBuffer(name) {
  const cached = soundBufferCache.get(name);
  if (!cached || cached instanceof Promise) return null;
  return cached;
}

function stopAllSounds() {
  for (const src of activeSources) { try { src.stop(); } catch (_) {} }
  activeSources.clear();
}

function pauseAllSounds() { stopAllSounds(); }
function resumeAllSounds() {}

function setPlaybackRate(r) {
  const n = Number(r);
  playbackRate = Number.isFinite(n) && n > 0 ? n : 1;
  for (const src of activeSources) { try { src.playbackRate.value = playbackRate; } catch (_) {} }
}
function getPlaybackRate() { return playbackRate; }

window.soundManager = {
  loadSound, preloadSounds, playSound, stopAllSounds,
  pauseAllSounds, resumeAllSounds,
  setSoundEnabled, isSoundEnabled,
  setSoundVolume, getSoundVolume, cycleSoundVolume,
  setPlaybackRate, getPlaybackRate,
  getSoundBuffer, playSoundAtOffset,
};