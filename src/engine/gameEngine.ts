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
  ReplayStep,
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
          currentDmg: baseCard.dmg,
          isRested: false,
          summonedTurn: 0,
          hasSummoningSickness: false,
          buffs: [],
        };
      });
    };

    const shuffledDeckA = this.prng.shuffle(createInstances(deckACardIds, 'PLAYER_A'));
    const shuffledDeckB = this.prng.shuffle(createInstances(deckBCardIds, 'PLAYER_B'));

    const initialHandA = shuffledDeckA.splice(0, 4);
    const initialHandB = shuffledDeckB.splice(0, 4);

    const playerA: PlayerState = {
      playerId: 'PLAYER_A',
      name: playerAName,
      hp: 20,
      maxHp: 20,
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
      hp: 20,
      maxHp: 20,
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
      phase: 'ARCANA', // Player A Turn 1 starts at Arcana phase (skips draw)
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
      aiPromptVersion: 'v2.2-tactical',
    };

    this.addLog(initialState, 'SYSTEM', `ゲーム開始！先攻: ${playerA.name}、後攻: ${playerB.name}`);
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

  // Calculate dynamic effective ATK/DEF/DMG considering board state and domains
  public calculateEffectiveStats(
    unit: CardInstance,
    owner: PlayerState,
    opp: PlayerState
  ): { atk: number; def: number; dmg: number; hasGuard: boolean; canAttack: boolean } {
    let atk = unit.baseCard.atk;
    let def = unit.baseCard.def;
    let dmg = unit.baseCard.dmg;
    let hasGuard = !!unit.baseCard.hasGuard;
    let canAttack = !unit.baseCard.cantAttack;

    // Apply Temporary/Permanent Buffs on instance
    for (const buff of unit.buffs) {
      if (buff.type === 'ATK') atk += buff.value;
      if (buff.type === 'DEF') def += buff.value;
      if (buff.type === 'DMG') dmg += buff.value;
      if (buff.type === 'GUARD') hasGuard = true;
      if (buff.type === 'CAN_ATTACK') canAttack = true;
    }

    // A-03: ワイルド・レオン (自分の朱系統のユニットが他に2体以上いれば、ATK+2000)
    if (unit.cardId === 'A-03') {
      const otherRedFauna = owner.battlefield.filter(
        (u) => u.instanceId !== unit.instanceId && u.baseCard.faction === 'RED'
      );
      if (otherRedFauna.length >= 2) {
        atk += 2000;
      }
    }

    // A-11: 統獣王グラディオン (自分の場にいる他のユニットの数ぶんDMG+1)
    if (unit.cardId === 'A-11') {
      const otherUnits = owner.battlefield.filter((u) => u.instanceId !== unit.instanceId);
      dmg += otherUnits.length;
    }

    // C-07: 月光妖精リゼ (自分のアルカナが7枚以上ならATK+2000)
    if (unit.cardId === 'C-07' && owner.arcana.length >= 7) {
      atk += 2000;
    }

    // C-15: 大樹の残響 (Domain: 自分のアルカナが8枚以上なら、自分のすべてのユニットのATK+1000)
    if (owner.domain?.cardId === 'C-15' && owner.arcana.length >= 8) {
      atk += 1000;
    }

    // D-04: 城壁の聖護者ミレイ・フォード (自分の聖系統のユニットが他に2枚以上いるならDEF+1000)
    if (unit.cardId === 'D-04') {
      const otherHoly = owner.battlefield.filter(
        (u) => u.instanceId !== unit.instanceId && u.baseCard.faction === 'HOLY'
      );
      if (otherHoly.length >= 2) {
        def += 1000;
      }
    }

    // D-15: 光彩を放つ聖域 (Domain: 自分の聖系統のユニットは攻撃できないという効果を受けなくなる)
    if (owner.domain?.cardId === 'D-15' && unit.baseCard.faction === 'HOLY') {
      canAttack = true;
    }

    // E-09: ナイト・ゴースト (自分のアーカイブにユニットが5枚以上ならATK+3000)
    if (unit.cardId === 'E-09') {
      const archiveUnits = owner.archive.filter(
        (c) => c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT'
      );
      if (archiveUnits.length >= 5) {
        atk += 3000;
      }
    }

    return { atk: Math.max(0, atk), def: Math.max(0, def), dmg: Math.max(0, dmg), hasGuard, canAttack };
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

    // 1. GUARD STEP (Defending player reacts to attack)
    if (state.phase === 'GUARD_STEP' && state.pendingCombat) {
      const defPlayer = this.getOpponent(state, state.pendingCombat.attackerPlayerId);
      const attacker = this.getPlayer(state, state.pendingCombat.attackerPlayerId).battlefield.find(
        (u) => u.instanceId === state.pendingCombat!.attackerInstanceId
      );

      // Check if attacker ignores guard
      const ignoreGuard =
        attacker?.cannotBeGuardedThisTurn ||
        (attacker?.baseCard.cardId === 'B-08' && active.archive.some((c) => c.baseCard.cardType === 'SPELL')) ||
        (attacker?.baseCard.cardId === 'B-10' && active.archive.some((c) => c.baseCard.cardType === 'SPELL'));

      if (!ignoreGuard) {
        // Find valid guardians (any unit with hasGuard)
        for (const guardUnit of defPlayer.battlefield) {
          const stats = this.calculateEffectiveStats(guardUnit, defPlayer, active);
          if (stats.hasGuard) {
            actions.push({
              action: {
                type: 'GUARD',
                playerId: defPlayer.playerId,
                payload: { guardInstanceId: guardUnit.instanceId, doGuard: true },
                description: `【ガード】${guardUnit.baseCard.name} (DEF ${stats.def}) で守る`,
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
          description: 'ガードしない (スルー)',
        },
        description: 'ガードしない (攻撃を受ける)',
        category: 'PASS',
      });

      return actions;
    }

    // 2. RUNE TRIGGER STEP
    if (state.phase === 'RUNE_STEP' && state.pendingTrigger) {
      const runePlayer = this.getPlayer(state, state.pendingTrigger.triggeringPlayerId);
      for (const rune of runePlayer.runes) {
        // Match rune trigger types
        if (state.pendingTrigger.triggerType === 'ON_ENTER' && rune.cardId === 'A-14') {
          if ((state.pendingTrigger.targetDef || 0) <= 2000) {
            actions.push({
              action: {
                type: 'TRIGGER_RUNE',
                playerId: runePlayer.playerId,
                payload: {
                  runeInstanceId: rune.instanceId,
                  activate: true,
                  targetUnitInstanceId: state.pendingTrigger.targetInstanceId,
                },
                description: `【ルーン発動】フレア・トリガー (DEF2000以下の登場ユニットを即時破壊)`,
              },
              description: `フレア・トリガーを発動`,
              category: 'TRIGGER',
              cardId: rune.cardId,
              cardName: rune.baseCard.name,
            });
          }
        }
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
                description: `【ルーン発動】三重聖壁 (相手ユニット3体をレスト)`,
              },
              description: `三重聖壁を発動`,
              category: 'TRIGGER',
              cardId: rune.cardId,
              cardName: rune.baseCard.name,
            });
          }
        }
        if (state.pendingTrigger.triggerType === 'ON_DESTROY' && rune.cardId === 'E-14') {
          const validArchiveUnits = runePlayer.archive.filter(
            (c) => c.baseCard.cardType === 'UNIT' && c.baseCard.faction === 'DARK' && c.baseCard.cost <= 2
          );
          if (validArchiveUnits.length > 0) {
            actions.push({
              action: {
                type: 'TRIGGER_RUNE',
                playerId: runePlayer.playerId,
                payload: {
                  runeInstanceId: rune.instanceId,
                  activate: true,
                  targetUnitInstanceId: validArchiveUnits[0].instanceId,
                },
                description: `【ルーン発動】ネクロ・コール (アーカイブからCost2以下の冥ユニットを蘇生)`,
              },
              description: `ネクロ・コールを発動`,
              category: 'TRIGGER',
              cardId: rune.cardId,
              cardName: rune.baseCard.name,
            });
          }
        }
        if (state.pendingTrigger.triggerType === 'ON_ARCANA_SET' && rune.cardId === 'C-14') {
          if (runePlayer.archive.length > 0 && runePlayer.arcana.length > 0) {
            actions.push({
              action: {
                type: 'TRIGGER_RUNE',
                playerId: runePlayer.playerId,
                payload: { runeInstanceId: rune.instanceId, activate: true },
                description: `【ルーン発動】調和の継承 (アーカイブからアルカナへ置き1枚戻す)`,
              },
              description: `調和の継承を発動`,
              category: 'TRIGGER',
              cardId: rune.cardId,
              cardName: rune.baseCard.name,
            });
          }
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

    // 3. ARCANA PHASE
    if (state.phase === 'ARCANA') {
      if (!active.hasPlacedArcanaThisTurn) {
        for (const card of active.hand) {
          actions.push({
            action: {
              type: 'SET_ARCANA',
              playerId: active.playerId,
              payload: { cardInstanceId: card.instanceId },
              description: `手札の「${card.baseCard.name}」をアルカナにセット`,
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
          description: 'アルカナセットをスキップしてメイン行動へ進む',
        },
        description: 'アルカナフェイズをスキップ',
        category: 'PASS',
      });
      return actions;
    }

    // 4. ACTION PHASE (Main Phase)
    if (state.phase === 'ACTION') {
      const activeArcanaCount = active.arcana.filter((a) => !a.isRested).length;
      const activeFactions = new Set<FactionCode>(
        active.arcana.filter((a) => !a.isRested).map((a) => a.instance.baseCard.faction)
      );

      // Check card play from hand
      for (const card of active.hand) {
        const cardData = card.baseCard;
        const canPayCost = activeArcanaCount >= cardData.cost;
        const meetsFactionReq =
          cardData.faction === 'NEUTRAL' || activeFactions.has(cardData.faction);

        if (canPayCost && meetsFactionReq) {
          // Play Unit
          if (cardData.cardType === 'UNIT') {
            actions.push({
              action: {
                type: 'PLAY_UNIT',
                playerId: active.playerId,
                payload: { cardInstanceId: card.instanceId },
                description: `【召喚】${cardData.name} (コスト${cardData.cost}, ATK${cardData.atk}/DEF${cardData.def})`,
              },
              description: `召喚: ${cardData.name}`,
              category: 'SUMMON',
              cardId: card.cardId,
              cardName: cardData.name,
            });
          }

          // Evolve Unit (Requires matching base unit on field)
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
                description: `進化: ${cardData.name} (対象: ${baseUnit.baseCard.name})`,
                category: 'SUMMON',
                cardId: card.cardId,
                cardName: cardData.name,
              });
            }
          }

          // Spells
          if (cardData.cardType === 'SPELL') {
            if (cardData.cardId === 'A-12') {
              // 燃える闘志 (自分のユニット1体のATK+2000)
              for (const target of active.battlefield) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: {
                      cardInstanceId: card.instanceId,
                      targetUnitInstanceId: target.instanceId,
                    },
                    description: `【スペル】燃える闘志 → ${target.baseCard.name}のATK+2000`,
                  },
                  description: `スペル: 燃える闘志 (${target.baseCard.name})`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else if (cardData.cardId === 'A-13' || cardData.cardId === 'N-04') {
              // ドラゴン・ブレス / 無彩の雷光 (DEF5000以下を破壊)
              const validTargets = opponent.battlefield.filter((u) => {
                const s = this.calculateEffectiveStats(u, opponent, active);
                return s.def <= 5000;
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
              // 聖なる戒め (相手ユニット1体をレスト)
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
              // バイタル・ロス (アクティブ状態の相手ユニット1体を破壊)
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
              // ルーン・ブレイク (相手のルーンを破壊)
              if (opponent.runes.length > 0) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: { cardInstanceId: card.instanceId },
                    description: `【スペル】ルーン・ブレイク → 相手のルーンを1枚破壊`,
                  },
                  description: `スペル: ルーン・ブレイク`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else if (cardData.cardId === 'N-05') {
              // ドメイン・ブレイク (相手のドメインをアーカイブ)
              if (opponent.domain !== null) {
                actions.push({
                  action: {
                    type: 'PLAY_SPELL',
                    playerId: active.playerId,
                    payload: { cardInstanceId: card.instanceId },
                    description: `【スペル】ドメイン・ブレイク → 相手の${opponent.domain.baseCard.name}を破壊`,
                  },
                  description: `スペル: ドメイン・ブレイク`,
                  category: 'SPELL',
                  cardId: card.cardId,
                  cardName: cardData.name,
                });
              }
            } else {
              // Untargeted spells: B-12 (draw 2), B-13 (mist barrier), C-12 (ramp), C-13 (twin grow), D-13 (holy fortress), E-12 (hand discard)
              actions.push({
                action: {
                  type: 'PLAY_SPELL',
                  playerId: active.playerId,
                  payload: { cardInstanceId: card.instanceId },
                  description: `【スペル】${cardData.name}を発動`,
                },
                description: `スペル: ${cardData.name}`,
                category: 'SPELL',
                cardId: card.cardId,
                cardName: cardData.name,
              });
            }
          }

          // Rune Placement (Max 2 in Rune Zone)
          if (cardData.cardType === 'RUNE' && active.runes.length < 2) {
            actions.push({
              action: {
                type: 'SET_RUNE',
                playerId: active.playerId,
                payload: { cardInstanceId: card.instanceId },
                description: `【ルーン設置】${cardData.name} (コスト${cardData.cost})`,
              },
              description: `ルーン設置: ${cardData.name}`,
              category: 'RUNE',
              cardId: card.cardId,
              cardName: cardData.name,
            });
          }

          // Domain Placement (1 active domain)
          if (cardData.cardType === 'DOMAIN') {
            actions.push({
              action: {
                type: 'PLAY_DOMAIN',
                playerId: active.playerId,
                payload: { cardInstanceId: card.instanceId },
                description: `【ドメイン展開】${cardData.name} (コスト${cardData.cost})`,
              },
              description: `ドメイン展開: ${cardData.name}`,
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
            description: `【攻撃】${unit.baseCard.name} (ATK${stats.atk}/DMG${stats.dmg}) → 相手プレイヤー`,
          },
          description: `攻撃: ${unit.baseCard.name} → 相手プレイヤー`,
          category: 'ATTACK',
          cardId: unit.cardId,
          cardName: unit.baseCard.name,
        });

        // Attack rested opponent units (or active units if canAttackActiveUnits like A-10)
        for (const oppUnit of opponent.battlefield) {
          const canTargetUnit = oppUnit.isRested || unit.baseCard.canAttackActiveUnits || unit.canAttackActiveThisTurn;
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

      // End Turn is always an option in Action Phase
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
    // Clone state deeply for immutability
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
          logMessage = `${active.name} は「${card.baseCard.name}」をアルカナにセットした。(アルカナ: ${active.arcana.length}枚)`;
          logType = 'ARCANA';
          diffDescriptions.push(`${active.name}の手札が1枚減り、アルカナが1枚増加`);

          // Check opponent Rune: C-14 (調和の継承)
          if (opponent.runes.some((r) => r.cardId === 'C-14')) {
            nextState.phase = 'RUNE_STEP';
            nextState.pendingTrigger = {
              triggerType: 'ON_ARCANA_SET',
              sourceInstanceId: card.instanceId,
              triggeringPlayerId: opponent.playerId,
            };
          } else {
            nextState.phase = 'ACTION';
          }
        }
        break;
      }

      case 'SKIP_ARCANA': {
        logMessage = `${active.name} はアルカナセットをスキップした。`;
        logType = 'ARCANA';
        nextState.phase = 'ACTION';
        diffDescriptions.push(`${active.name}がアルカナフェイズを通過`);
        break;
      }

      // ----------------------------------------------------
      // 2. PLAY UNIT
      // ----------------------------------------------------
      case 'PLAY_UNIT': {
        const { cardInstanceId } = action.payload as { cardInstanceId: string };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (handIdx !== -1) {
          const card = active.hand.splice(handIdx, 1)[0];
          this.payCost(active, card.baseCard.cost);
          card.summonedTurn = nextState.turnNumber;
          card.hasSummoningSickness = !card.baseCard.hasHaste;
          active.battlefield.push(card);

          logMessage = `${active.name} は「${card.baseCard.name}」を召喚！(コスト${card.baseCard.cost})`;
          logType = 'PLAY';
          diffDescriptions.push(`${active.name}が${card.baseCard.name}を召喚`);

          // Check opponent Rune: A-14 (フレア・トリガー)
          const flareRune = opponent.runes.find((r) => r.cardId === 'A-14');
          if (flareRune && card.baseCard.def <= 2000) {
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
          const baseUnit = active.battlefield[baseUnitIdx];
          this.payCost(active, evolveCard.baseCard.cost);

          evolveCard.evolvedFrom = baseUnit;
          evolveCard.isRested = baseUnit.isRested; // inherits rested state
          evolveCard.summonedTurn = nextState.turnNumber;
          evolveCard.hasSummoningSickness = false; // evolution doesn't have sickness if base unit didn't

          active.battlefield[baseUnitIdx] = evolveCard;

          logMessage = `${active.name} は「${baseUnit.baseCard.name}」を進化 →「${evolveCard.baseCard.name}」！`;
          logType = 'PLAY';
          diffDescriptions.push(`${baseUnit.baseCard.name}が${evolveCard.baseCard.name}へ進化`);

          // Evolution On-Enter Effects
          if (evolveCard.cardId === 'C-11') {
            // 精霊神セレフィア: デッキトップ2枚をアルカナへ
            const ramp1 = active.deck.shift();
            const ramp2 = active.deck.shift();
            if (ramp1) active.arcana.push({ instance: ramp1, isRested: true });
            if (ramp2) active.arcana.push({ instance: ramp2, isRested: true });
            logMessage += ` (アルカナを2枚追加)`;
          } else if (evolveCard.cardId === 'D-11') {
            // 聖天護神アルディアス: 相手ユニット1体をレスト
            const oppActive = opponent.battlefield.find((u) => !u.isRested);
            if (oppActive) {
              oppActive.isRested = true;
              logMessage += ` (相手の${oppActive.baseCard.name}をレスト)`;
            }
          } else if (evolveCard.cardId === 'E-11') {
            // 不死王ベルゼネク: アーカイブからCost4以下のユニットを蘇生
            const reviveTargetIdx = active.archive.findIndex(
              (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') && c.baseCard.cost <= 4
            );
            if (reviveTargetIdx !== -1) {
              const revived = active.archive.splice(reviveTargetIdx, 1)[0];
              revived.isRested = false;
              revived.hasSummoningSickness = true;
              active.battlefield.push(revived);
              logMessage += ` (アーカイブから「${revived.baseCard.name}」を蘇生)`;
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

          logMessage = `${active.name} はスペル「${spell.baseCard.name}」を発動！`;
          logType = 'EFFECT';

          // B-08 & B-10: 自分がスペルを使用したターンはガード無視
          for (const u of active.battlefield) {
            if (u.cardId === 'B-08' || u.cardId === 'B-10') {
              u.cannotBeGuardedThisTurn = true;
            }
          }

          // Specific Spell Resolutions
          if (spell.cardId === 'A-12' && targetUnitInstanceId) {
            const target = active.battlefield.find((u) => u.instanceId === targetUnitInstanceId);
            if (target) {
              target.buffs.push({
                id: `buff_${Date.now()}`,
                type: 'ATK',
                value: 2000,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
              logMessage += ` (${target.baseCard.name}のATK+2000)`;
            }
          } else if ((spell.cardId === 'A-13' || spell.cardId === 'N-04') && targetUnitInstanceId) {
            this.destroyUnit(nextState, opponent, targetUnitInstanceId, '相手のDEF5000以下破壊スペル');
          } else if (spell.cardId === 'B-12') {
            this.drawCards(active, 2);
            logMessage += ` (カードを2枚ドロー)`;
          } else if (spell.cardId === 'B-13') {
            active.battlefield.slice(0, 2).forEach((u) => (u.cannotBeGuardedThisTurn = true));
            logMessage += ` (ユニット2体にガード無効を付与)`;
          } else if (spell.cardId === 'C-12') {
            const top = active.deck.shift();
            if (top) active.arcana.push({ instance: top, isRested: true });
            logMessage += ` (デッキからアルカナ+1)`;
          } else if (spell.cardId === 'C-13') {
            active.battlefield.slice(0, 2).forEach((u) => {
              u.buffs.push({
                id: `buff_${Date.now()}`,
                type: 'ATK',
                value: 3000,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
            });
            logMessage += ` (ユニット2体のATK+3000)`;
          } else if (spell.cardId === 'D-12' && targetUnitInstanceId) {
            const target = opponent.battlefield.find((u) => u.instanceId === targetUnitInstanceId);
            if (target) target.isRested = true;
            logMessage += ` (相手ユニットをレスト)`;
          } else if (spell.cardId === 'D-13') {
            active.battlefield.filter((u) => u.baseCard.faction === 'HOLY').forEach((u) => {
              u.buffs.push({
                id: `buff_${Date.now()}`,
                type: 'DEF',
                value: 2000,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
              u.buffs.push({
                id: `buff_g_${Date.now()}`,
                type: 'GUARD',
                value: 1,
                duration: 'THIS_TURN',
                appliedTurn: nextState.turnNumber,
                sourceCardId: spell.cardId,
              });
            });
            logMessage += ` (聖ユニットDEF+2000＆ガード付与)`;
          } else if (spell.cardId === 'E-12') {
            if (opponent.hand.length > 0) {
              const randIdx = Math.floor(this.prng.next() * opponent.hand.length);
              const discarded = opponent.hand.splice(randIdx, 1)[0];
              opponent.archive.push(discarded);
              logMessage += ` (相手の手札「${discarded.baseCard.name}」をハンデス)`;
            }
          } else if (spell.cardId === 'E-13' && targetUnitInstanceId) {
            this.destroyUnit(nextState, opponent, targetUnitInstanceId, 'バイタル・ロス');
          } else if (spell.cardId === 'N-03') {
            if (opponent.runes.length > 0) {
              const destroyedRune = opponent.runes.pop()!;
              opponent.archive.push(destroyedRune);
              logMessage += ` (相手のルーン「${destroyedRune.baseCard.name}」を破壊)`;
            }
          } else if (spell.cardId === 'N-05') {
            if (opponent.domain) {
              opponent.archive.push(opponent.domain);
              logMessage += ` (相手のドメイン「${opponent.domain.baseCard.name}」を破壊)`;
              opponent.domain = null;
            }
          }
          diffDescriptions.push(`${spell.baseCard.name}を発動`);
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
          logMessage = `${active.name} はルーン「${rune.baseCard.name}」を伏せた。(ルーン: ${active.runes.length}/2)`;
          logType = 'PLAY';

          // B-05 & B-15 trigger: Draw 1 card when using rune
          if (active.battlefield.some((u) => u.cardId === 'B-05') || active.domain?.cardId === 'B-15') {
            this.drawCards(active, 1);
            logMessage += ` (ルーンシナジーで1ドロー)`;
          }
          diffDescriptions.push(`${rune.baseCard.name}をルーンゾーンへ配置`);
        }
        break;
      }

      // ----------------------------------------------------
      // 6. PLAY DOMAIN
      // ----------------------------------------------------
      case 'PLAY_DOMAIN': {
        const { cardInstanceId } = action.payload as { cardInstanceId: string };
        const handIdx = active.hand.findIndex((c) => c.instanceId === cardInstanceId);
        if (handIdx !== -1) {
          const domain = active.hand.splice(handIdx, 1)[0];
          this.payCost(active, domain.baseCard.cost);
          if (active.domain) {
            active.archive.push(active.domain);
          }
          active.domain = domain;
          logMessage = `${active.name} はドメイン「${domain.baseCard.name}」を展開！`;
          logType = 'PLAY';
          diffDescriptions.push(`${domain.baseCard.name}を展開`);
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
          if (attacker.cardId === 'A-01') {
            // リトル・ボア: 攻撃時自壊
            this.destroyUnit(nextState, active, attacker.instanceId, 'リトル・ボアの攻撃時自壊');
          } else if (attacker.cardId === 'C-01') {
            // 風花妖精ミア: 攻撃時アルカナを1枚戻す
            if (active.arcana.length > 0) {
              const returned = active.arcana.pop()!;
              active.archive.push(returned.instance);
              logMessage += ` (ミアの効果でアルカナを1枚アーカイブへ)`;
            }
          }

          if (targetType === 'PLAYER') {
            logMessage = `${active.name} の「${attacker.baseCard.name}」が相手プレイヤーに攻撃！`;
            logType = 'ATTACK';

            // Check opponent Runes: B-14 (ヴォルテ・リターン), D-14 (三重聖壁)
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
                // Deal direct player damage
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
              diffDescriptions.push(`プレイヤーへの直接ダメージ確定`);
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

            if (rune.cardId === 'A-14' && targetUnitInstanceId) {
              const targetPlayer = this.getOpponent(nextState, runePlayer.playerId);
              this.destroyUnit(nextState, targetPlayer, targetUnitInstanceId, 'フレア・トリガーによる登場前破壊');
            } else if (rune.cardId === 'B-14' && targetUnitInstanceId) {
              const targetPlayer = this.getOpponent(nextState, runePlayer.playerId);
              const uIdx = targetPlayer.battlefield.findIndex((u) => u.instanceId === targetUnitInstanceId);
              if (uIdx !== -1) {
                const returned = targetPlayer.battlefield.splice(uIdx, 1)[0];
                targetPlayer.hand.push(returned);
                this.drawCards(runePlayer, 1);
                logMessage += ` (攻撃ユニットを手札に戻し1ドロー)`;
              }
            } else if (rune.cardId === 'D-14') {
              const opp = this.getOpponent(nextState, runePlayer.playerId);
              opp.battlefield.slice(0, 3).forEach((u) => (u.isRested = true));
              logMessage += ` (相手ユニット3体をレスト)`;
            } else if (rune.cardId === 'E-14' && targetUnitInstanceId) {
              const archIdx = runePlayer.archive.findIndex((c) => c.instanceId === targetUnitInstanceId);
              if (archIdx !== -1) {
                const revived = runePlayer.archive.splice(archIdx, 1)[0];
                revived.isRested = false;
                revived.hasSummoningSickness = true;
                runePlayer.battlefield.push(revived);
                logMessage += ` (アーカイブから「${revived.baseCard.name}」を蘇生)`;
              }
            }
            diffDescriptions.push(`ルーン${rune.baseCard.name}が発動・墓地へ`);
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
        // D-10: ホワイト・アーク (ターン終了時アクティブにする)
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

        // Switch Active Player
        const nextPlayerId = active.playerId === 'PLAYER_A' ? 'PLAYER_B' : 'PLAYER_A';
        nextState.activePlayer = nextPlayerId;
        nextState.turnNumber++;

        const nextActive = this.getPlayer(nextState, nextPlayerId);
        // Untap all arcana and battlefield units
        nextActive.arcana.forEach((a) => (a.isRested = false));
        nextActive.battlefield.forEach((u) => {
          u.isRested = false;
          u.hasSummoningSickness = false;
        });
        nextActive.hasPlacedArcanaThisTurn = false;
        nextActive.unitsKilledThisTurn = 0;

        // Draw card for new turn
        const drawn = this.drawCards(nextActive, 1);
        logMessage = `${active.name} がターンを終了。ターン${nextState.turnNumber} (${nextActive.name}) 開始！`;
        if (drawn > 0) {
          logMessage += ` (1枚ドロー)`;
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
      // 1 Card Draw
      this.drawCards(owner, 1);
    } else if (card.cardId === 'B-06') {
      // Bounce opp cost <= 6
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
      // Bounce any opp unit
      if (opp.battlefield.length > 0) {
        const returned = opp.battlefield.pop()!;
        opp.hand.push(returned);
      }
    } else if (card.cardId === 'C-03') {
      // Hand to arcana
      if (owner.hand.length > 0) {
        const toArcana = owner.hand.pop()!;
        owner.arcana.push({ instance: toArcana, isRested: true });
      }
    } else if (card.cardId === 'C-04') {
      // Deck top to arcana
      const top = owner.deck.shift();
      if (top) owner.arcana.push({ instance: top, isRested: true });
    } else if (card.cardId === 'C-08' && owner.arcana.length >= 7) {
      this.drawCards(owner, 1);
    } else if (card.cardId === 'D-06') {
      // Rest 1 opp unit
      const target = opp.battlefield.find((u) => !u.isRested);
      if (target) target.isRested = true;
    } else if (card.cardId === 'E-02') {
      // Discard 1 opp hand
      if (opp.hand.length > 0) {
        const randIdx = Math.floor(this.prng.next() * opp.hand.length);
        const discarded = opp.hand.splice(randIdx, 1)[0];
        opp.archive.push(discarded);
      }
    } else if (card.cardId === 'E-04') {
      // Destroy opp cost <= 2
      const target = opp.battlefield.find((u) => u.baseCard.cost <= 2);
      if (target) this.destroyUnit(state, opp, target.instanceId, 'アビロト登場時効果');
    } else if (card.cardId === 'E-06') {
      // Destroy opp cost <= 3
      const target = opp.battlefield.find((u) => u.baseCard.cost <= 3);
      if (target) this.destroyUnit(state, opp, target.instanceId, 'ギルテト登場時効果');
    } else if (card.cardId === 'E-10') {
      // Destroy opp cost <= 5
      const target = opp.battlefield.find((u) => u.baseCard.cost <= 5);
      if (target) this.destroyUnit(state, opp, target.instanceId, 'ダルクト登場時効果');
    } else if (card.cardId === 'A-08') {
      // Destroy opp DEF <= 2000
      const target = opp.battlefield.find((u) => {
        const s = this.calculateEffectiveStats(u, opp, owner);
        return s.def <= 2000;
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
    defenderPlayer.hp = Math.max(0, defenderPlayer.hp - stats.dmg);
    attackerPlayer.totalDamageDealt += stats.dmg;
    this.addLog(
      state,
      'DAMAGE',
      `「${attacker.baseCard.name}」が ${defenderPlayer.name} に ${stats.dmg} ダメージ！(残りHP: ${defenderPlayer.hp})`,
      attackerPlayer.playerId
    );
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

    // E-08 (死刃の亡者デレイ): 攻撃時、相手のDEFが自身のDEFより高ければ自壊
    if (attacker.cardId === 'E-08' && defStats.def > attStats.def) {
      this.destroyUnit(state, attackerPlayer, attacker.instanceId, 'デレイの攻撃時自壊');
      return;
    }

    this.addLog(
      state,
      'COMBAT',
      `戦闘発生: ${attacker.baseCard.name} (ATK ${attStats.atk}) vs ${defender.baseCard.name} (DEF ${defStats.def})`,
      attackerPlayer.playerId
    );

    // Rule:
    // ATK < DEF: Attacker is destroyed
    // ATK == DEF: Both destroyed
    // ATK > DEF: Defender is destroyed
    if (attStats.atk < defStats.def) {
      this.destroyUnit(state, attackerPlayer, attacker.instanceId, `戦闘敗北 (ATK ${attStats.atk} < DEF ${defStats.def})`);
    } else if (attStats.atk === defStats.def) {
      this.destroyUnit(state, attackerPlayer, attacker.instanceId, '相打ち');
      this.destroyUnit(state, defenderPlayer, defender.instanceId, '相打ち');
      attackerPlayer.unitsKilledThisTurn++;
      this.onKillTriggers(state, attackerPlayer, defenderPlayer, attacker);
    } else {
      this.destroyUnit(state, defenderPlayer, defender.instanceId, `戦闘勝利 (ATK ${attStats.atk} > DEF ${defStats.def})`);
      attackerPlayer.unitsKilledThisTurn++;
      this.onKillTriggers(state, attackerPlayer, defenderPlayer, attacker);
    }
  }

  private onKillTriggers(
    state: GameState,
    killerPlayer: PlayerState,
    victimPlayer: PlayerState,
    killerUnit: CardInstance
  ): void {
    // A-06 (レイジ・ガルド): このターンはじめて相手ユニットを破壊した時アクティブ化
    if (killerUnit.cardId === 'A-06' && killerPlayer.unitsKilledThisTurn === 1) {
      killerUnit.isRested = false;
      this.addLog(state, 'EFFECT', `レイジ・ガルドの効果で再アクティブ化！`, killerPlayer.playerId);
    }
    // A-15 (百獣の狩場 Domain): ユニットを破壊したときカードを1枚引く
    if (killerPlayer.domain?.cardId === 'A-15') {
      this.drawCards(killerPlayer, 1);
      this.addLog(state, 'EFFECT', `百獣の狩場の効果で1ドロー！`, killerPlayer.playerId);
    }
    // C-10 (アース・トロール): 相手ユニットを破壊したときプレイヤーにDMG+1
    if (killerUnit.cardId === 'C-10') {
      victimPlayer.hp = Math.max(0, victimPlayer.hp - 1);
      killerPlayer.totalDamageDealt += 1;
      this.addLog(state, 'DAMAGE', `アース・トロールの効果で相手プレイヤーに1ダメージ！`, killerPlayer.playerId);
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

    // On-Destroy Triggers:
    // B-11 (大魔導師アストラ): 破壊されるとき代わりに手札に戻す
    if (unit.cardId === 'B-11') {
      owner.hand.push(unit);
      this.addLog(state, 'EFFECT', `大魔導師アストラの効果で手札へ帰還！`, owner.playerId);
      return;
    }

    // C-06 (エレナ・アイビー): 破壊時代わりにアルカナに置く
    if (unit.cardId === 'C-06') {
      owner.arcana.push({ instance: unit, isRested: true });
      this.addLog(state, 'EFFECT', `エレナ・アイビーの効果でアルカナゾーンへ配置！`, owner.playerId);
      return;
    }

    // Standard destruction to Archive
    owner.archive.push(unit);

    // E-01: デッキトップ1枚をアーカイブへ
    if (unit.cardId === 'E-01' && owner.deck.length > 0) {
      const top = owner.deck.shift()!;
      owner.archive.push(top);
    }
    // E-05: アーカイブからCost2以下のユニットを手札へ
    if (unit.cardId === 'E-05') {
      const targetIdx = owner.archive.findIndex(
        (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') && c.baseCard.cost <= 2
      );
      if (targetIdx !== -1) {
        const retrieved = owner.archive.splice(targetIdx, 1)[0];
        owner.hand.push(retrieved);
      }
    }
    // E-07: アーカイブからCost4以下のユニットを手札へ
    if (unit.cardId === 'E-07') {
      const targetIdx = owner.archive.findIndex(
        (c) => (c.baseCard.cardType === 'UNIT' || c.baseCard.cardType === 'EVOLVE_UNIT') && c.baseCard.cost <= 4
      );
      if (targetIdx !== -1) {
        const retrieved = owner.archive.splice(targetIdx, 1)[0];
        owner.hand.push(retrieved);
      }
    }
    // E-15 (終夜の宴 Domain): 自分のユニットが破壊されたとき1ドロー
    if (owner.domain?.cardId === 'E-15') {
      this.drawCards(owner, 1);
    }
  }

  private checkGameOutcome(state: GameState): void {
    if (state.winner !== null) return;

    const pA = state.playerA;
    const pB = state.playerB;

    // HP Loss Check
    if (pA.hp <= 0 && pB.hp <= 0) {
      state.winner = 'DRAW';
      state.winReason = '両プレイヤーのHPが同時に0以下';
      state.gameStatus = 'FINISHED';
    } else if (pA.hp <= 0) {
      state.winner = 'PLAYER_B';
      state.winReason = `${pB.name} の勝利！(${pA.name}のHPが0)`;
      state.gameStatus = 'FINISHED';
    } else if (pB.hp <= 0) {
      state.winner = 'PLAYER_A';
      state.winReason = `${pA.name} の勝利！(${pB.name}のHPが0)`;
      state.gameStatus = 'FINISHED';
    }

    // Deck Out Check at Turn End / Draw
    if (state.phase === 'ARCANA' && state.turnNumber > 1) {
      const active = this.getPlayer(state, state.activePlayer);
      if (active.deck.length === 0 && active.hand.length === 0 && active.battlefield.length === 0) {
        const opp = this.getOpponent(state, state.activePlayer);
        state.winner = opp.playerId;
        state.winReason = `${opp.name} の勝利！(${active.name}がデッキアウト)`;
        state.gameStatus = 'FINISHED';
      }
    }

    // Max Turn Safety Limit (100 turns)
    if (state.turnNumber >= 100) {
      state.winner = pA.hp > pB.hp ? 'PLAYER_A' : pB.hp > pA.hp ? 'PLAYER_B' : 'DRAW';
      state.winReason = `最大ターン(100)到達判定 (${pA.name} HP:${pA.hp} vs ${pB.name} HP:${pB.hp})`;
      state.gameStatus = 'FINISHED';
    }
  }
}
