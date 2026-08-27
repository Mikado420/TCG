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
    { id: 'BATTLE', label: '対戦', icon: Swords, desc: 'Human / AI対戦プレイ' },
    { id: 'DECK_BUILDER', label: 'デッキ構築', icon: Wrench, desc: '40枚デッキ編集' },
    { id: 'VERIFY', label: 'AI検証', icon: Activity, desc: '大量対戦シミュレーション' },
    { id: 'ANALYTICS', label: '勝率分析', icon: BarChart3, desc: '相性・カード採用率' },
    { id: 'REPLAY', label: 'リプレイ', icon: RotateCcw, desc: 'StateDiff再生' },
    { id: 'DEBUG', label: 'デバッグ', icon: Bug, desc: '80枚全効果検証' },
  ];

  return (
    <header className="h-12 shrink-0 bg-stone-950/95 border-b border-stone-800 backdrop-blur-md px-3 flex items-center justify-between gap-2 select-none z-30">
      {/* Brand Logo & Title */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center shadow-md shadow-red-950">
          <Swords className="w-4 h-4 text-white" />
        </div>
        <div className="flex items-center gap-1.5">
          <h1 className="text-sm font-black tracking-tight text-white hidden sm:inline">自作TCG</h1>
          <span className="bg-amber-500/20 text-amber-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-500/30 font-mono">
            Ver.2.2
          </span>
        </div>
      </div>

      {/* Center Nav Tabs */}
      <nav className="flex items-center gap-1 overflow-x-auto py-0.5">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              id={`nav-tab-${t.id.toLowerCase()}`}
              onClick={() => onSelectTab(t.id as AppTab)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? 'bg-amber-500 text-stone-950 shadow-md font-black'
                  : 'text-stone-300 hover:text-white hover:bg-stone-800/80'
              }`}
              title={t.desc}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-stone-950' : 'text-stone-400'}`} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* AI Indicator Badge */}
      <div className="hidden lg:flex items-center gap-1.5 bg-stone-900 px-2 py-1 rounded-lg border border-stone-800 text-[11px] shrink-0">
        <Sparkles className="w-3 h-3 text-amber-400" />
        <span className="text-stone-400">AI:</span>
        {hasApiKey ? (
          <span className="text-emerald-400 font-bold">Gemini有効</span>
        ) : (
          <span className="text-amber-400 font-bold">Heuristic Engine</span>
        )}
      </div>
    </header>
  );
};
