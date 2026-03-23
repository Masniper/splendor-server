import {
  GameState,
  GemColor,
  DevelopmentCard,
  Player,
  GemCount,
} from "./models";

export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GameError";
  }
}

const cloneState = (state: GameState): GameState => JSON.parse(JSON.stringify(state));

export const getTotalTokens = (player: Player): number => {
  return Object.values(player.ownedTokens).reduce(
    (sum, count) => sum + count,
    0,
  );
};

export const canAffordCard = (
  player: Player,
  card: DevelopmentCard,
): boolean => {
  let missingTokens = 0;
  for (const [colorStr, cost] of Object.entries(card.cost)) {
    const color = colorStr as GemColor;
    const available =
      player.ownedTokens[color] + (player.currentBonuses[color] || 0);
    if (available < cost) {
      missingTokens += cost - available;
    }
  }
  return player.ownedTokens[GemColor.Gold] >= missingTokens;
};

const finalizeTurn = (state: GameState): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];

  if (currentPlayer.currentScore >= 15) {
    state.isLastRound = true;
  }

  state.currentPlayerIndex =
    (state.currentPlayerIndex + 1) % state.players.length;
  state.turnPhase = "MainAction";
  state.pendingNobles = [];

  if (state.isLastRound && state.currentPlayerIndex === 0) {
    let winner = state.players[0];
    for (let i = 1; i < state.players.length; i++) {
      const p = state.players[i];
      if (p.currentScore > winner.currentScore) {
        winner = p;
      } else if (p.currentScore === winner.currentScore) {
        if (p.purchasedCards.length < winner.purchasedCards.length) {
          winner = p;
        }
      }
    }
    state.winner = winner;
  }

  return state;
};

const checkNoblesAndEndTurn = (state: GameState): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];

  const eligibleNobles = state.boardNobles.filter((noble) => {
    for (const [colorStr, required] of Object.entries(noble.requiredBonuses)) {
      const color = colorStr as GemColor;
      if ((currentPlayer.currentBonuses[color] || 0) < required) {
        return false;
      }
    }
    return true;
  });

  if (eligibleNobles.length === 1) {
    const noble = eligibleNobles[0];
    currentPlayer.ownedNobles.push(noble);
    currentPlayer.currentScore += noble.prestigePoints;
    state.boardNobles = state.boardNobles.filter((n) => n.id !== noble.id);
  } else if (eligibleNobles.length > 1) {
    state.turnPhase = "ChooseNoble";
    state.pendingNobles = eligibleNobles;
    return state;
  }

  return finalizeTurn(state);
};

const endOfMainAction = (state: GameState): GameState => {
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (getTotalTokens(currentPlayer) > 10) {
    state.turnPhase = "DiscardTokens";
    return state;
  }
  return checkNoblesAndEndTurn(state);
};

const applyDiscardTokens = (
  state: GameState,
  player: Player,
  discardTokens: GemColor[],
) => {
  if (!discardTokens || discardTokens.length === 0) return;

  const currentTotal = getTotalTokens(player);
  if (currentTotal - discardTokens.length !== 10) {
    throw new GameError(
      `You must discard exactly ${currentTotal - 10} tokens.`,
    );
  }

  const counts: Partial<Record<GemColor, number>> = {};
  for (const t of discardTokens) {
    counts[t] = (counts[t] || 0) + 1;
  }

  for (const [colorStr, count] of Object.entries(counts)) {
    const color = colorStr as GemColor;
    if (player.ownedTokens[color] < count) {
      throw new GameError(`You do not have enough ${color} tokens to discard.`);
    }
  }

  for (const color of discardTokens) {
    player.ownedTokens[color]--;
    state.bank[color]++;
  }
};

export const takeTokens = (
  state: GameState,
  tokens: GemColor[],
  discardTokens: GemColor[] = [],
): GameState => {
  if (state.turnPhase !== "MainAction")
    throw new GameError("Not in main action phase.");
  if (tokens.length === 0) throw new GameError("Must select tokens to take.");
  if (tokens.includes(GemColor.Gold))
    throw new GameError("Cannot take Gold tokens directly.");

  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayerIndex];

  const counts: Partial<Record<GemColor, number>> = {};
  for (const t of tokens) {
    counts[t] = (counts[t] || 0) + 1;
  }

  const uniqueColors = Object.keys(counts).length;

  if (tokens.length === 2 && uniqueColors === 1) {
    const color = tokens[0];
    if (newState.bank[color] < 4) {
      throw new GameError(
        `Must be at least 4 ${color} tokens in the bank to take two.`,
      );
    }
  } else if (tokens.length <= 3 && uniqueColors === tokens.length) {
    for (const color of tokens) {
      if (newState.bank[color] < 1) {
        throw new GameError(`Not enough ${color} tokens in the bank.`);
      }
    }
  } else {
    throw new GameError(
      "Invalid token selection. Take 3 different or 2 of the same.",
    );
  }

  for (const color of tokens) {
    newState.bank[color]--;
    player.ownedTokens[color]++;
  }

  const totalAfter = getTotalTokens(player);
  if (totalAfter > 10) {
    if (!discardTokens || discardTokens.length === 0) {
      newState.turnPhase = "DiscardTokens";
      return newState;
    }
    applyDiscardTokens(newState, player, discardTokens);
  }

  return endOfMainAction(newState);
};

export const discardTokens = (
  state: GameState,
  tokensToDiscard: GemColor[],
): GameState => {
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayerIndex];

  if (newState.turnPhase !== "DiscardTokens") {
    throw new GameError("Not currently discarding tokens.");
  }

  const currentTotal = getTotalTokens(player);
  if (currentTotal - tokensToDiscard.length !== 10) {
    throw new GameError(
      `You must discard exactly ${currentTotal - 10} tokens.`,
    );
  }

  const counts: Partial<Record<GemColor, number>> = {};
  for (const t of tokensToDiscard) {
    counts[t] = (counts[t] || 0) + 1;
  }

  for (const [colorStr, count] of Object.entries(counts)) {
    const color = colorStr as GemColor;
    if (player.ownedTokens[color] < count) {
      throw new GameError(`You do not have enough ${color} tokens to discard.`);
    }
  }

  for (const color of tokensToDiscard) {
    player.ownedTokens[color]--;
    newState.bank[color]++;
  }

  return checkNoblesAndEndTurn(newState);
};

export const chooseNoble = (state: GameState, nobleId: string): GameState => {
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayerIndex];

  if (newState.turnPhase !== "ChooseNoble") {
    throw new GameError("Not currently choosing a noble.");
  }

  const noble = newState.pendingNobles.find((n) => n.id === nobleId);
  if (!noble) {
    throw new GameError("Invalid noble selection.");
  }

  player.ownedNobles.push(noble);
  player.currentScore += noble.prestigePoints;
  newState.boardNobles = newState.boardNobles.filter((n) => n.id !== noble.id);

  return finalizeTurn(newState);
};

export const purchaseCard = (state: GameState, cardId: string): GameState => {
  if (state.turnPhase !== "MainAction")
    throw new GameError("Not in main action phase.");
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayerIndex];

  let cardToBuy: DevelopmentCard | undefined;
  let source: "board" | "reserved" | null = null;
  let level: 1 | 2 | 3 | null = null;

  for (const l of [1, 2, 3] as const) {
    const idx = newState.boardCards[`level${l}`].findIndex(
      (c) => c.id === cardId,
    );
    if (idx !== -1) {
      cardToBuy = newState.boardCards[`level${l}`][idx];
      source = "board";
      level = l;
      break;
    }
  }

  if (!cardToBuy) {
    const idx = player.reservedCards.findIndex((c) => c.id === cardId);
    if (idx !== -1) {
      cardToBuy = player.reservedCards[idx];
      source = "reserved";
    }
  }

  if (!cardToBuy) throw new GameError("Card not found.");
  if (!canAffordCard(player, cardToBuy))
    throw new GameError("Cannot afford this card.");

  let goldNeeded = 0;
  for (const [colorStr, cost] of Object.entries(cardToBuy.cost)) {
    const color = colorStr as GemColor;
    const available =
      player.ownedTokens[color] + (player.currentBonuses[color] || 0);
    if (available < cost) {
      const shortfall = cost - available;
      goldNeeded += shortfall;
      newState.bank[color] += player.ownedTokens[color];
      player.ownedTokens[color] = 0;
    } else {
      const tokensToPay = Math.max(
        0,
        cost - (player.currentBonuses[color] || 0),
      );
      newState.bank[color] += tokensToPay;
      player.ownedTokens[color] -= tokensToPay;
    }
  }

  if (goldNeeded > 0) {
    player.ownedTokens[GemColor.Gold] -= goldNeeded;
    newState.bank[GemColor.Gold] += goldNeeded;
  }

  player.purchasedCards.push(cardToBuy);
  player.currentScore += cardToBuy.prestigePoints;
  player.currentBonuses[cardToBuy.colorBonus] =
    (player.currentBonuses[cardToBuy.colorBonus] || 0) + 1;

  if (source === "board" && level) {
    const deck = newState.decks[`level${level}`];
    const board = newState.boardCards[`level${level}`];
    const idx = board.findIndex((c) => c.id === cardToBuy!.id);
    if (idx !== -1) {
      board.splice(idx, 1);
      if (deck.length > 0) {
        // Insert at the same position so the refill lands on the exact emptied slot
        board.splice(idx, 0, deck.shift()!);
      }
    }
  } else if (source === "reserved") {
    const idx = player.reservedCards.findIndex((c) => c.id === cardToBuy!.id);
    if (idx !== -1) {
      player.reservedCards.splice(idx, 1);
    }
  }

  return endOfMainAction(newState);
};

export const reserveCardFromBoard = (
  state: GameState,
  cardId: string,
  discardTokens: GemColor[] = [],
): GameState => {
  if (state.turnPhase !== "MainAction")
    throw new GameError("Not in main action phase.");
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayerIndex];

  if (player.reservedCards.length >= 3) {
    throw new GameError("Cannot reserve more than 3 cards.");
  }

  let cardToReserve: DevelopmentCard | undefined;
  let level: 1 | 2 | 3 | null = null;
  let reservedIdx = 0;

  for (const l of [1, 2, 3] as const) {
    const idx = newState.boardCards[`level${l}`].findIndex(
      (c) => c.id === cardId,
    );
    if (idx !== -1) {
      cardToReserve = newState.boardCards[`level${l}`][idx];
      level = l;
      reservedIdx = idx;
      newState.boardCards[`level${l}`].splice(idx, 1);
      break;
    }
  }

  if (!cardToReserve) {
    throw new GameError("Card not found on board.");
  }

  player.reservedCards.push(cardToReserve);

  if (newState.bank[GemColor.Gold] > 0) {
    newState.bank[GemColor.Gold]--;
    player.ownedTokens[GemColor.Gold]++;
  }

  if (level) {
    const deck = newState.decks[`level${level}`];
    if (deck.length > 0) {
      // Insert at the same position so the refill lands on the exact emptied slot
      newState.boardCards[`level${level}`].splice(reservedIdx, 0, deck.shift()!);
    }
  }

  const totalAfter = getTotalTokens(player);
  if (totalAfter > 10) {
    if (!discardTokens || discardTokens.length === 0) {
      newState.turnPhase = "DiscardTokens";
      return newState;
    }
    applyDiscardTokens(newState, player, discardTokens);
  }

  return endOfMainAction(newState);
};

export const reserveCardFromDeck = (
  state: GameState,
  level: 1 | 2 | 3,
  discardTokens: GemColor[] = [],
): GameState => {
  if (state.turnPhase !== "MainAction")
    throw new GameError("Not in main action phase.");
  const newState = cloneState(state);
  const player = newState.players[newState.currentPlayerIndex];

  if (player.reservedCards.length >= 3) {
    throw new GameError("Cannot reserve more than 3 cards.");
  }

  const deck = newState.decks[`level${level}`];
  if (deck.length === 0) {
    throw new GameError("No cards left in this deck.");
  }

  const cardToReserve = deck.shift()!;
  player.reservedCards.push(cardToReserve);

  if (newState.bank[GemColor.Gold] > 0) {
    newState.bank[GemColor.Gold]--;
    player.ownedTokens[GemColor.Gold]++;
  }

  const totalAfter = getTotalTokens(player);
  if (totalAfter > 10) {
    if (!discardTokens || discardTokens.length === 0) {
      newState.turnPhase = "DiscardTokens";
      return newState;
    }
    applyDiscardTokens(newState, player, discardTokens);
  }

  return endOfMainAction(newState);
};

export const takeSingleToken = (
  tokens: GemCount,
  color: GemColor,
): GemCount => ({
  ...tokens,
  [color]: (tokens[color] || 0) + 1,
});

export const giveSingleToken = (
  tokens: GemCount,
  color: GemColor,
): GemCount => {
  if ((tokens[color] || 0) <= 0) {
    throw new GameError(`Not enough ${color} tokens.`);
  }
  return {
    ...tokens,
    [color]: tokens[color] - 1,
  };
};

export const addBonus = (bonuses: GemCount, color: GemColor): GemCount => ({
  ...bonuses,
  [color]: (bonuses[color] || 0) + 1,
});
