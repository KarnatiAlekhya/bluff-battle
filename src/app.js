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

    // Do not redraw the page while the player is typing.
    const activeElement = document.activeElement;
    const isTyping =
      activeElement?.id === 'fake-answer';

    if (!isTyping) {
      renderGame(state);
    }

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
