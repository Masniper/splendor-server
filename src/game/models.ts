export enum GemColor {
  Emerald = 'Emerald',
  Diamond = 'Diamond',
  Sapphire = 'Sapphire',
  Onyx = 'Onyx',
  Ruby = 'Ruby',
  Gold = 'Gold', // Joker
}

export type GemCount = {
  [key in GemColor]: number;
};

export interface DevelopmentCard {
  id: string;
  level: 1 | 2 | 3;
  cost: Partial<GemCount>;
  prestigePoints: number;
  colorBonus: Exclude<GemColor, GemColor.Gold>;
  imageUrl?: string;
}

export interface NobleTile {
  id: string;
  requiredBonuses: Partial<GemCount>;
  prestigePoints: number; // Always 3
  imageUrl?: string;
}

export interface Player {
  id: string; // User ID from database
  name: string; // Username
  reservedCards: DevelopmentCard[]; // Max 3
  purchasedCards: DevelopmentCard[];
  ownedTokens: GemCount;
  ownedNobles: NobleTile[];
  currentScore: number;
  currentBonuses: Partial<GemCount>;
}

export type TurnPhase = 'MainAction' | 'DiscardTokens' | 'ChooseNoble';

export interface GameState {
  id: string; // Room ID
  players: Player[];
  currentPlayerIndex: number;
  bank: GemCount;
  boardCards: {
    level1: DevelopmentCard[];
    level2: DevelopmentCard[];
    level3: DevelopmentCard[];
  };
  decks: {
    level1: DevelopmentCard[];
    level2: DevelopmentCard[];
    level3: DevelopmentCard[];
  };
  boardNobles: NobleTile[];
  isLastRound: boolean;
  winner: Player | null;
  turnPhase: TurnPhase;
  pendingNobles: NobleTile[];
}
