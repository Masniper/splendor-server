import {
  GameState,
  Player,
  GemColor,
  GemCount,
  DevelopmentCard,
  NobleTile,
} from "./models";

export const createEmptyGemCount = (): GemCount => ({
  [GemColor.Emerald]: 0,
  [GemColor.Diamond]: 0,
  [GemColor.Sapphire]: 0,
  [GemColor.Onyx]: 0,
  [GemColor.Ruby]: 0,
  [GemColor.Gold]: 0,
});

const shuffleArray = <T>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const initializeGame = (
  roomId: string,
  playersInfo: { id: string; name: string }[],
  allLevel1Cards: DevelopmentCard[],
  allLevel2Cards: DevelopmentCard[],
  allLevel3Cards: DevelopmentCard[],
  allNobles: NobleTile[],
): GameState => {
  const playerCount = playersInfo.length;
  if (playerCount < 2 || playerCount > 4) {
    throw new Error("Game requires 2 to 4 players.");
  }

  // 1. Setup Bank based on player count
  let standardGemCount = 7;
  if (playerCount === 2) standardGemCount = 4;
  if (playerCount === 3) standardGemCount = 5;

  const bank: GemCount = {
    [GemColor.Emerald]: standardGemCount,
    [GemColor.Diamond]: standardGemCount,
    [GemColor.Sapphire]: standardGemCount,
    [GemColor.Onyx]: standardGemCount,
    [GemColor.Ruby]: standardGemCount,
    [GemColor.Gold]: 5,
  };

  // 2. Shuffle and deal cards
  const shuffledLevel1 = shuffleArray(allLevel1Cards);
  const shuffledLevel2 = shuffleArray(allLevel2Cards);
  const shuffledLevel3 = shuffleArray(allLevel3Cards);

  const boardCards = {
    level1: shuffledLevel1.splice(0, 4),
    level2: shuffledLevel2.splice(0, 4),
    level3: shuffledLevel3.splice(0, 4),
  };

  const decks = {
    level1: shuffledLevel1,
    level2: shuffledLevel2,
    level3: shuffledLevel3,
  };

  // 3. Shuffle and deal nobles
  const shuffledNobles = shuffleArray(allNobles);
  const boardNobles = shuffledNobles.splice(0, playerCount + 1);

  // 4. Setup Players
  const players: Player[] = playersInfo.map((p) => ({
    id: p.id,
    name: p.name,
    reservedCards: [],
    purchasedCards: [],
    ownedTokens: createEmptyGemCount(),
    ownedNobles: [],
    currentScore: 0,
    currentBonuses: {},
  }));

  // 5. Return Initial Game State
  return {
    id: roomId,
    players,
    currentPlayerIndex: 0,
    bank,
    boardCards,
    decks,
    boardNobles,
    isLastRound: false,
    winner: null,
    turnPhase: "MainAction",
    pendingNobles: [],
  };
};
