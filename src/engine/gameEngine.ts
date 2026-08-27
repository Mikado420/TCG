import {
  Action,
  CardData,
  CardInstance,
  CombatContext,
  FactionCode,
  GameLogEntry,
  GamePhase,
  GameState,
  LegalAction,
  PlayerId,
  PlayerSnapshot,
  PlayerState,
  StateDiff,
  TriggerContext,
} from '../types/game';
import { CARD_POOL_VERSION, getCardById, RULES_VERSION } from '../data/cards';

export { RULES_VERSION, CARD_POOL_VERSION };

// Reproducible PRNG (Mulberry32)
export class PRNG {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  public next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  public shuffle<T>(array: T[]): T[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export class GameEngine {
  private prng: PRNG;
  private logs: GameLogEntry[] = [];
  private actionIndex = 0;

  constructor(seed = Date.now()) {
    this.prng = new PRNG(seed);
  }

  public getPRNG(): PRNG {
    return this.prng;
  }

  public createInitialState(
    gameId: string,
    deckACardIds: string[],
    deckBCardIds: string[],
    playerAName = 'Player A (朱)',
    playerBName = 'Player B (蒼)',
    playerAIsAI = false,
    playerBIsAI = true,
    playerAAIType: 'GEMINI' | 'HEURISTIC' | 'RANDOM' | 'HUMAN' = 'HUMAN',
    playerBAIType: 'GEMINI' | 'HEURISTIC' | 'RANDOM' | 'HUMAN' = 'HEURISTIC',
    seed = Date.now()
  ): GameState {
    this.prng = new PRNG(seed);
    this.logs = [];
    this.actionIndex = 0;

    let instCounter = 1;
    const createInstances = (cardIds: string[], ownerId: PlayerId): CardInstance[] => {
      return cardIds.map((cardId) => {
        const baseCard = getCardById(cardId);
        return {
          instanceId: `inst_${ownerId}_${cardId}_${instCounter++}`,
          cardId,
          baseCard,
          ownerId,
          currentCost: baseCard.cost,
          currentAtk: baseCard.atk,
          currentDef: baseCard.def,
          currentBrk: baseCard.brk,
          currentDmg: baseCard.brk,
          isRested: false,
          summonedTurn: 0,
          hasSummoningSickness: false,
          buffs: [],
        };
      });
    };

    const shuffledDeckA = this.prng.shuffle(createInstances(deckACardIds, 'PLAYER_A'));
    const shuffledDeckB = this.prng.shuffle(createInstances(deckBCardIds, 'PLAYER_B'));

    // Rule 7: Initial Hand is 4 cards
    const initialHandA = shuffledDeckA.splice(0, 4);
    const initialHandB = shuffledDeckB.splice(0, 4);

    // Rule 2 & 7: Barrier is 5 (Kekkai 5)
    const playerA: PlayerState = {
      playerId: 'PLAYER_A',
      name: playerAName,
      hp: 5,
      maxHp: 5,
      deck: shuffledDeckA,
      hand: initialHandA,
      arcana: [],
      battlefield: [],
      runes: [],
      domain: null,
      archive: [],
      hasPlacedArcanaThisTurn: false,
      isAI: playerAIsAI,
      aiType: playerAAIType,
      unitsKilledThisTurn: 0,
      unitsDestroyedCount: 0,
      totalDamageDealt: 0,
      cardsDrawnCount: 4,
    };

    const playerB: PlayerState = {
      playerId: 'PLAYER_B',
      name: playerBName,
      hp: 5,
      maxHp: 5,
      deck: shuffledDeckB,
      hand: initialHandB,
      arcana: [],
      battlefield: [],
      runes: [],
      domain: null,
      archive: [],
      hasPlacedArcanaThisTurn: false,
      isAI: playerBIsAI,
      aiType: playerBAIType,
      unitsKilledThisTurn: 0,
      unitsDestroyedCount: 0,
      totalDamageDealt: 0,
      cardsDrawnCount: 4,
    };

    const initialState: GameState = {
      gameId,
      turnNumber: 1,
      activePlayer: 'PLAYER_A',
      phase: 'ARCANA', // Player A Turn 1 skips draw phase (Rule 7, 11)
      firstPlayer: 'PLAYER_A',
      secondPlayer: 'PLAYER_B',
      playerA,
      playerB,
      winner: null,
      winReason: undefined,
      gameStatus: 'IN_PROGRESS',
      randomSeed: seed,
      rulesVersion: RULES_VERSION,
      cardPoolVersion: CARD_POOL_VERSION,
      aiModelVersion: 'gemini-3.7-flash',
      aiPromptVersion: 'v2.3-tactical',
    };

    this.addLog(initialState, 'SYSTEM', `ゲーム開始！先攻: ${playerA.name}、後攻: ${playerB.name} (結界: 5, デッキ: 40枚)`);
    return initialState;
  }

  // ==========================================
  // Helper & Snapshot Methods
  // ==========================================

  public getPlayer(state: GameState, playerId: PlayerId): PlayerState {
    return playerId === 'PLAYER_A' ? state.playerA : state.playerB;
  }

  public getOpponent(state: GameState, playerId: PlayerId): PlayerState {
    return playerId === 'PLAYER_A' ? state.playerB : state.playerA;
  }

  public getSnapshot(player: PlayerState): PlayerSnapshot {
    return {
      hp: player.hp,
      handCount: player.hand.length,
      arcanaCount: player.arcana.length,
      activeArcanaCount: player.arcana.filter((a) => !a.isRested).length,
      fieldCount: player.battlefield.length,
      runeCount: player.runes.length,
      archiveCount: player.archive.length,
      deckCount: player.deck.length,
    };
  }

  private addLog(
    state: GameState,
    type: GameLogEntry['type'],
    message: string,
    playerId?: PlayerId,
    details?: Record<string, any>
  ): GameLogEntry {
    const entry: GameLogEntry = {
      id: `log_${Date.now()}_${++this.actionIndex}`,
      turn: state.turnNumber,
      playerId: playerId || state.activePlayer,
      type,
      message,
      timestamp: Date.now(),
      details,
    };
    this.logs.push(entry);
    return entry;
  }

  public getLogs(): GameLogEntry[] {
    return [...this.logs];
  }

  // Calculate dynamic effective ATK/DEF/BRK considering board state, buffs, and domains
  public calculateEffectiveStats(
    unit: CardInstance,
    owner: PlayerState,
    opp: PlayerState
  ): { atk: number; def: number; brk: number; dmg: number; hasGuard: boolean; canAttack: boolean } {
    let atk = unit.baseCard.atk;
    let def = unit.baseCard.def;
    let brk = unit.baseCard.brk;
    let hasGuard = !!unit.baseCard.hasGuard;
    let canAttack = !unit.baseCard.cantAttack;

    // Apply Temporary/Permanent Buffs on instance
    for (const buff of unit.buffs) {
      if (buff.type === 'ATK') atk += buff.value;
      if (buff.type === 'DEF') def += buff.value;
      if (buff.type === 'BRK' || buff.type === 'DMG') brk += buff.value;
      if (buff.type === 'GUARD') hasGuard = true;
      if (buff.type === 'CAN_ATTACK') canAttack = true;
    }

    // A-03: ワイルド・レオン (他の自分の朱系統のユニットが1体以上いるなら、ATK+20)
    if (unit.cardId === 'A-03') {
      const otherRed = owner.battlefield.filter(
        (u) => u.instanceId !== unit.instanceId && u.baseCard.faction === 'RED'
      );
      if (otherRed.length >= 1) {
        atk += 20;
      }
    }

    // C-07: 月光妖精リゼ (自分のアルカナが7枚以上なら、ATK+20)
    if (unit.cardId === 'C-07' && owner.arcana.length >= 7) {
      atk += 20;
    }

    // C-15: 大樹の残響 (Domain: 自分のアルカナが7枚以上なら、自分のユニットすべてのATK+10)
    if (owner.domain?.cardId === 'C-15' && owner.arcana.length >= 7) {
      atk += 10;
    }

    // D-04: 城壁の聖護者ミレイ・フォード (このユニット以外の自分の聖系統のユニットが2体以上いるなら、DEF+10)
    if (unit.cardId === 'D-04') {
      const otherHoly = owner.battlefield.filter(
        (u) => u.instanceId !== unit.instanceId && u.baseCard.faction === 'HOLY'
      );
      if (otherHoly.length >= 2) {
        def += 10;
      }
    }

    // D-15: 光彩を放つ聖域 (Domain: 自分の聖系統のユニットは「攻撃できない」を無視する)
    if (owner.domain?.cardId === 'D-15' && unit.baseCard.faction === 'HOLY') {
      canAttack = true;
    }

    // E-09: ナイト・ゴースト (自分のアーカイブにユニットが5枚以上あるなら、ATK+30)
    if (unit.cardId === 'E-09') {
      const archiveUnits = owner.archive.filter(
        (c) => c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT'
      );
      if (archiveUnits.length >= 5) {
        atk += 30;
      }
    }

    return {
      atk: Math.max(0, atk),
      def: Math.max(0, def),
      brk: Math.max(0, brk),
      dmg: Math.max(0, brk),
      hasGuard,
      canAttack,
    };
  }

  // ==========================================
  // Legal Actions Generation (Strict Rule-Based)
  // ==========================================

  public getLegalActions(state: GameState): LegalAction[] {
    if (state.gameStatus !== 'IN_PROGRESS' || state.winner !== null) {
      return [];
    }

    const actions: LegalAction[] = [];
    const active = this.getPlayer(state, state.activePlayer);
    const opponent = this.getOpponent(state, state.activePlayer);

    // 1. GUARD STEP (Defending player reacts to attack on player)
    if (state.phase === 'GUARD_STEP' && state.pendingCombat) {
      const defPlayer = this.getOpponent(state, state.pendingCombat.attackerPlayerId);
      const attacker = this.getPlayer(state, state.pendingCombat.attackerPlayerId).battlefield.find(
        (u) => u.instanceId === state.pendingCombat!.attackerInstanceId
      );

      // Check if attacker cannot be guarded (B-08/B-10 or spell buffs like B-13)
      const ignoreGuard = attacker?.cannotBeGuardedThisTurn;

      if (!ignoreGuard) {
        // Rule 17: Valid guard = hasGuard + isActive (not rested) + on field.
        // Summoning sickness does NOT prevent guard. Exactly 1 unit may guard.
        for (const guardUnit of defPlayer.battlefield) {
          if (guardUnit.isRested) continue;
          const stats = this.calculateEffectiveStats(guardUnit, defPlayer, active);
          if (stats.hasGuard) {
            actions.push({
              action: {
                type: 'GUARD',
                playerId: defPlayer.playerId,
                payload: { guardInstanceId: guardUnit.instanceId, doGuard: true },
                description: `【ガード】${guardUnit.baseCard.name} (DEF ${stats.def}) で受ける`,
              },
              description: `【ガード】${guardUnit.baseCard.name} で防御`,
              category: 'GUARD',
              cardId: guardUnit.cardId,
              cardName: guardUnit.baseCard.name,
            });
          }
        }
      }

      // Always allow passing guard
      actions.push({
        action: {
          type: 'GUARD',
          playerId: defPlayer.playerId,
          payload: { doGuard: false },
          description: 'ガードしない (攻撃を受ける)',
        },
        description: 'ガードしない (結界で受ける)',
        category: 'PASS',
      });

      return actions;
    }

    // 2. RUNE TRIGGER STEP
    if (state.phase === 'RUNE_STEP' && state.pendingTrigger) {
      const runePlayer = this.getPlayer(state, state.pendingTrigger.triggeringPlayerId);
      for (const rune of runePlayer.runes) {
        // Match rune trigger types
        // A-14: フレア・トリガー (相手がユニットを登場させたとき、そのユニットがDEF60以下のガードなら、登場時効果を処理する前に破壊する)
        if (state.pendingTrigger.triggerType === 'ON_ENTER' && rune.cardId === 'A-14') {
          if ((state.pendingTrigger.targetDef || 0) <= 60) {
            actions.push({
              action: {
                type: 'TRIGGER_RUNE',
                playerId: runePlayer.playerId,
                payload: {
                  runeInstanceId: rune.instanceId,
                  activate: true,
                  targetUnitInstanceId: state.pendingTrigger.targetInstanceId,
                },
                description: `【ルーン発動】フレア・トリガー (DEF60以下のガードユニットを登場時効果前に破壊)`,
              },
              description: `フレア・トリガーを発動`,
              category: 'TRIGGER',
              cardId: rune.cardId,
              cardName: rune.baseCard.name,
            });
          }
        }

        // B-14 & D-14: ON_ATTACK
        if (state.pendingTrigger.triggerType === 'ON_ATTACK') {
          if (rune.cardId === 'B-14') {
            actions.push({
              action: {
                type: 'TRIGGER_RUNE',
                playerId: runePlayer.playerId,
                payload: {
                  runeInstanceId: rune.instanceId,
                  activate: true,
                  targetUnitInstanceId: state.pendingTrigger.targetInstanceId,
                },
                description: `【ルーン発動】ヴォルテ・リターン (攻撃ユニットを手札に戻し1ドロー)`,
              },
              description: `ヴォルテ・リターンを発動`,
              category: 'TRIGGER',
              cardId: rune.cardId,
              cardName: rune.baseCard.name,
            });
          }
          if (rune.cardId === 'D-14') {
            actions.push({
              action: {
                type: 'TRIGGER_RUNE',
                playerId: runePlayer.playerId,
                payload: { runeInstanceId: rune.instanceId, activate: true },
                description: `【ルーン発動】三重聖壁 (相手のユニット3体までをレスト)`,
              },
              description: `三重聖壁を発動`,
              category: 'TRIGGER',
              cardId: rune.cardId,
              cardName: rune.baseCard.name,
            });
          }
        }

        // E-14: ON_DESTROY (自分のユニットが破壊されたとき、アーカイブからCOST2以下の冥系統ユニット1体を召喚してもよい)
        if (state.pendingTrigger.triggerType === 'ON_DESTROY' && rune.cardId === 'E-14') {
          const validArchiveUnits = runePlayer.archive.filter(
            (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') &&
                   c.baseCard.faction === 'DARK' &&
                   c.baseCard.cost <= 2
          );
          if (validArchiveUnits.length > 0 && runePlayer.battlefield.length < 6) {
            for (const archUnit of validArchiveUnits) {
              actions.push({
                action: {
                  type: 'TRIGGER_RUNE',
                  playerId: runePlayer.playerId,
                  payload: {
                    runeInstanceId: rune.instanceId,
                    activate: true,
                    targetUnitInstanceId: archUnit.instanceId,
                  },
                  description: `【ルーン発動】ネクロ・コール (アーカイブから「${archUnit.baseCard.name}」を召喚)`,
                },
                description: `ネクロ・コール: ${archUnit.baseCard.name}`,
                category: 'TRIGGER',
                cardId: rune.cardId,
                cardName: rune.baseCard.name,
              });
            }
          }
        }

        // C-14: ON_ARCANA_SET (相手がアルカナにカードを置いたとき、アーカイブから1枚をアルカナに置き、アルカナのカード1枚を手札に戻す)
        if (state.pendingTrigger.triggerType === 'ON_ARCANA_SET' && rune.cardId === 'C-14') {
          actions.push({
            action: {
              type: 'TRIGGER_RUNE',
              playerId: runePlayer.playerId,
              payload: { runeInstanceId: rune.instanceId, activate: true },
              description: `【ルーン発動】調和の継承 (アーカイブからアルカナへ置き1枚手札へ)`,
            },
            description: `調和の継承を発動`,
            category: 'TRIGGER',
            cardId: rune.cardId,
            cardName: rune.baseCard.name,
          });
        }
      }

      // Option to pass trigger
      actions.push({
        action: {
          type: 'TRIGGER_RUNE',
          playerId: runePlayer.playerId,
          payload: { activate: false },
          description: 'ルーンを発動しない (温存)',
        },
        description: 'ルーン発動をスキップ',
        category: 'PASS',
      });

      return actions;
    }

    // 3. ARCANA PHASE (Place 1 card from hand into Arcana)
    if (state.phase === 'ARCANA') {
      if (!active.hasPlacedArcanaThisTurn) {
        for (const card of active.hand) {
          actions.push({
            action: {
              type: 'SET_ARCANA',
              playerId: active.playerId,
              payload: { cardInstanceId: card.instanceId },
              description: `手札の「${card.baseCard.name}」をアルカナに置く`,
            },
            description: `アルカナセット: ${card.baseCard.name}`,
            category: 'ARCANA',
            cardId: card.cardId,
            cardName: card.baseCard.name,
          });
        }
      }
      // Can always skip Arcana placement
      actions.push({
        action: {
          type: 'SKIP_ARCANA',
          playerId: active.playerId,
          payload: {},
          description: 'アルカナ配置をスキップして行動フェーズへ',
        },
        description: 'アルカナ配置をスキップ',
        category: 'PASS',
      });
      return actions;
    }

    // 4. ACTION PHASE (Main Action Phase)
    if (state.phase === 'ACTION') {
      const activeArcanaCount = active.arcana.filter((a) => !a.isRested).length;

      // Rule 9: Faction condition requires at least 1 card of that faction in active/total arcana.
      // "朱・蒼・翠・聖・冥のカードを使用するには、アルカナに同系統のカードが1枚以上必要。無系統カードのみの場合、5系統カードは使用不可。"
      const presentArcanaFactions = new Set<FactionCode>(
        active.arcana.map((a) => a.instance.baseCard.faction)
      );

      // Check card plays from hand
      for (const card of active.hand) {
        const cardData = card.baseCard;
        const canPayCost = activeArcanaCount >= cardData.cost;

        // Faction Requirement Check
        const meetsFactionReq =
          cardData.faction === 'NEUTRAL' || presentArcanaFactions.has(cardData.faction);

        if (canPayCost && meetsFactionReq) {
          // Play Unit (Field limit: max 6 units)
          if (cardData.cardType === 'UNIT' && active.battlefield.length < 6) {
            actions.push({
              action: {
                type: 'PLAY_UNIT',
                playerId: active.playerId,
                payload: { cardInstanceId: card.instanceId },
                description: `【召喚】${cardData.name} (コスト${cardData.cost}, ATK${cardData.atk}/DEF${cardData.def}/BRK${cardData.brk})`,
              },
              description: `召喚: ${cardData.name}`,
              category: 'SUMMON',
              cardId: card.cardId,
              cardName: cardData.name,
            });
          }

          // Evolve Unit (Requires matching base unit on field; evolution unit replaces base unit on field)
          if (cardData.cardType === 'EVOLVE_UNIT' && cardData.evolutionRequirement) {
            const req = cardData.evolutionRequirement;
            const validBaseUnits = active.battlefield.filter(
              (u) =>
                u.baseCard.faction === req.faction &&
                u.baseCard.race === req.race &&
                u.baseCard.cardType === 'UNIT'
            );

            for (const baseUnit of validBaseUnits) {
              actions.push({
                action: {
                  type: 'EVOLVE',
                  playerId: active.playerId,
                  payload: {
                    cardInstanceId: card.instanceId,
                    baseUnitInstanceId: baseUnit.instanceId,
                  },
                  description: `【進化】${baseUnit.baseCard.name} → ${cardData.name} (コスト${cardData.cost})`,
                },
                description: `進化: ${cardData.name} (進化元: ${baseUnit.baseCard.name})`,
                category: 'SUMMON',
                cardId: card.cardId,
                cardName: cardData.name,
              });
            }
          }

          // Spells
          if (cardData.cardType === 'SPELL') {
            if (cardData.cardId === 'A-12') {
              // 燃える闘志: このターン、自分のユニット1体のBRK+1
              for (const target of active.battlefield) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: {
                      cardInstanceId: card.instanceId,
                      targetUnitInstanceId: target.instanceId,
                    },
                    description: `【スペル】燃える闘志 → ${target.baseCard.name}のBRK+1`,
                  },
                  description: `スペル: 燃える闘志 (${target.baseCard.name})`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else if (cardData.cardId === 'A-13' || cardData.cardId === 'N-04') {
              // ドラゴン・ブレス / 無彩の雷光: 相手のDEF50以下のユニット1体を破壊する
              const validTargets = opponent.battlefield.filter((u) => {
                const s = this.calculateEffectiveStats(u, opponent, active);
                return s.def <= 50;
              });
              for (const target of validTargets) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: {
                      cardInstanceId: card.instanceId,
                      targetUnitInstanceId: target.instanceId,
                    },
                    description: `【スペル】${cardData.name} → 相手の${target.baseCard.name}を破壊`,
                  },
                  description: `スペル: ${cardData.name} (${target.baseCard.name})`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else if (cardData.cardId === 'D-12') {
              // 聖なる戒め: 相手のユニット1体をレストする
              const activeOppUnits = opponent.battlefield.filter((u) => !u.isRested);
              for (const target of activeOppUnits) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: {
                      cardInstanceId: card.instanceId,
                      targetUnitInstanceId: target.instanceId,
                    },
                    description: `【スペル】聖なる戒め → 相手の${target.baseCard.name}をレスト`,
                  },
                  description: `スペル: 聖なる戒め (${target.baseCard.name})`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else if (cardData.cardId === 'E-13') {
              // バイタル・ロス: 相手のアクティブ状態のユニット1体を破壊する
              const activeOppUnits = opponent.battlefield.filter((u) => !u.isRested);
              for (const target of activeOppUnits) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: {
                      cardInstanceId: card.instanceId,
                      targetUnitInstanceId: target.instanceId,
                    },
                    description: `【スペル】バイタル・ロス → 相手の${target.baseCard.name}を破壊`,
                  },
                  description: `スペル: バイタル・ロス (${target.baseCard.name})`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else if (cardData.cardId === 'N-03') {
              // ルーン・ブレイク: 相手のルーン1枚を破壊する
              if (opponent.runes.length > 0) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: { cardInstanceId: card.instanceId },
                    description: `【スペル】ルーン・ブレイク → 相手のルーンを破壊`,
                  },
                  description: `スペル: ルーン・ブレイク`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else if (cardData.cardId === 'N-05') {
              // ドメイン・ブレイク: 相手のドメイン1枚をアーカイブに置く
              if (opponent.domain !== null) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: { cardInstanceId: card.instanceId },
                    description: `【スペル】ドメイン・ブレイク → 相手の${opponent.domain.baseCard.name}をアーカイブへ`,
                  },
                  description: `スペル: ドメイン・ブレイク`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else {
              // General / Untargeted spells:
              // B-12 (2枚引く), B-13 (ユニット2体ガード不能), C-12 (デッキトップアルカナ),
              // C-13 (ユニット2体ATK+30), D-13 (聖ユニットDEF+20&ガード付与), E-12 (相手手札1枚ランダムアーカイブ)
              actions.push({
                action: {
                  type: 'PLAY_SPELL',
                  playerId: active.playerId,
                  payload: { cardInstanceId: card.instanceId },
                  description: `【スペル】${cardData.name}を使用`,
                },
                description: `スペル: ${cardData.name}`,
                category: 'SPELL',
                cardId: card.cardId,
                cardName: cardData.name,
              });
            }
          }

          // Rune Placement (Rule: Max 2 runes in rune zone)
          if (cardData.cardType === 'RUNE' && active.runes.length < 2) {
            actions.push({
              action: {
                type: 'SET_RUNE',
                playerId: active.playerId,
                payload: { cardInstanceId: card.instanceId },
                description: `【ルーンセット】${cardData.name} (コスト${cardData.cost})`,
              },
              description: `ルーンセット: ${cardData.name}`,
              category: 'RUNE',
              cardId: card.cardId,
              cardName: cardData.name,
            });
          }

          // Domain Placement (Rule: Max 1 domain in field)
          if (cardData.cardType === 'DOMAIN' && active.domain === null) {
            actions.push({
              action: {
                type: 'PLAY_DOMAIN',
                playerId: active.playerId,
                payload: { cardInstanceId: card.instanceId },
                description: `【ドメイン配置】${cardData.name} (コスト${cardData.cost})`,
              },
              description: `ドメイン配置: ${cardData.name}`,
              category: 'DOMAIN',
              cardId: card.cardId,
              cardName: cardData.name,
            });
          }
        }
      }

      // Attacks
      for (const unit of active.battlefield) {
        if (unit.isRested) continue;
        if (unit.hasSummoningSickness && !unit.baseCard.hasHaste) continue;

        const stats = this.calculateEffectiveStats(unit, active, opponent);
        if (!stats.canAttack) continue;

        // Attack opponent player
        actions.push({
          action: {
            type: 'ATTACK',
            playerId: active.playerId,
            payload: {
              attackerInstanceId: unit.instanceId,
              targetType: 'PLAYER',
            },
            description: `【攻撃】${unit.baseCard.name} (ATK${stats.atk}/BRK${stats.brk}) → 相手プレイヤー`,
          },
          description: `攻撃: ${unit.baseCard.name} → 相手プレイヤー`,
          category: 'ATTACK',
          cardId: unit.cardId,
          cardName: unit.baseCard.name,
        });

        // Attack rested opponent units (or active units if canAttackActiveUnits like A-10)
        for (const oppUnit of opponent.battlefield) {
          const canTargetUnit =
            oppUnit.isRested || unit.baseCard.canAttackActiveUnits || unit.canAttackActiveThisTurn;
          if (canTargetUnit) {
            const oppStats = this.calculateEffectiveStats(oppUnit, opponent, active);
            actions.push({
              action: {
                type: 'ATTACK',
                playerId: active.playerId,
                payload: {
                  attackerInstanceId: unit.instanceId,
                  targetType: 'UNIT',
                  targetUnitInstanceId: oppUnit.instanceId,
                },
                description: `【攻撃】${unit.baseCard.name} (ATK${stats.atk}) → ${oppUnit.baseCard.name} (DEF${oppStats.def})`,
              },
              description: `攻撃: ${unit.baseCard.name} → ${oppUnit.baseCard.name}`,
              category: 'ATTACK',
              cardId: unit.cardId,
              cardName: unit.baseCard.name,
            });
          }
        }
      }

      // End Turn
      actions.push({
        action: {
          type: 'END_TURN',
          playerId: active.playerId,
          payload: {},
          description: 'ターン終了',
        },
        description: 'ターンを終了する',
        category: 'PASS',
      });

      return actions;
    }

    return [];
  }

  // ==========================================
  // State Transitions & Action Execution
  // ==========================================

  public step(state: GameState, action: Action): { nextState: GameState; diff: StateDiff; log: GameLogEntry } {
    const nextState: GameState = JSON.parse(JSON.stringify(state));
    const pA_before = this.getSnapshot(nextState.playerA);
    const pB_before = this.getSnapshot(nextState.playerB);
    const diffDescriptions: string[] = [];

    const active = this.getPlayer(nextState, nextState.activePlayer);
    const opponent = this.getOpponent(nextState, nextState.activePlayer);
    nextState.lastAction = action;

    let logMessage = '';
    let logType: GameLogEntry['type'] = 'PLAY';

    switch (action.type) {
      // ----------------------------------------------------
      // 1. SET ARCANA
      // ----------------------------------------------------
      case 'SET_ARCANA': {
        const { cardInstanceId } = action.payload as { cardInstanceId: string };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (handIdx !== -1) {
          const card = active.hand.splice(handIdx, 1)[0];
          active.arcana.push({ instance: card, isRested: false });
          active.hasPlacedArcanaThisTurn = true;
          logMessage = `${active.name} は「${card.baseCard.name}」をアルカナに置いた。(アルカナ: ${active.arcana.length}枚)`;
          logType = 'ARCANA';
          diffDescriptions.push(`${active.name}の手札が1枚減り、アルカナが1枚増加`);

          // Check opponent Rune: C-14 (調和の継承: 相手がアルカナにカードを置いたとき)
          const runeC14 = opponent.runes.find((r) => r.cardId === 'C-14');
          if (runeC14) {
            nextState.phase = 'RUNE_STEP';
            nextState.pendingTrigger = {
              triggerType: 'ON_ARCANA_SET',
              sourceInstanceId: runeC14.instanceId,
              triggeringPlayerId: opponent.playerId,
            };
          } else {
            nextState.phase = 'ACTION';
          }
        }
        break;
      }

      case 'SKIP_ARCANA': {
        logMessage = `${active.name} はアルカナ配置をスキップした。`;
        logType = 'ARCANA';
        nextState.phase = 'ACTION';
        diffDescriptions.push(`${active.name}が行動フェーズへ移行`);
        break;
      }

      // ----------------------------------------------------
      // 2. PLAY UNIT (Summon)
      // ----------------------------------------------------
      case 'PLAY_UNIT': {
        const { cardInstanceId } = action.payload as { cardInstanceId: string };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (handIdx !== -1 && active.battlefield.length < 6) {
          const card = active.hand.splice(handIdx, 1)[0];
          this.payCost(active, card.baseCard.cost);
          card.summonedTurn = nextState.turnNumber;
          card.hasSummoningSickness = !card.baseCard.hasHaste;
          card.isRested = false;
          active.battlefield.push(card);

          logMessage = `${active.name} は「${card.baseCard.name}」を召喚！(コスト${card.baseCard.cost})`;
          logType = 'PLAY';
          diffDescriptions.push(`${active.name}が${card.baseCard.name}を召喚`);

          // Check opponent Rune: A-14 (フレア・トリガー)
          // "相手がユニットを登場させたとき、そのユニットがDEF60以下のガードなら、登場時効果を処理する前に破壊する。"
          const flareRune = opponent.runes.find((r) => r.cardId === 'A-14');
          const isGuardUnit = !!card.baseCard.hasGuard;
          if (flareRune && card.baseCard.def <= 60 && isGuardUnit) {
            nextState.phase = 'RUNE_STEP';
            nextState.pendingTrigger = {
              triggerType: 'ON_ENTER',
              sourceInstanceId: flareRune.instanceId,
              triggeringPlayerId: opponent.playerId,
              targetInstanceId: card.instanceId,
              targetDef: card.baseCard.def,
            };
          } else {
            // Trigger on-enter effects immediately
            this.resolveOnEnterEffects(nextState, active, opponent, card);
          }
        }
        break;
      }

      // ----------------------------------------------------
      // 3. EVOLVE
      // ----------------------------------------------------
      case 'EVOLVE': {
        const { cardInstanceId, baseUnitInstanceId } = action.payload as {
          cardInstanceId: string;
          baseUnitInstanceId: string;
        };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        const baseUnitIdx = active.battlefield.findIndex((u) => u.instanceId === baseUnitInstanceId);

        if (handIdx !== -1 && baseUnitIdx !== -1) {
          const evolveCard = active.hand.splice(handIdx, 1)[0];
          const baseUnit = active.battlefield.splice(baseUnitIdx, 1)[0];
          this.payCost(active, evolveCard.baseCard.cost);

          // Rule 14: Base unit is sent to archive!
          // Evolution unit does NOT inherit ATK, DEF, BRK, effects, active/rest state, or summoning sickness.
          // Evolution unit enters ACTIVE and CAN ATTACK on evolution turn.
          active.archive.push(baseUnit);

          evolveCard.isRested = false;
          evolveCard.summonedTurn = nextState.turnNumber;
          evolveCard.hasSummoningSickness = false; // can attack immediately
          active.battlefield.push(evolveCard);

          logMessage = `${active.name} は「${baseUnit.baseCard.name}」を進化元にして「${evolveCard.baseCard.name}」を進化召喚！(進化元はアーカイブへ)`;
          logType = 'PLAY';
          diffDescriptions.push(`${baseUnit.baseCard.name}を進化元に${evolveCard.baseCard.name}を進化召喚`);

          // Evolution On-Enter Effects
          if (evolveCard.cardId === 'A-11') {
            // 統獣王グラディオン: 登場時、自分のフォウナすべてのATK+10
            active.battlefield
              .filter((u) => u.baseCard.race === 'FAUNA')
              .forEach((u) => {
                u.buffs.push({
                  id: `buff_${Date.now()}_${Math.random()}`,
                  type: 'ATK',
                  value: 10,
                  duration: 'PERMANENT',
                  appliedTurn: nextState.turnNumber,
                  sourceCardId: evolveCard.cardId,
                });
              });
            logMessage += ` (自分のフォウナすべてのATK+10)`;
          } else if (evolveCard.cardId === 'C-11') {
            // 精霊神セレフィア: 登場時、デッキの上から2枚をアルカナに置く
            const ramp1 = active.deck.shift();
            const ramp2 = active.deck.shift();
            if (ramp1) active.arcana.push({ instance: ramp1, isRested: true });
            if (ramp2) active.arcana.push({ instance: ramp2, isRested: true });
            logMessage += ` (アルカナを2枚追加)`;
          } else if (evolveCard.cardId === 'D-11') {
            // 聖天護神アルディアス: 登場時、相手のユニット1体をレストする
            const oppActive = opponent.battlefield.find((u) => !u.isRested);
            if (oppActive) {
              oppActive.isRested = true;
              logMessage += ` (相手の${oppActive.baseCard.name}をレスト)`;
            }
          } else if (evolveCard.cardId === 'E-11') {
            // 不死王ベルゼネク: 進化時、アーカイブからCOST4以下のユニット1体を召喚する
            if (active.battlefield.length < 6) {
              const reviveTargetIdx = active.archive.findIndex(
                (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') && c.baseCard.cost <= 4
              );
              if (reviveTargetIdx !== -1) {
                const revived = active.archive.splice(reviveTargetIdx, 1)[0];
                revived.isRested = false;
                revived.hasSummoningSickness = true;
                active.battlefield.push(revived);
                logMessage += ` (アーカイブから「${revived.baseCard.name}」を召喚)`;
              }
            }
          }
        }
        break;
      }

      // ----------------------------------------------------
      // 4. PLAY SPELL
      // ----------------------------------------------------
      case 'PLAY_SPELL': {
        const { cardInstanceId, targetUnitInstanceId } = action.payload as {
          cardInstanceId: string;
          targetUnitInstanceId?: string;
        };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (handIdx !== -1) {
          const spell = active.hand.splice(handIdx, 1)[0];
          this.payCost(active, spell.baseCard.cost);
          active.archive.push(spell);

          logMessage = `${active.name} はスペル「${spell.baseCard.name}」を使用！`;
          logType = 'EFFECT';

          // B-08 & B-10: 自分がスペルを使用したターン、このユニットはガードされない
          for (const u of active.battlefield) {
            if (u.cardId === 'B-08' || u.cardId === 'B-10') {
              u.cannotBeGuardedThisTurn = true;
            }
          }

          // Specific Spell Resolutions
          if (spell.cardId === 'A-12' && targetUnitInstanceId) {
            // 燃える闘志: このターン、自分のユニット1体のBRK+1
            const target = active.battlefield.find((u) => u.instanceId === targetUnitInstanceId);
            if (target) {
              target.buffs.push({
                id: `buff_${Date.now()}`,
                type: 'BRK',
                value: 1,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
              logMessage += ` (${target.baseCard.name}のBRK+1)`;
            }
          } else if ((spell.cardId === 'A-13' || spell.cardId === 'N-04') && targetUnitInstanceId) {
            // ドラゴン・ブレス / 無彩の雷光: 相手のDEF50以下のユニット1体を破壊する
            this.destroyUnit(nextState, opponent, targetUnitInstanceId, `${spell.baseCard.name}による破壊`);
          } else if (spell.cardId === 'B-12') {
            // 啓示の魔術書: 2枚引く
            this.drawCards(active, 2);
            logMessage += ` (2枚引いた)`;
          } else if (spell.cardId === 'B-13') {
            // ミスト・バリア: 自分のユニット2体を選ぶ。このターン、それらはガードされない
            active.battlefield.slice(0, 2).forEach((u) => (u.cannotBeGuardedThisTurn = true));
            logMessage += ` (ユニット2体にガード無効を付与)`;
          } else if (spell.cardId === 'C-12') {
            // 木漏れ日の恩恵: デッキの上から1枚をアルカナに置く
            const top = active.deck.shift();
            if (top) active.arcana.push({ instance: top, isRested: true });
            logMessage += ` (デッキからアルカナ+1)`;
          } else if (spell.cardId === 'C-13') {
            // ツイン・グロウ: このターン、自分のユニット2体のATK+30
            active.battlefield.slice(0, 2).forEach((u) => {
              u.buffs.push({
                id: `buff_${Date.now()}_${Math.random()}`,
                type: 'ATK',
                value: 30,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
            });
            logMessage += ` (ユニット2体のATK+30)`;
          } else if (spell.cardId === 'D-12' && targetUnitInstanceId) {
            // 聖なる戒め: 相手のユニット1体をレストする
            const target = opponent.battlefield.find((u) => u.instanceId === targetUnitInstanceId);
            if (target) target.isRested = true;
            logMessage += ` (相手ユニットをレスト)`;
          } else if (spell.cardId === 'D-13') {
            // ホーリー・フォートレス: このターン、自分の聖系統のユニットはDEF+20され、ガードを得る
            active.battlefield.filter((u) => u.baseCard.faction === 'HOLY').forEach((u) => {
              u.buffs.push({
                id: `buff_${Date.now()}_${Math.random()}`,
                type: 'DEF',
                value: 20,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
              u.buffs.push({
                id: `buff_g_${Date.now()}_${Math.random()}`,
                type: 'GUARD',
                value: 1,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
            });
            logMessage += ` (聖系統ユニットDEF+20＆ガード付与)`;
          } else if (spell.cardId === 'E-12') {
            // 死者の呪詛: 相手の手札1枚をランダムにアーカイブに置く
            if (opponent.hand.length > 0) {
              const randIdx = Math.floor(this.prng.next() * opponent.hand.length);
              const discarded = opponent.hand.splice(randIdx, 1)[0];
              opponent.archive.push(discarded);
              logMessage += ` (相手の手札「${discarded.baseCard.name}」をアーカイブへ置いた)`;
            }
          } else if (spell.cardId === 'E-13' && targetUnitInstanceId) {
            // バイタル・ロス: 相手のアクティブ状態のユニット1体を破壊する
            this.destroyUnit(nextState, opponent, targetUnitInstanceId, 'バイタル・ロス');
          } else if (spell.cardId === 'N-03') {
            // ルーン・ブレイク: 相手のルーン1枚を破壊する
            if (opponent.runes.length > 0) {
              const destroyedRune = opponent.runes.pop()!;
              opponent.archive.push(destroyedRune);
              logMessage += ` (相手のルーン「${destroyedRune.baseCard.name}」を破壊)`;
            }
          } else if (spell.cardId === 'N-05') {
            // ドメイン・ブレイク: 相手のドメイン1枚をアーカイブに置く
            if (opponent.domain) {
              opponent.archive.push(opponent.domain);
              logMessage += ` (相手のドメイン「${opponent.domain.baseCard.name}」をアーカイブへ置いた)`;
              opponent.domain = null;
            }
          }
          diffDescriptions.push(`${spell.baseCard.name}を使用`);
        }
        break;
      }

      // ----------------------------------------------------
      // 5. SET RUNE
      // ----------------------------------------------------
      case 'SET_RUNE': {
        const { cardInstanceId } = action.payload as { cardInstanceId: string };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (handIdx !== -1 && active.runes.length < 2) {
          const rune = active.hand.splice(handIdx, 1)[0];
          this.payCost(active, rune.baseCard.cost);
          active.runes.push(rune);
          logMessage = `${active.name} はルーン「${rune.baseCard.name}」をセットした。(ルーン: ${active.runes.length}/2)`;
          logType = 'PLAY';

          // B-05 & B-15 trigger: 自分がルーンを使用したとき、1枚引く
          if (active.battlefield.some((u) => u.cardId === 'B-05') || active.domain?.cardId === 'B-15') {
            this.drawCards(active, 1);
            logMessage += ` (ルーン効果で1枚引いた)`;
          }
          diffDescriptions.push(`${rune.baseCard.name}をルーンにセット`);
        }
        break;
      }

      // ----------------------------------------------------
      // 6. PLAY DOMAIN
      // ----------------------------------------------------
      case 'PLAY_DOMAIN': {
        const { cardInstanceId } = action.payload as { cardInstanceId: string };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (handIdx !== -1 && active.domain === null) {
          const domain = active.hand.splice(handIdx, 1)[0];
          this.payCost(active, domain.baseCard.cost);
          active.domain = domain;
          logMessage = `${active.name} はドメイン「${domain.baseCard.name}」を配置！`;
          logType = 'PLAY';
          diffDescriptions.push(`${domain.baseCard.name}を配置`);
        }
        break;
      }

      // ----------------------------------------------------
      // 7. ATTACK DECLARATION
      // ----------------------------------------------------
      case 'ATTACK': {
        const { attackerInstanceId, targetType, targetUnitInstanceId } = action.payload as {
          attackerInstanceId: string;
          targetType: 'PLAYER' | 'UNIT';
          targetUnitInstanceId?: string;
        };
        const attacker = active.battlefield.find((u) => u.instanceId === attackerInstanceId);
        if (attacker) {
          attacker.isRested = true;

          // Attack Trigger Effects on Attacker
          // C-01 (風花妖精ミア): 攻撃したとき、アルカナのカード1枚を手札に戻す
          if (attacker.cardId === 'C-01') {
            if (active.arcana.length > 0) {
              const returned = active.arcana.pop()!;
              active.hand.push(returned.instance);
              logMessage += ` (ミアの効果でアルカナ「${returned.instance.baseCard.name}」を手札に戻した)`;
            }
          }

          if (targetType === 'PLAYER') {
            logMessage = `${active.name} の「${attacker.baseCard.name}」が相手プレイヤーに攻撃！`;
            logType = 'ATTACK';

            // Check opponent Runes: B-14 (ヴォルテ・リターン) or D-14 (三重聖壁: 自分が攻撃されたとき)
            const attackRune = opponent.runes.find((r) => r.cardId === 'B-14' || r.cardId === 'D-14');
            if (attackRune) {
              nextState.phase = 'RUNE_STEP';
              nextState.pendingTrigger = {
                triggerType: 'ON_ATTACK',
                sourceInstanceId: attackRune.instanceId,
                triggeringPlayerId: opponent.playerId,
                targetInstanceId: attacker.instanceId,
              };
              nextState.pendingCombat = {
                attackerInstanceId: attacker.instanceId,
                attackerPlayerId: active.playerId,
                targetType: 'PLAYER',
              };
            } else {
              // Proceed to Guard Step
              const hasGuardUnits = opponent.battlefield.some((u) => {
                if (u.isRested) return false;
                const s = this.calculateEffectiveStats(u, opponent, active);
                return s.hasGuard;
              });

              if (hasGuardUnits && !attacker.cannotBeGuardedThisTurn) {
                nextState.phase = 'GUARD_STEP';
                nextState.pendingCombat = {
                  attackerInstanceId: attacker.instanceId,
                  attackerPlayerId: active.playerId,
                  targetType: 'PLAYER',
                };
              } else {
                // Deal direct BRK damage to Barrier (結界)
                this.resolveDirectDamage(nextState, active, opponent, attacker);
              }
            }
          } else if (targetType === 'UNIT' && targetUnitInstanceId) {
            const defender = opponent.battlefield.find((u) => u.instanceId === targetUnitInstanceId);
            if (defender) {
              logMessage = `${active.name} の「${attacker.baseCard.name}」が「${defender.baseCard.name}」に攻撃！`;
              logType = 'COMBAT';
              this.resolveCombatBetweenUnits(nextState, active, opponent, attacker, defender);
            }
          }
          diffDescriptions.push(`${attacker.baseCard.name}が攻撃`);
        }
        break;
      }

      // ----------------------------------------------------
      // 8. GUARD STEP RESOLUTION
      // ----------------------------------------------------
      case 'GUARD': {
        const { guardInstanceId, doGuard } = action.payload as { guardInstanceId?: string; doGuard: boolean };
        const combat = nextState.pendingCombat;
        if (combat) {
          const attackerPlayer = this.getPlayer(nextState, combat.attackerPlayerId);
          const defenderPlayer = this.getOpponent(nextState, combat.attackerPlayerId);
          const attacker = attackerPlayer.battlefield.find((u) => u.instanceId === combat.attackerInstanceId);

          if (attacker) {
            if (doGuard && guardInstanceId) {
              const guardUnit = defenderPlayer.battlefield.find((u) => u.instanceId === guardInstanceId);
              if (guardUnit) {
                logMessage = `${defenderPlayer.name} は「${guardUnit.baseCard.name}」で【ガード】！`;
                logType = 'COMBAT';
                this.resolveCombatBetweenUnits(nextState, attackerPlayer, defenderPlayer, attacker, guardUnit);
                diffDescriptions.push(`${guardUnit.baseCard.name}がガードに入った`);
              }
            } else {
              logMessage = `${defenderPlayer.name} はガードしなかった。`;
              logType = 'DAMAGE';
              this.resolveDirectDamage(nextState, attackerPlayer, defenderPlayer, attacker);
              diffDescriptions.push(`結界への攻撃確定`);
            }
          }
        }
        nextState.pendingCombat = undefined;
        nextState.phase = 'ACTION';
        break;
      }

      // ----------------------------------------------------
      // 9. TRIGGER RUNE RESOLUTION
      // ----------------------------------------------------
      case 'TRIGGER_RUNE': {
        const { runeInstanceId, activate, targetUnitInstanceId } = action.payload as {
          runeInstanceId?: string;
          activate: boolean;
          targetUnitInstanceId?: string;
        };
        const trigger = nextState.pendingTrigger;
        if (trigger && activate && runeInstanceId) {
          const runePlayer = this.getPlayer(nextState, trigger.triggeringPlayerId);
          const runeIdx = runePlayer.runes.findIndex((r) => r.instanceId === runeInstanceId);
          if (runeIdx !== -1) {
            const rune = runePlayer.runes.splice(runeIdx, 1)[0];
            runePlayer.archive.push(rune);
            logMessage = `${runePlayer.name} のルーン「${rune.baseCard.name}」が発動！`;
            logType = 'RUNE';

            // A-14: フレア・トリガー (相手がユニットを登場させたとき、そのユニットがDEF60以下のガードなら、登場時効果を処理する前に破壊する)
            if (rune.cardId === 'A-14' && trigger.targetInstanceId) {
              const targetPlayer = this.getOpponent(nextState, runePlayer.playerId);
              this.destroyUnit(nextState, targetPlayer, trigger.targetInstanceId, 'フレア・トリガーによる登場前破壊');
              // Notice: On-Enter effects of the target unit are NOT processed!
            } else if (rune.cardId === 'B-14' && trigger.targetInstanceId) {
              // B-14: ヴォルテ・リターン (相手が攻撃したとき、相手のユニット1体を手札に戻し、1枚引く)
              const targetPlayer = this.getOpponent(nextState, runePlayer.playerId);
              const uIdx = targetPlayer.battlefield.findIndex((u) => u.instanceId === trigger.targetInstanceId);
              if (uIdx !== -1) {
                const returned = targetPlayer.battlefield.splice(uIdx, 1)[0];
                targetPlayer.hand.push(returned);
                this.drawCards(runePlayer, 1);
                logMessage += ` (攻撃ユニットを手札に戻し1枚引いた)`;
              }
            } else if (rune.cardId === 'D-14') {
              // D-14: 三重聖壁 (自分が攻撃されたとき、相手のユニット3体までをレストする)
              const opp = this.getOpponent(nextState, runePlayer.playerId);
              opp.battlefield.slice(0, 3).forEach((u) => (u.isRested = true));
              logMessage += ` (相手のユニット3体をレストした)`;
            } else if (rune.cardId === 'E-14' && targetUnitInstanceId) {
              // E-14: ネクロ・コール (自分のユニットが破壊されたとき、アーカイブからCOST2以下の冥系統ユニット1体を召喚してもよい)
              if (runePlayer.battlefield.length < 6) {
                const archIdx = runePlayer.archive.findIndex((c) => c.instanceId === targetUnitInstanceId);
                if (archIdx !== -1) {
                  const revived = runePlayer.archive.splice(archIdx, 1)[0];
                  revived.isRested = false;
                  revived.hasSummoningSickness = true;
                  runePlayer.battlefield.push(revived);
                  logMessage += ` (アーカイブから「${revived.baseCard.name}」を召喚)`;
                }
              }
            } else if (rune.cardId === 'C-14') {
              // C-14: 調和の継承 (相手がアルカナにカードを置いたとき、アーカイブから1枚をアルカナに置き、アルカナのカード1枚を手札に戻す)
              if (runePlayer.archive.length > 0) {
                const archCard = runePlayer.archive.pop()!;
                runePlayer.arcana.push({ instance: archCard, isRested: true });
                logMessage += ` (アーカイブから「${archCard.baseCard.name}」をアルカナに置いた)`;
              }
              if (runePlayer.arcana.length > 0) {
                const arcCard = runePlayer.arcana.shift()!;
                runePlayer.hand.push(arcCard.instance);
                logMessage += ` (アルカナの「${arcCard.instance.baseCard.name}」を手札に戻した)`;
              }
            }
            diffDescriptions.push(`ルーン${rune.baseCard.name}発動`);
          }
        } else if (trigger && !activate) {
          // Rune was skipped. If trigger was ON_ENTER, now process the unit's on-enter effect!
          if (trigger.triggerType === 'ON_ENTER' && trigger.targetInstanceId) {
            const enteredPlayer = this.getOpponent(nextState, trigger.triggeringPlayerId);
            const enteredUnit = enteredPlayer.battlefield.find((u) => u.instanceId === trigger.targetInstanceId);
            if (enteredUnit) {
              this.resolveOnEnterEffects(nextState, enteredPlayer, this.getPlayer(nextState, trigger.triggeringPlayerId), enteredUnit);
            }
          }
        }
        nextState.pendingTrigger = undefined;

        // If there was a pending combat waiting for rune step, resume combat
        if (nextState.pendingCombat) {
          const attackerPlayer = this.getPlayer(nextState, nextState.pendingCombat.attackerPlayerId);
          const defenderPlayer = this.getOpponent(nextState, nextState.pendingCombat.attackerPlayerId);
          const attacker = attackerPlayer.battlefield.find(
            (u) => u.instanceId === nextState.pendingCombat!.attackerInstanceId
          );

          if (attacker) {
            const hasGuardUnits = defenderPlayer.battlefield.some((u) => {
              if (u.isRested) return false;
              const s = this.calculateEffectiveStats(u, defenderPlayer, attackerPlayer);
              return s.hasGuard;
            });
            if (hasGuardUnits && !attacker.cannotBeGuardedThisTurn) {
              nextState.phase = 'GUARD_STEP';
            } else {
              this.resolveDirectDamage(nextState, attackerPlayer, defenderPlayer, attacker);
              nextState.pendingCombat = undefined;
              nextState.phase = 'ACTION';
            }
          } else {
            nextState.pendingCombat = undefined;
            nextState.phase = 'ACTION';
          }
        } else {
          nextState.phase = 'ACTION';
        }
        break;
      }

      // ----------------------------------------------------
      // 10. END TURN
      // ----------------------------------------------------
      case 'END_TURN': {
        // D-10: ホワイト・アーク (ターン終了時、このユニットをアクティブにする)
        for (const u of active.battlefield) {
          if (u.cardId === 'D-10') {
            u.isRested = false;
          }
        }

        // Clean up temporary buffs from this turn
        for (const u of active.battlefield) {
          u.buffs = u.buffs.filter((b) => b.duration !== 'THIS_TURN');
          u.cannotBeGuardedThisTurn = false;
          u.canAttackActiveThisTurn = false;
        }

        // Rule 2 & 44: "ターン終了時に自分のデッキが0枚の場合、そのプレイヤーは敗北する"
        if (active.deck.length === 0) {
          nextState.winner = opponent.playerId;
          nextState.winReason = `${opponent.name} の勝利！(${active.name}のターン終了時デッキが0枚)`;
          nextState.gameStatus = 'FINISHED';
          logMessage = `${active.name} はターン終了時にデッキが0枚のため敗北！`;
          logType = 'SYSTEM';
          break;
        }

        // Switch Active Player
        const nextPlayerId = active.playerId === 'PLAYER_A' ? 'PLAYER_B' : 'PLAYER_A';
        nextState.activePlayer = nextPlayerId;
        nextState.turnNumber++;

        const nextActive = this.getPlayer(nextState, nextPlayerId);

        // Turn Start Phase:
        // Rule 10 & 11: 自分のレスト状態のユニットとアルカナをすべてアクティブにする
        nextActive.arcana.forEach((a) => (a.isRested = false));
        nextActive.battlefield.forEach((u) => {
          u.isRested = false;
          u.hasSummoningSickness = false;
        });
        nextActive.hasPlacedArcanaThisTurn = false;
        nextActive.unitsKilledThisTurn = 0;

        // Draw card for new turn (1 card)
        const drawn = this.drawCards(nextActive, 1);
        logMessage = `${active.name} がターンを終了。ターン${nextState.turnNumber} (${nextActive.name}) 開始！`;
        if (drawn > 0) {
          logMessage += ` (1枚引いた)`;
        }
        logType = 'SYSTEM';
        nextState.phase = 'ARCANA';
        diffDescriptions.push(`ターン交代: ターン${nextState.turnNumber} (${nextActive.name})`);
        break;
      }
    }

    // Check Win/Loss conditions
    this.checkGameOutcome(nextState);

    const logEntry = this.addLog(nextState, logType, logMessage, action.playerId);
    const pA_after = this.getSnapshot(nextState.playerA);
    const pB_after = this.getSnapshot(nextState.playerB);

    const diff: StateDiff = {
      stepIndex: this.actionIndex,
      turn: nextState.turnNumber,
      action,
      playerA_before: pA_before,
      playerA_after: pA_after,
      playerB_before: pB_before,
      playerB_after: pB_after,
      descriptions: diffDescriptions,
    };

    return { nextState, diff, log: logEntry };
  }

  // ==========================================
  // Private Sub-mechanics Resolvers
  // ==========================================

  private payCost(player: PlayerState, cost: number): void {
    let remaining = cost;
    for (const arc of player.arcana) {
      if (!arc.isRested && remaining > 0) {
        arc.isRested = true;
        remaining--;
      }
    }
  }

  private drawCards(player: PlayerState, count: number): number {
    let drawn = 0;
    for (let i = 0; i < count; i++) {
      if (player.deck.length > 0) {
        const card = player.deck.shift()!;
        player.hand.push(card);
        player.cardsDrawnCount++;
        drawn++;
      }
    }
    return drawn;
  }

  private resolveOnEnterEffects(
    state: GameState,
    owner: PlayerState,
    opp: PlayerState,
    card: CardInstance
  ): void {
    if (card.cardId === 'B-04' || card.cardId === 'D-08' || card.cardId === 'N-02') {
      // 登場時、1枚引く
      this.drawCards(owner, 1);
    } else if (card.cardId === 'B-06') {
      // 蒼雷の魔導師カイ: 登場時、相手のCOST6以下のユニット1体を手札に戻してもよい
      const validOppUnits = opp.battlefield.filter((u) => u.baseCard.cost <= 6);
      if (validOppUnits.length > 0) {
        const target = validOppUnits[0];
        const idx = opp.battlefield.findIndex((u) => u.instanceId === target.instanceId);
        if (idx !== -1) {
          const returned = opp.battlefield.splice(idx, 1)[0];
          opp.hand.push(returned);
        }
      }
    } else if (card.cardId === 'B-09') {
      // 静水の魔導師ルーク: 登場時、相手のユニット1体を手札に戻してもよい
      if (opp.battlefield.length > 0) {
        const returned = opp.battlefield.pop()!;
        opp.hand.push(returned);
      }
    } else if (card.cardId === 'C-03') {
      // 宝花妖精ノエラ: 登場時、手札1枚をアルカナに置いてもよい
      if (owner.hand.length > 0) {
        const toArcana = owner.hand.pop()!;
        owner.arcana.push({ instance: toArcana, isRested: true });
      }
    } else if (card.cardId === 'C-04') {
      // 若葉妖精リーファ: 登場時、デッキの上から1枚をアルカナに置く
      const top = owner.deck.shift();
      if (top) owner.arcana.push({ instance: top, isRested: true });
    } else if (card.cardId === 'C-08' && owner.arcana.length >= 7) {
      // セレナ・ファンガス: 登場時、自分のアルカナが7枚以上なら1枚引く
      this.drawCards(owner, 1);
    } else if (card.cardId === 'D-06') {
      // 星詠の聖使徒ノエル: 登場時、相手のユニット1体をレストする
      const target = opp.battlefield.find((u) => !u.isRested);
      if (target) target.isRested = true;
    } else if (card.cardId === 'E-02') {
      // 黒衣の亡者グリム: 登場時、相手の手札1枚をランダムにアーカイブに置く
      if (opp.hand.length > 0) {
        const randIdx = Math.floor(this.prng.next() * opp.hand.length);
        const discarded = opp.hand.splice(randIdx, 1)[0];
        opp.archive.push(discarded);
      }
    } else if (card.cardId === 'E-04') {
      // 深淵の悪魔アビロト: 登場時、相手のCOST2以下のユニット1体を破壊する
      const target = opp.battlefield.find((u) => u.baseCard.cost <= 2);
      if (target) this.destroyUnit(state, opp, target.instanceId, 'アビロト登場時効果');
    } else if (card.cardId === 'E-06') {
      // 処刑の悪魔ギルテト: 登場時、相手のCOST3以下のユニット1体を破壊する
      const target = opp.battlefield.find((u) => u.baseCard.cost <= 3);
      if (target) this.destroyUnit(state, opp, target.instanceId, 'ギルテト登場時効果');
    } else if (card.cardId === 'E-10') {
      // 冥王の悪魔ダルクト: 登場時、相手のCOST5以下のユニット1体を破壊する
      const target = opp.battlefield.find((u) => u.baseCard.cost <= 5);
      if (target) this.destroyUnit(state, opp, target.instanceId, 'ダルクト登場時効果');
    } else if (card.cardId === 'A-08') {
      // 弾雷兵ボレトス: 登場時、相手のDEF20以下のユニット1体を破壊する
      const target = opp.battlefield.find((u) => {
        const s = this.calculateEffectiveStats(u, opp, owner);
        return s.def <= 20;
      });
      if (target) this.destroyUnit(state, opp, target.instanceId, '弾雷兵ボレトス登場時効果');
    }
  }

  private resolveDirectDamage(
    state: GameState,
    attackerPlayer: PlayerState,
    defenderPlayer: PlayerState,
    attacker: CardInstance
  ): void {
    const stats = this.calculateEffectiveStats(attacker, attackerPlayer, defenderPlayer);
    // Rule 19: 攻撃ユニットのBRK分だけ相手の結界を減らす
    defenderPlayer.hp = Math.max(0, defenderPlayer.hp - stats.brk);
    attackerPlayer.totalDamageDealt += stats.brk;
    this.addLog(
      state,
      'DAMAGE',
      `「${attacker.baseCard.name}」の攻撃が成功！ ${defenderPlayer.name} の結界が ${stats.brk} 減少！(残り結界: ${defenderPlayer.hp})`,
      attackerPlayer.playerId
    );

    // A-15 (百獣の狩場 Domain): 自分のユニットが相手プレイヤーへの攻撃に成功したとき、1枚引いてもよい
    if (attackerPlayer.domain?.cardId === 'A-15') {
      this.drawCards(attackerPlayer, 1);
      this.addLog(state, 'EFFECT', `百獣の狩場の効果で1枚引いた！`, attackerPlayer.playerId);
    }
  }

  private resolveCombatBetweenUnits(
    state: GameState,
    attackerPlayer: PlayerState,
    defenderPlayer: PlayerState,
    attacker: CardInstance,
    defender: CardInstance
  ): void {
    const attStats = this.calculateEffectiveStats(attacker, attackerPlayer, defenderPlayer);
    const defStats = this.calculateEffectiveStats(defender, defenderPlayer, attackerPlayer);

    // E-08 (死刃の亡者デレイ): 攻撃したとき、攻撃対象のDEFがこのユニットより高ければ、このユニットを破壊する
    if (attacker.cardId === 'E-08' && defStats.def > attStats.atk) {
      this.destroyUnit(state, attackerPlayer, attacker.instanceId, 'デレイの攻撃時自壊');
      return;
    }

    this.addLog(
      state,
      'COMBAT',
      `ユニット戦闘: ${attacker.baseCard.name} (ATK ${attStats.atk}) vs ${defender.baseCard.name} (DEF ${defStats.def})`,
      attackerPlayer.playerId
    );

    // Rule 18:
    // ATK > DEF: 防御側を破壊
    // ATK = DEF: 両方を破壊 (相討ち)
    // ATK < DEF: 攻撃側を破壊
    // BRKは戦闘に使用しない
    if (attStats.atk < defStats.def) {
      this.destroyUnit(state, attackerPlayer, attacker.instanceId, `戦闘敗北 (ATK ${attStats.atk} < DEF ${defStats.def})`);
    } else if (attStats.atk === defStats.def) {
      this.destroyUnit(state, attackerPlayer, attacker.instanceId, '相討ち');
      this.destroyUnit(state, defenderPlayer, defender.instanceId, '相討ち');
      attackerPlayer.unitsKilledThisTurn++;
      this.onUnitKillTriggers(state, attackerPlayer, defenderPlayer, attacker, defender);
    } else {
      this.destroyUnit(state, defenderPlayer, defender.instanceId, `戦闘勝利 (ATK ${attStats.atk} > DEF ${defStats.def})`);
      attackerPlayer.unitsKilledThisTurn++;
      this.onUnitKillTriggers(state, attackerPlayer, defenderPlayer, attacker, defender);
    }
  }

  private onUnitKillTriggers(
    state: GameState,
    killerPlayer: PlayerState,
    victimPlayer: PlayerState,
    killerUnit: CardInstance,
    victimUnit: CardInstance
  ): void {
    // A-06 (レイジ・ガルド): このターン、このユニットが初めて相手ユニットを破壊したとき、アクティブにする
    if (killerUnit.cardId === 'A-06' && killerPlayer.unitsKilledThisTurn === 1) {
      killerUnit.isRested = false;
      this.addLog(state, 'EFFECT', `レイジ・ガルドの効果で再アクティブ化！`, killerPlayer.playerId);
    }
    // C-10 (アース・トロール): 相手ユニットを破壊したとき、1枚引く (このユニット自身の攻撃によって破壊したとき)
    if (killerUnit.cardId === 'C-10') {
      this.drawCards(killerPlayer, 1);
      this.addLog(state, 'EFFECT', `アース・トロールの効果で1枚引いた！`, killerPlayer.playerId);
    }
  }

  public destroyUnit(
    state: GameState,
    owner: PlayerState,
    unitInstanceId: string,
    reason: string
  ): void {
    const idx = owner.battlefield.findIndex((u) => u.instanceId === unitInstanceId);
    if (idx === -1) return;

    const unit = owner.battlefield.splice(idx, 1)[0];
    owner.unitsDestroyedCount++;

    this.addLog(state, 'DESTROY', `「${unit.baseCard.name}」が破壊された (${reason})`, owner.playerId);

    // Replacement Effects (Rule 32):
    // B-11 (大魔導師アストラ): 破壊されるとき、かわりに手札に戻す
    if (unit.cardId === 'B-11') {
      owner.hand.push(unit);
      this.addLog(state, 'EFFECT', `大魔導師アストラの効果で手札へ戻った！`, owner.playerId);
      return;
    }

    // C-06 (エレナ・アイビー): このユニットが破壊されるとき、かわりにアルカナに置く
    if (unit.cardId === 'C-06') {
      owner.arcana.push({ instance: unit, isRested: true });
      this.addLog(state, 'EFFECT', `エレナ・アイビーの効果でアルカナへ置かれた！`, owner.playerId);
      return;
    }

    // Standard destruction to Archive
    owner.archive.push(unit);

    // On-Destroy Triggers:
    // E-01 (墓守の亡者ネグロ): このユニットが破壊されたとき、デッキの上から1枚をアーカイブに置く
    if (unit.cardId === 'E-01' && owner.deck.length > 0) {
      const top = owner.deck.shift()!;
      owner.archive.push(top);
      this.addLog(state, 'EFFECT', `ネグロの効果でデッキトップ1枚をアーカイブへ`, owner.playerId);
    }
    // E-05 (還魂の亡者バウル): このユニットが破壊されたとき、アーカイブからCOST2以下のユニット1体を手札に戻す
    if (unit.cardId === 'E-05') {
      const targetIdx = owner.archive.findIndex(
        (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') && c.baseCard.cost <= 2
      );
      if (targetIdx !== -1) {
        const retrieved = owner.archive.splice(targetIdx, 1)[0];
        owner.hand.push(retrieved);
        this.addLog(state, 'EFFECT', `バウルの効果でアーカイブから「${retrieved.baseCard.name}」を手札に戻した`, owner.playerId);
      }
    }
    // E-07 (グレイブ・ゴースト): このユニットが破壊されたとき、アーカイブからCOST4以下のユニット1体を手札に戻す
    if (unit.cardId === 'E-07') {
      const targetIdx = owner.archive.findIndex(
        (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') && c.baseCard.cost <= 4
      );
      if (targetIdx !== -1) {
        const retrieved = owner.archive.splice(targetIdx, 1)[0];
        owner.hand.push(retrieved);
        this.addLog(state, 'EFFECT', `グレイブ・ゴーストの効果でアーカイブから「${retrieved.baseCard.name}」を手札に戻した`, owner.playerId);
      }
    }
    // E-15 (終夜の宴 Domain): 自分のユニットが破壊されたとき、1枚引く
    if (owner.domain?.cardId === 'E-15') {
      this.drawCards(owner, 1);
      this.addLog(state, 'EFFECT', `終夜の宴の効果で1枚引いた！`, owner.playerId);
    }

    // Check Rune E-14 (ネクロ・コール) trigger
    const necroRune = owner.runes.find((r) => r.cardId === 'E-14');
    if (necroRune && state.phase !== 'RUNE_STEP') {
      const validRevives = owner.archive.filter(
        (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') &&
               c.baseCard.faction === 'DARK' &&
               c.baseCard.cost <= 2
      );
      if (validRevives.length > 0 && owner.battlefield.length < 6) {
        state.phase = 'RUNE_STEP';
        state.pendingTrigger = {
          triggerType: 'ON_DESTROY',
          sourceInstanceId: necroRune.instanceId,
          triggeringPlayerId: owner.playerId,
        };
      }
    }
  }

  private checkGameOutcome(state: GameState): void {
    if (state.winner !== null) return;

    const pA = state.playerA;
    const pB = state.playerB;

    // Barrier (結界) Loss Check: Rule 2: "相手の結界を0以下にした時点で勝利"
    if (pA.hp <= 0 && pB.hp <= 0) {
      state.winner = 'DRAW';
      state.winReason = '両プレイヤーの結界が同時に0以下';
      state.gameStatus = 'FINISHED';
    } else if (pA.hp <= 0) {
      state.winner = 'PLAYER_B';
      state.winReason = `${pB.name} の勝利！(${pA.name}の結界が0以下)`;
      state.gameStatus = 'FINISHED';
    } else if (pB.hp <= 0) {
      state.winner = 'PLAYER_A';
      state.winReason = `${pA.name} の勝利！(${pB.name}の結界が0以下)`;
      state.gameStatus = 'FINISHED';
    }

    // Max Turn Safety Limit (100 turns)
    if (state.turnNumber >= 100 && state.winner === null) {
      state.winner = pA.hp > pB.hp ? 'PLAYER_A' : pB.hp > pA.hp ? 'PLAYER_B' : 'DRAW';
      state.winReason = `最大ターン(100)到達判定 (${pA.name} 結界:${pA.hp} vs ${pB.name} 結界:${pB.hp})`;
      state.gameStatus = 'FINISHED';
    }
  }
}
