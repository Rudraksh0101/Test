(() => {
'use strict';

const app = document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));

async function api(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) {}
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok:false, status:0, data:{error:'Cannot connect to the game server.'} };
  }
}

function shell(html) {
  app.innerHTML = `<main class="wrap">${html}</main>`;
}

function nav(active) {
  return `<nav class="nav">
    <a class="${active==='home'?'active':''}" href="/?page=home"><b>⌂</b>Home</a>
    <a class="${active==='history'?'active':''}" href="/?page=history"><b>◷</b>History</a>
    <a class="${active==='ranks'?'active':''}" href="/?page=ranks"><b>♛</b>Ranks</a>
    <a class="${active==='profile'?'active':''}" href="/?page=profile"><b>◉</b>Profile</a>
  </nav>`;
}

async function getMe() {
  return api('/api/me');
}

async function guard() {
  const r = await getMe();
  if (!r.data.authenticated) {
    location.replace('/?page=auth');
    return null;
  }
  return r.data.user;
}

function topbar(user) {
  return `<div class="top">
    <div class="brand">COLOUR <span>PREDICTION</span><small>ARENA</small></div>
    <button id="logout" class="logout">↪</button>
  </div>`;
}

async function showAuth() {
  const me = await getMe();
  if (me.data.authenticated) {
    location.replace('/?page=home');
    return;
  }

  shell(`<section class="auth card">
    <div class="logo-crown">♛</div>
    <h1>COLOUR <span>PREDICTION</span></h1>
    <div class="sub">ARENA</div>
    <p class="muted center">Welcome back. Enter the arena.</p>
    <div class="tabs">
      <button class="active" data-mode="login">LOGIN</button>
      <button data-mode="register">REGISTER</button>
    </div>
    <form id="authForm">
      <label>USERNAME<input id="username" required minlength="3" maxlength="24" autocomplete="username"></label>
      <label id="emailWrap" class="hidden">EMAIL<input id="email" type="email" autocomplete="email"></label>
      <label>PASSWORD<input id="password" type="password" required minlength="8" autocomplete="current-password"></label>
      <button id="authButton" class="primary" type="submit">LOGIN</button>
    </form>
    <div id="authMsg" class="msg"></div>
    <p class="fine">Virtual-points game only.</p>
  </section>`);

  let mode = 'login';
  document.querySelectorAll('[data-mode]').forEach(btn => btn.onclick = () => {
    mode = btn.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('active', x === btn));
    document.getElementById('emailWrap').classList.toggle('hidden', mode !== 'register');
    document.getElementById('email').required = mode === 'register';
    document.getElementById('authButton').textContent = mode === 'register' ? 'CREATE ACCOUNT' : 'LOGIN';
  });

  document.getElementById('authForm').onsubmit = async e => {
    e.preventDefault();
    const body = {
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value
    };
    if (mode === 'register') body.email = document.getElementById('email').value.trim();
    const r = await api('/api/' + mode, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if (!r.ok) {
      document.getElementById('authMsg').textContent = r.data.error || 'Request failed.';
      return;
    }
    location.replace('/?page=home');
  };
}

async function showHome() {
  const user = await guard();
  if (!user) return;

  shell(`${topbar(user)}
  <div class="grid">
    <section class="card hero">
      <div class="userline"><b>${esc(user.username)}</b><span>LEVEL 1</span><strong>🪙 <em id="balance">${Number(user.balance).toLocaleString('en-IN')}</em></strong></div>
      <div class="banner"><b>PLAY <span>PREDICTION</span></b><small>Predict the next colour and compete live.</small></div>
    </section>

    <section class="card round">
      <div class="roundhead"><div><small>PERIOD</small><strong id="round">#—</strong></div><div><small>ONLINE</small><strong id="online">0</strong></div></div>
      <div id="timer" class="timer">30</div>
      <div class="bar"><i id="bar"></i></div>
      <p id="roundState" class="center muted">Connecting…</p>
    </section>

    <section class="card">
      <small>CHOOSE A COLOUR</small>
      <div class="choices">
        <button class="choice red" data-colour="RED"><i></i>RED</button>
        <button class="choice green" data-colour="GREEN"><i></i>GREEN</button>
        <button class="choice violet" data-colour="VIOLET"><i></i>VIOLET</button>
      </div>
      <p id="chosen" class="muted">Select a colour</p>
      <small>VIRTUAL STAKE</small>
      <div class="amounts">${[10,50,100,500,1000].map(n=>`<button class="amount ${n===100?'active':''}" data-stake="${n}">${n}</button>`).join('')}</div>
      <input id="stake" class="stakeInput" type="number" min="10" max="5000" step="10" value="100">
      <button id="predict" class="primary" disabled>CONFIRM PREDICTION</button>
      <div id="predictMsg" class="msg"></div>
    </section>

    <section class="card">
      <div class="between"><small>RECENT RESULTS</small><a href="/?page=history">View all ›</a></div>
      <div id="results" class="results"></div>
    </section>
  </div>${nav('home')}`);

  document.getElementById('logout').onclick = async () => {
    await api('/api/logout', {method:'POST'});
    location.replace('/?page=auth');
  };

  let selected = null;
  document.querySelectorAll('[data-colour]').forEach(btn => btn.onclick = () => {
    selected = btn.dataset.colour;
    document.querySelectorAll('[data-colour]').forEach(x => x.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('chosen').textContent = 'Selected: ' + selected;
    document.getElementById('predict').disabled = false;
  });

  document.querySelectorAll('[data-stake]').forEach(btn => btn.onclick = () => {
    document.getElementById('stake').value = btn.dataset.stake;
    document.querySelectorAll('[data-stake]').forEach(x => x.classList.toggle('active', x === btn));
  });

  document.getElementById('predict').onclick = async () => {
    const stake = Number(document.getElementById('stake').value);
    const r = await api('/api/predict', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({colour:selected, color:selected, stake})
    });
    document.getElementById('predictMsg').textContent = r.ok
      ? `Prediction accepted for round #${r.data.round}.`
      : (r.data.error || 'Prediction failed.');
    if (r.ok) {
      document.getElementById('balance').textContent = Number(r.data.balance).toLocaleString('en-IN');
      document.getElementById('predict').disabled = true;
    }
  };

  // If Socket.IO is unavailable, the page remains usable and polls the round endpoint.
  let socket = null;
  if (typeof io === 'function') {
    socket = io();
    socket.on('connect', () => document.getElementById('roundState').textContent = 'Predictions open');
    socket.on('connect_error', () => document.getElementById('roundState').textContent = 'Live connection unavailable — retrying');
    socket.on('tick', updateRound);
    socket.on('result', d => addResult(d.color));
  }

  async function poll() {
    const r = await api('/api/round');
    if (r.ok) updateRound(r.data);
  }
  setInterval(() => { if (!socket || !socket.connected) poll(); }, 1000);
  poll();

  function updateRound(d) {
    const timer = document.getElementById('timer');
    if (!timer) return;
    timer.textContent = String(d.seconds).padStart(2,'0');
    document.getElementById('round').textContent = '#' + d.round;
    document.getElementById('online').textContent = d.online ?? '—';
    document.getElementById('bar').style.width = ((Number(d.seconds) / 30) * 100) + '%';
    document.getElementById('roundState').textContent = Number(d.seconds) <= 3 ? 'Round closing…' : 'Predictions open';
  }

  function addResult(color) {
    const box = document.getElementById('results');
    if (!box || !color) return;
    const dot = document.createElement('span');
    dot.className = 'dot ' + color;
    dot.textContent = color[0];
    box.prepend(dot);
    while (box.children.length > 12) box.lastElementChild.remove();
  }
}

async function showListPage(kind) {
  const user = await guard();
  if (!user) return;

  const title = kind === 'history' ? 'Prediction History' : kind === 'ranks' ? 'Leaderboard' : 'Profile';
  shell(`${topbar(user)}<section class="card"><h2>${title}</h2><div id="content" class="muted">Loading…</div></section>${nav(kind)}`);
  document.getElementById('logout').onclick = async () => {
    await api('/api/logout', {method:'POST'});
    location.replace('/?page=auth');
  };

  if (kind === 'history') {
    const r = await api('/api/history');
    document.getElementById('content').innerHTML = r.ok && r.data.items.length
      ? r.data.items.map(x => `<div class="row"><span>#${x.round_id} · ${esc(x.color)}<small>${x.stake} virtual points</small></span><b>${esc(x.result || 'PENDING')}<br>${x.payout ? '+'+x.payout : '0'}</b></div>`).join('')
      : 'No predictions yet.';
  } else if (kind === 'ranks') {
    const r = await api('/api/leaderboard');
    document.getElementById('content').innerHTML = r.ok
      ? r.data.items.map((x,i)=>`<div class="row"><span>#${i+1} ${esc(x.username)}</span><b>${Number(x.balance).toLocaleString('en-IN')}</b></div>`).join('')
      : 'Unable to load leaderboard.';
  } else {
    document.getElementById('content').innerHTML = `<div class="profile"><div class="logo-crown">♛</div><h2>${esc(user.username)}</h2><p class="muted">${esc(user.email || 'No email added')}</p><div class="row"><span>Virtual balance</span><b>${Number(user.balance).toLocaleString('en-IN')}</b></div><div class="row"><span>Member since</span><b>${new Date(user.created_at).toLocaleDateString()}</b></div></div>`;
  }
}

function showFatal(error) {
  app.innerHTML = `<main class="wrap"><section class="card fatal"><div class="logo-crown">!</div><h1>Unable to load the game</h1><p>${esc(error?.message || error || 'Unknown browser error')}</p><button class="primary" onclick="location.reload()">RELOAD GAME</button><p class="fine">If this persists, open F12 → Console and check the red error.</p></section></main>`;
}

window.addEventListener('error', e => {
  if (document.getElementById('app')?.children.length === 0) showFatal(e.error || new Error(e.message));
});

(async function boot() {
  try {
    const page = new URLSearchParams(location.search).get('page') || 'splash';
    if (page === 'splash') {
      let p = 5;
      const bar = document.querySelector('.load i');
      const timer = setInterval(() => {
        p += 8;
        if (bar) bar.style.width = Math.min(p,100) + '%';
        if (p >= 100) {
          clearInterval(timer);
          getMe().then(r => location.replace(r.data.authenticated ? '/?page=home' : '/?page=auth'));
        }
      }, 80);
    } else if (page === 'auth') await showAuth();
    else if (page === 'home') await showHome();
    else if (['history','ranks','profile'].includes(page)) await showListPage(page);
    else location.replace('/?page=auth');
  } catch (e) {
    console.error(e);
    showFatal(e);
  }
})();

})();
