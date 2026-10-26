'use strict';

const { GameEngine } = require('./engine');

describe('GameEngine rally pass behavior', () => {
  test('passed players are skipped until rally resets', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const state = GameEngine.initGame(ids, 1, 'A');
    const active = { ...state, currentTurn: 'B', lastPlayerId: 'A', passedPlayers: [] };

    const skipB = GameEngine.processSkip(active, 'B');
    expect(skipB.ok).toBe(true);
    expect(skipB.event.type).toBe('player_skipped');
    expect(skipB.state.passedPlayers).toContain('B');
    expect(skipB.state.currentTurn).toBe('C');

    const skipC = GameEngine.processSkip(skipB.state, 'C');
    expect(skipC.ok).toBe(true);
    expect(skipC.event.type).toBe('player_skipped');
    expect(skipC.state.passedPlayers).toEqual(expect.arrayContaining(['B', 'C']));
    expect(skipC.state.currentTurn).toBe('D');

    const skipD = GameEngine.processSkip(skipC.state, 'D');
    expect(skipD.ok).toBe(true);
    expect(skipD.event.type).toBe('rally_ended');
    expect(skipD.state.passedPlayers).toEqual([]);
    expect(skipD.state.table).toEqual([]);
    expect(skipD.state.currentTurn).toBe('A');
  });

  test('a player who passed does not receive another turn in same rally', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const active = { ...GameEngine.initGame(ids, 1, 'A'), currentTurn: 'B', lastPlayerId: 'A', passedPlayers: [] };

    const skipB = GameEngine.processSkip(active, 'B');
    expect(skipB.state.currentTurn).toBe('C');

    const skipC = GameEngine.processSkip(skipB.state, 'C');
    expect(skipC.state.currentTurn).toBe('D');

    const nextAfterD = GameEngine._nextActive(ids, 'D', new Set(skipC.state.passedPlayers));
    expect(nextAfterD).toBe('A');
    expect(skipC.state.passedPlayers).not.toContain('A');
  });

  test('rally ends when only one active player remains and restores all players next rally', () => {
    const ids = ['A', 'B', 'C', 'D'];
    const state = {
      ...GameEngine.initGame(ids, 1, 'A'),
      currentTurn: 'D',
      lastPlayerId: 'C',
      passedPlayers: ['B'],
      table: [{ playerId: 'A', combo: { type: 'single', cards: [{ id: '1' }] } }, { playerId: 'C', combo: { type: 'single', cards: [{ id: '2' }] } }],
    };

    const skipD = GameEngine.processSkip(state, 'D');
    expect(skipD.ok).toBe(true);
    expect(skipD.event.type).toBe('player_skipped');
    expect(skipD.state.currentTurn).toBe('A');
    expect(skipD.state.passedPlayers).toEqual(expect.arrayContaining(['B', 'D']));

    const skipA = GameEngine.processSkip(skipD.state, 'A');
    expect(skipA.ok).toBe(true);
    expect(skipA.event.type).toBe('rally_ended');
    expect(skipA.state.currentTurn).toBe('C');
    expect(skipA.state.passedPlayers).toEqual([]);
    expect(skipA.state.table).toEqual([]);
  });
});
