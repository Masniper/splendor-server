/** Row shape used in HTTP and socket public list payloads */
export type PublicRoomListItem = {
  id: string;
  name: string;
  hostName: string;
  playerCount: number;
  status: string;
  canJoin: boolean;
  betAmount: number;
  isPublic: boolean;
};

export type CreateRoomSocketPayload = {
  isPublic?: boolean;
  roomName?: string;
  betAmount?: number;
};
