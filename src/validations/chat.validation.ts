import { z } from "zod";

/** In-room chat payload (ephemeral; not persisted). */
export const roomChatSendSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export type RoomChatSendPayload = z.infer<typeof roomChatSendSchema>;
