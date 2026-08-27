import React from 'react';
import { CardInstance, CardData } from '../types/game';
import { CardItem } from './CardItem';
import { X, BookOpen, Layers } from 'lucide-react';

interface ArchiveOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  cards: CardInstance[];
  onInspectCard: (card: CardData) => void;
}

export const ArchiveOverlay: React.FC<ArchiveOverlayProps> = ({
  isOpen,
  onClose,
  title,
  cards,
  onInspectCard,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="archive-overlay-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        id="archive-overlay-modal"
        className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col p-4 shadow-2xl relative text-stone-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-black text-white">{title} ({cards.length}枚)</h3>
            <span className="text-xs text-stone-400">カードをタップすると拡大詳細を確認できます</span>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-white bg-stone-800 hover:bg-stone-700 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content: Scrollable Cards Grid */}
        <div className="flex-1 overflow-y-auto pr-1">
          {cards.length === 0 ? (
            <div className="py-16 text-center text-stone-500">
              アーカイブにカードはありません
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {cards.map((inst, idx) => (
                <div key={inst.instanceId || idx} className="flex justify-center">
                  <CardItem
                    card={inst}
                    size="sm"
                    isInteractive={true}
                    onClick={() => onInspectCard(inst.baseCard)}
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
