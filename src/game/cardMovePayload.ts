import type { DevelopmentCard, GameState } from './models';
import { GemColor } from './models';

export type CardMoveSource = 'board' | 'reserved' | 'deck';

export type CardMoveSocketPayload = {
  playerId: string;
  cardId: string;
  action: 'purchase' | 'reserve' | 'reserve_from_deck';
  colorBonus: Exclude<GemColor, GemColor.Gold>;
  cardIndex1Based: number;
  source: CardMoveSource;
  level?: 1 | 2 | 3;
  gaveGold: boolean;
};

function cardIndexFromId(cardId: string): number {
  const m = /^c-(\d+)$/i.exec(cardId.trim());
  return m ? parseInt(m[1], 10) : 1;
}

/** Card on board before purchase/reserve from board. */
export function findCardOnBoard(
  state: GameState,
  cardId: string,
): { card: DevelopmentCard; level: 1 | 2 | 3 } | null {
  for (const l of [1, 2, 3] as const) {
    const c = state.boardCards[`level${l}`].find((x) => x.id === cardId);
    if (c) return { card: c, level: l };
  }
  return null;
}

/** Card on board or in current player's reserved (before purchase). */
export function findCardForPurchase(
  state: GameState,
  cardId: string,
  currentPlayerIndex: number,
): { card: DevelopmentCard; source: 'board' | 'reserved'; level?: 1 | 2 | 3 } | null {
  const onBoard = findCardOnBoard(state, cardId);
  if (onBoard) {
    return { card: onBoard.card, source: 'board', level: onBoard.level };
  }
  const p = state.players[currentPlayerIndex];
  const c = p.reservedCards.find((x) => x.id === cardId);
  if (c) return { card: c, source: 'reserved' };
  return null;
}

export function toCardMovePayload(
  card: DevelopmentCard,
  playerId: string,
  action: CardMoveSocketPayload['action'],
  source: CardMoveSource,
  level: 1 | 2 | 3 | undefined,
  gaveGold: boolean,
): CardMoveSocketPayload {
  return {
    playerId,
    cardId: card.id,
    action,
    colorBonus: card.colorBonus,
    cardIndex1Based: cardIndexFromId(card.id),
    source,
    level,
    gaveGold,
  };
}
