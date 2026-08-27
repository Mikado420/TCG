import React from 'react';
import { Swords, Activity, BarChart3, RotateCcw, Wrench, Bug, Sparkles } from 'lucide-react';

export type AppTab = 'BATTLE' | 'VERIFY' | 'ANALYTICS' | 'REPLAY' | 'DECK_BUILDER' | 'DEBUG';

interface NavbarProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  hasApiKey: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onSelectTab, hasApiKey }) => {
  const tabs = [
    { id: 'BATTLE', label: '対戦プレイ', icon: Swords, desc: 'Human / AI対戦' },
    { id: 'VERIFY', label: 'AI検証シミュレーション', icon: Activity, desc: '100〜10,000戦 高速検証' },
    { id: 'ANALYTICS', label: '勝率・カード分析', icon: BarChart3, desc: '採用率・相性マトリクス' },
    { id: 'REPLAY', label: 'リプレイ再生', icon: RotateCcw, desc: 'ターン毎StateDiff再生' },
    { id: 'DECK_BUILDER', label: 'デッキ構築', icon: Wrench, desc: '40枚・Ver2.2準拠' },
    { id: 'DEBUG', label: 'ルール検証・デバッグ', icon: Bug, desc: '80枚全効果テスト' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-stone-950/90 border-b border-stone-800 backdrop-blur-md px-4 py-2.5 shadow-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-lg shadow-red-900/30">
            <Swords className="w-6 h-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight text-white">自作TCG シミュレーター</h1>
              <span className="bg-amber-500/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
                Card Pool Ver.2.2 (80枚)
              </span>
            </div>
            <p className="text-[11px] text-stone-400">GameEngine ルール完全準拠 & AI検証環境</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <nav className="flex items-center gap-1 bg-stone-900/90 p-1 rounded-xl border border-stone-800">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                id={`nav-tab-${t.id.toLowerCase()}`}
                onClick={() => onSelectTab(t.id as AppTab)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow-md font-extrabold'
                    : 'text-stone-300 hover:text-white hover:bg-stone-800/80'
                }`}
                title={t.desc}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-stone-950' : 'text-stone-400'}`} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* AI Backend Status Indicator */}
        <div className="flex items-center gap-2 bg-stone-900 px-3 py-1.5 rounded-xl border border-stone-800 text-xs">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-stone-400">Gemini AI:</span>
          {hasApiKey ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              有効
            </span>
          ) : (
            <span className="text-amber-400 font-bold" title="ヒューリスティックAIエンジンが自動稼働します">
              Heuristic Engine稼働中
            </span>
          )}
        </div>
      </div>
    </header>
  );
};
