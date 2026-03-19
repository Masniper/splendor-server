import { Server, Socket } from 'socket.io';
import { activeRooms } from './room.handler';
import { 
  takeTokens, 
  purchaseCard, 
  reserveCardFromBoard, 
  reserveCardFromDeck,
  discardTokens, 
  chooseNoble 
} from '../game/actions';
import { GemColor } from '../game/models';

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

  const applyGameStateUpdate = (room: any, newGameState: any, roomId: string) => {
    room.gameState = newGameState;
    
    if (newGameState.winner) {
      room.status = 'finished';
      room.rematchRequests = [];
      
      io.to(roomId).emit('game:over', {
        winner: newGameState.winner,
        finalState: newGameState
      });
      
      console.log(`[Game] Game over in room ${roomId}, winner: ${newGameState.winner.name}`);
    }
  };

  // 1. Take Tokens
  socket.on('game:takeTokens', (roomId: string, tokens: GemColor[], discardTokens: GemColor[] = []) => {
    try {
      const room = getValidRoom(roomId);
      const updatedState = takeTokens(room.gameState!, tokens, discardTokens);
      applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
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
      const updatedState = purchaseCard(room.gameState!, cardId);
      applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
      console.log(`[Game] User ${username} purchased card ${cardId} in room ${roomId}`);
    } catch (error: any) {
      console.error(`[Game] Error in purchaseCard for user ${username}:`, error.message);
      socket.emit('game:error', { message: error.message });
    }
  });

  // 3. Reserve Card
  socket.on(
    'game:reserveCard',
    (roomId: string, cardId: string, discardTokens: GemColor[] = []) => {
      try {
        const room = getValidRoom(roomId);
        const updatedState = reserveCardFromBoard(room.gameState!, cardId, discardTokens);
        applyGameStateUpdate(room, updatedState, roomId);
        io.to(roomId).emit('game:updated', { gameState: room.gameState });
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
    (roomId: string, level: 1 | 2 | 3, discardTokens: GemColor[] = []) => {
      try {
        const room = getValidRoom(roomId);
        const updatedState = reserveCardFromDeck(room.gameState!, level, discardTokens);
        applyGameStateUpdate(room, updatedState, roomId);
        io.to(roomId).emit('game:updated', { gameState: room.gameState });
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
      const updatedState = discardTokens(room.gameState!, tokensToDiscard);
      applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
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
      applyGameStateUpdate(room, updatedState, roomId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
      console.log(`[Game] User ${username} chose noble ${nobleId} in room ${roomId}`);
    } catch (error: any) {
      console.error(`[Game] Error in chooseNoble for user ${username}:`, error.message);
      socket.emit('game:error', { message: error.message });
    }
  });
}
