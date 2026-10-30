const API = '/.netlify/functions/game';
const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');

let session = null;
let currentState = null;
let pollHandle = null;
let tickHandle = null;
let busy = false;
let selectedAnswer = null;
let lastPhaseKey = '';

const esc = (v = '') =>
  String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));

const initials = (s = '?') =>
  esc(s.trim().slice(0, 1).toUpperCase() || '?');

function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(
    () => toastEl.classList.remove('show'),
    2600
  );
}

function saveSession(data) {
  session = data;
  localStorage.setItem(
    'bluff-battle-session',
    JSON.stringify(data)
  );
}

function loadSession() {
  try {
    return JSON.parse(
      localStorage.getItem('bluff-battle-session') || 'null'
    );
  } catch {
    return null;
  }
}

async function api(method, data, query = '') {
  const res = await fetch(
    method === 'GET' ? `${API}?${query}` : API,
    {
      method,
      headers: method === 'GET'
        ? {}
        : { 'content-type': 'application/json' },
      body: method === 'GET'
        ? undefined
        : JSON.stringify(data),
      cache: 'no-store'
    }
  );

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(
      payload.error || `Request failed (${res.status})`
    );
  }

  return payload;
}

function homeView() {
  app.innerHTML = `
    <section class="hero">
      <div class="eyebrow">✦ THE PARTY GAME OF PERFECT BLUFFS</div>
      <h1>Can you spot<br><span>the real answer?</span></h1>
      <p>
        Make up convincing lies. Catch your friends bluffing.<br>
        One real answer. A room full of suspicious people.
      </p>
    </section>

    <section class="home-grid">
      <div class="panel">
        <h2>Start a new battle</h2>
        <p class="sub">
          Create a room and invite your crew with a six-character code.
        </p>

        <label class="field-label" for="create-name">
          Your player name
        </label>

        <input
          class="input"
          id="create-name"
          maxlength="18"
          placeholder="e.g. Quiz Queen"
          autocomplete="nickname"
        />

        <button
          class="btn btn-primary btn-full"
          id="create-room"
        >
          ✦ Create a room <span>→</span>
        </button>

        <div class="error" id="create-error"></div>
        <p class="fine-print">
          No account. No downloads. Just a good bluff.
        </p>
      </div>

      <div class="panel">
        <h2>Join the party</h2>
        <p class="sub">
          Got a room code? Enter it here and jump into the game.
        </p>

        <label class="field-label" for="join-name">
          Your player name
        </label>

        <input
          class="input"
          id="join-name"
          maxlength="18"
          placeholder="What should we call you?"
          autocomplete="nickname"
        />

        <label class="field-label" for="join-code">
          Room code
        </label>

        <input
          class="input code-input"
          id="join-code"
          maxlength="6"
          placeholder="ABC123"
          autocomplete="off"
        />

        <button
          class="btn btn-secondary btn-full"
          id="join-room"
        >
          Join room <span>→</span>
        </button>

        <div class="error" id="join-error"></div>
      </div>

      <div class="panel how-panel">
        <div>
          <h2>How to play</h2>
          <p class="sub">Three quick rounds. Maximum mischief.</p>

          <div class="steps">
            <div class="step">
              <div class="step-num">01</div>
              <div>
                <strong>Make up a believable answer</strong>
                <span>
                  Everyone gets the same weird trivia question.
                  Submit a fake answer privately.
                </span>
              </div>
            </div>

            <div class="step">
              <div class="step-num">02</div>
              <div>
                <strong>Pick the real answer</strong>
                <span>
                  Read the anonymous options and secretly vote
                  for the one true fact.
                </span>
              </div>
            </div>

            <div class="step">
              <div class="step-num">03</div>
              <div>
                <strong>Score points & expose bluffs</strong>
                <span>
                  Earn 2 points for finding the truth.
                  Your fake earns 1 point for every player you fool.
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="pill-row">
          <span class="pill">2–8 PLAYERS</span>
          <span class="pill">3 ROUNDS</span>
          <span class="pill">NO LOGIN</span>
          <span class="pill">LIVE SCORES</span>
        </div>
      </div>

      <div class="panel">
        <h2>Good to know</h2>
        <p class="sub">
          The rules are simple. The bluffs are not.
        </p>

        <div class="rules">
          <strong>Scoring</strong><br>
          +2 points when your vote finds the real answer.<br>
          +1 point for every player who votes for your fake answer.
          <br><br>
          <strong>Fair play</strong><br>
          You cannot vote for your own fake answer.
          Answers stay anonymous until the reveal.
          The game lasts three rounds; the highest score wins.
          <br><br>
          <strong>Timers</strong><br>
          60 seconds to submit a bluff, then 45 seconds to vote.
          If someone runs out of time, the game moves on.
        </div>
      </div>
    </section>

    <p class="footer-note">
      BLUFF BATTLE · TRUST NO ONE (ESPECIALLY YOUR FRIENDS)
    </p>
  `;

  document
    .querySelector('#create-room')
    .addEventListener('click', createRoom);

  document
    .querySelector('#join-room')
    .addEventListener('click', joinRoom);

  document
    .querySelector('#join-code')
    .addEventListener('input', e => {
      e.target.value = e.target.value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
    });
}

async function createRoom() {
  const name = document
    .querySelector('#create-name')
    .value.trim();

  const error = document.querySelector('#create-error');

  if (name.length < 2) {
    error.textContent =
      'Please enter a name with at least 2 characters.';
    return;
  }

  const btn = document.querySelector('#create-room');
  btn.disabled = true;
  btn.textContent = 'Creating your room…';
  error.textContent = '';

  try {
    const data = await api('POST', {
      action: 'create',
      name
    });

    enterRoom(data);
  } catch (e) {
    error.textContent = e.message;
    btn.disabled = false;
    btn.innerHTML = '✦ Create a room <span>→</span>';
  }
}

async function joinRoom() {
  const name = document
    .querySelector('#join-name')
    .value.trim();

  const roomCode = document
    .querySelector('#join-code')
    .value.trim();

  const error = document.querySelector('#join-error');

  if (name.length < 2) {
    error.textContent =
      'Please enter a name with at least 2 characters.';
    return;
  }

  if (roomCode.length !== 6) {
    error.textContent =
      'A room code has exactly 6 characters.';
    return;
  }

  const btn = document.querySelector('#join-room');
  btn.disabled = true;
  btn.textContent = 'Joining…';
  error.textContent = '';

  try {
    const data = await api('POST', {
      action: 'join',
      name,
      roomCode
    });

    enterRoom(data);
  } catch (e) {
    error.textContent = e.message;
    btn.disabled = false;
    btn.innerHTML = 'Join room <span>→</span>';
  }
}

function enterRoom(data) {
  saveSession({
    roomCode: data.roomCode,
    playerId: data.playerId
  });

  history.replaceState(
    {},
    '',
    `/?room=${data.roomCode}`
  );

  selectedAnswer = null;
  lastPhaseKey = '';

  startPolling();
}

function startPolling() {
  clearInterval(pollHandle);
  clearInterval(tickHandle);

  refresh();

  pollHandle = setInterval(refresh, 1400);
  tickHandle = setInterval(updateTimers, 300);
}

async function refresh() {
  if (!session || busy) return;

  try {
    const state = await api(
      'GET',
      null,
      `roomCode=${encodeURIComponent(session.roomCode)}` +
      `&playerId=${encodeURIComponent(session.playerId)}` +
      `&t=${Date.now()}`
    );

    const phaseKey =
      `${state.gameId}:${state.round}:${state.phase}`;

    if (phaseKey !== lastPhaseKey) {
      selectedAnswer = null;
      lastPhaseKey = phaseKey;
    }

    currentState = state;
    renderGame(state);

  } catch (e) {
    if (/not in this room|session/i.test(e.message)) {
      clearInterval(pollHandle);

      toast(e.message);

      localStorage.removeItem('bluff-battle-session');
      session = null;

      homeView();

    } else if (!currentState) {
      app.innerHTML = `
        <section class="panel">
          <h2>Couldn't load this room</h2>
          <p class="sub">${esc(e.message)}</p>
          <button class="btn btn-secondary" id="back-home">
            Back home
          </button>
        </section>
      `;
    }
  }
}

function playerRows(players) {
  return players.map(p => `
    <div class="player-row">
      <div class="avatar">${initials(p.name)}</div>
      <div class="player-name">
        ${esc(p.name)}
        ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
        ${p.isYou ? '<span class="player-meta"> · YOU</span>' : ''}
      </div>
      <div class="score">${p.score} pts</div>
    </div>
  `).join('');
}

function renderGame(s) {
  const me = s.players.find(
    p => p.id === session.playerId
  );

  // FIX: Determine host status using the server's player data.
  const isHost = Boolean(me?.isHost);

  const roundDots = [1, 2, 3]
    .map(n => `<i class="${n <= s.round ? 'active' : ''}"></i>`)
    .join('');

  const roomHead = `
    <div class="game-top">
      <div class="room-chip">
        <div>
          <small>ROOM CODE · SHARE WITH FRIENDS</small>
          <strong>${esc(s.roomCode)}</strong>
        </div>
        <button class="copy-btn" id="copy-code">COPY</button>
      </div>

      <span class="status-chip">
        ${s.phase === 'lobby' ? 'WAITING ROOM' : s.phase.toUpperCase()}
      </span>
    </div>
  `;

  let content = '';

  if (s.phase === 'lobby') {
    content = `
      <div class="game-layout">
        <section class="game-panel">
          <div class="round-label">
            <span>YOUR PRIVATE PARTY ROOM</span>
            <span>${s.playerCount}/8 PLAYERS</span>
          </div>

          <div class="waiting-box">
            <div class="big-icon">🎭</div>
            <h3>Bring your best bluff.</h3>

            <p>
              Share the room code with friends.
              Once at least two players have joined,
              the host can kick off the first round.
            </p>

            <div class="lobby-code">${esc(s.roomCode)}</div>

            <p>Waiting for players to join…</p>

            ${
              isHost
                ? `
                  <button
                    class="btn btn-primary"
                    id="start-game"
                    ${s.playerCount < 2 ? 'disabled' : ''}
                  >
                    Start the battle →
                  </button>
                `
                : '<span class="status-chip">WAITING FOR HOST TO START</span>'
            }

            <div class="hint">
              ${
                s.playerCount < 2
                  ? 'You need at least one more player to start.'
                  : 'Everyone is here? The host can start whenever ready.'
              }
            </div>
          </div>
        </section>

        <aside class="panel side-panel">
          <h3 class="side-title">Players in the room</h3>
          <p class="side-caption">The crew so far</p>

          <div class="player-list">
            ${playerRows(s.players)}
          </div>

          <div class="divider"></div>

          <div class="rules">
            <strong>Quick rules</strong><br>
            Submit one fake answer. Vote for the real answer.
            Score points for truth and trickery.
          </div>
        </aside>
      </div>
    `;

  } else {
    let phaseContent = '';

    if (s.phase === 'writing') {
      phaseContent = s.mySubmission
        ? `
          <div class="waiting-box">
            <div class="big-icon">🕵️</div>
            <h3>Your bluff is locked in!</h3>
            <p>
              Now wait for the other players to submit.
              Your answer stays secret until voting begins.
            </p>
            <div class="waiting-count">
              ${s.submittedCount} / ${s.playerCount}
            </div>
            <p>Players submitted</p>
          </div>
        `
        : `
          <h3 class="phase-title">
            Make up a convincing fake
          </h3>

          <p class="phase-copy">
            Think of an answer that sounds real enough to fool
            your friends. Don't enter the actual answer!
          </p>

          <form id="submit-form">
            <textarea
              id="fake-answer"
              class="input"
              rows="3"
              maxlength="140"
              placeholder="Type your believable fake answer…"
              style="height:104px;padding:13px;resize:vertical"
            ></textarea>

            <div class="hint">
              Keep it short, clever and convincing.
              Your answer is private.
            </div>

            <button class="btn btn-primary btn-full" type="submit">
              Lock in my bluff ✦
            </button>
          </form>
        `;

    } else if (s.phase === 'voting') {
      phaseContent = s.myVote
        ? `
          <div class="waiting-box">
            <div class="big-icon">🤐</div>
            <h3>Your vote is secret.</h3>
            <p>
              Waiting for everyone else to vote.
              The answers will be revealed when voting ends.
            </p>
            <div class="waiting-count">
              ${s.votedCount} / ${s.playerCount}
            </div>
            <p>Votes cast</p>
          </div>
        `
        : `
          <h3 class="phase-title">
            Which answer is actually true?
          </h3>

          <p class="phase-copy">
            One is a fact. The rest are bluffs from the room.
            Choose carefully — you cannot change your vote.
          </p>

          <div class="answer-list">
            ${s.answerOptions.map((o, i) => `
              <button
                class="answer-choice ${
                  selectedAnswer === o.answerId ? 'selected' : ''
                }"
                data-answer="${esc(o.answerId)}"
              >
                <span class="choice-letter">
                  ${String.fromCharCode(65 + i)}
                </span>
                <span>${esc(o.text)}</span>
              </button>
            `).join('')}
          </div>

          <button
            class="btn btn-primary btn-full"
            id="cast-vote"
            ${selectedAnswer ? '' : 'disabled'}
          >
            Lock my vote →
          </button>
        `;

    } else {
      const opts = s.answerOptions.map((o, i) => `
        <div
          class="answer-choice ${o.isCorrect ? 'correct' : ''}"
          style="cursor:default"
        >
          <span class="choice-letter">
            ${String.fromCharCode(65 + i)}
          </span>

          <span style="flex:1">
            ${esc(o.text)}
            ${o.isCorrect ? ' <strong>✓ REAL</strong>' : ''}
            ${
              o.authorName
                ? `<span class="player-meta"> · ${esc(o.authorName)}'s bluff</span>`
                : ''
            }
          </span>

          <span class="player-meta">
            ${o.votes} vote${o.votes === 1 ? '' : 's'}
          </span>
        </div>
      `).join('');

      phaseContent = `
        <div class="reveal-banner">
          <small>THE REAL ANSWER WAS</small>
          <strong>${esc(s.correctAnswer)}</strong>

          ${
            s.question?.fact
              ? `<div class="hint" style="color:#b4d8c1">
                   ${esc(s.question.fact)}
                 </div>`
              : ''
          }
        </div>

        <h3 class="phase-title">
          The room has been exposed.
        </h3>

        <p class="phase-copy">
          Here are the answers and who managed to fool the room.
        </p>

        <div class="answer-list">${opts}</div>

        ${
          s.gameOver
            ? `
              <div class="divider"></div>
              <h3 class="phase-title">🏆 Final leaderboard</h3>
              <div class="player-list">
                ${playerRows(s.leaderboard)}
              </div>

              ${
                isHost
                  ? `
                    <button
                      class="btn btn-primary btn-full"
                      id="rematch"
                    >
                      Play a rematch ↻
                    </button>
                  `
                  : `
                    <p class="hint">
                      The host can start a rematch when everyone is ready.
                    </p>
                  `
              }
            `
            : isHost
              ? `
                <button
                  class="btn btn-primary btn-full"
                  id="next-round"
                >
                  Next round →
                </button>
              `
              : `
                <p class="hint">
                  Waiting for the host to start the next round…
                </p>
              `
        }
      `;
    }

    const deadline =
      s.phase === 'writing'
        ? s.deadlines.writing
        : s.phase === 'voting'
          ? s.deadlines.voting
          : null;

    const timer = deadline
      ? `
        <span
          class="timer"
          id="timer"
          data-deadline="${deadline}"
        >
          --:--
        </span>
      `
      : '';

    content = `
      <div class="game-layout">
        <section class="game-panel">
          <div class="round-label">
            <span>ROUND ${s.round} OF 3</span>
            <div class="round-dots">${roundDots}</div>
            ${timer}
          </div>

          <div class="question-card">
            <div class="q-label">✦ THE QUESTION</div>
            <h2>${esc(s.question?.prompt || 'Get ready…')}</h2>
          </div>

          ${phaseContent}
        </section>

        <aside class="panel side-panel">
          <h3 class="side-title">Live leaderboard</h3>
          <p class="side-caption">
            Points update after each reveal
          </p>

          <div class="player-list">
            ${playerRows(s.leaderboard)}
          </div>

          <div class="divider"></div>

          <div class="rules">
            <strong>Scoring</strong><br>
            +2 · Find the real answer<br>
            +1 · Each vote for your bluff<br><br>

            <strong>Progress</strong><br>
            ${
              s.phase === 'writing'
                ? `${s.submittedCount}/${s.playerCount} bluffs submitted`
                : s.phase === 'voting'
                  ? `${s.votedCount}/${s.playerCount} votes cast`
                  : 'Round revealed'
            }
          </div>
        </aside>
      </div>
    `;
  }

  app.innerHTML =
    roomHead +
    content +
    `<p class="footer-note">
      BLUFF BATTLE · TRUST NO ONE (ESPECIALLY YOUR FRIENDS)
    </p>`;

  document
    .querySelector('#copy-code')
    ?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(s.roomCode);
        toast('Room code copied. Send it to your friends!');
      } catch {
        toast(`Room code: ${s.roomCode}`);
      }
    });

  document
    .querySelector('#start-game')
    ?.addEventListener('click', () => sendAction('start'));

  document
    .querySelector('#submit-form')
    ?.addEventListener('submit', e => {
      e.preventDefault();

      sendAction('submit', {
        text: document.querySelector('#fake-answer').value
      });
    });

  document
    .querySelectorAll('[data-answer]')
    .forEach(el => {
      el.addEventListener('click', () => {
        selectedAnswer = el.dataset.answer;

        document
          .querySelectorAll('[data-answer]')
          .forEach(b => {
            b.classList.toggle(
              'selected',
              b.dataset.answer === selectedAnswer
            );
          });

        document.querySelector('#cast-vote').disabled = false;
      });
    });

  document
    .querySelector('#cast-vote')
    ?.addEventListener('click', () => {
      sendAction('vote', {
        answerId: selectedAnswer
      });
    });

  document
    .querySelector('#next-round')
    ?.addEventListener('click', () => sendAction('advance'));

  document
    .querySelector('#rematch')
    ?.addEventListener('click', () => sendAction('rematch'));

  updateTimers();
}

async function sendAction(action, extra = {}) {
  if (!session || busy) return;

  busy = true;

  const buttons = [...app.querySelectorAll('button')];
  buttons.forEach(b => {
    b.disabled = true;
  });

  try {
    await api('POST', {
      ...extra,
      action,
      roomCode: session.roomCode,
      playerId: session.playerId
    });

    if (action === 'rematch') {
      selectedAnswer = null;
    }

    await refresh();

  } catch (e) {
    toast(e.message);

  } finally {
    busy = false;

    if (currentState) {
      renderGame(currentState);
    }
  }
}

function updateTimers() {
  const el = document.querySelector('#timer');

  if (!el) return;

  const remaining = Math.max(
    0,
    Math.ceil(
      (Number(el.dataset.deadline) - Date.now()) / 1000
    )
  );

  el.textContent =
    `${String(Math.floor(remaining / 60)).padStart(2, '0')}:` +
    `${String(remaining % 60).padStart(2, '0')}`;

  el.style.color =
    remaining <= 10 ? '#ff8194' : '';
}

const saved = loadSession();
const params = new URLSearchParams(location.search);

if (
  saved &&
  (!params.get('room') || params.get('room') === saved.roomCode)
) {
  session = saved;
  startPolling();
} else {
  homeView();
}

window.addEventListener('beforeunload', () => {
  clearInterval(pollHandle);
  clearInterval(tickHandle);
});
