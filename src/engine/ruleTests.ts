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

  // 8. Guard Condition Test (Only Active Guard Units Can Guard)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const holyDeck = PRESET_DECKS[3];
    const state = engine.createInitialState('test_guard', redDeck.cards, holyDeck.cards);

    // Player A has attacker A-04 (ATK 30, DEF 30, BRK 1)
    const a04Card = CARD_MAP.get('A-04')!;
    state.playerA.battlefield.push({
      instanceId: 'attacker_a04',
      cardId: 'A-04',
      baseCard: a04Card,
      ownerId: 'PLAYER_A',
      currentCost: 3,
      currentAtk: 30,
      currentDef: 30,
      currentBrk: 1,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    // Player B has 1 active guard (D-01) and 1 rested guard (D-02)
    const d01Card = CARD_MAP.get('D-01')!;
    const d02Card = CARD_MAP.get('D-02')!;
    state.playerB.battlefield.push(
      {
        instanceId: 'guard_active',
        cardId: 'D-01',
        baseCard: d01Card,
        ownerId: 'PLAYER_B',
        currentCost: 1,
        currentAtk: 0,
        currentDef: 10,
        currentBrk: 1,
        isRested: false,
        summonedTurn: 1,
        hasSummoningSickness: false,
        buffs: [],
      },
      {
        instanceId: 'guard_rested',
        cardId: 'D-02',
        baseCard: d02Card,
        ownerId: 'PLAYER_B',
        currentCost: 2,
        currentAtk: 0,
        currentDef: 30,
        currentBrk: 1,
        isRested: true,
        summonedTurn: 1,
        hasSummoningSickness: false,
        buffs: [],
      }
    );

    state.phase = 'ACTION';
    const attackResult = engine.step(state, {
      type: 'ATTACK',
      playerId: 'PLAYER_A',
      payload: {
        attackerInstanceId: 'attacker_a04',
        targetType: 'PLAYER',
      },
    });

    const guardActions = engine.getLegalActions(attackResult.nextState);
    const hasActiveGuardAction = guardActions.some(
      (a) => a.action.type === 'GUARD' && (a.action.payload as any).guardInstanceId === 'guard_active'
    );
    const hasRestedGuardAction = guardActions.some(
      (a) => a.action.type === 'GUARD' && (a.action.payload as any).guardInstanceId === 'guard_rested'
    );

    const passed = hasActiveGuardAction && !hasRestedGuardAction;
    results.push({
      testId: 'test_guard_active_condition',
      category: 'CORE_RULE',
      name: 'ガード条件 (アクティブ時のみ防御可能)',
      description: 'レスト状態のガードユニットはガードできず、アクティブ状態のガードユニットのみ選択可能か検証',
      passed,
      message: passed
        ? 'アクティブ状態のガードユニットのみが正常にガード選択肢として生成されました。'
        : 'レスト状態のガードユニットがガード可能になっているか、アクティブなガードが選べません。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 9. C-10 アース・トロール (自身の攻撃による破壊時ドロー)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const greenDeck = PRESET_DECKS[2];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_c10', greenDeck.cards, blueDeck.cards);

    const c10Card = CARD_MAP.get('C-10')!;
    state.playerA.battlefield.push({
      instanceId: 'attacker_c10',
      cardId: 'C-10',
      baseCard: c10Card,
      ownerId: 'PLAYER_A',
      currentCost: 5,
      currentAtk: 40,
      currentDef: 40,
      currentBrk: 1,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    const victimCard = CARD_MAP.get('B-01')!; // DEF 10
    state.playerB.battlefield.push({
      instanceId: 'victim_unit',
      cardId: 'B-01',
      baseCard: victimCard,
      ownerId: 'PLAYER_B',
      currentCost: 1,
      currentAtk: 10,
      currentDef: 10,
      currentBrk: 1,
      isRested: true,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    const handCountBefore = state.playerA.hand.length;
    state.phase = 'ACTION';

    const combatResult = engine.step(state, {
      type: 'ATTACK',
      playerId: 'PLAYER_A',
      payload: {
        attackerInstanceId: 'attacker_c10',
        targetType: 'UNIT',
        targetUnitInstanceId: 'victim_unit',
      },
    });

    const handCountAfter = combatResult.nextState.playerA.hand.length;
    const passed = handCountAfter === handCountBefore + 1;

    results.push({
      testId: 'test_c10_earth_troll',
      category: 'CARD_MECHANIC',
      name: 'C-10 アース・トロール 攻撃破壊時ドロー',
      description: 'C-10自身の攻撃で相手ユニットを破壊した時に1ドロー効果が発動することを検証',
      passed,
      message: passed
        ? 'C-10自身の攻撃によるユニット破壊時、正常に1ドローが実行されました。'
        : 'C-10のドロー効果が実行されていません。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 10. C-14 調和の継承 (アーカイブ→アルカナ、アルカナ→手札)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const greenDeck = PRESET_DECKS[2];
    const state = engine.createInitialState('test_c14', redDeck.cards, greenDeck.cards);

    const c14Card = CARD_MAP.get('C-14')!;
    state.playerB.runes.push({
      instanceId: 'rune_c14',
      cardId: 'C-14',
      baseCard: c14Card,
      ownerId: 'PLAYER_B',
      currentCost: 2,
      currentAtk: 0,
      currentDef: 0,
      currentBrk: 0,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    // Put a card in Player B's archive and arcana
    const archCard = state.playerB.deck.shift()!;
    state.playerB.archive.push(archCard);
    const arcCard = state.playerB.deck.shift()!;
    state.playerB.arcana.push({ instance: arcCard, isRested: false });

    state.phase = 'ARCANA';
    const setArcanaCard = state.playerA.hand[0];

    const setArcanaResult = engine.step(state, {
      type: 'SET_ARCANA',
      playerId: 'PLAYER_A',
      payload: { cardInstanceId: setArcanaCard.instanceId },
    });

    const isTriggered = setArcanaResult.nextState.phase === 'RUNE_STEP';
    const triggerResult = engine.step(setArcanaResult.nextState, {
      type: 'TRIGGER_RUNE',
      playerId: 'PLAYER_B',
      payload: { runeInstanceId: 'rune_c14', activate: true },
    });

    const finalB = triggerResult.nextState.playerB;
    // Archive had 1 (archCard) + 1 (C-14 sent on trigger) - 1 (archCard moved to arcana) = 1
    // Hand had 4 + 1 (arcCard moved to hand) = 5
    const passed = isTriggered && finalB.archive.length === 1 && finalB.hand.length === 5;

    results.push({
      testId: 'test_c14_harmony_order',
      category: 'CARD_MECHANIC',
      name: 'C-14 調和の継承 順序解決 (アーカイブ→アルカナ→手札)',
      description: '相手がアルカナ配置時、アーカイブからアルカナに置き、アルカナから手札に戻す順序を検証',
      passed,
      message: passed
        ? 'C-14 調和の継承がアーカイブ→アルカナ→手札の正しい順序で処理されました。'
        : 'C-14 調和の継承の処理が不正です。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 11. D-14 三重聖壁 (自分が攻撃された時のみ相手3体レスト)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const holyDeck = PRESET_DECKS[3];
    const state = engine.createInitialState('test_d14', redDeck.cards, holyDeck.cards);

    const d14Card = CARD_MAP.get('D-14')!;
    state.playerB.runes.push({
      instanceId: 'rune_d14',
      cardId: 'D-14',
      baseCard: d14Card,
      ownerId: 'PLAYER_B',
      currentCost: 3,
      currentAtk: 0,
      currentDef: 0,
      currentBrk: 0,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    // Player A has 3 active units
    for (let i = 1; i <= 3; i++) {
      const uCard = CARD_MAP.get('A-01')!;
      state.playerA.battlefield.push({
        instanceId: `pA_unit_${i}`,
        cardId: 'A-01',
        baseCard: uCard,
        ownerId: 'PLAYER_A',
        currentCost: 1,
        currentAtk: 10,
        currentDef: 10,
        currentBrk: 1,
        isRested: false,
        summonedTurn: 1,
        hasSummoningSickness: false,
        buffs: [],
      });
    }

    state.phase = 'ACTION';
    const attackResult = engine.step(state, {
      type: 'ATTACK',
      playerId: 'PLAYER_A',
      payload: {
        attackerInstanceId: 'pA_unit_1',
        targetType: 'PLAYER',
      },
    });

    const isTriggerPending = attackResult.nextState.phase === 'RUNE_STEP';
    const triggerResult = engine.step(attackResult.nextState, {
      type: 'TRIGGER_RUNE',
      playerId: 'PLAYER_B',
      payload: { runeInstanceId: 'rune_d14', activate: true },
    });

    const allRested = triggerResult.nextState.playerA.battlefield.every((u) => u.isRested);
    const passed = isTriggerPending && allRested;

    results.push({
      testId: 'test_d14_triple_wall',
      category: 'CARD_MECHANIC',
      name: 'D-14 三重聖壁 迎撃レスト判定',
      description: 'プレイヤー直接攻撃時にD-14が発動し、相手ユニット3体をレストすることを検証',
      passed,
      message: passed
        ? 'D-14 三重聖壁が正常に発動し、相手ユニット3体をレストしました。'
        : 'D-14 三重聖壁のレスト処理が不正です。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 12. Deckout End-Turn Loss Rule (0 Deck loses only at END_TURN)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_deckout', redDeck.cards, blueDeck.cards);

    // Empty Player A's deck
    state.playerA.deck = [];
    state.phase = 'ACTION';

    // Player A performs an action; game should NOT be finished yet
    const notFinishedYet = state.gameStatus === 'IN_PROGRESS';

    // Now Player A ends turn
    const endTurnResult = engine.step(state, {
      type: 'END_TURN',
      playerId: 'PLAYER_A',
      payload: {},
    });

    const passed =
      notFinishedYet &&
      endTurnResult.nextState.gameStatus === 'FINISHED' &&
      endTurnResult.nextState.winner === 'PLAYER_B';

    results.push({
      testId: 'test_deckout_end_turn_loss',
      category: 'CORE_RULE',
      name: 'デッキ切れ敗北タイミング検証 (ターン終了時判定)',
      description: 'デッキが0枚になった瞬間ではなく、ターン終了時に敗北となるルールVer.0.03を検証',
      passed,
      message: passed
        ? 'ターン終了時のデッキ0枚判定によって正常に敗北が成立しました。'
        : 'デッキ切れ敗北のタイミング処理が不正です。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 13. No Summoning Sickness (Units Can Attack On Summoned Turn)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_no_sickness', redDeck.cards, blueDeck.cards);

    // Give Player A active arcana
    for (let i = 0; i < 5; i++) {
      state.playerA.arcana.push({ instance: state.playerA.deck.shift()!, isRested: false });
    }

    const a04Card = CARD_MAP.get('A-04')!; // Normal Unit (No Haste keyword)
    state.playerA.hand.push({
      instanceId: 'fresh_unit',
      cardId: 'A-04',
      baseCard: a04Card,
      ownerId: 'PLAYER_A',
      currentCost: 3,
      currentAtk: 30,
      currentDef: 30,
      currentBrk: 1,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    state.phase = 'ACTION';
    const summonResult = engine.step(state, {
      type: 'PLAY_UNIT',
      playerId: 'PLAYER_A',
      payload: { cardInstanceId: 'fresh_unit' },
    });

    const actions = engine.getLegalActions(summonResult.nextState);
    const canAttackFresh = actions.some(
      (a) => a.action.type === 'ATTACK' && (a.action.payload as any).attackerInstanceId === 'fresh_unit'
    );

    results.push({
      testId: 'test_no_summoning_sickness',
      category: 'CORE_RULE',
      name: '召喚酔い廃止 (召喚ターン即時攻撃可能)',
      description: 'ルールVer.0.03に基づき召喚されたユニットがそのターンに攻撃可能か検証',
      passed: canAttackFresh,
      message: canAttackFresh
        ? '召喚したばかりの通常ユニットがそのターン即座に攻撃可能であることを確認しました。'
        : '召喚したユニットが攻撃できません (召喚酔い判定が残存しています)。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 14. Field Limit (Max 6 Units)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_field_limit', redDeck.cards, blueDeck.cards);

    for (let i = 0; i < 10; i++) {
      state.playerA.arcana.push({ instance: state.playerA.deck.shift()!, isRested: false });
    }

    // Fill field to 6 units
    for (let i = 1; i <= 6; i++) {
      state.playerA.battlefield.push({
        instanceId: `field_u_${i}`,
        cardId: 'A-01',
        baseCard: CARD_MAP.get('A-01')!,
        ownerId: 'PLAYER_A',
        currentCost: 1,
        currentAtk: 10,
        currentDef: 10,
        currentBrk: 1,
        isRested: false,
        summonedTurn: 1,
        hasSummoningSickness: false,
        buffs: [],
      });
    }

    state.playerA.hand.push({
      instanceId: 'extra_unit',
      cardId: 'A-01',
      baseCard: CARD_MAP.get('A-01')!,
      ownerId: 'PLAYER_A',
      currentCost: 1,
      currentAtk: 10,
      currentDef: 10,
      currentBrk: 1,
      isRested: false,
      summonedTurn: 1,
      hasSummoningSickness: false,
      buffs: [],
    });

    state.phase = 'ACTION';
    const actions = engine.getLegalActions(state);
    const canSummon7th = actions.some((a) => a.action.type === 'PLAY_UNIT');

    results.push({
      testId: 'test_field_limit_6',
      category: 'CORE_RULE',
      name: 'フィールド上限6体制限検証',
      description: 'フィールドに6体存在する状態で7体目の召喚が禁止されることを検証',
      passed: !canSummon7th,
      message: !canSummon7th
        ? 'フィールド6体上限により7体目の召喚行動が正しく遮断されました。'
        : 'フィールド6体上限を超えて召喚可能になっています。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  // 15. Arcana Faction Requirement (Color Constraint)
  {
    const start = performance.now();
    const engine = new GameEngine(12345);
    const redDeck = PRESET_DECKS[0];
    const blueDeck = PRESET_DECKS[1];
    const state = engine.createInitialState('test_faction_req', redDeck.cards, blueDeck.cards);

    // Player A has 3 NEUTRAL arcana (N-01)
    const n01Card = CARD_MAP.get('N-01')!;
    state.playerA.arcana = [1, 2, 3].map((i) => ({
      instance: {
        instanceId: `neutral_arc_${i}`,
        cardId: 'N-01',
        baseCard: n01Card,
        ownerId: 'PLAYER_A',
        currentCost: 2,
        currentAtk: 20,
        currentDef: 10,
        currentBrk: 1,
        isRested: false,
        summonedTurn: 1,
        hasSummoningSickness: false,
        buffs: [],
      },
      isRested: false,
    }));

    // Player A holds a RED card (A-01: Cost 1) and a NEUTRAL card (N-02: Cost 1)
    state.playerA.hand = [
      {
        instanceId: 'hand_red_1',
        cardId: 'A-01',
        baseCard: CARD_MAP.get('A-01')!,
        ownerId: 'PLAYER_A',
        currentCost: 1,
        currentAtk: 10,
        currentDef: 10,
        currentBrk: 1,
        isRested: false,
        summonedTurn: 1,
        hasSummoningSickness: false,
        buffs: [],
      },
      {
        instanceId: 'hand_neutral_1',
        cardId: 'N-02',
        baseCard: CARD_MAP.get('N-02')!,
        ownerId: 'PLAYER_A',
        currentCost: 1,
        currentAtk: 10,
        currentDef: 10,
        currentBrk: 1,
        isRested: false,
        summonedTurn: 1,
        hasSummoningSickness: false,
        buffs: [],
      },
    ];

    state.phase = 'ACTION';
    const actions = engine.getLegalActions(state);
    const canPlayRed = actions.some(
      (a) => (a.action.payload as any).cardInstanceId === 'hand_red_1'
    );
    const canPlayNeutral = actions.some(
      (a) => (a.action.payload as any).cardInstanceId === 'hand_neutral_1'
    );

    const passed = !canPlayRed && canPlayNeutral;
    results.push({
      testId: 'test_arcana_faction_requirement',
      category: 'CORE_RULE',
      name: 'アルカナ系統条件 (無系統アルカナのみでの5系統プレイ不可)',
      description: 'アルカナに無系統カードしかない場合、朱など5系統カードは使用不可、無系統は使用可能を検証',
      passed,
      message: passed
        ? '無系統アルカナのみの場合、系統カード使用不可および無系統カード使用可能が正しく判定されました。'
        : 'アルカナ系統条件の判定が不正です。',
      durationMs: parseFloat((performance.now() - start).toFixed(2)),
    });
  }

  return results;
}
