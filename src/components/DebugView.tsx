import React, { useState } from 'react';
import { runAllRuleTests, TestResult } from '../engine/ruleTests';
import { ALL_CARDS, CARD_POOL_VERSION } from '../data/cards';
import { RULES_VERSION } from '../engine/gameEngine';
import { Bug, CheckCircle2, XCircle, Play, Sparkles, BookOpen, Layers, Code } from 'lucide-react';

export const DebugView: React.FC = () => {
  const [testResults, setTestResults] = useState<TestResult[]>(() => runAllRuleTests());
  const [selectedCardId, setSelectedCardId] = useState<string>(ALL_CARDS[0].cardId);

  const handleRunTests = () => {
    const res = runAllRuleTests();
    setTestResults(res);
  };

  const allPassed = testResults.every((t) => t.passed);
  const selectedCard = ALL_CARDS.find((c) => c.cardId === selectedCardId) || ALL_CARDS[0];

  return (
    <div id="debug-view" className="max-w-7xl mx-auto p-4 space-y-4 animate-fade-in">
      {/* Top Header & Re-test Button */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Bug className="w-5 h-5 text-amber-400" />
              GameEngine ルール検証・カードプール80枚デバッグ
            </h2>
            <span
              className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                allPassed
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : 'bg-rose-950 text-rose-300 border border-rose-700'
              }`}
            >
              {allPassed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span>{allPassed ? '全テスト合格 (PASS)' : 'エラー検知'}</span>
            </span>
          </div>
          <p className="text-xs text-stone-400">
            Rules Version: {RULES_VERSION} / Card Pool: {CARD_POOL_VERSION} (朱15, 蒼15, 翠15, 聖15, 冥15, 無5 = 全80枚)
          </p>
        </div>

        <button
          onClick={handleRunTests}
          className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs flex items-center gap-2 shadow-md transition-all"
        >
          <Play className="w-4 h-4 fill-stone-950" />
          <span>全ルール単体テスト再実行</span>
        </button>
      </div>

      {/* Test Results Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {testResults.map((test) => (
          <div
            key={test.testId}
            className={`p-3.5 rounded-2xl border transition-all ${
              test.passed
                ? 'bg-stone-900/80 border-stone-800'
                : 'bg-rose-950/30 border-rose-800'
            }`}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5">
                {test.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span className="font-bold text-xs text-stone-100">{test.name}</span>
              </div>
              <span className="text-[10px] font-mono text-stone-500">{test.durationMs} ms</span>
            </div>

            <p className="text-[11px] text-stone-400 mb-2">{test.description}</p>

            <div className="p-2 bg-stone-950 rounded-xl border border-stone-800/80 text-[11px] text-stone-300 leading-relaxed font-mono">
              {test.message}
            </div>
          </div>
        ))}
      </div>

      {/* Card Pool Explorer with Raw JSON attributes */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg space-y-3">
        <h3 className="text-sm font-black text-stone-200 flex items-center gap-2">
          <Code className="w-4 h-4 text-amber-400" />
          カードプール Ver.2.3 全属性 JSONエクスプローラー
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* Card Selector (4 cols) */}
          <div className="md:col-span-4 space-y-2">
            <label className="text-xs text-stone-400 block">カードを選択 (全80種):</label>
            <select
              value={selectedCardId}
              onChange={(e) => setSelectedCardId(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl p-2 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
            >
              {ALL_CARDS.map((c) => (
                <option key={c.cardId} value={c.cardId} className="bg-stone-900 text-white">
                  [{c.cardId}] {c.name} ({c.factionName} / {c.cost}マナ)
                </option>
              ))}
            </select>

            <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 text-xs space-y-1">
              <div className="font-bold text-amber-300 text-sm">{selectedCard.name}</div>
              <div className="text-stone-400">
                {selectedCard.factionName}系統 / {selectedCard.cost}マナ
              </div>
              <div className="text-stone-300 text-[11px] mt-1 whitespace-pre-wrap">
                {selectedCard.effectsText}
              </div>
            </div>
          </div>

          {/* Raw JSON viewer (8 cols) */}
          <div className="md:col-span-8 bg-stone-950 rounded-xl border border-stone-800 p-3 overflow-x-auto max-h-80">
            <pre className="text-[11px] font-mono text-emerald-400">
              {JSON.stringify(selectedCard, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
