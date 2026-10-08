const SUPABASE_URL = 'https://lgdhantafmbmzwfgfzdi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxnZGhhbnRhZm1ibXp3ZmdmemRpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEwOTg4NjUsImV4cCI6MjEwNjY3NDg2NX0.B0YgR9SLNSdk7bECi28XyDK-9KzdzGTdAGkoHcUwkS8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const DISCORD_INVITE_URL = 'https://discord.gg/manuelleweyt-691138101367668736';
const DISCORD_GUILD_ID = '691138101367668736';
const GUILD_CACHE_KEY = 'discordGuildVerified';

let discordGuildsCache = null;
let checkSessionRunning = false;

async function getSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session && session.user ? session : null;
}

async function fetchDiscordGuilds(accessToken) {
  if (!accessToken) return [];
  try {
    const res = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (res.status === 429) {
      const retry = parseFloat(res.headers.get('Retry-After') || '5');
      await new Promise(r => setTimeout(r, retry * 1000));
      return [];
    }
    if (!res.ok) return [];
    return await res.json();
  } catch (_) {
    return [];
  }
}

function isInGuild(guilds) {
  if (!guilds || !DISCORD_GUILD_ID) return false;
  const target = String(DISCORD_GUILD_ID).trim();
  return guilds.some(g => String(g.id).trim() === target);
}

function openExclusiveLayer() {
  const scaleContainerLayer = document.getElementById("scale-container-layer");
  const exclusiveLayer = document.getElementById("exclusiveLayer");
  if (scaleContainerLayer) scaleContainerLayer.classList.remove("hidden");
  if (exclusiveLayer) exclusiveLayer.classList.remove("hidden");
  if (typeof showStatic === "function") showStatic();
}

function closeExclusiveLayer() {
  const scaleContainerLayer = document.getElementById("scale-container-layer");
  const exclusiveLayer = document.getElementById("exclusiveLayer");
  if (exclusiveLayer) exclusiveLayer.classList.add("hidden");
  if (scaleContainerLayer) scaleContainerLayer.classList.add("hidden");
  if (typeof hideStatic === "function") hideStatic();
}

function openJoinLayer() {
  const scaleContainerLayer = document.getElementById("scale-container-layer");
  const joinLayer = document.getElementById("joinLayer");
  if (scaleContainerLayer) scaleContainerLayer.classList.remove("hidden");
  if (joinLayer) joinLayer.classList.remove("hidden");
  if (typeof showStatic === "function") showStatic();
}

function closeJoinLayer() {
  const scaleContainerLayer = document.getElementById("scale-container-layer");
  const joinLayer = document.getElementById("joinLayer");
  if (joinLayer) joinLayer.classList.add("hidden");
  if (scaleContainerLayer) scaleContainerLayer.classList.add("hidden");
  if (typeof hideStatic === "function") hideStatic();
}

async function requireLogin() {
  const session = await getSession();
  if (!session) {
    openExclusiveLayer();
    return false;
  }
  return true;
}

async function requireGuildMembership() {
  const session = await getSession();
  if (!session) {
    openExclusiveLayer();
    return false;
  }
  if (localStorage.getItem(GUILD_CACHE_KEY) === 'true') return true;
  if (session.provider_token) {
    discordGuildsCache = await fetchDiscordGuilds(session.provider_token);
    if (isInGuild(discordGuildsCache)) {
      localStorage.setItem(GUILD_CACHE_KEY, 'true');
      return true;
    }
  }
  openJoinLayer();
  return false;
}

async function checkGuildMembership() {
  const session = await getSession();
  if (!session) return false;
  if (localStorage.getItem(GUILD_CACHE_KEY) === 'true') return true;
  if (session.provider_token) {
    const guilds = await fetchDiscordGuilds(session.provider_token);
    if (isInGuild(guilds)) {
      localStorage.setItem(GUILD_CACHE_KEY, 'true');
      return true;
    }
  }
  return false;
}

async function handleDebugClick() {
  const session = await getSession();
  const btnDebug = document.getElementById('btnDebug');
  const btnMenu = document.getElementById('btnMenu');
  if (!btnDebug || !btnMenu) return;
  if (!session) {
    openExclusiveLayer();
    return;
  }
  const isActive = btnDebug.classList.contains("active");
  document.querySelectorAll(".btn.menu").forEach(b => {
    b.classList.remove("active");
    b.setAttribute("aria-pressed", "false");
  });
  document.querySelectorAll(".menuContent").forEach(sec => sec.classList.remove("active"));
  if (!isActive) {
    btnDebug.classList.add("active");
    btnDebug.setAttribute("aria-pressed", "true");
    const id = btnDebug.dataset.target;
    const target = document.getElementById(id);
    if (target) target.classList.add("active");
  }
}

function signInWithDiscord() {
  return supabaseClient.auth.signInWithOAuth({
    provider: 'discord',
    options: {
      scopes: 'identify guilds',
      redirectTo: window.location.origin + window.location.pathname
    }
  });
}

function setupUserDropdown() {
  const userWrap = document.querySelector('.btnDiscordUser');
  const btnUser = document.getElementById('btnDiscordUser');
  const bgLogout = document.querySelector('.bgLogout');
  const btnLogout = document.getElementById('btnLogout');
  if (!userWrap || !btnUser || !bgLogout) return;
  btnUser.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    bgLogout.classList.toggle('active');
  });
  userWrap.addEventListener('mouseleave', () => {
    bgLogout.classList.remove('active');
  });
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.stopPropagation();
      bgLogout.classList.remove('active');
      localStorage.removeItem(GUILD_CACHE_KEY);
      try {
        await supabaseClient.auth.signOut();
      } catch (_) {}
      window.location.reload();
    });
  }
}

async function checkDiscordSession() {
  if (checkSessionRunning) return;
  checkSessionRunning = true;
  try {
    const session = await getSession();
    const loginWrap = document.querySelector('.btnDiscord');
    const userWrap = document.querySelector('.btnDiscordUser');
    if (!loginWrap || !userWrap) return;
    if (session) {
      const meta = session.user.user_metadata || {};
      loginWrap.classList.add('hidden');
      userWrap.classList.remove('hidden');
      const avatarImg = document.querySelector('.profileDiscord');
      if (avatarImg && meta.avatar_url) avatarImg.src = meta.avatar_url;
      const nameSpan = document.querySelector('.textProfile');
      if (nameSpan) {
        nameSpan.textContent =
          meta.custom_claims?.global_name ||
          meta.full_name ||
          meta.name ||
          '';
      }
      if (!discordGuildsCache && session.provider_token) {
        discordGuildsCache = await fetchDiscordGuilds(session.provider_token);
        if (isInGuild(discordGuildsCache)) {
          localStorage.setItem(GUILD_CACHE_KEY, 'true');
        } else {
          localStorage.removeItem(GUILD_CACHE_KEY);
        }
      }
    } else {
      loginWrap.classList.remove('hidden');
      userWrap.classList.add('hidden');
      discordGuildsCache = null;
      const btnMenu = document.getElementById('btnMenu');
      if (btnMenu) btnMenu.classList.remove('showDebug');
      localStorage.removeItem(GUILD_CACHE_KEY);
      const nameSpan = document.querySelector('.textProfile');
      if (nameSpan) nameSpan.textContent = '';
    }
  } finally {
    checkSessionRunning = false;
  }
}

function setupDiscordAuth() {
  const loginBtn = document.querySelector('.btnDiscord #btnDiscord');
  const exclusiveClose = document.getElementById('exclusiveClose');
  const joinClose = document.getElementById('joinClose');
  const btnExclusive = document.getElementById('btnExclusive');
  const btnJoin = document.getElementById('btnJoin');
  const btnDebug = document.getElementById('btnDebug');
  if (loginBtn) loginBtn.addEventListener('click', () => signInWithDiscord());
  if (exclusiveClose) exclusiveClose.addEventListener('click', closeExclusiveLayer);
  if (joinClose) joinClose.addEventListener('click', closeJoinLayer);
  if (btnExclusive) btnExclusive.addEventListener('click', () => signInWithDiscord());
  if (btnJoin) {
    btnJoin.addEventListener('click', () => {
      window.open(DISCORD_INVITE_URL, '_blank', 'noopener,noreferrer');
    });
  }
  if (btnDebug) btnDebug.addEventListener('click', handleDebugClick);
  supabaseClient.auth.onAuthStateChange(() => checkDiscordSession());
  checkDiscordSession();
}

function onAuthChanged(callback) {
  supabaseClient.auth.onAuthStateChange(callback);
}

window.discordIntegration = {
  getSession,
  requireLogin,
  requireGuildMembership,
  checkGuildMembership,
  setupDiscordAuth,
  setupUserDropdown,
  checkDiscordSession,
  closeExclusiveLayer,
  closeJoinLayer,
  signInWithDiscord,
  onAuthChanged
};