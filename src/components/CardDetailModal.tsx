import React from 'react';
import { CardData } from '../types/game';
import { FACTION_THEMES } from './CardItem';
import { X, Shield, Swords, Heart, Sparkles, BookOpen, Layers, Flame, Zap, Check } from 'lucide-react';

interface CardDetailModalProps {
  card: CardData | null;
  onClose: () => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({ card, onClose }) => {
  if (!card) return null;

  const factionTheme = FACTION_THEMES[card.faction] || FACTION_THEMES.NEUTRAL;
  const isUnit = card.cardType === 'UNIT' || card.cardType === 'EVOLVE_UNIT';

  return (
    <div
      id="card-detail-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        id="card-detail-modal-content"
        className="bg-stone-900 border border-stone-700 rounded-2xl max-w-lg w-full p-4 sm:p-5 shadow-2xl relative text-stone-100 max-h-[90vh] flex flex-col justify-between overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          id="close-card-detail-modal-btn"
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-full transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Card Header */}
        <div>
          <div className="flex items-start gap-3 mb-3">
            {/* Big Cost Badge */}
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl font-black shrink-0 border shadow-inner ${factionTheme.badge}`}
            >
              {card.cost}
            </div>

            <div className="pr-6">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-800 border border-stone-700 text-stone-400">
                  {card.cardId}
                </span>
                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${factionTheme.badge}`}>
                  {card.factionName}系統
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-800 text-stone-300 border border-stone-700">
                  {card.cardType === 'UNIT'
                    ? 'ユニット'
                    : card.cardType === 'EVOLVE_UNIT'
                    ? '進化ユニット'
                    : card.cardType === 'SPELL'
                    ? 'スペル'
                    : card.cardType === 'RUNE'
                    ? 'ルーン'
                    : 'ドメイン'}
                </span>
              </div>

              <h2 className="text-xl font-black tracking-tight text-white">{card.name}</h2>
              {card.raceName && (
                <p className="text-xs text-stone-400 mt-0.5">
                  {card.classification === 'SMALL'
                    ? '小型'
                    : card.classification === 'MEDIUM'
                    ? '中型'
                    : '大型'}{' '}
                  • {card.raceName}
                </p>
              )}
            </div>
          </div>

          {/* Combat Stats Bar (If Unit) */}
          {isUnit && (
            <div className="grid grid-cols-3 gap-2 p-2 bg-stone-950/80 rounded-xl border border-stone-800 mb-3">
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-stone-400 flex items-center gap-1">
                  <Swords className="w-3 h-3 text-amber-400" /> ATK
                </span>
                <span className="text-lg font-black font-mono text-amber-300">{card.atk}</span>
              </div>
              <div className="flex flex-col items-center border-x border-stone-800">
                <span className="text-[10px] text-stone-400 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-sky-400" /> DEF
                </span>
                <span className="text-lg font-black font-mono text-sky-300">{card.def}</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-[10px] text-stone-400 flex items-center gap-1">
                  <Heart className="w-3 h-3 text-rose-400" /> BRK
                </span>
                <span className="text-lg font-black font-mono text-rose-400">{card.brk}</span>
              </div>
            </div>
          )}

          {/* Evolution Requirement Banner */}
          {card.evolutionRequirement && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-500/50 rounded-xl text-amber-200 text-xs mb-3 flex items-start gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold">【進化条件】</strong>
                <p className="mt-0.5">{card.evolutionRequirement.description}</p>
              </div>
            </div>
          )}

          {/* Card Effects Text Box */}
          <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 mb-3">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1">
              効果テキスト
            </h4>
            <p className="text-stone-100 text-xs whitespace-pre-wrap leading-relaxed">
              {card.effectsText}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-stone-800 pt-2.5 mt-1 text-[11px] text-stone-400">
          <span>Ver.2.2 完全準拠プール</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
