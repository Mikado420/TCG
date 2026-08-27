/**
 * Custom TCG Core Type Definitions
 * Specification Version: Rules Ver.0.03 / CardPool Ver.2.3
 */

export type FactionCode = 'RED' | 'BLUE' | 'GREEN' | 'HOLY' | 'DARK' | 'NEUTRAL';
export type FactionName = '朱' | '蒼' | '翠' | '聖' | '冥' | '無';

export type CardType = 'UNIT' | 'EVOLVE_UNIT' | 'SPELL' | 'RUNE' | 'DOMAIN';
export type CardClassification = 'SMALL' | 'MEDIUM' | 'LARGE';

export type Race =
  | 'FAUNA' // フォウナ (朱/無)
  | 'DRAGON' // ドラゴン (朱)
  | 'MECHANOID' // メカノイド (朱)
  | 'MAGE' // メイジ (蒼)
  | 'ORACLE' // オラクル (蒼)
  | 'AQUATILIS' // アクアティリス (蒼)
  | 'FAIRY' // フェアリー (翠/無)
  | 'TROLL' // トロール (翠)
  | 'FLORA' // フローラ (翠)
  | 'GUARDIAN' // ガーディアン (聖/無)
  | 'APOSTLE' // アポストル (聖)
  | 'STRUCTURE' // ストラクチャー (聖)
  | 'UNDEAD' // アンデッド (冥)
  | 'DEMON' // デーモン (冥)
  | 'GHOST'; // ゴースト (冥)

export interface EvolutionRequirement {
  faction: FactionCode;
  race: Race;
  description: string;
}

export interface CardData {
  cardId: string;
  name: string;
  cardType: CardType;
  faction: FactionCode;
  factionName: FactionName;
  classification?: CardClassification;
  race?: Race;
  raceName?: string;
  cost: number;
  atk: number;
  def: number;
  brk: number;
  dmg?: number; // Backward compatibility alias for brk
  effectsText: string;
  effectKeywords: string[];
  evolutionRequirement?: EvolutionRequirement;
  hasGuard?: boolean;
  hasHaste?: boolean;
  cantAttack?: boolean;
  canAttackActiveUnits?: boolean;
}

export interface CardBuff {
  id: string;
  type: 'ATK' | 'DEF' | 'BRK' | 'DMG' | 'GUARD' | 'IGNORE_GUARD' | 'CAN_ATTACK' | 'CANT_BE_GUARDED';
  value: number;
  duration: 'THIS_TURN' | 'NEXT_TURN_START' | 'PERMANENT';
  appliedTurn: number;
  sourceCardId: string;
}

export interface CardInstance {
  instanceId: string;
  cardId: string;
  baseCard: CardData;
  ownerId: 'PLAYER_A' | 'PLAYER_B';
  currentCost: number;
  currentAtk: number;
  currentDef: number;
  currentBrk: number;
  currentDmg?: number; // Alias for currentBrk
  isRested: boolean;
  summonedTurn: number;
  hasSummoningSickness: boolean;
  buffs: CardBuff[];
  evolvedFrom?: CardInstance;
  cannotBeGuardedThisTurn?: boolean;
  canAttackActiveThisTurn?: boolean;
}

export interface ArcanaSlot {
  instance: CardInstance;
  isRested: boolean;
}

export type PlayerId = 'PLAYER_A' | 'PLAYER_B';

export interface PlayerState {
  playerId: PlayerId;
  name: string;
  hp: number; // 結界 (Barrier value, starts at 5)
  maxHp: number; // 最大結界 (5)
  deck: CardInstance[];
  hand: CardInstance[];
  arcana: ArcanaSlot[];
  battlefield: CardInstance[]; // Max 6 units
  runes: CardInstance[]; // Max 2 runes
  domain: CardInstance | null; // Max 1 domain
  archive: CardInstance[];
  hasPlacedArcanaThisTurn: boolean;
  isAI: boolean;
  aiType: 'GEMINI' | 'HEURISTIC' | 'RANDOM' | 'HUMAN';
  // Metrics tracked within a game for this player
  unitsKilledThisTurn: number;
  unitsDestroyedCount: number;
  totalDamageDealt: number; // Total barrier broken
  cardsDrawnCount: number;
}

export type GamePhase =
  | 'START'
  | 'DRAW'
  | 'ARCANA'
  | 'ACTION'
  | 'GUARD_STEP'
  | 'RUNE_STEP'
  | 'END';

export interface ActionPayloadMap {
  DRAW: {};
  SET_ARCANA: { cardInstanceId: string };
  SKIP_ARCANA: {};
  PLAY_UNIT: { cardInstanceId: string };
  EVOLVE: { cardInstanceId: string; baseUnitInstanceId: string };
  PLAY_SPELL: { cardInstanceId: string; targetUnitInstanceId?: string; targetPlayerId?: PlayerId };
  SET_RUNE: { cardInstanceId: string };
  PLAY_DOMAIN: { cardInstanceId: string };
  ATTACK: {
    attackerInstanceId: string;
    targetType: 'PLAYER' | 'UNIT';
    targetUnitInstanceId?: string;
  };
  GUARD: {
    guardInstanceId?: string;
    doGuard: boolean;
  };
  TRIGGER_RUNE: {
    runeInstanceId?: string;
    activate: boolean;
    targetUnitInstanceId?: string;
  };
  END_TURN: {};
}

export type ActionType = keyof ActionPayloadMap;

export interface Action<T extends ActionType = ActionType> {
  type: T;
  playerId: PlayerId;
  payload: ActionPayloadMap[T];
  description?: string;
}

export interface LegalAction {
  action: Action;
  description: string;
  category: 'ARCANA' | 'SUMMON' | 'SPELL' | 'RUNE' | 'DOMAIN' | 'ATTACK' | 'GUARD' | 'TRIGGER' | 'PASS';
  cardId?: string;
  cardName?: string;
}

export interface CombatContext {
  attackerInstanceId: string;
  attackerPlayerId: PlayerId;
  targetType: 'PLAYER' | 'UNIT';
  targetUnitInstanceId?: string;
  guardedByInstanceId?: string;
}

export interface TriggerContext {
  triggerType: 'ON_ENTER' | 'ON_ATTACK' | 'ON_DESTROY' | 'ON_RUNE_USED' | 'ON_ARCANA_SET';
  sourceInstanceId: string;
  triggeringPlayerId: PlayerId;
  targetInstanceId?: string;
  targetDef?: number;
}

export interface GameState {
  gameId: string;
  turnNumber: number;
  activePlayer: PlayerId;
  phase: GamePhase;
  firstPlayer: PlayerId;
  secondPlayer: PlayerId;
  playerA: PlayerState;
  playerB: PlayerState;
  winner: PlayerId | 'DRAW' | null;
  winReason?: string;
  gameStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'FINISHED';
  randomSeed: number;
  rulesVersion: string;
  cardPoolVersion: string;
  aiModelVersion: string;
  aiPromptVersion: string;
  // Step tracking for reactive phases (guard/rune triggers)
  pendingCombat?: CombatContext;
  pendingTrigger?: TriggerContext;
  lastAction?: Action;
}

export interface GameLogEntry {
  id: string;
  turn: number;
  playerId: PlayerId;
  type: 'SYSTEM' | 'DRAW' | 'ARCANA' | 'PLAY' | 'ATTACK' | 'COMBAT' | 'DAMAGE' | 'DESTROY' | 'BOUNCE' | 'EFFECT' | 'RUNE' | 'REJECT';
  message: string;
  timestamp: number;
  details?: Record<string, any>;
}

export interface CandidateActionEvaluation {
  action: Action;
  score: number; // 0.0 - 10.0
  breakdown?: {
    boardAdvantage: number;
    handAdvantage: number;
    hpAdvantage: number;
    resourceAdvantage: number;
    pressure: number;
    lethalPotential: number;
    futureValue: number;
    risk: number;
    overall: number;
  };
  rationale?: string;
}

export interface AIDecisionLog {
  id: string;
  gameId: string;
  turn: number;
  phase: GamePhase;
  aiPlayer: PlayerId;
  selectedAction: Action;
  reason: string;
  candidates: CandidateActionEvaluation[];
  isFallback: boolean;
  fallbackReason?: string;
  visibleStateSummary: {
    myHp: number;
    opponentHp: number;
    myHandCount: number;
    oppHandCount: number;
    myActiveArcana: number;
    myBattlefieldCount: number;
    oppBattlefieldCount: number;
  };
  timestamp: number;
}

export interface PlayerSnapshot {
  hp: number; // 結界
  handCount: number;
  arcanaCount: number;
  activeArcanaCount: number;
  fieldCount: number;
  runeCount: number;
  archiveCount: number;
  deckCount: number;
}

export interface StateDiff {
  stepIndex: number;
  turn: number;
  action: Action;
  playerA_before: PlayerSnapshot;
  playerA_after: PlayerSnapshot;
  playerB_before: PlayerSnapshot;
  playerB_after: PlayerSnapshot;
  descriptions: string[];
}

export interface ReplayStep {
  stepIndex: number;
  state: GameState;
  action: Action;
  log: GameLogEntry[];
  aiDecision?: AIDecisionLog;
  diff: StateDiff;
}

export interface GameReplay {
  gameId: string;
  randomSeed: number;
  rulesVersion: string;
  cardPoolVersion: string;
  deckA: Deck;
  deckB: Deck;
  winner: PlayerId | 'DRAW' | null;
  winReason: string;
  totalTurns: number;
  steps: ReplayStep[];
  logs: GameLogEntry[];
  aiDecisions: AIDecisionLog[];
  completedAt: string;
}

export interface Deck {
  deckId: string;
  deckName: string;
  faction: FactionCode;
  cards: string[]; // 40 cardId strings
  deckVersion: string; // e.g. "v1.0", "v1.1"
  createdAt: string;
  updatedAt: string;
  cardPoolVersion: string;
  description?: string;
}

export interface CardUsageStats {
  cardId: string;
  cardName: string;
  faction: FactionCode;
  copiesInDeck: number;
  gamesPlayed: number;
  gamesUsed: number;
  usageRate: number; // 0 - 100%
  averageTurnUsed: number;
  winRateWhenUsed: number;
  winRateWhenNotUsed: number;
  destroyCount: number;
  damageDealt: number;
  drawCount: number;
  bounceCount: number;
  effectTriggerCount: number;
}

export interface MatchupStat {
  opponentDeckId: string;
  opponentDeckName: string;
  opponentFaction: FactionCode;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  firstTurnWins: number;
  firstTurnMatches: number;
  firstTurnWinRate: number;
  secondTurnWins: number;
  secondTurnMatches: number;
  secondTurnWinRate: number;
  avgTurns: number;
  avgFinalHp: number;
}

export interface VerificationReport {
  verificationId: string;
  timestamp: string;
  targetDeck: Deck;
  totalMatches: number;
  totalWins: number;
  totalLosses: number;
  totalDraws: number;
  overallWinRate: number;
  firstTurnWinRate: number;
  secondTurnWinRate: number;
  avgTurns: number;
  avgFinalHp: number;
  maxWinStreak: number;
  maxLossStreak: number;
  matchups: MatchupStat[];
  cardStats: CardUsageStats[];
  favoredMatchups: string[];
  unfavoredMatchups: string[];
  mostUsedCards: string[];
  highestWinRateCards: string[];
  aiDecisionInsights: {
    highEvaluationCards: { cardId: string; cardName: string; avgScore: number }[];
    commonStrategies: string[];
  };
}

export interface VisibleGameState {
  gameId: string;
  turnNumber: number;
  phase: GamePhase;
  me: {
    playerId: PlayerId;
    hp: number; // 結界
    maxHp: number;
    hand: CardData[];
    arcana: { card: CardData; isRested: boolean }[];
    battlefield: {
      instanceId: string;
      card: CardData;
      currentAtk: number;
      currentDef: number;
      currentBrk: number;
      currentDmg?: number;
      isRested: boolean;
      hasSummoningSickness: boolean;
      hasGuard: boolean;
    }[];
    domain: CardData | null;
    runeCount: number;
    archive: CardData[];
    deckCount: number;
  };
  opponent: {
    playerId: PlayerId;
    hp: number; // 結界
    maxHp: number;
    handCount: number;
    arcana: { card: CardData; isRested: boolean }[];
    battlefield: {
      instanceId: string;
      card: CardData;
      currentAtk: number;
      currentDef: number;
      currentBrk: number;
      currentDmg?: number;
      isRested: boolean;
      hasSummoningSickness: boolean;
      hasGuard: boolean;
    }[];
    domain: CardData | null;
    runeCount: number;
    archive: CardData[];
    deckCount: number;
  };
  legalActions: LegalAction[];
}
