// =================== ÄNDERE HIER! ===================
const STEAM_API_KEY = "AA0D60FDE8D4F015F5B89EC7B8FA0A41"; // ← https://steamcommunity.com/dev/apikey
const ADMIN_PASSWORD = "admin123"; // ← ÄNDERE DAS!
// ===================================================

const CACHE_TIME = 3600000; // 1 Stunde
const $ = s => document.querySelector(s);

async function getSteamId64(input) {
  if (input.includes('steamcommunity.com/id/')) {
    const vanity = input.split('id/')[1].split('/')[0].split('?')[0];
    return await resolveVanity(vanity);
  }
  if (!/^\d{17}$/.test(input)) return await resolveVanity(input);
  return input;
}

async function resolveVanity(vanity) {
  try {
    const res = await fetch(`https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${vanity}`);
    const data = await res.json();
    return data.response.success === 1 ? data.response.steamid : null;
  } catch { return null; }
}

async function getSteamData(steamid) {
  const cacheKey = `cache_${steamid}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, time } = JSON.parse(cached);
    if (Date.now() - time < CACHE_TIME) return data;
  }
  try {
    const [p, g] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamid}`),
      fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`)
    ]);
    const profile = await p.json(), games = await g.json();
    const player = profile.response.players[0];
    if (!player || !games.response.games) return null;
    const data = {
      steamid, username: player.personaname, avatar: player.avatarfull,
      game_count: games.response.game_count,
      games: games.response.games.map(g => ({ appid: g.appid, name: g.name, hours: Math.floor(g.playtime_forever / 60) }))
    };
    localStorage.setItem(cacheKey, JSON.stringify({ data, time: Date.now() }));
    return data;
  } catch { return null; }
}

// Hauptseite
if (location.pathname.includes('index') || location.pathname === '/') {
  const addButton = $('#addButton');
  const input = $('#steamInput');

  if (addButton && input) {
    addButton.addEventListener('click', async () => {
      if (!STEAM_API_KEY || STEAM_API_KEY === 'DEIN_STEAM_API_KEY_HIER') {
        alert('STEAM API KEY FEHLT! Gehe zu https://steamcommunity.com/dev/apikey');
        return;
      }
      const raw = input.value.trim();
      if (!raw) return;
      const steamid = await getSteamId64(raw);
      if (!steamid) { alert('Profil nicht gefunden oder privat!'); return; }
      const data = await getSteamData(steamid);
      if (!data) { alert('Fehler: Profil privat oder API-Limit!'); return; }
      let users = JSON.parse(localStorage.getItem('steam_users') || '[]');
      if (!users.includes(steamid)) users.push(steamid);
      localStorage.setItem('steam_users', JSON.stringify(users));
      renderUsers();
      input.value = '';
    });

    input.addEventListener('keypress', e => e.key === 'Enter' ? addButton.click() : 0);
  }

  window.removeUser = id => {
    let users = JSON.parse(localStorage.getItem('steam_users') || '[]');
    users = users.filter(u => u !== id);
    localStorage.setItem('steam_users', JSON.stringify(users));
    localStorage.removeItem(`cache_${id}`);
    renderUsers();
  };

  window.forceRefresh = async id => {
    localStorage.removeItem(`cache_${id}`);
    await getSteamData(id);
    renderUsers();
  };

  async function renderUsers() {
    const users = JSON.parse(localStorage.getItem('steam_users') || '[]');
    const data = await Promise.all(users.map(getSteamData));
    $('#users').innerHTML = data.filter(d => d).map(d => `
      <div class="user-card">
        <img src="${d.avatar}">
        <div class="info"><strong>${d.username}</strong><small>${d.game_count} Spiele</small></div>
        <span class="refresh" onclick="forceRefresh('${d.steamid}')">Refresh</span>
        <span class="remove" onclick="removeUser('${d.steamid}')">Remove</span>
      </div>
    `).join('') || '<p>Keine Profile hinzugefügt</p>';
    renderCommon(data.filter(Boolean));
  }

  function renderCommon(users) {
    if (users.length < 2) { $('#common-games').innerHTML = ''; return; }
    const map = {};
    users.forEach(u => u.games.forEach(g => {
      if (!map[g.appid]) map[g.appid] = { ...g, users: [] };
      map[g.appid].users.push(u.username);
    }));
    const common = Object.values(map).filter(g => g.users.length === users.length);
    $('#common-games').innerHTML = common.length ? `<h2>Gemeinsame Spiele (${common.length})</h2>` + common.map(g => `
      <div class="game"><strong>${g.name}</strong><span>${g.hours}h</span></div>
    `).join('') : `<h2>Keine gemeinsamen Spiele</h2>`;
  }

  renderUsers();
}

// Admin Seite
if (location.pathname.includes('admin')) {
  const loginBtn = $('#loginButton');
  const refreshBtn = $('#refreshAllButton');
  const clearBtn = $('#clearCacheButton');

  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      if ($('#adminPass').value === ADMIN_PASSWORD) {
        $('#login').classList.add('hidden');
        $('#panel').classList.remove('hidden');
        renderAdmin();
      } else alert('Falsches Passwort!');
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (!confirm('Alle neu laden?')) return;
      const users = JSON.parse(localStorage.getItem('steam_users') || '[]');
      for (const id of users) { localStorage.removeItem(`cache_${id}`); await getSteamData(id); }
      renderAdmin(); alert('Alle aktualisiert!');
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (!confirm('Cache leeren?')) return;
      Object.keys(localStorage).filter(k => k.startsWith('cache_')).forEach(k => localStorage.removeItem(k));
      alert('Cache geleert!');
    });
  }

  window.forceRefresh = async id => {
    localStorage.removeItem(`cache_${id}`);
    await getSteamData(id);
    renderAdmin();
  };

  async function renderAdmin() {
    const users = JSON.parse(localStorage.getItem('steam_users') || '[]');
    const data = await Promise.all(users.map(getSteamData));
    $('#admin-users').innerHTML = data.filter(d => d).map(d => `
      <div class="user-card">
        <img src="${d.avatar}">
        <div class="info"><strong>${d.username}</strong><small>${d.game_count} Spiele</small></div>
        <span class="refresh" onclick="forceRefresh('${d.steamid}');renderAdmin()">Refresh</span>
      </div>
    `).join('') || '<p>Keine Nutzer</p>';
  }
}
