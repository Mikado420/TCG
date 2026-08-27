import React, { useState } from 'react';
import { CardData, Deck, FactionCode } from '../types/game';
import { ALL_CARDS, CARD_POOL_VERSION, getCardById } from '../data/cards';
import { PRESET_DECKS, validateDeck } from '../data/presetDecks';
import { CardItem } from './CardItem';
import {
  Plus,
  Minus,
  Save,
  Download,
  Upload,
  Sparkles,
  BarChart2,
  Trash2,
  CheckCircle,
  AlertTriangle,
  Play,
} from 'lucide-react';

interface DeckBuilderProps {
  onInspectCard: (card: CardData) => void;
  onSaveCustomDeck: (deck: Deck) => void;
  onTestDeck: (deck: Deck) => void;
  customDecks: Deck[];
}

export const DeckBuilder: React.FC<DeckBuilderProps> = ({
  onInspectCard,
  onSaveCustomDeck,
  onTestDeck,
  customDecks,
}) => {
  const [currentDeckName, setCurrentDeckName] = useState<string>('カスタムデッキ (新構築)');
  const [currentFaction, setCurrentFaction] = useState<FactionCode>('RED');
  const [currentVersion, setCurrentVersion] = useState<string>('v1.0');
  const [deckCards, setDeckCards] = useState<string[]>([...PRESET_DECKS[0].cards]);

  // Filters for Card Pool
  const [filterFaction, setFilterFaction] = useState<FactionCode | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterCost, setFilterCost] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Count copies in current deck
  const cardCounts: Record<string, number> = {};
  for (const cardId of deckCards) {
    cardCounts[cardId] = (cardCounts[cardId] || 0) + 1;
  }

  const addCard = (cardId: string) => {
    if (deckCards.length >= 40) return;
    if ((cardCounts[cardId] || 0) >= 4) return;
    setDeckCards([...deckCards, cardId]);
  };

  const removeCard = (cardId: string) => {
    const idx = deckCards.lastIndexOf(cardId);
    if (idx !== -1) {
      const updated = [...deckCards];
      updated.splice(idx, 1);
      setDeckCards(updated);
    }
  };

  const clearDeck = () => {
    setDeckCards([]);
  };

  const loadPreset = (preset: Deck) => {
    setCurrentDeckName(preset.deckName);
    setCurrentFaction(preset.faction);
    setCurrentVersion(preset.deckVersion);
    setDeckCards([...preset.cards]);
  };

  // Compile current deck object
  const currentDeckObj: Deck = {
    deckId: `deck_${Date.now()}`,
    deckName: currentDeckName,
    faction: currentFaction,
    cards: deckCards,
    deckVersion: currentVersion,
    cardPoolVersion: CARD_POOL_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const validation = validateDeck(currentDeckObj);

  // Filter cards
  const filteredPool = ALL_CARDS.filter((card) => {
    if (filterFaction !== 'ALL' && card.faction !== filterFaction) return false;
    if (filterType !== 'ALL' && card.cardType !== filterType) return false;
    if (filterCost !== 'ALL' && card.cost.toString() !== filterCost) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        card.name.toLowerCase().includes(q) ||
        card.effectsText.toLowerCase().includes(q) ||
        (card.raceName && card.raceName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  // Calculate Mana Curve (1 to 7+)
  const manaCurve: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  let unitCount = 0;
  let evolveCount = 0;
  let spellCount = 0;
  let runeCount = 0;
  let domainCount = 0;

  for (const cardId of deckCards) {
    const card = getCardById(cardId);
    const costKey = Math.min(card.cost, 7);
    manaCurve[costKey] = (manaCurve[costKey] || 0) + 1;

    if (card.cardType === 'UNIT') unitCount++;
    else if (card.cardType === 'EVOLVE_UNIT') evolveCount++;
    else if (card.cardType === 'SPELL') spellCount++;
    else if (card.cardType === 'RUNE') runeCount++;
    else if (card.cardType === 'DOMAIN') domainCount++;
  }

  const maxCurveVal = Math.max(...Object.values(manaCurve), 1);

  // Export JSON
  const handleExport = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(currentDeckObj, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${currentDeckName}_${currentVersion}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div id="deck-builder-view" className="max-w-7xl mx-auto p-4 space-y-4 animate-fade-in">
      {/* Top Header & Deck Settings */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        {/* Deck Title & Version Input */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="text-[10px] uppercase font-bold text-stone-500 block mb-1">デッキ名</label>
            <input
              type="text"
              value={currentDeckName}
              onChange={(e) => setCurrentDeckName(e.target.value)}
              className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-sm font-bold text-white focus:outline-none focus:border-amber-500 w-64"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-stone-500 block mb-1">主要系統</label>
            <select
              value={currentFaction}
              onChange={(e) => setCurrentFaction(e.target.value as FactionCode)}
              className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
            >
              <option value="RED">朱系統 (Red)</option>
              <option value="BLUE">蒼系統 (Blue)</option>
              <option value="GREEN">翠系統 (Green)</option>
              <option value="HOLY">聖系統 (Holy)</option>
              <option value="DARK">冥系統 (Dark)</option>
              <option value="NEUTRAL">混色 / 無系統</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase font-bold text-stone-500 block mb-1">バージョン</label>
            <input
              type="text"
              value={currentVersion}
              onChange={(e) => setCurrentVersion(e.target.value)}
              className="bg-stone-950 border border-stone-700 rounded-xl px-2 py-1.5 text-xs font-mono font-bold text-amber-300 w-20 text-center focus:outline-none"
            />
          </div>
        </div>

        {/* Deck Load Preset / Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Loader Dropdown */}
          <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-xl border border-stone-800 text-xs">
            <span className="text-stone-400">プリセット読込:</span>
            <select
              onChange={(e) => {
                const p = PRESET_DECKS.find((d) => d.deckId === e.target.value);
                if (p) loadPreset(p);
              }}
              className="bg-transparent text-amber-300 font-bold focus:outline-none"
              defaultValue=""
            >
              <option value="" disabled className="bg-stone-900 text-stone-400">
                選択してください...
              </option>
              {PRESET_DECKS.map((p) => (
                <option key={p.deckId} value={p.deckId} className="bg-stone-900 text-white">
                  {p.deckName}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => onSaveCustomDeck(currentDeckObj)}
            disabled={!validation.valid}
            className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>保存</span>
          </button>

          <button
            onClick={() => onTestDeck(currentDeckObj)}
            disabled={!validation.valid}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            <span>このデッキで対戦/検証</span>
          </button>

          <button
            onClick={handleExport}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white"
            title="JSON形式でエクスポート"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={clearDeck}
            className="p-2 rounded-xl bg-stone-800 hover:bg-red-950 text-stone-400 hover:text-red-300"
            title="デッキを全クリア"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Deck Stats & Mana Curve Overview */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        {/* Status Box (4 cols) */}
        <div className="md:col-span-4 bg-stone-900/80 border border-stone-800 rounded-2xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-stone-300">デッキ構成枚数</span>
            <span
              className={`text-lg font-black font-mono px-2 py-0.5 rounded-lg ${
                deckCards.length === 40
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                  : 'bg-red-950 text-red-300 border border-red-700'
              }`}
            >
              {deckCards.length} / 40 枚
            </span>
          </div>

          {/* Validation Feedback */}
          {validation.valid ? (
            <div className="flex items-center gap-2 p-2 bg-emerald-950/40 rounded-xl border border-emerald-800 text-emerald-300 text-xs">
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>デッキ規定を満たしています (40枚/同名最大4枚)</span>
            </div>
          ) : (
            <div className="space-y-1 p-2 bg-red-950/40 rounded-xl border border-red-800 text-red-300 text-xs">
              {validation.errors.map((err, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span>{err}</span>
                </div>
              ))}
            </div>
          )}

          {/* Card Types Breakdown Pills */}
          <div className="grid grid-cols-5 gap-1 mt-2 text-center text-[10px]">
            <div className="bg-stone-950 p-1.5 rounded-lg border border-stone-800">
              <div className="text-stone-500">ユニット</div>
              <div className="font-bold text-amber-300">{unitCount}</div>
            </div>
            <div className="bg-stone-950 p-1.5 rounded-lg border border-stone-800">
              <div className="text-stone-500">進化</div>
              <div className="font-bold text-amber-400">{evolveCount}</div>
            </div>
            <div className="bg-stone-950 p-1.5 rounded-lg border border-stone-800">
              <div className="text-stone-500">スペル</div>
              <div className="font-bold text-blue-300">{spellCount}</div>
            </div>
            <div className="bg-stone-950 p-1.5 rounded-lg border border-stone-800">
              <div className="text-stone-500">ルーン</div>
              <div className="font-bold text-purple-300">{runeCount}</div>
            </div>
            <div className="bg-stone-950 p-1.5 rounded-lg border border-stone-800">
              <div className="text-stone-500">ドメイン</div>
              <div className="font-bold text-amber-200">{domainCount}</div>
            </div>
          </div>
        </div>

        {/* Mana Curve Histogram (8 cols) */}
        <div className="md:col-span-8 bg-stone-900/80 border border-stone-800 rounded-2xl p-3 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
              <BarChart2 className="w-4 h-4 text-amber-400" />
              マナカーブ (コスト別分布)
            </span>
            <span className="text-[11px] text-stone-500">
              平均コスト: {(deckCards.reduce((acc, cid) => acc + getCardById(cid).cost, 0) / (deckCards.length || 1)).toFixed(2)}
            </span>
          </div>

          <div className="grid grid-cols-7 gap-2 items-end h-20 pt-2">
            {[1, 2, 3, 4, 5, 6, 7].map((cost) => {
              const count = manaCurve[cost] || 0;
              const heightPct = Math.max(8, (count / maxCurveVal) * 100);
              return (
                <div key={cost} className="flex flex-col items-center gap-1 h-full justify-end">
                  <span className="text-[10px] font-mono font-bold text-stone-300">{count}</span>
                  <div
                    className="w-full bg-gradient-to-t from-amber-600 to-amber-400 rounded-t-md transition-all duration-300 shadow-sm"
                    style={{ height: `${heightPct}%` }}
                  />
                  <span className="text-[10px] font-mono text-stone-400">{cost === 7 ? '7+' : cost}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Workspace: Current Deck List (Left 4 cols) + Card Pool Explorer (Right 8 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Current Deck Card List */}
        <div className="lg:col-span-4 bg-stone-900 border border-stone-800 rounded-2xl p-3 shadow-lg flex flex-col h-[560px]">
          <div className="flex items-center justify-between pb-2 border-b border-stone-800 mb-2">
            <span className="text-xs font-bold text-stone-200">採用カード一覧</span>
            <span className="text-[11px] text-stone-400">{Object.keys(cardCounts).length} 種類</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {Object.keys(cardCounts).length === 0 ? (
              <div className="text-center text-xs text-stone-600 py-16">
                右側のカードプールからカードを追加してください
              </div>
            ) : (
              Object.entries(cardCounts)
                .sort(([idA], [idB]) => {
                  const cA = getCardById(idA);
                  const cB = getCardById(idB);
                  return cA.cost - cB.cost;
                })
                .map(([cardId, count]) => {
                  const card = getCardById(cardId);
                  return (
                    <div
                      key={cardId}
                      className="flex items-center justify-between p-2 bg-stone-950 rounded-xl border border-stone-800/80 hover:border-stone-700 transition-colors"
                    >
                      {/* Left: Cost + Name */}
                      <div
                        onClick={() => onInspectCard(card)}
                        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0 mr-2"
                      >
                        <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs flex items-center justify-center shrink-0">
                          {card.cost}
                        </span>
                        <div className="truncate text-xs font-bold text-stone-200" title={card.name}>
                          {card.name}
                        </div>
                      </div>

                      {/* Right: Plus/Minus controls */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => removeCard(cardId)}
                          className="w-6 h-6 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 flex items-center justify-center text-xs font-bold"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center font-mono font-bold text-xs text-amber-300">
                          {count}
                        </span>
                        <button
                          onClick={() => addCard(cardId)}
                          disabled={count >= 4 || deckCards.length >= 40}
                          className="w-6 h-6 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 disabled:opacity-30 flex items-center justify-center text-xs font-bold"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        {/* Card Pool Browser */}
        <div className="lg:col-span-8 bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-col h-[560px]">
          {/* Filter Bar */}
          <div className="space-y-2 pb-3 border-b border-stone-800 mb-3">
            {/* Search Input */}
            <input
              type="text"
              placeholder="カード名や効果テキストで検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500"
            />

            {/* Faction Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-[11px] text-stone-500 mr-1">系統:</span>
              {(['ALL', 'RED', 'BLUE', 'GREEN', 'HOLY', 'DARK', 'NEUTRAL'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterFaction(f)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    filterFaction === f
                      ? 'bg-amber-500 text-stone-950'
                      : 'bg-stone-950 text-stone-400 hover:text-white border border-stone-800'
                  }`}
                >
                  {f === 'ALL'
                    ? '全系統'
                    : f === 'RED'
                    ? '朱'
                    : f === 'BLUE'
                    ? '蒼'
                    : f === 'GREEN'
                    ? '翠'
                    : f === 'HOLY'
                    ? '聖'
                    : f === 'DARK'
                    ? '冥'
                    : '無'}
                </button>
              ))}
            </div>

            {/* Type & Cost Filter Buttons */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-stone-500 mr-1">種類:</span>
                {(['ALL', 'UNIT', 'EVOLVE_UNIT', 'SPELL', 'RUNE', 'DOMAIN'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                      filterType === t ? 'bg-stone-700 text-white' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {t === 'ALL'
                      ? '全て'
                      : t === 'UNIT'
                      ? 'ユニット'
                      : t === 'EVOLVE_UNIT'
                      ? '進化'
                      : t === 'SPELL'
                      ? 'スペル'
                      : t === 'RUNE'
                      ? 'ルーン'
                      : 'ドメイン'}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[11px] text-stone-500 mr-1">コスト:</span>
                {(['ALL', '1', '2', '3', '4', '5', '6', '7'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setFilterCost(c)}
                    className={`w-6 h-6 rounded flex items-center justify-center font-mono text-[11px] ${
                      filterCost === c ? 'bg-amber-500 text-stone-950 font-bold' : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cards Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {filteredPool.map((card) => {
                const countInDeck = cardCounts[card.cardId] || 0;
                return (
                  <div key={card.cardId} className="relative group">
                    <CardItem
                      card={card}
                      size="sm"
                      isInteractive={true}
                      onInspect={onInspectCard}
                      onClick={() => addCard(card.cardId)}
                    />

                    {/* Quick Add Overlay Badge */}
                    <div className="absolute top-1 right-1 flex items-center gap-1 bg-stone-950/90 border border-stone-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                      <span className="text-amber-300">{countInDeck}</span>
                      <span className="text-stone-500">/4</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
