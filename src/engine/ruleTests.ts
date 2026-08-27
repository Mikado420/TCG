import { ALL_CARDS, CARD_MAP, CARD_POOL_VERSION, RULES_VERSION } from '../data/cards';
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

  // 1. Card Pool Completeness Test (Ver.2.3)
  {
    const start = performance.now();
    let passed = true;
    let message = `全80枚のカードデータ (朱15, 蒼15, 翠15, 聖15, 冥15, 無5) が正常に読み込まれました。(Card Pool: ${CARD_POOL_VERSION})`;

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
      description: 'Ver.2.3 全80枚のカード定義と系統毎の枚数構成を検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 2. Initial State Rules Test (Rules Ver.0.03: Kekkai 5, Hand 4, Deck 36)
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
    let message = '初期状態(結界5, 手札4枚, アルカナ0枚, デッキ36枚, P1先攻)がルールVer.0.03に完全準拠しています。';

    if (
      state.playerA.hp !== 5 ||
      state.playerB.hp !== 5 ||
      state.playerA.hand.length !== 4 ||
      state.playerB.hand.length !== 4 ||
      state.playerA.deck.length !== 36 ||
      state.playerB.deck.length !== 36 ||
      state.playerA.arcana.length !== 0 ||
      state.playerB.arcana.length !== 0 ||
      state.activePlayer !== 'PLAYER_A'
    ) {
      passed = false;
      message = `初期ゲーム状態の値が不正です (A結界:${state.playerA.hp}, B結界:${state.playerB.hp}, A手札:${state.playerA.hand.length}, Aデッキ:${state.playerA.deck.length})`;
    }

    results.push({
      testId: 'test_initial_state',
      category: 'CORE_RULE',
      name: '初期結界5・手札4枚・デッキ36枚検証',
      description: '初期結界5、手札4枚、デッキ36枚、先攻設定の正確性を検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 3. Combat Mechanics (ATK vs DEF resolution & BRK direct damage)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_combat', redDeck.cards, blueDeck.cards);

    // Inject attacker (A-04: ATK 30, DEF 30, BRK 2) and defender (B-02: ATK 20, DEF 20)
    const attackerCard = CARD_MAP.get('A-04')!;
    const defenderCard = CARD_MAP.get('B-02')!;

    state.playerA.battlefield.push({
      instanceId: 'test_atk_1',
      cardId: 'A-04',
      baseCard: attackerCard,
      ownerId: 'PLAYER_A',
      currentCost: 3,
      currentAtk: 30,
      currentDef: 30,
      currentBrk: 2,
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
      currentAtk: 20,
      currentDef: 20,
      currentBrk: 1,
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
      ? 'ATK 30 > DEF 20 による一方的破壊の戦闘解決が成功しました。'
      : '戦闘解決の処理結果が不正です。';

    results.push({
      testId: 'test_combat_resolution',
      category: 'COMBAT',
      name: 'ユニット戦闘 (ATK vs DEF)',
      description: 'ATKとDEFの比較によるユニット破壊および生存判定を検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 4. Barrier Damage (BRK Direct Attack)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_brk_damage', redDeck.cards, blueDeck.cards);

    const attackerCard = CARD_MAP.get('A-11')!; // 統獣王グラディオン (BRK 2)
    state.playerA.battlefield.push({
      instanceId: 'test_atk_brk',
      cardId: 'A-11',
      baseCard: attackerCard,
      ownerId: 'PLAYER_A',
      currentCost: 7,
      currentAtk: 60,
      currentDef: 60,
      currentBrk: 2,
      currentDmg: 2,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    state.phase = 'ACTION';

    const stepResult = engine.step(state, {
      type: 'ATTACK',
      playerId: 'PLAYER_A',
      payload: {
        attackerInstanceId: 'test_atk_brk',
        targetType: 'PLAYER',
      },
    });

    const nextState = stepResult.nextState;
    const passed = nextState.playerB.hp === 3; // 5 - 2 = 3

    results.push({
      testId: 'test_brk_damage',
      category: 'COMBAT',
      name: '結界へのBRKダメージ計算',
      description: 'プレイヤー直接攻撃時にBRK 2により結界が5から3に減少することを検証',
      passed,
      message: passed
        ? `BRK 2 による直接攻撃で相手の結界が 5 → ${nextState.playerB.hp} に減少しました。`
        : `結界ダメージ計算が不正です (現在結界: ${nextState.playerB.hp})`,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 5. Card Specific Mechanics: A-14 フレア・トリガー
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_a14', redDeck.cards, blueDeck.cards);

    // Player B has A-14 in runes
    const a14Card = CARD_MAP.get('A-14')!;
    state.playerB.runes.push({
      instanceId: 'rune_a14',
      cardId: 'A-14',
      baseCard: a14Card,
      ownerId: 'PLAYER_B',
      currentCost: 2,
      currentAtk: 0,
      currentDef: 0,
      currentBrk: 0,
      currentDmg: 0,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    // Player A summons D-01 (DEF 10, Guard)
    const d01Card = CARD_MAP.get('D-01')!;
    state.playerA.hand.push({
      instanceId: 'summon_d01',
      cardId: 'D-01',
      baseCard: d01Card,
      ownerId: 'PLAYER_A',
      currentCost: 1,
      currentAtk: 0,
      currentDef: 10,
      currentBrk: 1,
      currentDmg: 1,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    // Give Player A active arcana
    state.playerA.arcana.push({
      instance: state.playerA.hand[0],
      isRested: false,
    });
    state.phase = 'ACTION';

    const playResult = engine.step(state, {
      type: 'PLAY_UNIT',
      playerId: 'PLAYER_A',
      payload: { cardInstanceId: 'summon_d01' },
    });

    const isTriggerPending =
      playResult.nextState.phase === 'RUNE_STEP' &&
      playResult.nextState.pendingTrigger?.triggerType === 'ON_ENTER';

    results.push({
      testId: 'test_a14_flare_trigger',
      category: 'CARD_MECHANIC',
      name: 'A-14 フレア・トリガー迎撃判定',
      description: '相手がDEF60以下のガードユニットを登場させた時にフレア・トリガーが割り込むかを検証',
      passed: isTriggerPending,
      message: isTriggerPending
        ? 'A-14 フレア・トリガーの割込フェーズ(RUNE_STEP)への遷移が正常に実行されました。'
        : 'フレア・トリガーのトリガー判定が不正です。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 6. Card Specific Mechanics: C-01 風花妖精ミア
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_c01', redDeck.cards, blueDeck.cards);

    const c01Card = CARD_MAP.get('C-01')!;
    state.playerA.battlefield.push({
      instanceId: 'unit_c01',
      cardId: 'C-01',
      baseCard: c01Card,
      ownerId: 'PLAYER_A',
      currentCost: 1,
      currentAtk: 20,
      currentDef: 10,
      currentBrk: 1,
      currentDmg: 1,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    state.playerA.arcana.push({
      instance: state.playerA.deck.shift()!,
      isRested: false,
    });

    const arcanaCountBefore = state.playerA.arcana.length;
    const handCountBefore = state.playerA.hand.length;
    state.phase = 'ACTION';

    const attackResult = engine.step(state, {
      type: 'ATTACK',
      playerId: 'PLAYER_A',
      payload: {
        attackerInstanceId: 'unit_c01',
        targetType: 'PLAYER',
      },
    });

    const arcanaCountAfter = attackResult.nextState.playerA.arcana.length;
    const handCountAfter = attackResult.nextState.playerA.hand.length;

    const passed = arcanaCountAfter === arcanaCountBefore - 1 && handCountAfter === handCountBefore + 1;

    results.push({
      testId: 'test_c01_mia_attack',
      category: 'CARD_MECHANIC',
      name: 'C-01 風花妖精ミア 攻撃時アルカナ回収',
      description: '攻撃時にアルカナのカード1枚を手札に戻す効果を検証',
      passed,
      message: passed
        ? 'C-01 ミアの攻撃時、アルカナから手札への回収が正常に実行されました。'
        : 'C-01 ミアの効果処理が不正です。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 7. Preset Deck 40-Card Validation
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
      name: '40枚構築プリセットデッキ規格適合性',
      description: '全プリセットデッキが40枚制限・同名4枚制限を遵守しているか検証',
      passed,
      message,
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  return results;
}
