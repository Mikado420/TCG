import React from 'react';
import { CardData } from '../types/game';
import { X, Shield, Swords, Heart, Sparkles, BookOpen, Layers, Flame, Zap } from 'lucide-react';

interface CardDetailModalProps {
  card: CardData | null;
  onClose: () => void;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({ card, onClose }) => {
  if (!card) return null;

  return (
    <div
      id="card-detail-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        id="card-detail-modal-content"
        className="bg-stone-900 border border-stone-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-stone-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          id="close-card-detail-modal-btn"
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-stone-400 hover:text-white bg-stone-800/80 hover:bg-stone-700 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Card Header */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl font-black text-amber-300">
            {card.cost}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-stone-800 border border-stone-700 text-stone-300">
                {card.cardId}
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-red-950/80 border border-red-700/80 text-red-300">
                {card.factionName}系統
              </span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-stone-800 text-stone-400">
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
            <h2 className="text-2xl font-black tracking-tight text-white">{card.name}</h2>
            {card.raceName && (
              <p className="text-sm text-stone-400">
                {card.classification === 'SMALL'
                  ? '小型'
                  : card.classification === 'MEDIUM'
                  ? '中型'
                  : '大型'}{' '}
                / {card.raceName}
              </p>
            )}
          </div>
        </div>

        {/* Combat Stats (If Unit) */}
        {(card.cardType === 'UNIT' || card.cardType === 'EVOLVE_UNIT') && (
          <div className="grid grid-cols-3 gap-3 p-3 bg-stone-950/60 rounded-xl border border-stone-800 mb-4">
            <div className="flex flex-col items-center">
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <Swords className="w-3.5 h-3.5 text-amber-400" /> ATK (攻撃力)
              </span>
              <span className="text-xl font-bold font-mono text-amber-300">{card.atk}</span>
            </div>
            <div className="flex flex-col items-center border-x border-stone-800">
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-sky-400" /> DEF (防御力)
              </span>
              <span className="text-xl font-bold font-mono text-sky-300">{card.def}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-rose-400" /> DMG (打点)
              </span>
              <span className="text-xl font-bold font-mono text-rose-400">{card.dmg}</span>
            </div>
          </div>
        )}

        {/* Evolution Requirement */}
        {card.evolutionRequirement && (
          <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded-xl text-amber-200 text-sm mb-4">
            <span className="font-bold">【進化条件】</span> {card.evolutionRequirement.description}
          </div>
        )}

        {/* Card Text & Effects */}
        <div className="p-4 bg-stone-950/80 rounded-xl border border-stone-800 mb-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-400 mb-1">
            カード効果 / テキスト
          </h4>
          <p className="text-stone-100 text-base whitespace-pre-wrap leading-relaxed">
            {card.effectsText}
          </p>
        </div>

        {/* Rule Notes */}
        <div className="text-xs text-stone-500 flex items-center justify-between border-t border-stone-800 pt-3">
          <span>Ver.2.2 完全準拠カードプール</span>
          <span>最大4枚までデッキ投入可能</span>
        </div>
      </div>
    </div>
  );
};
