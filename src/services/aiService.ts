import {
  Action,
  AIDecisionLog,
  GameState,
  LegalAction,
  PlayerId,
  VisibleGameState,
} from '../types/game';
import { AIEvaluator } from '../engine/aiEvaluator';
import { GameEngine } from '../engine/gameEngine';

export class AIService {
  private engine: GameEngine;
  private evaluator: AIEvaluator;

  constructor(engine: GameEngine) {
    this.engine = engine;
    this.evaluator = new AIEvaluator(engine);
  }

  public async getDecision(
    state: GameState,
    legalActions: LegalAction[],
    aiPlayerId: PlayerId,
    useGemini = true
  ): Promise<AIDecisionLog> {
    if (!useGemini) {
      return this.evaluator.selectBestAction(state, legalActions, aiPlayerId);
    }

    const visibleState = this.evaluator.extractVisibleState(state, aiPlayerId, legalActions);

    try {
      const response = await fetch('/api/ai/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleState, legalActions, aiPlayerId }),
      });

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }

      const data = await response.json();

      if (data.fallback || !data.selectedAction) {
        const fallbackDecision = this.evaluator.selectBestAction(state, legalActions, aiPlayerId);
        fallbackDecision.isFallback = true;
        fallbackDecision.fallbackReason = data.reason || 'Gemini fallback mode';
        return fallbackDecision;
      }

      const me = this.engine.getPlayer(state, aiPlayerId);
      const opp = this.engine.getOpponent(state, aiPlayerId);

      const decisionLog: AIDecisionLog = {
        id: `gemini_dec_${Date.now()}`,
        gameId: state.gameId,
        turn: state.turnNumber,
        phase: state.phase,
        aiPlayer: aiPlayerId,
        selectedAction: data.selectedAction,
        reason: data.reason || 'Geminiによる戦略的意思決定',
        candidates: data.evaluations?.map((ev: any) => ({
          action: legalActions[ev.index]?.action || data.selectedAction,
          score: ev.score,
          rationale: ev.rationale,
        })) || [],
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
    } catch (err: any) {
      console.warn('Gemini request failed, defaulting to heuristic AI:', err);
      const fallbackDecision = this.evaluator.selectBestAction(state, legalActions, aiPlayerId);
      fallbackDecision.isFallback = true;
      fallbackDecision.fallbackReason = `Network/API Error: ${err.message}. Used local heuristic evaluation.`;
      return fallbackDecision;
    }
  }

  public async explainBoardState(state: GameState, aiPlayerId: PlayerId): Promise<string> {
    const legal = this.engine.getLegalActions(state);
    const visibleState = this.evaluator.extractVisibleState(state, aiPlayerId, legal);

    try {
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibleState }),
      });
      const data = await response.json();
      return data.analysis || '戦況分析を取得できませんでした。';
    } catch {
      return 'オフライン戦況分析: 盤面の有利トレードとアルカナの順次セットを心がけてください。';
    }
  }

  public async analyzeMatchSummary(summary: any): Promise<string> {
    try {
      const response = await fetch('/api/ai/analyze-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchSummary: summary }),
      });
      const data = await response.json();
      return data.review || '対戦総括を取得できませんでした。';
    } catch {
      return 'オフライン対戦総括: 序盤のマナカーブとテンポ維持が勝敗を分けました。';
    }
  }
}
