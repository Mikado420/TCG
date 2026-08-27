import React, { useState } from 'react';
import { Deck, GameReplay, VerificationReport } from '../types/game';
import { PRESET_DECKS } from '../data/presetDecks';
import { MatchSimulator, SimulationProgress } from '../engine/simulator';
import { AIService } from '../services/aiService';
import { GameEngine } from '../engine/gameEngine';
import {
  Activity,
  Play,
  CheckCircle2,
  Sparkles,
  BarChart3,
  RotateCcw,
  Zap,
  TrendingUp,
  Award,
  Layers,
} from 'lucide-react';

interface VerificationViewProps {
  customDecks: Deck[];
  onCompleteVerification: (report: VerificationReport, replays: GameReplay[]) => void;
  onNavigateToAnalytics: () => void;
  onNavigateToReplay: () => void;
}

export const VerificationView: React.FC<VerificationViewProps> = ({
  customDecks,
  onCompleteVerification,
  onNavigateToAnalytics,
  onNavigateToReplay,
}) => {
  const allDecks = [...customDecks, ...PRESET_DECKS];

  const [selectedDeckId, setSelectedDeckId] = useState<string>(
    customDecks.length > 0 ? customDecks[0].deckId : PRESET_DECKS[0].deckId
  );
  const [matchCount, setMatchCount] = useState<number>(1000);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<SimulationProgress | null>(null);
  const [lastReport, setLastReport] = useState<VerificationReport | null>(null);
  const [aiPostReview, setAiPostReview] = useState<string | null>(null);
  const [isGeneratingAiReview, setIsGeneratingAiReview] = useState<boolean>(false);

  const selectedDeck = allDecks.find((d) => d.deckId === selectedDeckId) || PRESET_DECKS[0];

  const handleStartSimulation = async () => {
    setIsRunning(true);
    setProgress(null);
    setAiPostReview(null);

    const simulator = new MatchSimulator();

    try {
      const { report, sampleReplays } = await simulator.runBatchSimulation({
        totalMatches: matchCount,
        targetDeck: selectedDeck,
        recordFullReplaysCount: 5,
        onProgress: (p) => setProgress(p),
      });

      setLastReport(report);
      onCompleteVerification(report, sampleReplays);
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRequestAiReview = async () => {
    if (!lastReport) return;
    setIsGeneratingAiReview(true);
    try {
      const engine = new GameEngine();
      const aiService = new AIService(engine);
      const review = await aiService.analyzeMatchSummary(lastReport);
      setAiPostReview(review);
    } catch {
      setAiPostReview('AIによる対戦総括の生成に失敗しました。');
    } finally {
      setIsGeneratingAiReview(false);
    }
  };

  return (
    <div id="verification-view" className="max-w-7xl mx-auto p-4 space-y-4 animate-fade-in">
      {/* Configuration Header */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            AI vs AI 高速検証シミュレーション
          </h2>
          <p className="text-xs text-stone-400">
            作成したデッキをAI同士で100〜10,000戦連続対戦させ、勝率・先攻後攻差・カード個別有効性を高精度算出
          </p>
        </div>

        {/* Start Simulation Button */}
        <button
          id="run-simulation-btn"
          onClick={handleStartSimulation}
          disabled={isRunning}
          className={`px-6 py-2.5 rounded-xl font-black text-sm flex items-center gap-2 transition-all shadow-lg ${
            isRunning
              ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-amber-500 to-red-600 hover:from-amber-400 hover:to-red-500 text-stone-950 hover:scale-105'
          }`}
        >
          {isRunning ? (
            <>
              <span className="w-4 h-4 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
              <span>検証実行中...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-stone-950" />
              <span>{matchCount.toLocaleString()}戦 シミュレーション開始</span>
            </>
          )}
        </button>
      </div>

      {/* Simulation Setup Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Target Deck Selector */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 space-y-3">
          <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-amber-400" />
            検証対象デッキを選択
          </label>
          <select
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
            disabled={isRunning}
            className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-sm font-bold text-white focus:outline-none focus:border-amber-500"
          >
            {allDecks.map((d) => (
              <option key={d.deckId} value={d.deckId} className="bg-stone-900 text-white">
                {d.deckName} ({d.deckVersion}) - {d.cards.length}枚
              </option>
            ))}
          </select>

          <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 text-xs text-stone-400 space-y-1">
            <div className="flex justify-between">
              <span>デッキ系統:</span>
              <span className="font-bold text-stone-200">{selectedDeck.faction}系統</span>
            </div>
            <div className="flex justify-between">
              <span>バージョン:</span>
              <span className="font-mono text-amber-300">{selectedDeck.deckVersion}</span>
            </div>
          </div>
        </div>

        {/* Scale Selector */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 space-y-3">
          <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" />
            シミュレーション対戦回数
          </label>

          <div className="grid grid-cols-3 gap-2">
            {[
              { count: 100, label: '100戦 (高速)', desc: '約0.5秒 / 即時確認' },
              { count: 1000, label: '1,000戦 (標準)', desc: '約2秒 / 統計精度◎' },
              { count: 10000, label: '10,000戦 (詳細)', desc: '約15秒 / 完全監査' },
            ].map((opt) => (
              <button
                key={opt.count}
                onClick={() => setMatchCount(opt.count)}
                disabled={isRunning}
                className={`p-3 rounded-xl border text-left transition-all ${
                  matchCount === opt.count
                    ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-md'
                    : 'bg-stone-950 border-stone-800 text-stone-400 hover:border-stone-700'
                }`}
              >
                <div className="font-black text-xs text-white">{opt.label}</div>
                <div className="text-[10px] text-stone-500 mt-1">{opt.desc}</div>
              </button>
            ))}
          </div>

          <div className="text-[11px] text-stone-500">
            ※各対戦で先攻・後攻が均等(50:50)に割り振られ、相手には全主要アーキタイプが均等に対戦相手として選定されます。
          </div>
        </div>
      </div>

      {/* Progress & Live Results Box */}
      {progress && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-200 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping inline-block" />
              シミュレーション進行状況: {progress.currentMatch} / {progress.totalMatches} 試合
            </span>
            <span className="font-mono text-sm font-black text-amber-400">
              勝率 {progress.currentWinRate}%
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-stone-950 rounded-full overflow-hidden border border-stone-800">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 transition-all duration-150"
              style={{ width: `${(progress.currentMatch / progress.totalMatches) * 100}%` }}
            />
          </div>

          {/* Counters Grid */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="bg-stone-950 p-2 rounded-xl border border-stone-800">
              <div className="text-stone-500 text-[10px]">勝利 (Wins)</div>
              <div className="font-bold text-emerald-400 text-sm">{progress.wins}</div>
            </div>
            <div className="bg-stone-950 p-2 rounded-xl border border-stone-800">
              <div className="text-stone-500 text-[10px]">敗北 (Losses)</div>
              <div className="font-bold text-rose-400 text-sm">{progress.losses}</div>
            </div>
            <div className="bg-stone-950 p-2 rounded-xl border border-stone-800">
              <div className="text-stone-500 text-[10px]">引き分け (Draws)</div>
              <div className="font-bold text-stone-400 text-sm">{progress.draws}</div>
            </div>
            <div className="bg-stone-950 p-2 rounded-xl border border-stone-800">
              <div className="text-stone-500 text-[10px]">直近対戦相手</div>
              <div className="font-bold text-stone-200 text-[11px] truncate">
                {progress.currentOpponentName}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion Report Card */}
      {lastReport && (
        <div className="bg-gradient-to-br from-stone-900 to-stone-950 border border-amber-500/40 rounded-2xl p-5 shadow-2xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-800 pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <div>
                <h3 className="text-base font-black text-white">
                  検証完了: 「{lastReport.targetDeck.deckName}」
                </h3>
                <p className="text-xs text-stone-400 font-mono">
                  {lastReport.totalMatches.toLocaleString()}試合 / 完了日時: {new Date(lastReport.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {/* Overall Win Rate Highlight */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] uppercase font-bold text-stone-500">総合勝率 (Overall Win Rate)</div>
                <div className="text-3xl font-black font-mono text-amber-400">
                  {lastReport.overallWinRate}%
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
              <div className="text-stone-400">先攻勝率 (1st Turn)</div>
              <div className="text-base font-bold font-mono text-white mt-1">
                {lastReport.firstTurnWinRate}%
              </div>
            </div>
            <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
              <div className="text-stone-400">後攻勝率 (2nd Turn)</div>
              <div className="text-base font-bold font-mono text-white mt-1">
                {lastReport.secondTurnWinRate}%
              </div>
            </div>
            <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
              <div className="text-stone-400">平均決着ターン数</div>
              <div className="text-base font-bold font-mono text-stone-200 mt-1">
                {lastReport.avgTurns} ターン
              </div>
            </div>
            <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
              <div className="text-stone-400">最大連勝 / 連敗</div>
              <div className="text-base font-bold font-mono text-emerald-400 mt-1">
                {lastReport.maxWinStreak}連勝 <span className="text-stone-500 font-normal">/ {lastReport.maxLossStreak}連敗</span>
              </div>
            </div>
          </div>

          {/* Navigation & Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={onNavigateToAnalytics}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-2 shadow-md"
            >
              <BarChart3 className="w-4 h-4" />
              <span>詳細分析・採用カード統計を見る</span>
            </button>

            <button
              onClick={onNavigateToReplay}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>サンプルリプレイを再生</span>
            </button>

            <button
              onClick={handleRequestAiReview}
              disabled={isGeneratingAiReview}
              className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-amber-300 font-bold text-xs flex items-center gap-2 border border-amber-500/30"
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>{isGeneratingAiReview ? 'Gemini分析中...' : 'Geminiに対戦総括を依頼'}</span>
            </button>
          </div>

          {/* AI Post-Mortem Feedback */}
          {aiPostReview && (
            <div className="p-4 bg-stone-950 rounded-xl border border-amber-500/40 text-stone-200 text-xs leading-relaxed space-y-2">
              <div className="font-bold text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                Gemini AI シミュレーション総括・バランス診断
              </div>
              <p className="whitespace-pre-wrap">{aiPostReview}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
