import React from 'react';
import { ArcanaSlot, CardData } from '../types/game';
import { CardItem } from './CardItem';
import { X, Flame } from 'lucide-react';

interface ArcanaOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  arcanaCards: ArcanaSlot[];
  onInspectCard: (card: CardData) => void;
}

export const ArcanaOverlay: React.FC<ArcanaOverlayProps> = ({
  isOpen,
  onClose,
  title,
  arcanaCards,
  onInspectCard,
}) => {
  if (!isOpen) return null;

  const activeCount = arcanaCards.filter((a) => !a.isRested).length;

  return (
    <div
      id="arcana-overlay-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        id="arcana-overlay-modal"
        className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col p-4 shadow-2xl relative text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-black text-white">{title}</h3>
            <span className="text-xs bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-full border border-amber-500/30">
              アクティブ {activeCount} / 全 {arcanaCards.length}
            </span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content: Arcana Cards Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {arcanaCards.length === 0 ? (
            <div className="py-16 text-center text-stone-500">
              アルカナゾーンにカードはありません
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {arcanaCards.map((arc, idx) => (
                <div key={arc.instance.instanceId || idx} className="flex flex-col items-center gap-1">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      arc.isRested
                        ? 'bg-stone-800 text-stone-500 border border-stone-700'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                    }`}
                  >
                    {arc.isRested ? 'レスト (使用済)' : 'アクティブ'}
                  </span>
                  <CardItem
                    card={arc.instance}
                    size="sm"
                    isInteractive={true}
                    onClick={() => onInspectCard(arc.instance.baseCard)}
                    onInspect={onInspectCard}
                    showRested={false}
                  />
                </div>
              ))}
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
