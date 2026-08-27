import { ALL_CARDS, CARD_MAP } from '../data/cards';
import { PRESET_DECKS } from '../data/presetDecks';
import { GameEngine } from './gameEngine';

export interface TestResult {
  testId: string;
  category: 'CORE_RULE' | 'COMBAT' | 'CARD_MECHANIC' | 'SYSTEM';
  name: string;
  description: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export function runAllRuleTests(): TestResult[] {
  const results: TestResult[] = [];

  // 1. Card Pool Completeness Test
  {
    const start = performance.now();
    let passed = true;
    let message = `全80枚のカードデータ (朱15, 蒼15, 翠15, 聖15, 冥15, 無5) が正常に読み込まれました。`;

    if (ALL_CARDS.length !== 80) {
      passed = false;
      message = `カード数が80枚ではありません (現在: ${ALL_CARDS.length}枚)`;
    }

    const redCards = ALL_CARDS.filter((c) => c.faction === 'RED');
    const blueCards = ALL_CARDS.filter((c) => c.faction === 'BLUE');
    const greenCards = ALL_CARDS.filter((c) => c.faction === 'GREEN');
    const holyCards = ALL_CARDS.filter((c) => c.faction === 'HOLY');
    const darkCards = ALL_CARDS.filter((c) => c.faction === 'DARK');
    const neutralCards = ALL_CARDS.filter((c) => c.faction === 'NEUTRAL');

    if (
      redCards.length !== 15 ||
      blueCards.length !== 15 ||
      greenCards.length !== 15 ||
      holyCards.length !== 15 ||
      darkCards.length !== 15 ||
      neutralCards.length !== 5
    ) {
      passed = false;
      message = `系統別のカード枚数内訳が不正です (朱:${redCards.length}, 蒼:${blueCards.length}, 翠:${greenCards.length}, 聖:${holyCards.length}, 冥:${darkCards.length}, 無:${neutralCards.length})`;
    }

    results.push({
      testId: 'test_card_pool_count',
      category: 'CARD_MECHANIC',
      name: 'カードプール80枚完全検証',
      description: 'Ver.2.2 全80枚のカード定義と系統毎の枚数構成を検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 2. Initial State Rules Test
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];

    const state = engine.createInitialState(
      'test_game_1',
      redDeck.cards,
      blueDeck.cards,
      'Player A',
      'Player B',
      false,
      false,
      'HUMAN',
      'HUMAN',
      12345
    );

    let passed = true;
    let message = '初期状態(HP20, 手札4枚, アルカナ0枚, デッキ36枚, P1先攻)が完全準拠しています。';

    if (
      state.playerA.hp !== 20 ||
      state.playerB.hp !== 20 ||
      state.playerA.hand.length !== 4 ||
      state.playerB.hand.length !== 4 ||
      state.playerA.deck.length !== 36 ||
      state.playerB.deck.length !== 36 ||
      state.playerA.arcana.length !== 0 ||
      state.playerB.arcana.length !== 0 ||
      state.activePlayer !== 'PLAYER_A'
    ) {
      passed = false;
      message = '初期ゲーム状態の値がルール仕様と一致しません。';
    }

    results.push({
      testId: 'test_initial_state',
      category: 'CORE_RULE',
      name: '初期ゲーム状態と手札配分',
      description: '初期HP20、手札4枚、デッキ36枚、先攻設定の正確性を検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 3. Combat Mechanics (ATK vs DEF resolution)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_combat', redDeck.cards, blueDeck.cards);

    // Inject attacker (ATK 3000, DEF 3000) and defender (ATK 2000, DEF 2000)
    const attackerCard = CARD_MAP.get('A-04')!; // ATK 3000, DEF 3000
    const defenderCard = CARD_MAP.get('B-02')!; // ATK 2000, DEF 2000 (Guard)

    state.playerA.battlefield.push({
      instanceId: 'test_atk_1',
      cardId: 'A-04',
      baseCard: attackerCard,
      ownerId: 'PLAYER_A',
      currentCost: 3,
      currentAtk: 3000,
      currentDef: 3000,
      currentDmg: 2,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    state.playerB.battlefield.push({
      instanceId: 'test_def_1',
      cardId: 'B-02',
      baseCard: defenderCard,
      ownerId: 'PLAYER_B',
      currentCost: 2,
      currentAtk: 2000,
      currentDef: 2000,
      currentDmg: 1,
      isRested: true,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    state.phase = 'ACTION';

    const stepResult = engine.step(state, {
      type: 'ATTACK',
      playerId: 'PLAYER_A',
      payload: {
        attackerInstanceId: 'test_atk_1',
        targetType: 'UNIT',
        targetUnitInstanceId: 'test_def_1',
      },
    });

    const nextState = stepResult.nextState;
    const defenderDead = nextState.playerB.battlefield.every((u) => u.instanceId !== 'test_def_1');
    const attackerAlive = nextState.playerA.battlefield.some((u) => u.instanceId === 'test_atk_1');

    const passed = defenderDead && attackerAlive;
    const message = passed
      ? 'ATK 3000 > DEF 2000 による一方的破壊の戦闘解決が成功しました。'
      : '戦闘解決の処理結果が不正です。';

    results.push({
      testId: 'test_combat_resolution',
      category: 'COMBAT',
      name: '戦闘ダメージ・破壊判定',
      description: 'ATKとDEFの比較によるユニット破壊および生存判定を検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 4. Arcana Setting & Phase Flow
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_arcana', redDeck.cards, blueDeck.cards);

    const firstCardInHand = state.playerA.hand[0];
    const stepResult = engine.step(state, {
      type: 'SET_ARCANA',
      playerId: 'PLAYER_A',
      payload: { cardInstanceId: firstCardInHand.instanceId },
    });

    const nextState = stepResult.nextState;
    const passed =
      nextState.playerA.arcana.length === 1 &&
      nextState.playerA.hand.length === 3 &&
      nextState.playerA.hasPlacedArcanaThisTurn === true &&
      nextState.phase === 'ACTION';

    results.push({
      testId: 'test_arcana_setting',
      category: 'CORE_RULE',
      name: 'アルカナセット＆アクションフェイズ遷移',
      description: '手札からアルカナへの配置とアクションフェイズへの遷移を検証',
      passed,
      message: passed
        ? 'アルカナ配置とアクションフェイズへの移行が正常に行われました。'
        : 'アルカナ配置処理が不正です。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 5. Preset Deck Validation Test
  {
    const start = performance.now();
    let passed = true;
    let message = '全5つのプリセットデッキ(朱, 蒼, 翠, 聖, 冥)が各40枚・最大4積みルールを満たしています。';

    for (const deck of PRESET_DECKS) {
      if (deck.cards.length !== 40) {
        passed = false;
        message = `プリセットデッキ「${deck.deckName}」が40枚ではありません (${deck.cards.length}枚)`;
        break;
      }
      const counts: Record<string, number> = {};
      for (const cardId of deck.cards) {
        counts[cardId] = (counts[cardId] || 0) + 1;
        if (counts[cardId] > 4) {
          passed = false;
          message = `プリセットデッキ「${deck.deckName}」で「${cardId}」が4枚を超えています (${counts[cardId]}枚)`;
          break;
        }
      }
    }

    results.push({
      testId: 'test_preset_decks_valid',
      category: 'SYSTEM',
      name: 'プリセットデッキ規格適合性',
      description: '各プリセットデッキが40枚制限・同名4枚制限を遵守しているか検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  return results;
}
