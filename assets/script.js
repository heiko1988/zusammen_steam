const STEAM_API_KEY = "AA0D60FDE8D4F015F5B89EC7B8FA0A41"; // ← HIER EINTRAGEN!
const ADMIN_PASSWORD = "1234"; // ← ÄNDERN!
const CACHE_TIME = 3600000; // 1 Stunde

// Hilfsfunktionen
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

async function resolveVanity(vanity) {
  const res = await fetch(`https://api.steamcommunity.com/ISteamUser/ResolveVanityURL/v1/?key=${STEAM_API_KEY}&vanityurl=${vanity}`);
  const data = await res.json();
  return data.response.success === 1 ? data.response.steamid : null;
}

async function getSteamData(steamid) {
  const cacheKey = `cache_${steamid}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, time } = JSON.parse(cached);
    if (Date.now() - time < CACHE_TIME) return data;
  }

  try {
    const [profileRes, gamesRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamid}`),
      fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`)
    ]);

    const profileData = await profileRes.json();
    const gamesData = await gamesRes.json();

    const player = profileData.response.players[0];
    if (!player || !gamesData.response.games) return null;

    const data = {
      steamid,
      username: player.personaname,
      avatar: player.avatarfull,
      game_count: gamesData.response.game_count,
      games: gamesData.response.games.map(g => ({
        appid: g.appid,
        name: g.name,
        hours: Math.floor(g.playtime_forever / 60)
      }))
    };

    localStorage.setItem(cacheKey, JSON.stringify({ data, time: Date.now() }));
    return data;
  } catch (e) {
    console.error(e);
    return null;
  }
}

// Hauptseite
if (window.location.pathname.includes("index.html") || window.location.pathname === "/") {
  function saveUsers() {
    const users = Array.from($$(".user-card")).map(c => c.dataset.id);
    localStorage.setItem("steam_users", JSON.stringify(users));
  }

  async function addUser() {
    const input = $("#steamInput").value.trim();
    if (!input) return;

    let steamid = input;
    if (!/^\d{17}$/.test(input)) {
      steamid = await resolveVanity(input);
      if (!steamid) { alert("SteamID nicht gefunden oder Profil privat!"); return; }
    }

    const data = await getSteamData(steamid);
    if (!data) { alert("Fehler: Profil privat oder nicht gefunden!"); return; }

    const users = JSON.parse(localStorage.getItem("steam_users") || "[]");
    if (!users.includes(steamid)) {
      users.push(steamid);
      localStorage.setItem("steam_users", JSON.stringify(users));
    }

    renderUsers();
    $("#steamInput").value = "";
  }

  async function renderUsers() {
    const container = $("#users");
    const users = JSON.parse(localStorage.getItem("steam_users") || "[]");
    container.innerHTML = "";

    const userData = await Promise.all(users.map(id => getSteamData(id)));
    userData.forEach((data, i) => {
      if (!data) return;
      const div = document.createElement("div");
      div.className = "user-card";
      div.dataset.id = data.steamid;
      div.innerHTML = `
        <img src="${data.avatar}" alt="Avatar">
        <div class="info">
          <strong>${data.username}</strong>
          <small>${data.game_count} Spiele</small>
        </div>
        <span class="refresh" onclick="forceRefresh('${data.steamid}')">Refresh</span>
        <span class="remove" onclick="removeUser('${data.steamid}')">Remove</span>
      `;
      container.appendChild(div);
    });

    renderCommonGames(userData.filter(Boolean));
  }

  window.removeUser = (id) => {
    let users = JSON.parse(localStorage.getItem("steam_users") || "[]");
    users = users.filter(u => u !== id);
    localStorage.setItem("steam_users", JSON.stringify(users));
    localStorage.removeItem(`cache_${id}`);
    renderUsers();
  };

  window.forceRefresh = async (id) => {
    localStorage.removeItem(`cache_${id}`);
    await getSteamData(id);
    renderUsers();
  };

  function renderCommonGames(users) {
    const container = $("#common-games");
    if (users.length < 2) {
      container.innerHTML = "";
      return;
    }

    const gameMap = {};
    users.forEach(u => {
      u.games.forEach(g => {
        if (!gameMap[g.appid]) gameMap[g.appid] = { ...g, users: [] };
        gameMap[g.appid].users.push(u.username);
      });
    });

    const common = Object.values(gameMap).filter(g => g.users.length === users.length);
    if (common.length === 0) {
      container.innerHTML = "<p class='section'>Keine gemeinsamen Spiele</p>";
      return;
    }

    container.innerHTML = `<h2>Gemeinsame Spiele (${common.length})</h2>` + common.map(g => `
      <div class="game">
        <span><strong>${g.name}</strong></span>
        <span>${g.hours}h gespielt (insgesamt)</span>
      </div>
    `).join("");
  }

  // Init
  renderUsers();
}

// Admin Seite
if (window.location.pathname.includes("admin.html")) {
  window.login = () => {
    if ($("#adminPass").value === ADMIN_PASSWORD) {
      $("#login").classList.add("hidden");
      $("#panel").classList.remove("hidden");
      renderAdmin();
    } else {
      alert("Falsches Passwort!");
    }
  };

  window.refreshAll = async () => {
    if (!confirm("Alle Benutzer neu laden?")) return;
    const users = JSON.parse(localStorage.getItem("steam_users") || "[]");
    for (const id of users) {
      localStorage.removeItem(`cache_${id}`);
      await getSteamData(id);
    }
    alert("Alle aktualisiert!");
    renderAdmin();
  };

  window.clearCache = () => {
    if (!confirm("Cache wirklich leeren?")) return;
    Object.keys(localStorage).filter(k => k.startsWith("cache_")).forEach(k => localStorage.removeItem(k));
    alert("Cache geleert!");
  };

  async function renderAdmin() {
    const container = $("#admin-users");
    const users = JSON.parse(localStorage.getItem("steam_users") || "[]");
    const data = await Promise.all(users.map(id => getSteamData(id)));
    container.innerHTML = data.filter(Boolean).map(u => `
      <div class="user-card">
        <img src="${u.avatar}">
        <div class="info">
          <strong>${u.username}</strong>
          <small>${u.game_count} Spiele | Zuletzt: ${new Date().toLocaleString()}</small>
        </div>
        <span class="refresh" onclick="forceRefresh('${u.steamid}'); renderAdmin()">Refresh</span>
      </div>
    `).join("") || "<p>Keine Benutzer</p>";
  }
}
