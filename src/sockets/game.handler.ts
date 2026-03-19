import { Server, Socket } from 'socket.io';
import { activeRooms } from './room.handler';
import { 
  takeTokens, 
  purchaseCard, 
  reserveCardFromBoard, 
  discardTokens, 
  chooseNoble 
} from '../game/actions';
import { GemColor } from '../game/models';

export function registerGameHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;

  // Helper function to validate room and game state
  const getValidRoom = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) throw new Error('Room not found');
    
    if (room.status !== 'playing' || !room.gameState) {
      throw new Error('Game is not active');
    }
    
    // Check if the user is a registered player in this room
    if (!room.players.some(p => p.userId === userId)) {
      throw new Error('You are not in this room');
    }
    
    return room;
  };

  // 1. Take Tokens
  socket.on('game:takeTokens', (roomId: string, tokens: GemColor[]) => {
    try {
      const room = getValidRoom(roomId);
      room.gameState = takeTokens(room.gameState!, tokens); 
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
    } catch (error: any) {
      socket.emit('game:error', { message: error.message });
    }
  });

  // 2. Purchase Card
  socket.on('game:purchaseCard', (roomId: string, cardId: string) => {
    try {
      const room = getValidRoom(roomId);
      room.gameState = purchaseCard(room.gameState!, cardId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
    } catch (error: any) {
      socket.emit('game:error', { message: error.message });
    }
  });

  // 3. Reserve Card
  socket.on('game:reserveCard', (roomId: string, cardId: string) => {
    try {
      const room = getValidRoom(roomId);
      room.gameState = reserveCardFromBoard(room.gameState!, cardId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
    } catch (error: any) {
      socket.emit('game:error', { message: error.message });
    }
  });

  // 4. Discard Tokens
  socket.on('game:discardTokens', (roomId: string, tokensToDiscard: GemColor[]) => {
    try {
      const room = getValidRoom(roomId);
      room.gameState = discardTokens(room.gameState!, tokensToDiscard);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
    } catch (error: any) {
      socket.emit('game:error', { message: error.message });
    }
  });

  // 5. Choose Noble
  socket.on('game:chooseNoble', (roomId: string, nobleId: string) => {
    try {
      const room = getValidRoom(roomId);
      room.gameState = chooseNoble(room.gameState!, nobleId);
      io.to(roomId).emit('game:updated', { gameState: room.gameState });
    } catch (error: any) {
      socket.emit('game:error', { message: error.message });
    }
  });
}
