import {
  Action,
  AIDecisionLog,
  CandidateActionEvaluation,
  GameState,
  LegalAction,
  PlayerId,
  VisibleGameState,
} from '../types/game';
import { GameEngine } from './gameEngine';

export class AIEvaluator {
  private engine: GameEngine;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  // Convert full GameState to VisibleGameState for AI (hides opponent's hand and deck order)
  public extractVisibleState(state: GameState, aiPlayerId: PlayerId, legalActions: LegalAction[]): VisibleGameState {
    const me = this.engine.getPlayer(state, aiPlayerId);
    const opp = this.engine.getOpponent(state, aiPlayerId);

    return {
      gameId: state.gameId,
      turnNumber: state.turnNumber,
      phase: state.phase,
      me: {
        playerId: me.playerId,
        hp: me.hp,
        maxHp: me.maxHp,
        hand: me.hand.map((c) => c.baseCard),
        arcana: me.arcana.map((a) => ({ card: a.instance.baseCard, isRested: a.isRested })),
        battlefield: me.battlefield.map((u) => {
          const stats = this.engine.calculateEffectiveStats(u, me, opp);
          return {
            instanceId: u.instanceId,
            card: u.baseCard,
            currentAtk: stats.atk,
            currentDef: stats.def,
            currentDmg: stats.dmg,
            isRested: u.isRested,
            hasSummoningSickness: u.hasSummoningSickness,
            hasGuard: stats.hasGuard,
          };
        }),
        domain: me.domain ? me.domain.baseCard : null,
        runeCount: me.runes.length,
        archive: me.archive.map((c) => c.baseCard),
        deckCount: me.deck.length,
      },
      opponent: {
        playerId: opp.playerId,
        hp: opp.hp,
        maxHp: opp.maxHp,
        handCount: opp.hand.length,
        arcana: opp.arcana.map((a) => ({ card: a.instance.baseCard, isRested: a.isRested })),
        battlefield: opp.battlefield.map((u) => {
          const stats = this.engine.calculateEffectiveStats(u, opp, me);
          return {
            instanceId: u.instanceId,
            card: u.baseCard,
            currentAtk: stats.atk,
            currentDef: stats.def,
            currentDmg: stats.dmg,
            isRested: u.isRested,
            hasSummoningSickness: u.hasSummoningSickness,
            hasGuard: stats.hasGuard,
          };
        }),
        domain: opp.domain ? opp.domain.baseCard : null,
        runeCount: opp.runes.length,
        archive: opp.archive.map((c) => c.baseCard),
        deckCount: opp.deck.length,
      },
      legalActions,
    };
  }

  // Tactical Heuristic Evaluation of a Candidate Action
  public evaluateCandidateAction(
    state: GameState,
    candidate: LegalAction,
    aiPlayerId: PlayerId
  ): CandidateActionEvaluation {
    const me = this.engine.getPlayer(state, aiPlayerId);
    const opp = this.engine.getOpponent(state, aiPlayerId);
    const act = candidate.action;

    let boardAdvantage = 5.0;
    let handAdvantage = 5.0;
    let hpAdvantage = (me.hp / 20) * 5.0 + ((20 - opp.hp) / 20) * 5.0;
    let resourceAdvantage = 5.0;
    let pressure = 5.0;
    let lethalPotential = 0.0;
    let futureValue = 5.0;
    let risk = 2.0;
    let rationale = '';

    switch (act.type) {
      case 'SET_ARCANA': {
        // Higher value in early game (turns 1-6)
        if (me.arcana.length < 5) {
          resourceAdvantage = 9.0;
          futureValue = 8.5;
          rationale = `序盤のマナ展開を最優先。次ターンの高コスト展開へ繋げる。`;
        } else if (me.arcana.length < 7) {
          resourceAdvantage = 7.0;
          futureValue = 7.0;
          rationale = `中盤のアルカナ拡張。シナジー条件を満たす。`;
        } else {
          resourceAdvantage = 4.0;
          futureValue = 4.0;
          rationale = `アルカナが十分に揃っているため、手札温存も視野。`;
        }
        break;
      }

      case 'SKIP_ARCANA': {
        if (me.arcana.length >= 6) {
          resourceAdvantage = 8.0;
          futureValue = 7.5;
          rationale = `十分なアルカナがあるため手札リソースを温存。`;
        } else {
          resourceAdvantage = 2.0;
          futureValue = 2.0;
          risk = 8.0;
          rationale = `序盤のマナ停止はテンポロスになる恐れあり。`;
        }
        break;
      }

      case 'PLAY_UNIT':
      case 'EVOLVE': {
        boardAdvantage = 8.5;
        pressure = 7.5;
        resourceAdvantage = 6.0;
        risk = 3.0;
        rationale = `盤面プレゼンスの強化。テンポを取りに行く展開。`;
        break;
      }

      case 'PLAY_SPELL': {
        boardAdvantage = 7.0;
        pressure = 6.5;
        rationale = `スペルによる盤面除去またはリソースアドバンテージの獲得。`;
        break;
      }

      case 'SET_RUNE': {
        futureValue = 8.0;
        risk = 2.0;
        rationale = `相手ターンの行動に対するカウンター妨害の布石。`;
        break;
      }

      case 'PLAY_DOMAIN': {
        futureValue = 9.0;
        boardAdvantage = 7.5;
        rationale = `永続ドメインによる継続的アドバンテージの確立。`;
        break;
      }

      case 'ATTACK': {
        const payload = act.payload as { attackerInstanceId: string; targetType: 'PLAYER' | 'UNIT'; targetUnitInstanceId?: string };
        const attacker = me.battlefield.find((u) => u.instanceId === payload.attackerInstanceId);
        const stats = attacker ? this.engine.calculateEffectiveStats(attacker, me, opp) : { atk: 0, def: 0, dmg: 0 };

        if (payload.targetType === 'PLAYER') {
          pressure = 8.5;
          if (opp.hp <= stats.dmg) {
            lethalPotential = 10.0;
            pressure = 10.0;
            rationale = `リーサル（直接トドメ）。勝利を決定づける攻撃。`;
          } else {
            rationale = `相手プレイヤーへ直接${stats.dmg}点ダメージを与え、ライフを詰める。`;
          }
        } else if (payload.targetType === 'UNIT' && payload.targetUnitInstanceId) {
          const defender = opp.battlefield.find((u) => u.instanceId === payload.targetUnitInstanceId);
          const defStats = defender ? this.engine.calculateEffectiveStats(defender, opp, me) : { atk: 0, def: 0, dmg: 0 };

          if (stats.atk > defStats.def) {
            boardAdvantage = 9.0;
            risk = 1.0;
            rationale = `有利トレード: 敵ユニット「${defender?.baseCard.name}」を一方的に撃破。`;
          } else if (stats.atk === defStats.def) {
            boardAdvantage = 6.0;
            risk = 4.0;
            rationale = `相打ちトレード: 互いの盤面をリセット。`;
          } else {
            boardAdvantage = 1.0;
            risk = 9.5;
            rationale = `不利トレード: 自滅の危険性あり。`;
          }
        }
        break;
      }

      case 'GUARD': {
        const payload = act.payload as { doGuard: boolean };
        if (payload.doGuard) {
          hpAdvantage = 8.0;
          risk = 4.0;
          rationale = `ガードによりプレイヤーHPへの被ダメージを防御。`;
        } else {
          hpAdvantage = 4.0;
          risk = 5.0;
          rationale = `ユニットを温存するため攻撃を甘受。`;
        }
        break;
      }

      case 'TRIGGER_RUNE': {
        const payload = act.payload as { activate: boolean };
        if (payload.activate) {
          boardAdvantage = 8.5;
          rationale = `ルーンを発動し、相手の行動を即座に妨害・カウンター。`;
        } else {
          rationale = `ルーンを温存。より有効な局面まで待機。`;
        }
        break;
      }

      case 'END_TURN': {
        boardAdvantage = 5.0;
        futureValue = 5.0;
        rationale = `今ターンの行動を完了し、相手ターンへ移行。`;
        break;
      }
    }

    const overall =
      boardAdvantage * 0.25 +
      hpAdvantage * 0.2 +
      resourceAdvantage * 0.15 +
      pressure * 0.15 +
      lethalPotential * 0.2 +
      futureValue * 0.1 -
      risk * 0.05;

    const clampedOverall = Math.min(10.0, Math.max(0.1, parseFloat(overall.toFixed(2))));

    return {
      action: act,
      score: clampedOverall,
      breakdown: {
        boardAdvantage: parseFloat(boardAdvantage.toFixed(1)),
        handAdvantage: parseFloat(handAdvantage.toFixed(1)),
        hpAdvantage: parseFloat(hpAdvantage.toFixed(1)),
        resourceAdvantage: parseFloat(resourceAdvantage.toFixed(1)),
        pressure: parseFloat(pressure.toFixed(1)),
        lethalPotential: parseFloat(lethalPotential.toFixed(1)),
        futureValue: parseFloat(futureValue.toFixed(1)),
        risk: parseFloat(risk.toFixed(1)),
        overall: clampedOverall,
      },
      rationale,
    };
  }

  // Pick best action using tactical heuristics
  public selectBestAction(
    state: GameState,
    legalActions: LegalAction[],
    aiPlayerId: PlayerId
  ): AIDecisionLog {
    if (legalActions.length === 0) {
      throw new Error('No legal actions available for AI');
    }

    const candidates: CandidateActionEvaluation[] = legalActions.map((cand) =>
      this.evaluateCandidateAction(state, cand, aiPlayerId)
    );

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    const bestCandidate = candidates[0];
    const me = this.engine.getPlayer(state, aiPlayerId);
    const opp = this.engine.getOpponent(state, aiPlayerId);

    const decisionLog: AIDecisionLog = {
      id: `ai_dec_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      gameId: state.gameId,
      turn: state.turnNumber,
      phase: state.phase,
      aiPlayer: aiPlayerId,
      selectedAction: bestCandidate.action,
      reason: bestCandidate.rationale || `総合評価値 ${bestCandidate.score}/10 に基づき最適手を選択。`,
      candidates,
      isFallback: false,
      visibleStateSummary: {
        myHp: me.hp,
        opponentHp: opp.hp,
        myHandCount: me.hand.length,
        oppHandCount: opp.hand.length,
        myActiveArcana: me.arcana.filter((a) => !a.isRested).length,
        myBattlefieldCount: me.battlefield.length,
        oppBattlefieldCount: opp.battlefield.length,
      },
      timestamp: Date.now(),
    };

    return decisionLog;
  }
}
