import { getStore } from '@netlify/blobs';

// Site-wide store with strong consistency for multiplayer room state.
// Netlify Functions provide the site ID and token automatically.
const store = () => getStore({
  name: 'bluff-battle-live',
  consistency: 'strong'
});

const QUESTIONS = [
  {
    prompt: 'What is the official name for the smell after rain?',
    answer: 'Petrichor',
    fact: 'The word was coined in 1964 from Greek roots.'
  },
  {
    prompt: 'Which animal has three hearts?',
    answer: 'The octopus',
    fact: 'Two hearts pump blood to the gills; one pumps it to the body.'
  },
  {
    prompt: 'What is the dot over a lowercase i or j called?',
    answer: 'A tittle',
    fact: 'The tiny mark has its own name: a tittle.'
  },
  {
    prompt: 'Which planet has a day longer than its year?',
    answer: 'Venus',
    fact: 'Venus rotates very slowly compared with its orbit around the Sun.'
  },
  {
    prompt: 'What is the national animal of Scotland?',
    answer: 'The unicorn',
    fact: 'The unicorn has appeared in Scottish heraldry for centuries.'
  },
  {
    prompt: 'What do you call a group of flamingos?',
    answer: 'A flamboyance',
    fact: 'A group of flamingos is commonly called a flamboyance.'
  },
  {
    prompt: 'Which food never spoils when stored properly?',
    answer: 'Honey',
    fact: 'Honey’s low water content and acidity help prevent microbial growth.'
  },
  {
    prompt: 'What is the only mammal capable of true flight?',
    answer: 'The bat',
    fact: 'Other gliding mammals can travel through the air but cannot sustain powered flight.'
  },
  {
    prompt: 'Which country invented the first modern printed book?',
    answer: 'China',
    fact: 'Woodblock printing and early printed books developed in China.'
  },
  {
    prompt: 'What is the fear of long words humorously called?',
    answer: 'Hippopotomonstrosesquipedaliophobia',
    fact: 'The unusually long term is used humorously for the fear of long words.'
  },
  {
    prompt: 'Which sea creature has blue blood?',
    answer: 'The horseshoe crab',
    fact: 'Its copper-based blood uses hemocyanin to carry oxygen.'
  },
  {
    prompt: 'What is the smallest bone in the human body?',
    answer: 'The stapes',
    fact: 'The stapes is a tiny bone in the middle ear.'
  }
];

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });

const cleanName = (v) =>
  typeof v === 'string'
    ? v.trim().replace(/[<>]/g, '').slice(0, 18)
    : '';

const cleanText = (v) =>
  typeof v === 'string'
    ? v.trim().replace(/[<>]/g, '').slice(0, 140)
    : '';

const code = () =>
  Math.random().toString(36).slice(2, 8).toUpperCase();

const id = () => crypto.randomUUID();

const roomKey = (c) => `room:${c}:meta`;

const eventPrefix = (c, g) =>
  `room:${c}:game:${g}:`;

async function readJSON(s, key) {
  return await s.get(key, {
    type: 'json',
    consistency: 'strong'
  });
}

async function putNew(s, key, value) {
  return s.setJSON(key, value, {
    onlyIfNew: true
  });
}

async function listJSON(s, prefix) {
  const { blobs } = await s.list({ prefix });

  const values = await Promise.all(
    blobs.map(async b => ({
      key: b.key,
      value: await readJSON(s, b.key)
    }))
  );

  return values.filter(x => x.value !== null);
}

function shuffle(items, seed) {
  const a = [...items];
  let h = 2166136261;

  for (const ch of seed) {
    h = Math.imul(
      h ^ ch.charCodeAt(0),
      16777619
    ) >>> 0;
  }

  for (let i = a.length - 1; i > 0; i--) {
    h = (
      Math.imul(h, 1664525) + 1013904223
    ) >>> 0;

    const j = h % (i + 1);

    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

async function getRoom(s, c) {
  return readJSON(s, roomKey(c));
}

async function getPlayers(s, c) {
  const slots = await listJSON(s, `room:${c}:slot:`);

  return slots
    .map(x => x.value)
    .filter(Boolean)
    .sort((a, b) => a.slot - b.slot);
}

async function createRoom(s, body) {
  const playerId = id();
  const playerName = cleanName(body.name);

  if (playerName.length < 2) {
    return json({
      error: 'Choose a name with at least 2 characters.'
    }, 400);
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const roomCode = code();
    const gameId = id();

    const meta = {
      code: roomCode,
      hostId: playerId,
      gameId,
      createdAt: Date.now()
    };

    const made = await putNew(
      s,
      roomKey(roomCode),
      meta
    );

    if (!made.modified) continue;

    await putNew(
      s,
      `room:${roomCode}:slot:1`,
      {
        id: playerId,
        name: playerName,
        slot: 1,
        joinedAt: Date.now()
      }
    );

    return json({
      roomCode,
      playerId,
      gameId
    });
  }

  return json({
    error: 'Could not create a room. Please try again.'
  }, 503);
}

async function joinRoom(s, body) {
  const c = String(body.roomCode || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);

  const name = cleanName(body.name);

  if (name.length < 2) {
    return json({
      error: 'Choose a name with at least 2 characters.'
    }, 400);
  }

  const meta = await getRoom(s, c);

  if (!meta) {
    return json({
      error: 'Room not found. Check the code and try again.'
    }, 404);
  }

  // Do not allow anyone to join a room ended by the host.
  if (
    await readJSON(
      s,
      `${eventPrefix(c, meta.gameId)}ended`
    )
  ) {
    return json({
      error: 'The host has ended this game. This room is closed.'
    }, 410);
  }

  if (
    await readJSON(
      s,
      `${eventPrefix(c, meta.gameId)}start`
    )
  ) {
    return json({
      error: 'This game has already started. Ask the host to create a new room.'
    }, 409);
  }

  const playerId = id();

  for (let slot = 2; slot <= 8; slot++) {
    const result = await putNew(
      s,
      `room:${c}:slot:${slot}`,
      {
        id: playerId,
        name,
        slot,
        joinedAt: Date.now()
      }
    );

    if (result.modified) {
      return json({
        roomCode: c,
        playerId,
        gameId: meta.gameId
      });
    }
  }

  return json({
    error: 'This room is full (8 players maximum).'
  }, 409);
}

async function state(s, c, playerId) {
  const meta = await getRoom(s, c);

  if (!meta) {
    return json({
      error: 'Room not found.'
    }, 404);
  }

  const players = await getPlayers(s, c);

  if (!players.some(p => p.id === playerId)) {
    return json({
      error: 'You are not in this room. Rejoin with the room code.'
    }, 403);
  }

  const gameEvents = await listJSON(
    s,
    eventPrefix(c, meta.gameId)
  );

  // Check whether the host has ended the game.
  const ended = gameEvents.find(
    x => x.value.type === 'endGame'
  )?.value;

  if (ended) {
    return json({
      roomCode: c,
      gameId: meta.gameId,
      players: players.map(p => ({
        name: p.name,
        slot: p.slot,
        score: 0,
        isHost: p.id === meta.hostId,
        isYou: p.id === playerId
      })),
      playerCount: players.length,
      phase: 'ended',
      endedBy:
        players.find(p => p.id === ended.playerId)?.name ||
        'The host'
    });
  }

  const starts = gameEvents
    .filter(x => x.value.type === 'start')
    .map(x => x.value);

  const start = starts[0] || null;

  const advances = gameEvents
    .filter(x => x.value.type === 'advance')
    .map(x => x.value)
    .sort((a, b) => a.round - b.round);

  const round = advances.length
    ? advances[advances.length - 1].round
    : 1;

  const roundStart = advances.length
    ? advances[advances.length - 1].at
    : start?.at;

  const currentQuestion = start
    ? QUESTIONS[start.questionIndexes[round - 1]]
    : null;

  const prefix = eventPrefix(c, meta.gameId);

  const submissions = gameEvents
    .filter(
      x =>
        x.value.type === 'submission' &&
        x.value.round === round
    )
    .map(x => x.value);

  const votes = gameEvents
    .filter(
      x =>
        x.value.type === 'vote' &&
        x.value.round === round
    )
    .map(x => x.value);

  let phase = !start ? 'lobby' : 'writing';
  let voteStartedAt = null;

  if (start) {
    voteStartedAt =
      submissions.length >= players.length
        ? Math.max(...submissions.map(x => x.at))
        : roundStart + 60000;

    if (
      submissions.length >= players.length ||
      Date.now() >= roundStart + 60000
    ) {
      phase = 'voting';
    }

    if (
      phase === 'voting' &&
      (
        votes.length >= players.length ||
        Date.now() >= voteStartedAt + 45000
      )
    ) {
      phase = 'reveal';
    }
  }

  const mySubmission = submissions.find(
    x => x.playerId === playerId
  );

  const myVote = votes.find(
    x => x.playerId === playerId
  );

  const scores = Object.fromEntries(
    players.map(p => [p.id, 0])
  );

  for (let r = 1; r <= 3; r++) {
    const subs = gameEvents
      .filter(
        x =>
          x.value.type === 'submission' &&
          x.value.round === r
      )
      .map(x => x.value);

    const vs = gameEvents
      .filter(
        x =>
          x.value.type === 'vote' &&
          x.value.round === r
      )
      .map(x => x.value);

    if (
      start &&
      (
        r < round ||
        phase === 'reveal' ||
        (r === round && phase === 'reveal')
      )
    ) {
      for (const v of vs) {
        if (v.answerId === 'real') {
          scores[v.playerId] =
            (scores[v.playerId] || 0) + 2;
        }

        const chosen = subs.find(
          x => x.answerId === v.answerId
        );

        if (
          chosen &&
          chosen.playerId !== v.playerId
        ) {
          scores[chosen.playerId] =
            (scores[chosen.playerId] || 0) + 1;
        }
      }
    }
  }

  const playerList = players.map(p => ({
    name: p.name,
    slot: p.slot,
    score: scores[p.id] || 0,
    isHost: p.id === meta.hostId,
    isYou: p.id === playerId
  }));

  let answerOptions = [];

  if (phase === 'voting' || phase === 'reveal') {
    const choices = [
      {
        answerId: 'real',
        text: currentQuestion.answer
      },
      ...submissions.map(x => ({
        answerId: x.answerId,
        text: x.text,
        authorId: x.playerId
      }))
    ];

    const shuffled = shuffle(
      choices,
      `${meta.gameId}:${round}`
    );

    answerOptions = shuffled
      .filter(
        x => phase === 'reveal' || x.authorId !== playerId
      )
      .map((x, i) => ({
        answerId: x.answerId,
        optionId: `option-${shuffled.indexOf(x)}`,
        text: x.text,
        ...(phase === 'reveal'
          ? {
              isCorrect: x.answerId === 'real',
              authorName: x.authorId
                ? players.find(
                    p => p.id === x.authorId
                  )?.name
                : null,
              votes: votes.filter(
                v => v.answerId === x.answerId
              ).length
            }
          : {})
      }));
  }

  const allScores = playerList.sort(
    (a, b) => b.score - a.score || a.slot - b.slot
  );

  return json({
    roomCode: c,
    gameId: meta.gameId,
    players: playerList,
    phase,
    round,
    totalRounds: 3,
    question: currentQuestion
      ? {
          prompt: currentQuestion.prompt,
          fact: phase === 'reveal'
            ? currentQuestion.fact
            : null
        }
      : null,
    submittedCount: submissions.length,
    votedCount: votes.length,
    playerCount: players.length,
    mySubmission: phase === 'writing'
      ? Boolean(mySubmission)
      : undefined,
    myVote: phase === 'voting'
      ? Boolean(myVote)
      : undefined,
    answerOptions,
    correctAnswer: phase === 'reveal'
      ? currentQuestion.answer
      : null,
    leaderboard: allScores,
    canStart:
      players.length >= 2 &&
      playerId === meta.hostId &&
      !start,
    canAdvance:
      playerId === meta.hostId &&
      phase === 'reveal' &&
      round < 3,
    gameOver: phase === 'reveal' && round === 3,
    deadlines: {
      writing: roundStart
        ? roundStart + 60000
        : null,
      voting: phase === 'voting'
        ? voteStartedAt + 45000
        : null
    }
  });
}

async function action(s, body) {
  const c = String(body.roomCode || '').toUpperCase();
  const meta = await getRoom(s, c);

  if (!meta) {
    return json({
      error: 'Room not found.'
    }, 404);
  }

  const playerId = String(body.playerId || '');
  const players = await getPlayers(s, c);

  if (!players.some(p => p.id === playerId)) {
    return json({
      error: 'You are not in this room. Rejoin with the room code.'
    }, 403);
  }

  const prefix = eventPrefix(c, meta.gameId);
  const events = await listJSON(s, prefix);

  const start = events.find(
    x => x.value.type === 'start'
  )?.value;

  // Host-only action to end the game for everyone.
  if (body.action === 'endGame') {
    if (playerId !== meta.hostId) {
      return json({
        error: 'Only the host can end the game.'
      }, 403);
    }

    const result = await putNew(
      s,
      `${prefix}ended`,
      {
        type: 'endGame',
        playerId,
        at: Date.now()
      }
    );

    if (!result.modified) {
      return json({
        error: 'This game has already ended.'
      }, 409);
    }

    return json({
      ok: true
    });
  }

  // Stop all other game actions after the host ends the game.
  if (
    events.some(x => x.value.type === 'endGame')
  ) {
    return json({
      error: 'This game has ended.'
    }, 410);
  }

  if (body.action === 'start') {
    if (playerId !== meta.hostId) {
      return json({
        error: 'Only the host can start the game.'
      }, 403);
    }

    if (players.length < 2) {
      return json({
        error: 'At least 2 players are needed.'
      }, 400);
    }

    const questionIndexes = shuffle(
      [...QUESTIONS.keys()],
      meta.gameId
    ).slice(0, 3);

    const result = await putNew(
      s,
      `${prefix}start`,
      {
        type: 'start',
        at: Date.now(),
        questionIndexes
      }
    );

    if (!result.modified) {
      return json({
        error: 'The game has already started.'
      }, 409);
    }

    return json({
      ok: true
    });
  }

  if (!start) {
    return json({
      error: 'The host has not started the game yet.'
    }, 409);
  }

  const advances = events
    .filter(x => x.value.type === 'advance')
    .map(x => x.value)
    .sort((a, b) => a.round - b.round);

  const round = advances.length
    ? advances[advances.length - 1].round
    : 1;

  const roundStart = advances.length
    ? advances[advances.length - 1].at
    : start.at;

  const submissions = events
    .filter(
      x =>
        x.value.type === 'submission' &&
        x.value.round === round
    )
    .map(x => x.value);

  const votes = events
    .filter(
      x =>
        x.value.type === 'vote' &&
        x.value.round === round
    )
    .map(x => x.value);

  if (body.action === 'submit') {
    if (
      Date.now() > roundStart + 60000 ||
      submissions.length >= players.length
    ) {
      return json({
        error: 'The answer-submission phase has ended.'
      }, 409);
    }

    const text = cleanText(body.text);

    if (text.length < 2) {
      return json({
        error: 'Your bluff must contain at least 2 characters.'
      }, 400);
    }

    if (
      text.toLowerCase() ===
      QUESTIONS[start.questionIndexes[round - 1]]
        .answer.toLowerCase()
    ) {
      return json({
        error: 'That is the real answer! Try a convincing fake.'
      }, 400);
    }

    const result = await putNew(
      s,
      `${prefix}submission:${round}:${playerId}`,
      {
        type: 'submission',
        round,
        playerId,
        answerId: id(),
        text,
        at: Date.now()
      }
    );

    if (!result.modified) {
      return json({
        error: 'You have already submitted this round.'
      }, 409);
    }

    return json({
      ok: true
    });
  }

  if (body.action === 'vote') {
    const voteStart =
      submissions.length >= players.length
        ? Math.max(...submissions.map(x => x.at))
        : roundStart + 60000;

    if (
      Date.now() < roundStart + 60000 &&
      submissions.length < players.length
    ) {
      return json({
        error: 'Wait until everyone submits or the timer ends.'
      }, 409);
    }

    if (
      Date.now() > voteStart + 45000 ||
      votes.length >= players.length
    ) {
      return json({
        error: 'Voting has ended.'
      }, 409);
    }

    const answerId = String(body.answerId || '');

    if (
      answerId !== 'real' &&
      !submissions.some(
        x =>
          x.answerId === answerId &&
          x.playerId !== playerId
      )
    ) {
      return json({
        error: 'That answer is not available to vote for.'
      }, 400);
    }

    const result = await putNew(
      s,
      `${prefix}vote:${round}:${playerId}`,
      {
        type: 'vote',
        round,
        playerId,
        answerId,
        at: Date.now()
      }
    );

    if (!result.modified) {
      return json({
        error: 'You have already voted this round.'
      }, 409);
    }

    return json({
      ok: true
    });
  }

  if (body.action === 'advance') {
    if (playerId !== meta.hostId) {
      return json({
        error: 'Only the host can advance the round.'
      }, 403);
    }

    const voteStart =
      submissions.length >= players.length
        ? Math.max(...submissions.map(x => x.at))
        : roundStart + 60000;

    const reveal =
      votes.length >= players.length ||
      Date.now() >= voteStart + 45000;

    if (!reveal) {
      return json({
        error: 'Wait for the voting round to finish.'
      }, 409);
    }

    if (round >= 3) {
      return json({
        error: 'The game is already complete.'
      }, 409);
    }

    const result = await putNew(
      s,
      `${prefix}advance:${round + 1}`,
      {
        type: 'advance',
        round: round + 1,
        at: Date.now()
      }
    );

    if (!result.modified) {
      return json({
        error: 'The next round has already started.'
      }, 409);
    }

    return json({
      ok: true
    });
  }

  if (body.action === 'rematch') {
    if (playerId !== meta.hostId) {
      return json({
        error: 'Only the host can start a rematch.'
      }, 403);
    }

    const newGameId = id();

    const nextMeta = {
      ...meta,
      gameId: newGameId,
      createdAt: Date.now()
    };

    const old = await s.getWithMetadata(
      roomKey(c),
      {
        type: 'json',
        consistency: 'strong'
      }
    );

    if (!old) {
      return json({
        error: 'Room not found.'
      }, 404);
    }

    const saved = await s.setJSON(
      roomKey(c),
      nextMeta,
      {
        onlyIfMatch: old.etag
      }
    );

    if (!saved.modified) {
      return json({
        error: 'Room changed at the same time. Please try again.'
      }, 409);
    }

    return json({
      ok: true,
      gameId: newGameId
    });
  }

  return json({
    error: 'Unknown action.'
  }, 400);
}

export default async (request) => {
  try {
    const s = store();

    if (request.method === 'GET') {
      const url = new URL(request.url);

      if (url.searchParams.get('health') === '1') {
        await s.list({
          prefix: 'health-check:'
        });

        return json({
          ok: true,
          function: 'game',
          blobs: 'available'
        });
      }

      const c = (
        url.searchParams.get('roomCode') || ''
      ).toUpperCase();

      const playerId =
        url.searchParams.get('playerId') || '';

      if (!/^[A-Z0-9]{6}$/.test(c) || !playerId) {
        return json({
          error: 'A valid room code and player session are required.'
        }, 400);
      }

      return await state(s, c, playerId);
    }

    if (request.method !== 'POST') {
      return json({
        error: 'Method not allowed.'
      }, 405);
    }

    const body = await request.json();

    if (body.action === 'create') {
      return await createRoom(s, body);
    }

    if (body.action === 'join') {
      return await joinRoom(s, body);
    }

    return await action(s, body);

  } catch (error) {
    console.error('Bluff Battle API error:', error);

    return json({
      error: 'Something went wrong. Please try again.'
    }, 500);
  }
};
