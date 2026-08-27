import React from 'react';
import { CardData, CardInstance, FactionCode } from '../types/game';
import { Shield, Zap, Sparkles, Swords, Heart, BookOpen, Layers, Flame } from 'lucide-react';

interface CardItemProps {
  card: CardData | CardInstance;
  isInteractive?: boolean;
  isSelected?: boolean;
  isPlayable?: boolean;
  isTargetable?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  onInspect?: (card: CardData) => void;
  showRested?: boolean;
}

const FACTION_STYLES: Record<
  FactionCode,
  {
    bg: string;
    border: string;
    text: string;
    badge: string;
    glow: string;
    name: string;
    icon: any;
  }
> = {
  RED: {
    bg: 'bg-gradient-to-b from-red-950/80 to-stone-900',
    border: 'border-red-600/70',
    text: 'text-red-300',
    badge: 'bg-red-900/80 text-red-100 border-red-500',
    glow: 'shadow-red-600/30',
    name: '朱',
    icon: Flame,
  },
  BLUE: {
    bg: 'bg-gradient-to-b from-blue-950/80 to-stone-900',
    border: 'border-blue-500/70',
    text: 'text-blue-300',
    badge: 'bg-blue-900/80 text-blue-100 border-blue-400',
    glow: 'shadow-blue-500/30',
    name: '蒼',
    icon: Sparkles,
  },
  GREEN: {
    bg: 'bg-gradient-to-b from-emerald-950/80 to-stone-900',
    border: 'border-emerald-500/70',
    text: 'text-emerald-300',
    badge: 'bg-emerald-900/80 text-emerald-100 border-emerald-400',
    glow: 'shadow-emerald-500/30',
    name: '翠',
    icon: Zap,
  },
  HOLY: {
    bg: 'bg-gradient-to-b from-amber-950/70 to-stone-900',
    border: 'border-amber-400/80',
    text: 'text-amber-200',
    badge: 'bg-amber-800/80 text-amber-100 border-amber-300',
    glow: 'shadow-amber-400/30',
    name: '聖',
    icon: Shield,
  },
  DARK: {
    bg: 'bg-gradient-to-b from-purple-950/80 to-stone-900',
    border: 'border-purple-600/70',
    text: 'text-purple-300',
    badge: 'bg-purple-950/90 text-purple-200 border-purple-500',
    glow: 'shadow-purple-600/30',
    name: '冥',
    icon: Layers,
  },
  NEUTRAL: {
    bg: 'bg-gradient-to-b from-stone-800 to-stone-900',
    border: 'border-stone-500/70',
    text: 'text-stone-300',
    badge: 'bg-stone-700 text-stone-100 border-stone-400',
    glow: 'shadow-stone-500/20',
    name: '無',
    icon: BookOpen,
  },
};

export const CardItem: React.FC<CardItemProps> = ({
  card,
  isInteractive = false,
  isSelected = false,
  isPlayable = false,
  isTargetable = false,
  size = 'md',
  onClick,
  onInspect,
  showRested = true,
}) => {
  const baseCard: CardData = 'baseCard' in card ? card.baseCard : card;
  const isInstance = 'instanceId' in card;
  const cardInst = isInstance ? (card as CardInstance) : null;
  const isRested = showRested && cardInst?.isRested;
  const factionStyle = FACTION_STYLES[baseCard.faction] || FACTION_STYLES.NEUTRAL;

  const currentAtk = cardInst ? cardInst.currentAtk : baseCard.atk;
  const currentDef = cardInst ? cardInst.currentDef : baseCard.def;
  const currentDmg = cardInst ? cardInst.currentDmg : baseCard.dmg;

  const sizeClasses = {
    sm: 'w-24 h-36 text-xs p-1.5',
    md: 'w-36 h-52 text-xs p-2',
    lg: 'w-52 h-72 text-sm p-3',
  }[size];

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (onInspect) {
      onInspect(baseCard);
    }
  };

  return (
    <div
      id={`card-${baseCard.cardId}-${cardInst?.instanceId || 'base'}`}
      onClick={isInteractive ? onClick : undefined}
      onContextMenu={handleContextMenu}
      className={`relative select-none rounded-xl border flex flex-col justify-between transition-all duration-200 cursor-pointer overflow-hidden shadow-md ${
        sizeClasses
      } ${factionStyle.bg} ${factionStyle.border} ${
        isRested ? 'rotate-90 opacity-75 scale-95 origin-center' : ''
      } ${
        isSelected ? 'ring-2 ring-yellow-400 scale-105 shadow-xl shadow-yellow-400/20' : ''
      } ${
        isPlayable
          ? 'ring-2 ring-emerald-400 shadow-lg shadow-emerald-500/30 animate-pulse hover:scale-105'
          : ''
      } ${
        isTargetable
          ? 'ring-2 ring-red-500 shadow-lg shadow-red-500/40 hover:scale-105'
          : ''
      } hover:border-white/50 hover:shadow-lg`}
    >
      {/* Top Header: Cost + Faction + Card Name */}
      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          {/* Cost Badge */}
          <div
            className={`flex items-center justify-center font-black rounded-full border shadow-inner ${
              size === 'sm' ? 'w-5 h-5 text-[10px]' : size === 'lg' ? 'w-8 h-8 text-base' : 'w-6 h-6 text-xs'
            } ${factionStyle.badge}`}
          >
            {baseCard.cost}
          </div>

          {/* Faction & Type Badge */}
          <div className="flex items-center gap-0.5">
            <span
              className={`px-1 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${factionStyle.badge}`}
            >
              {baseCard.factionName}
            </span>
            <span className="bg-stone-800/90 text-stone-300 px-1 py-0.5 rounded text-[9px] font-medium border border-stone-600">
              {baseCard.cardType === 'UNIT'
                ? 'ユニット'
                : baseCard.cardType === 'EVOLVE_UNIT'
                ? '進化'
                : baseCard.cardType === 'SPELL'
                ? 'スペル'
                : baseCard.cardType === 'RUNE'
                ? 'ルーン'
                : 'ドメイン'}
            </span>
          </div>
        </div>

        {/* Card Name */}
        <div className="font-bold text-stone-100 truncate tracking-tight" title={baseCard.name}>
          {baseCard.name}
        </div>

        {/* Sub-header: Classification & Race */}
        {baseCard.raceName && (
          <div className="text-[10px] text-stone-400 font-mono flex items-center gap-1 mt-0.5">
            <span>{baseCard.classification === 'SMALL' ? '小型' : baseCard.classification === 'MEDIUM' ? '中型' : '大型'}</span>
            <span>•</span>
            <span>{baseCard.raceName}</span>
          </div>
        )}
      </div>

      {/* Center Effect Text Box */}
      <div className="my-1 bg-stone-950/75 rounded p-1 border border-stone-800/80 flex-1 flex flex-col justify-center overflow-hidden">
        <p
          className={`text-stone-300 leading-tight ${
            size === 'sm' ? 'text-[9px] line-clamp-3' : size === 'lg' ? 'text-xs line-clamp-5' : 'text-[10px] line-clamp-4'
          }`}
        >
          {baseCard.effectsText}
        </p>
      </div>

      {/* Bottom Stats Footer (For Units & Evolve Units) */}
      {(baseCard.cardType === 'UNIT' || baseCard.cardType === 'EVOLVE_UNIT') && (
        <div className="flex items-center justify-between font-mono font-bold pt-1 border-t border-stone-800">
          <div className="flex items-center gap-0.5 text-amber-300" title="攻撃力 (ATK)">
            <Swords className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
            <span>{currentAtk}</span>
          </div>

          <div className="flex items-center gap-0.5 text-sky-300" title="防御力 (DEF)">
            <Shield className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
            <span>{currentDef}</span>
          </div>

          <div className="flex items-center gap-0.5 text-rose-400" title="プレイヤーダメージ (DMG)">
            <Heart className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} />
            <span>{currentDmg}</span>
          </div>
        </div>
      )}

      {/* Special Indicators / Ribbons */}
      {cardInst?.hasSummoningSickness && (
        <div className="absolute top-1 right-1 bg-amber-600/90 text-amber-100 text-[8px] font-bold px-1 rounded">
          酔
        </div>
      )}
      {baseCard.hasGuard && (
        <div className="absolute bottom-1 right-1 bg-sky-700/90 text-sky-100 text-[8px] font-bold px-1 rounded">
          防
        </div>
      )}
    </div>
  );
};
