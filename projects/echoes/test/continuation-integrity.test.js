import test from "node:test";
import assert from "node:assert/strict";
import { createDatabase, startGame, humanMove, advanceGhost, currentGame, archiveReplies, continueEncounter, discoveryScore } from "../src/core/game.js";
import { validateDatabase } from "../src/storage/validation.js";

const Y = { from: { x: 1, y: 2 }, to: { x: 2, y: 1 } };

function firstDiscovery(turnLimit = 12) {
  return advanceGhost(humanMove(startGame(createDatabase(), { turnLimit }), Y));
}

test("pending and replayed continuations reject forged opening provenance", () => {
  const pending = continueEncounter(firstDiscovery());
  assert.doesNotThrow(() => validateDatabase(pending));
  const corruptions = [
    game => { game.openingSource.gameId = game.id; },
    game => { game.openingSource.moveIndex = 99; },
    game => { game.openingSource.transform.orientation = 1; },
    game => { game.openingSource.transform.dx = 1; },
    game => { game.archiveGameIds = []; },
    game => { game.turn = "human"; },
  ];
  for (const corrupt of corruptions) {
    const forged = structuredClone(pending);
    corrupt(currentGame(forged));
    assert.throws(() => validateDatabase(forged));
  }

  const replayed = advanceGhost(pending);
  assert.doesNotThrow(() => validateDatabase(replayed));
  const forgedReplay = structuredClone(replayed);
  currentGame(forgedReplay).moves[0].source.moveIndex = 99;
  assert.throws(() => validateDatabase(forgedReplay), /source/i);
  const erasedOpening = structuredClone(replayed);
  delete currentGame(erasedOpening).openingSource;
  assert.throws(() => validateDatabase(erasedOpening), /turn/i);
});

test("a ghost opening preserves all twelve human turns and its complete replay validates", () => {
  let db = advanceGhost(continueEncounter(firstDiscovery()));
  assert.equal(currentGame(db).moves[0].actor, "ghost");
  assert.equal(currentGame(db).humanTurns, 0);
  for (let turn = 1; turn <= 12; turn++) {
    const game = currentGame(db);
    assert.equal(game.status, "playing", `human turn ${turn} is available`);
    assert.equal(game.turn, "human");
    const recordedReply = archiveReplies(db, game.board)[0];
    assert.ok(recordedReply, "the symmetric opening provides an archived continuation");
    db = advanceGhost(humanMove(db, recordedReply.move));
    assert.equal(currentGame(db).humanTurns, turn);
    assert.doesNotThrow(() => validateDatabase(db));
  }
  const finished = currentGame(db);
  assert.equal(finished.status, "held");
  assert.equal(finished.moves.length, 25, "one opening ghost plus twelve human/ghost pairs");
  assert.deepEqual(validateDatabase(JSON.parse(JSON.stringify(db))), db);
});

test("legacy completed saves without frontier metadata can continue with exact provenance", () => {
  const legacy = firstDiscovery();
  delete legacy.games[0].initialBoard;
  delete legacy.games[0].handoffs;
  const duplicate = structuredClone(legacy.games[0]);
  duplicate.id = "legacy-repeated-discovery";
  duplicate.archiveGameIds = [legacy.games[0].id];
  legacy.games.push(duplicate);
  legacy.activeGameId = duplicate.id;
  const loaded = validateDatabase(JSON.parse(JSON.stringify(legacy)));
  assert.equal(discoveryScore(loaded), 1, "legacy repeated wins count as one discovery");
  const next = continueEncounter(loaded);
  assert.doesNotThrow(() => validateDatabase(next));
  const resumed = advanceGhost(validateDatabase(JSON.parse(JSON.stringify(next))));
  assert.deepEqual(currentGame(resumed).board, duplicate.board);
  assert.equal(currentGame(resumed).moves[0].source.gameId, duplicate.id);
  assert.deepEqual(resumed.games.slice(0, 2), legacy.games, "legacy history remains intact");
  assert.doesNotThrow(() => validateDatabase(resumed));
});
