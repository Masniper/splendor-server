import { Server, Socket } from 'socket.io';
import type { Room } from './room.handler';
import { activeRooms } from './room.handler';

/** Match front-end `utils/tokenFlight.ts` (duration + stagger + buffer). */
function tokenFlightTotalMs(len: number): number {
  if (len <= 0) return 0;
  return Math.round(520 + Math.max(0, len - 1) * 75 + 90);
}

function delayAfterTokenFlights(takeLen: number, discardLen: number): number {
  return tokenFlightTotalMs(takeLen) + tokenFlightTotalMs(discardLen) + 120;
}

/** Align with splendor-net `MOVECARD_DURATION` (~1000ms) and front-end `CARD_FLIGHT_DURATION_MS`. */
const CARD_MOVE_MS = 1000;

function delayAfterCardAndOptionalGoldMs(gaveGold: boolean): number {
  const goldMs = gaveGold ? tokenFlightTotalMs(1) : 0;
  return Math.max(CARD_MOVE_MS, goldMs) + 120;
}

import {
  takeTokens,
  purchaseCard,
  reserveCardFromBoard,
  reserveCardFromDeck,
  discardTokens,
  chooseNoble,
} from '../game/actions';
import type { GameState } from '../game/models';
import { GemColor } from '../game/models';
import {
  findCardForPurchase,
  findCardOnBoard,
  toCardMovePayload,
} from '../game/cardMovePayload';
import {
  settleRoomBets,
  type SettleRoomBetsResult,
} from '../services/bet.service';

export function registerGameHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;
  const username = socket.data.username;

  // Helper function to validate room and game state
  const getValidRoom = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    if (room.status !== 'playing' || !room.gameState) {
      throw new Error('Game is not active');
    }

    // Check if waiting for reconnection
    if (room.waitingForReconnection) {
      throw new Error('Waiting for players to reconnect');
    }

    // Check if the user is a registered player in this room
    const player = room.players.find(p => p.userId === userId);
    if (!player) {
      throw new Error('You are not in this room');
    }

    // Check if player is connected
    if (player.socketId === null) {
      throw new Error('You are disconnected from the game');
    }

    return room;
  };

  const applyGameStateUpdate = async (
    room: Room,
    newGameState: GameState,
    roomId: string,
  ): Promise<void> => {
    room.gameState = newGameState;

    if (newGameState.winner) {
      room.status = 'finished';
      room.rematchRequests = [];

      let winnerStats: SettleRoomBetsResult['winnerStats'] | null = null;
      let loserStats: SettleRoomBetsResult['loserStats'] = [];
      try {
        const settleResult = await settleRoomBets(
          roomId,
          newGameState.winner.id,
        );
        winnerStats = settleResult.winnerStats ?? null;
        loserStats = settleResult.loserStats ?? [];
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[Game] Failed to settle bets for room ${roomId}:`, msg);
      }

      io.to(roomId).emit('game:over', {
        reason: 'Match finished',
        winner: newGameState.winner,
        winnerStats,
        loserStats,
        finalState: newGameState,
      });

      console.log(
        `[Game] Game over in room ${roomId}, winner: ${newGameState.winner.name}`,
      );
    }
  };

  // 1. Take Tokens
  socket.on('game:takeTokens', (roomId: string, tokens: GemColor[], discardTokens: GemColor[] = []) => {
    try {
      const room = getValidRoom(roomId);
      const actingPlayerId =
        room.gameState!.players[room.gameState!.currentPlayerIndex].id;
      const taken = tokens ?? [];
      const disc = discardTokens ?? [];
      const updatedState = takeTokens(room.gameState!, taken, disc);
      void applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit('game:tokensTaken', {
        playerId: actingPlayerId,
        tokens: [...taken],
        discardTokens: [...disc],
      });
      const delay = delayAfterTokenFlights(taken.length, disc.length);
      setTimeout(() => {
        const r = activeRooms.get(roomId);
        if (r?.gameState && r.status === 'playing') {
          io.to(roomId).emit('game:updated', { gameState: r.gameState });
        }
      }, Math.max(delay, 80));
      console.log(`[Game] User ${username} took tokens in room ${roomId}`);
    } catch (error: any) {
      console.error(`[Game] Error in takeTokens for user ${username}:`, error.message);
      socket.emit('game:error', { message: error.message });
    }
  });

  // 2. Purchase Card
  socket.on('game:purchaseCard', (roomId: string, cardId: string) => {
    try {
      const room = getValidRoom(roomId);
      const gs = room.gameState!;
      const idx = gs.currentPlayerIndex;
      const actingPlayerId = gs.players[idx].id;
      const snap = findCardForPurchase(gs, cardId, idx);
      if (!snap) {
        socket.emit('game:error', { message: 'Card not found.' });
        return;
      }
      const updatedState = purchaseCard(gs, cardId);
      void applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit(
        'game:cardMoved',
        toCardMovePayload(
          snap.card,
          actingPlayerId,
          'purchase',
          snap.source === 'board' ? 'board' : 'reserved',
          snap.level,
          false,
        ),
      );
      setTimeout(() => {
        const r = activeRooms.get(roomId);
        if (r?.gameState && r.status === 'playing') {
          io.to(roomId).emit('game:updated', { gameState: r.gameState });
        }
      }, CARD_MOVE_MS + 120);
      console.log(`[Game] User ${username} purchased card ${cardId} in room ${roomId}`);
    } catch (error: any) {
      console.error(`[Game] Error in purchaseCard for user ${username}:`, error.message);
      socket.emit('game:error', { message: error.message });
    }
  });

  // 3. Reserve Card
  socket.on(
    'game:reserveCard',
    (roomId: string, cardId: string, discardTokensArg: GemColor[] = []) => {
      try {
        const room = getValidRoom(roomId);
        const gs = room.gameState!;
        const actingPlayerId = gs.players[gs.currentPlayerIndex].id;
        const disc = discardTokensArg ?? [];
        const preGold = gs.bank[GemColor.Gold] > 0;
        const snap = findCardOnBoard(gs, cardId);
        if (!snap) {
          socket.emit('game:error', { message: 'Card not found on board.' });
          return;
        }
        const updatedState = reserveCardFromBoard(gs, cardId, disc);
        void applyGameStateUpdate(room, updatedState, roomId);
        const payload = toCardMovePayload(
          snap.card,
          actingPlayerId,
          'reserve',
          'board',
          snap.level,
          preGold,
        );

        const emitCardAndGold = () => {
          io.to(roomId).emit('game:cardMoved', payload);
          if (preGold) {
            io.to(roomId).emit('game:tokensTaken', {
              playerId: actingPlayerId,
              tokens: [GemColor.Gold],
              discardTokens: [],
            });
          }
          setTimeout(() => {
            const r = activeRooms.get(roomId);
            if (r?.gameState && r.status === 'playing') {
              io.to(roomId).emit('game:updated', { gameState: r.gameState });
            }
          }, delayAfterCardAndOptionalGoldMs(preGold));
        };

        if (disc.length > 0) {
          io.to(roomId).emit('game:tokensDiscarded', {
            playerId: actingPlayerId,
            tokens: [...disc],
          });
          setTimeout(emitCardAndGold, tokenFlightTotalMs(disc.length));
        } else {
          emitCardAndGold();
        }
        console.log(`[Game] User ${username} reserved card ${cardId} in room ${roomId}`);
      } catch (error: any) {
        console.error(`[Game] Error in reserveCard for user ${username}:`, error.message);
        socket.emit('game:error', { message: error.message });
      }
    },
  );

  // 3.5 Reserve Card From Deck (face-down)
  socket.on(
    'game:reserveFromDeck',
    (roomId: string, level: 1 | 2 | 3, discardTokensArg: GemColor[] = []) => {
      try {
        const room = getValidRoom(roomId);
        const gs = room.gameState!;
        const actingPlayerId = gs.players[gs.currentPlayerIndex].id;
        const disc = discardTokensArg ?? [];
        const preGold = gs.bank[GemColor.Gold] > 0;
        const actingIdx = gs.currentPlayerIndex;
        const updatedState = reserveCardFromDeck(gs, level, disc);
        void applyGameStateUpdate(room, updatedState, roomId);
        const reserved = updatedState.players[actingIdx].reservedCards;
        const card = reserved[reserved.length - 1];
        const payload = toCardMovePayload(
          card,
          actingPlayerId,
          'reserve_from_deck',
          'deck',
          level,
          preGold,
        );

        const emitCardAndGold = () => {
          io.to(roomId).emit('game:cardMoved', payload);
          if (preGold) {
            io.to(roomId).emit('game:tokensTaken', {
              playerId: actingPlayerId,
              tokens: [GemColor.Gold],
              discardTokens: [],
            });
          }
          setTimeout(() => {
            const r = activeRooms.get(roomId);
            if (r?.gameState && r.status === 'playing') {
              io.to(roomId).emit('game:updated', { gameState: r.gameState });
            }
          }, delayAfterCardAndOptionalGoldMs(preGold));
        };

        if (disc.length > 0) {
          io.to(roomId).emit('game:tokensDiscarded', {
            playerId: actingPlayerId,
            tokens: [...disc],
          });
          setTimeout(emitCardAndGold, tokenFlightTotalMs(disc.length));
        } else {
          emitCardAndGold();
        }
        console.log(`[Game] User ${username} reserved from deck level ${level} in room ${roomId}`);
      } catch (error: any) {
        console.error(`[Game] Error in reserveFromDeck for user ${username}:`, error.message);
        socket.emit('game:error', { message: error.message });
      }
    },
  );

  // 4. Discard Tokens
  socket.on('game:discardTokens', (roomId: string, tokensToDiscard: GemColor[]) => {
    try {
      const room = getValidRoom(roomId);
      const actingPlayerId =
        room.gameState!.players[room.gameState!.currentPlayerIndex].id;
      const updatedState = discardTokens(room.gameState!, tokensToDiscard);
      void applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit('game:tokensDiscarded', {
        playerId: actingPlayerId,
        tokens: [...tokensToDiscard],
      });
      const delay = delayAfterTokenFlights(0, tokensToDiscard.length);
      setTimeout(() => {
        const r = activeRooms.get(roomId);
        if (r?.gameState && r.status === 'playing') {
          io.to(roomId).emit('game:updated', { gameState: r.gameState });
        }
      }, Math.max(delay, 80));
      console.log(`[Game] User ${username} discarded tokens in room ${roomId}`);
    } catch (error: any) {
      console.error(`[Game] Error in discardTokens for user ${username}:`, error.message);
      socket.emit('game:error', { message: error.message });
    }
  });

  // 5. Choose Noble
  socket.on('game:chooseNoble', (roomId: string, nobleId: string) => {
    try {
      const room = getValidRoom(roomId);
      const updatedState = chooseNoble(room.gameState!, nobleId);
      void applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
      console.log(`[Game] User ${username} chose noble ${nobleId} in room ${roomId}`);
    } catch (error: any) {
      console.error(`[Game] Error in chooseNoble for user ${username}:`, error.message);
      socket.emit('game:error', { message: error.message });
    }
  });
}
