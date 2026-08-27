import React, { useState } from 'react';
import { GameLogEntry, AIDecisionLog } from '../types/game';
import { X, Clock, Sparkles, Filter, Bot } from 'lucide-react';

interface GameLogOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  logs: GameLogEntry[];
  latestAIDecision: AIDecisionLog | null;
}

export const GameLogOverlay: React.FC<GameLogOverlayProps> = ({
  isOpen,
  onClose,
  logs,
  latestAIDecision,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'LOGS' | 'AI_THINKING'>('LOGS');
  const [logFilter, setLogFilter] = useState<'ALL' | 'COMBAT' | 'PLAY' | 'DAMAGE'>('ALL');

  if (!isOpen) return null;

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'COMBAT') return l.type === 'COMBAT' || l.type === 'ATTACK';
    if (logFilter === 'PLAY') return l.type === 'PLAY' || l.type === 'ARCANA';
    if (logFilter === 'DAMAGE') return l.type === 'DAMAGE' || l.type === 'DESTROY';
    return true;
  });

  return (
    <div
      id="game-log-overlay-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        id="game-log-overlay-modal"
        className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col p-4 shadow-2xl relative text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Sub-tabs */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveSubTab('LOGS')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors ${
                activeSubTab === 'LOGS'
                  ? 'bg-amber-500 text-stone-950 shadow-md'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>対戦ログ ({logs.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('AI_THINKING')}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors ${
                activeSubTab === 'AI_THINKING'
                  ? 'bg-amber-500 text-stone-950 shadow-md'
                  : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>AI 思考ログ</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto pr-1">
          {activeSubTab === 'LOGS' ? (
            <div className="space-y-2">
              {/* Filter Buttons */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-stone-800/80">
                <span className="text-[11px] text-stone-400 flex items-center gap-1">
                  <Filter className="w-3 h-3" /> 絞り込み:
                </span>
                <div className="flex items-center gap-1">
                  {(['ALL', 'COMBAT', 'PLAY', 'DAMAGE'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setLogFilter(f)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        logFilter === f
                          ? 'bg-stone-200 text-stone-950'
                          : 'bg-stone-800 text-stone-400 hover:bg-stone-700'
                      }`}
                    >
                      {f === 'ALL' ? 'すべて' : f === 'COMBAT' ? '戦闘・攻撃' : f === 'PLAY' ? '展開・召喚' : 'ダメージ・破壊'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logs List */}
              <div className="space-y-1.5 font-mono text-xs">
                {filteredLogs.length === 0 ? (
                  <div className="py-12 text-center text-stone-500">ログはありません</div>
                ) : (
                  filteredLogs.map((log) => {
                    const isCombat = log.type === 'COMBAT' || log.type === 'ATTACK';
                    const isDestroy = log.type === 'DESTROY';
                    const isRune = log.type === 'RUNE';
                    return (
                      <div
                        key={log.id}
                        className={`p-2 rounded-xl border leading-relaxed ${
                          isCombat
                            ? 'bg-rose-950/40 text-rose-200 border-rose-800/60'
                            : isDestroy
                            ? 'bg-purple-950/40 text-purple-200 border-purple-800/60'
                            : isRune
                            ? 'bg-fuchsia-950/40 text-fuchsia-200 border-fuchsia-800/60'
                            : 'bg-stone-950/60 text-stone-300 border-stone-800'
                        }`}
                      >
                        <span className="text-stone-500 mr-2 font-bold">[Turn {log.turn}]</span>
                        <span>{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {latestAIDecision ? (
                <div className="space-y-3">
                  <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
                    <div className="text-xs text-amber-300 font-bold mb-1 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" />
                      Turn {latestAIDecision.turn} 選択判断理由 ({latestAIDecision.aiPlayer === 'PLAYER_A' ? '先攻P1' : '後攻P2'})
                    </div>
                    <p className="text-xs text-stone-200 leading-relaxed whitespace-pre-wrap">
                      {latestAIDecision.reason}
                    </p>
                  </div>

                  {/* Candidate Action Rankings */}
                  {latestAIDecision.candidates && latestAIDecision.candidates.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                        行動候補スコア評価 (高いほど有力)
                      </div>
                      <div className="space-y-1.5">
                        {latestAIDecision.candidates.map((cand, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between p-2 bg-stone-950/70 rounded-xl text-xs border border-stone-800"
                          >
                            <span className="text-stone-200 font-medium">
                              {cand.action.description || cand.action.type}
                            </span>
                            <span className="font-mono font-bold text-amber-400">
                              ★ {cand.score.toFixed(1)} pt
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-16 text-center text-stone-500 text-xs">
                  AIが行動を行うと、ここに最新の評価スコアと戦略理由が表示されます。
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-800 pt-2.5 mt-2 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
