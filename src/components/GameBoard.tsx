import React, { useState, useEffect, useRef } from 'react';
import {
  Action,
  AIDecisionLog,
  CardData,
  Deck,
  GameLogEntry,
  GameState,
  LegalAction,
  PlayerId,
} from '../types/game';
import { PRESET_DECKS } from '../data/presetDecks';
import { GameEngine } from '../engine/gameEngine';
import { AIService } from '../services/aiService';
import { CardItem } from './CardItem';
import {
  Play,
  RotateCcw,
  Sparkles,
  Swords,
  Shield,
  Heart,
  Flame,
  ChevronRight,
  Bot,
  User,
  Zap,
  Info,
  Clock,
  Layers,
  CheckCircle2,
} from 'lucide-react';

interface GameBoardProps {
  onInspectCard: (card: CardData) => void;
  customDecks: Deck[];
  hasApiKey: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({ onInspectCard, customDecks, hasApiKey }) => {
  const allAvailableDecks = [...customDecks, ...PRESET_DECKS];

  const [deckAId, setDeckAId] = useState<string>(PRESET_DECKS[0].deckId);
  const [deckBId, setDeckBId] = useState<string>(PRESET_DECKS[1].deckId);

  const [playerAIsAI, setPlayerAIsAI] = useState<boolean>(false);
  const [playerBIsAI, setPlayerBIsAI] = useState<boolean>(true);
  const [useGeminiForAI, setUseGeminiForAI] = useState<boolean>(hasApiKey);

  const [engine] = useState(() => new GameEngine(Date.now()));
  const [aiService] = useState(() => new AIService(engine));

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [legalActions, setLegalActions] = useState<LegalAction[]>([]);
  const [latestAIDecision, setLatestAIDecision] = useState<AIDecisionLog | null>(null);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(false);
  const [isProcessingStep, setIsProcessingStep] = useState<boolean>(false);
  const [gameLogs, setGameLogs] = useState<GameLogEntry[]>([]);
  const [logFilter, setLogFilter] = useState<'ALL' | 'COMBAT' | 'PLAY' | 'DAMAGE'>('ALL');

  const [selectedHandInstanceId, setSelectedHandInstanceId] = useState<string | null>(null);
  const [selectedBoardInstanceId, setSelectedBoardInstanceId] = useState<string | null>(null);

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize Match
  const startNewMatch = () => {
    if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    setIsAutoPlaying(false);

    const deckA = allAvailableDecks.find((d) => d.deckId === deckAId) || PRESET_DECKS[0];
    const deckB = allAvailableDecks.find((d) => d.deckId === deckBId) || PRESET_DECKS[1];

    const state = engine.createInitialState(
      `game_${Date.now()}`,
      deckA.cards,
      deckB.cards,
      `${deckA.deckName.split(' ')[0]} (P1)`,
      `${deckB.deckName.split(' ')[0]} (P2)`,
      playerAIsAI,
      playerBIsAI,
      playerAIsAI ? (useGeminiForAI ? 'GEMINI' : 'HEURISTIC') : 'HUMAN',
      playerBIsAI ? (useGeminiForAI ? 'GEMINI' : 'HEURISTIC') : 'HUMAN',
      Date.now()
    );

    setGameState(state);
    setGameLogs(engine.getLogs());
    setLatestAIDecision(null);
    setSelectedHandInstanceId(null);
    setSelectedBoardInstanceId(null);

    const actions = engine.getLegalActions(state);
    setLegalActions(actions);
  };

  useEffect(() => {
    startNewMatch();
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [deckAId, deckBId]);

  // Scroll logs to bottom on update
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gameLogs]);

  // Execute an action
  const handleExecuteAction = async (action: Action) => {
    if (!gameState || gameState.gameStatus !== 'IN_PROGRESS' || isProcessingStep) return;

    setIsProcessingStep(true);
    try {
      const { nextState, log } = engine.step(gameState, action);
      setGameState(nextState);
      setGameLogs((prev) => [...prev, log]);

      setSelectedHandInstanceId(null);
      setSelectedBoardInstanceId(null);

      const nextActions = engine.getLegalActions(nextState);
      setLegalActions(nextActions);
    } finally {
      setIsProcessingStep(false);
    }
  };

  // Perform AI turn execution
  const executeAITurn = async () => {
    if (!gameState || gameState.gameStatus !== 'IN_PROGRESS' || isProcessingStep) return;

    const activePlayer = gameState.activePlayer;
    const isAICurrent =
      activePlayer === 'PLAYER_A' ? playerAIsAI : playerBIsAI;

    // In reactive phases (e.g. GUARD_STEP), the responding player might be AI even if not their main turn
    let effectivePlayerId: PlayerId = activePlayer;
    let effectiveIsAI = isAICurrent;

    if (gameState.phase === 'GUARD_STEP' && gameState.pendingCombat) {
      effectivePlayerId = engine.getOpponent(gameState, gameState.pendingCombat.attackerPlayerId).playerId;
      effectiveIsAI = effectivePlayerId === 'PLAYER_A' ? playerAIsAI : playerBIsAI;
    } else if (gameState.phase === 'RUNE_STEP' && gameState.pendingTrigger) {
      effectivePlayerId = gameState.pendingTrigger.triggeringPlayerId;
      effectiveIsAI = effectivePlayerId === 'PLAYER_A' ? playerAIsAI : playerBIsAI;
    }

    if (!effectiveIsAI) return;

    setIsProcessingStep(true);
    try {
      const currentLegal = engine.getLegalActions(gameState);
      if (currentLegal.length === 0) return;

      const decision = await aiService.getDecision(
        gameState,
        currentLegal,
        effectivePlayerId,
        useGeminiForAI
      );

      setLatestAIDecision(decision);

      const { nextState, log } = engine.step(gameState, decision.selectedAction);
      setGameState(nextState);
      setGameLogs((prev) => [...prev, log]);

      const nextActions = engine.getLegalActions(nextState);
      setLegalActions(nextActions);
    } catch (err) {
      console.error('AI Turn Error:', err);
    } finally {
      setIsProcessingStep(false);
    }
  };

  // Trigger AI turn automatically when active player is AI
  useEffect(() => {
    if (!gameState || gameState.gameStatus !== 'IN_PROGRESS' || isProcessingStep) return;

    let isCurrentAI =
      gameState.activePlayer === 'PLAYER_A' ? playerAIsAI : playerBIsAI;

    if (gameState.phase === 'GUARD_STEP' && gameState.pendingCombat) {
      const defPlayer = engine.getOpponent(gameState, gameState.pendingCombat.attackerPlayerId).playerId;
      isCurrentAI = defPlayer === 'PLAYER_A' ? playerAIsAI : playerBIsAI;
    } else if (gameState.phase === 'RUNE_STEP' && gameState.pendingTrigger) {
      const runePlayer = gameState.pendingTrigger.triggeringPlayerId;
      isCurrentAI = runePlayer === 'PLAYER_A' ? playerAIsAI : playerBIsAI;
    }

    if (isCurrentAI && isAutoPlaying) {
      const timer = setTimeout(() => {
        executeAITurn();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [gameState, isAutoPlaying, playerAIsAI, playerBIsAI]);

  if (!gameState) {
    return (
      <div className="p-8 text-center text-stone-400">
        ゲーム盤面を初期化中...
      </div>
    );
  }

  const pA = gameState.playerA;
  const pB = gameState.playerB;
  const activeP = engine.getPlayer(gameState, gameState.activePlayer);
  const activeArcanaCountA = pA.arcana.filter((a) => !a.isRested).length;
  const activeArcanaCountB = pB.arcana.filter((a) => !a.isRested).length;

  const filteredLogs = gameLogs.filter((l) => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'COMBAT') return l.type === 'COMBAT' || l.type === 'ATTACK';
    if (logFilter === 'PLAY') return l.type === 'PLAY' || l.type === 'ARCANA';
    if (logFilter === 'DAMAGE') return l.type === 'DAMAGE' || l.type === 'DESTROY';
    return true;
  });

  return (
    <div id="game-board-view" className="max-w-7xl mx-auto p-3 space-y-3 animate-fade-in">
      {/* Top Toolbar: Match Settings, AI Toggle, Step / Auto Play */}
      <div className="bg-stone-900/90 border border-stone-800 rounded-2xl p-3 shadow-lg flex flex-wrap items-center justify-between gap-3">
        {/* Match Deck Selectors & Mode */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Deck A Selector */}
          <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-xl border border-stone-800 text-xs">
            <span className="text-red-400 font-bold">先攻(P1):</span>
            <select
              value={deckAId}
              onChange={(e) => setDeckAId(e.target.value)}
              className="bg-transparent text-stone-200 font-medium focus:outline-none"
            >
              {allAvailableDecks.map((d) => (
                <option key={d.deckId} value={d.deckId} className="bg-stone-900 text-stone-100">
                  {d.deckName} ({d.deckVersion})
                </option>
              ))}
            </select>
            <button
              onClick={() => setPlayerAIsAI(!playerAIsAI)}
              className={`p-1 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                playerAIsAI ? 'bg-amber-600/80 text-amber-100' : 'bg-blue-600/80 text-blue-100'
              }`}
              title="プレイヤーAの操作主体を切り替え"
            >
              {playerAIsAI ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
              <span>{playerAIsAI ? 'AI' : '手動'}</span>
            </button>
          </div>

          <span className="text-stone-500 font-bold text-xs">VS</span>

          {/* Deck B Selector */}
          <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-xl border border-stone-800 text-xs">
            <span className="text-sky-400 font-bold">後攻(P2):</span>
            <select
              value={deckBId}
              onChange={(e) => setDeckBId(e.target.value)}
              className="bg-transparent text-stone-200 font-medium focus:outline-none"
            >
              {allAvailableDecks.map((d) => (
                <option key={d.deckId} value={d.deckId} className="bg-stone-900 text-stone-100">
                  {d.deckName} ({d.deckVersion})
                </option>
              ))}
            </select>
            <button
              onClick={() => setPlayerBIsAI(!playerBIsAI)}
              className={`p-1 rounded-md text-[10px] font-bold flex items-center gap-1 ${
                playerBIsAI ? 'bg-amber-600/80 text-amber-100' : 'bg-blue-600/80 text-blue-100'
              }`}
              title="プレイヤーBの操作主体を切り替え"
            >
              {playerBIsAI ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
              <span>{playerBIsAI ? 'AI' : '手動'}</span>
            </button>
          </div>
        </div>

        {/* Action Controls: Step, Auto, Reset */}
        <div className="flex items-center gap-2">
          {/* Gemini Mode Toggle */}
          <button
            onClick={() => setUseGeminiForAI(!useGeminiForAI)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all ${
              useGeminiForAI
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-stone-800 text-stone-400 border-stone-700'
            }`}
            title="Gemini API (Server-Side) と高速Heuristic Engineを切り替え"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{useGeminiForAI ? 'Gemini 3.7' : 'Heuristic AI'}</span>
          </button>

          {/* AI Step Button */}
          <button
            id="ai-step-action-btn"
            onClick={executeAITurn}
            disabled={isProcessingStep || gameState.gameStatus !== 'IN_PROGRESS'}
            className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center gap-1.5 border border-stone-700 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
            <span>AI 1手進行</span>
          </button>

          {/* Auto Play Toggle */}
          <button
            id="toggle-autoplay-btn"
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            disabled={gameState.gameStatus !== 'IN_PROGRESS'}
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all ${
              isAutoPlaying
                ? 'bg-red-600 text-white animate-pulse'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
            }`}
          >
            <Play className="w-4 h-4" />
            <span>{isAutoPlaying ? '自動進行停止' : '連続自動対戦'}</span>
          </button>

          {/* Reset Button */}
          <button
            id="reset-match-btn"
            onClick={startNewMatch}
            className="p-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition-colors"
            title="試合を初期状態にリセット"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Game Stage (Left 70%) + AI Thinking & Log (Right 30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* ==================================================== */}
        {/* LEFT COLUMN: THE BATTLE ARENA (8 cols) */}
        {/* ==================================================== */}
        <div className="lg:col-span-8 space-y-3">
          {/* OPPONENT AREA (Player B) */}
          <div
            id="opponent-zone"
            className={`bg-stone-900/80 rounded-2xl p-3 border transition-colors ${
              gameState.activePlayer === 'PLAYER_B'
                ? 'border-sky-500/60 shadow-lg shadow-sky-900/20'
                : 'border-stone-800'
            }`}
          >
            {/* Player B Header Bar */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-sky-950 border border-sky-500 flex items-center justify-center font-bold text-sky-300 text-sm">
                  {playerBIsAI ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-stone-100">{pB.name}</span>
                    {gameState.activePlayer === 'PLAYER_B' && (
                      <span className="bg-sky-500/20 text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-sky-500/40 animate-pulse">
                        ターン行動中
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-stone-400 flex items-center gap-2">
                    <span>手札: {pB.hand.length}枚</span>
                    <span>•</span>
                    <span>デッキ: {pB.deck.length}枚</span>
                    <span>•</span>
                    <span>墓地: {pB.archive.length}枚</span>
                  </div>
                </div>
              </div>

              {/* HP Bar */}
              <div className="text-right">
                <div className="flex items-center gap-1.5 justify-end">
                  <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                  <span className="text-xl font-black font-mono text-white">{pB.hp}</span>
                  <span className="text-xs text-stone-500">/ 20</span>
                </div>
                <div className="w-36 h-2 bg-stone-950 rounded-full overflow-hidden border border-stone-800 mt-1">
                  <div
                    className="h-full bg-gradient-to-r from-rose-600 to-emerald-500 transition-all duration-300"
                    style={{ width: `${Math.max(0, (pB.hp / 20) * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Opponent Sub-zones: Arcana & Domain & Runes */}
            <div className="flex items-center gap-2 py-1.5 border-y border-stone-800/80 mb-2 text-xs">
              {/* Arcana Count & Preview */}
              <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-lg border border-stone-800">
                <Flame className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-stone-400">アルカナ:</span>
                <span className="font-bold text-sky-300 font-mono">
                  {activeArcanaCountB} / {pB.arcana.length}
                </span>
                <div className="flex items-center gap-1 ml-1">
                  {pB.arcana.map((arc, idx) => (
                    <span
                      key={idx}
                      className={`w-2 h-2 rounded-full ${
                        arc.isRested ? 'bg-stone-700' : 'bg-sky-400 shadow-sm shadow-sky-400'
                      }`}
                      title={arc.instance.baseCard.name}
                    />
                  ))}
                </div>
              </div>

              {/* Runes Count */}
              <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-lg border border-stone-800">
                <Shield className="w-3.5 h-3.5 text-purple-400" />
                <span className="text-stone-400">ルーン:</span>
                <span className="font-bold text-purple-300 font-mono">{pB.runes.length} / 2</span>
              </div>

              {/* Domain */}
              {pB.domain && (
                <div
                  onClick={() => onInspectCard(pB.domain!.baseCard)}
                  className="flex items-center gap-1 bg-amber-950/40 text-amber-200 border border-amber-500/30 px-2 py-0.5 rounded cursor-pointer hover:bg-amber-900/50"
                  title="ドメインカード (クリックで詳細)"
                >
                  <Layers className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{pB.domain.baseCard.name}</span>
                </div>
              )}
            </div>

            {/* Opponent Battlefield */}
            <div className="min-h-[140px] bg-stone-950/60 rounded-xl p-2 border border-dashed border-stone-800 flex items-center gap-2 overflow-x-auto">
              {pB.battlefield.length === 0 ? (
                <div className="w-full text-center text-xs text-stone-600 py-6">
                  相手の場にユニットはいません
                </div>
              ) : (
                pB.battlefield.map((unit) => {
                  const isAttackTarget = legalActions.some(
                    (a) =>
                      a.action.type === 'ATTACK' &&
                      (a.action.payload as any).targetUnitInstanceId === unit.instanceId
                  );
                  return (
                    <CardItem
                      key={unit.instanceId}
                      card={unit}
                      size="sm"
                      isInteractive={true}
                      isTargetable={isAttackTarget}
                      onInspect={onInspectCard}
                      onClick={() => {
                        // If player is attacking and clicks target unit
                        if (selectedBoardInstanceId) {
                          const attAction = legalActions.find(
                            (a) =>
                              a.action.type === 'ATTACK' &&
                              (a.action.payload as any).attackerInstanceId === selectedBoardInstanceId &&
                              (a.action.payload as any).targetUnitInstanceId === unit.instanceId
                          );
                          if (attAction) {
                            handleExecuteAction(attAction.action);
                          }
                        }
                      }}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* CENTER FIELD: BATTLE STATUS & PHASE BANNER */}
          <div className="bg-stone-950 border border-stone-800 rounded-2xl p-2.5 shadow-inner flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="bg-stone-800 text-stone-300 font-mono font-bold px-2.5 py-1 rounded-lg border border-stone-700">
                Turn {gameState.turnNumber}
              </span>
              <span
                className={`font-black px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                  gameState.phase === 'ARCANA'
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                    : gameState.phase === 'ACTION'
                    ? 'bg-amber-950 text-amber-300 border border-amber-700'
                    : gameState.phase === 'GUARD_STEP'
                    ? 'bg-sky-950 text-sky-300 border border-sky-700 animate-pulse'
                    : gameState.phase === 'RUNE_STEP'
                    ? 'bg-purple-950 text-purple-300 border border-purple-700 animate-pulse'
                    : 'bg-stone-800 text-stone-300'
                }`}
              >
                {gameState.phase === 'ARCANA'
                  ? 'アルカナフェイズ'
                  : gameState.phase === 'ACTION'
                  ? 'メインアクションフェイズ'
                  : gameState.phase === 'GUARD_STEP'
                  ? '【ガード判定ステップ】'
                  : gameState.phase === 'RUNE_STEP'
                  ? '【ルーン発動確認ステップ】'
                  : 'ターン終了'}
              </span>
            </div>

            {/* Victory Banner if finished */}
            {gameState.gameStatus === 'FINISHED' && (
              <div className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-red-600 text-stone-950 font-black px-4 py-1.5 rounded-xl shadow-lg animate-bounce">
                <CheckCircle2 className="w-4 h-4" />
                <span>{gameState.winReason || 'ゲーム決着！'}</span>
              </div>
            )}

            {/* Last Action Brief */}
            <div className="text-stone-400 truncate max-w-xs text-right">
              {gameLogs.length > 0 ? gameLogs[gameLogs.length - 1].message : '試合開始'}
            </div>
          </div>

          {/* PLAYER AREA (Player A) */}
          <div
            id="player-zone"
            className={`bg-stone-900/80 rounded-2xl p-3 border transition-colors ${
              gameState.activePlayer === 'PLAYER_A'
                ? 'border-red-500/60 shadow-lg shadow-red-900/20'
                : 'border-stone-800'
            }`}
          >
            {/* Player A Battlefield */}
            <div className="min-h-[140px] bg-stone-950/60 rounded-xl p-2 border border-dashed border-stone-800 flex items-center gap-2 overflow-x-auto mb-2">
              {pA.battlefield.length === 0 ? (
                <div className="w-full text-center text-xs text-stone-600 py-6">
                  あなたの場にユニットはいません（手札から召喚可能）
                </div>
              ) : (
                pA.battlefield.map((unit) => {
                  const canAttack = legalActions.some(
                    (a) =>
                      a.action.type === 'ATTACK' &&
                      (a.action.payload as any).attackerInstanceId === unit.instanceId
                  );
                  const isSelected = selectedBoardInstanceId === unit.instanceId;

                  return (
                    <CardItem
                      key={unit.instanceId}
                      card={unit}
                      size="sm"
                      isInteractive={true}
                      isSelected={isSelected}
                      isPlayable={canAttack}
                      onInspect={onInspectCard}
                      onClick={() => {
                        setSelectedBoardInstanceId(isSelected ? null : unit.instanceId);
                      }}
                    />
                  );
                })
              )}
            </div>

            {/* Player A Sub-zones: Arcana & Domain & Runes */}
            <div className="flex items-center justify-between py-1.5 border-y border-stone-800/80 mb-2 text-xs">
              <div className="flex items-center gap-2">
                {/* Arcana Zone */}
                <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-lg border border-stone-800">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-stone-400">アルカナ:</span>
                  <span className="font-bold text-amber-300 font-mono">
                    {activeArcanaCountA} / {pA.arcana.length}
                  </span>
                  <div className="flex items-center gap-1 ml-1">
                    {pA.arcana.map((arc, idx) => (
                      <span
                        key={idx}
                        className={`w-2 h-2 rounded-full ${
                          arc.isRested ? 'bg-stone-700' : 'bg-amber-400 shadow-sm shadow-amber-400'
                        }`}
                        title={arc.instance.baseCard.name}
                      />
                    ))}
                  </div>
                </div>

                {/* Runes Zone */}
                <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-lg border border-stone-800">
                  <Shield className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-stone-400">ルーン:</span>
                  <span className="font-bold text-purple-300 font-mono">{pA.runes.length} / 2</span>
                  {pA.runes.map((r, idx) => (
                    <span
                      key={idx}
                      onClick={() => onInspectCard(r.baseCard)}
                      className="text-[10px] text-purple-300 bg-purple-950 px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      {r.baseCard.name}
                    </span>
                  ))}
                </div>

                {/* Domain */}
                {pA.domain && (
                  <div
                    onClick={() => onInspectCard(pA.domain!.baseCard)}
                    className="flex items-center gap-1 bg-amber-950/40 text-amber-200 border border-amber-500/30 px-2 py-0.5 rounded cursor-pointer hover:bg-amber-900/50"
                    title="ドメインカード (クリックで詳細)"
                  >
                    <Layers className="w-3 h-3" />
                    <span className="truncate max-w-[120px]">{pA.domain.baseCard.name}</span>
                  </div>
                )}
              </div>

              {/* Player A Stats */}
              <div className="flex items-center gap-3">
                <span className="text-stone-400 text-xs">デッキ: {pA.deck.length}枚</span>
                <span className="text-stone-400 text-xs">墓地: {pA.archive.length}枚</span>

                {/* HP Bar */}
                <div className="flex items-center gap-1.5">
                  <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                  <span className="text-xl font-black font-mono text-white">{pA.hp}</span>
                  <span className="text-xs text-stone-500">/ 20</span>
                </div>
              </div>
            </div>

            {/* Player A Hand (Interactive Cards) */}
            <div>
              <div className="flex items-center justify-between text-xs text-stone-400 mb-1.5">
                <span className="font-bold">あなたの手札 ({pA.hand.length}枚)</span>
                <span className="text-[11px] text-stone-500">
                  緑色に光るカードは現在のアクションフェイズで使用可能です
                </span>
              </div>
              <div className="flex items-center gap-2 overflow-x-auto p-2 bg-stone-950/40 rounded-xl min-h-[160px]">
                {pA.hand.length === 0 ? (
                  <div className="w-full text-center text-xs text-stone-600 py-6">
                    手札がありません
                  </div>
                ) : (
                  pA.hand.map((card) => {
                    const isPlayable = legalActions.some(
                      (a) =>
                        (a.action.payload as any)?.cardInstanceId === card.instanceId
                    );
                    const isSelected = selectedHandInstanceId === card.instanceId;

                    return (
                      <CardItem
                        key={card.instanceId}
                        card={card}
                        size="md"
                        isInteractive={true}
                        isSelected={isSelected}
                        isPlayable={isPlayable}
                        onInspect={onInspectCard}
                        onClick={() => {
                          setSelectedHandInstanceId(isSelected ? null : card.instanceId);
                        }}
                      />
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* DYNAMIC ACTION BAR (Available Legal Actions for current player) */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-3 shadow-md">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-400" />
                実行可能なアクション ({legalActions.length}手)
              </span>
              <span className="text-[11px] text-stone-500">
                操作主体: {activeP.name} ({activeP.isAI ? 'AI' : '手動操作'})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 max-h-36 overflow-y-auto pr-1">
              {legalActions.map((leg, idx) => {
                const isSelectedHandAction =
                  selectedHandInstanceId &&
                  (leg.action.payload as any)?.cardInstanceId === selectedHandInstanceId;
                const isSelectedBoardAction =
                  selectedBoardInstanceId &&
                  (leg.action.payload as any)?.attackerInstanceId === selectedBoardInstanceId;

                const categoryColors: Record<string, string> = {
                  ARCANA: 'bg-emerald-950/80 hover:bg-emerald-900 border-emerald-600 text-emerald-200',
                  SUMMON: 'bg-amber-950/80 hover:bg-amber-900 border-amber-500 text-amber-200',
                  SPELL: 'bg-blue-950/80 hover:bg-blue-900 border-blue-500 text-blue-200',
                  RUNE: 'bg-purple-950/80 hover:bg-purple-900 border-purple-500 text-purple-200',
                  DOMAIN: 'bg-amber-950/90 hover:bg-amber-800 border-amber-400 text-amber-100',
                  ATTACK: 'bg-red-950/80 hover:bg-red-900 border-red-500 text-red-200',
                  GUARD: 'bg-sky-950/90 hover:bg-sky-800 border-sky-400 text-sky-100',
                  TRIGGER: 'bg-fuchsia-950/90 hover:bg-fuchsia-800 border-fuchsia-400 text-fuchsia-100',
                  PASS: 'bg-stone-800 hover:bg-stone-700 border-stone-600 text-stone-300',
                };

                const btnStyle = categoryColors[leg.category] || categoryColors.PASS;

                return (
                  <button
                    key={idx}
                    id={`action-btn-${idx}`}
                    onClick={() => handleExecuteAction(leg.action)}
                    disabled={isProcessingStep}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${btnStyle} ${
                      isSelectedHandAction || isSelectedBoardAction
                        ? 'ring-2 ring-yellow-400 scale-105 shadow-md shadow-yellow-500/20'
                        : ''
                    }`}
                  >
                    <span>{leg.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* RIGHT COLUMN: AI THOUGHTS & REALTIME LOGS (4 cols) */}
        {/* ==================================================== */}
        <div className="lg:col-span-4 space-y-3">
          {/* AI Decision & Strategy Inspector */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-3 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                AI 思考・意思決定ログ
              </span>
              <span className="text-[10px] text-stone-500">
                {latestAIDecision?.isFallback ? 'Heuristic' : 'Gemini 3.7'}
              </span>
            </div>

            {latestAIDecision ? (
              <div className="space-y-2">
                <div className="p-2.5 bg-stone-950 rounded-xl border border-stone-800">
                  <div className="text-[11px] text-amber-300 font-bold mb-1">
                    【選択理由】Turn {latestAIDecision.turn} ({latestAIDecision.aiPlayer === 'PLAYER_A' ? '先攻' : '後攻'})
                  </div>
                  <p className="text-xs text-stone-200 leading-relaxed">
                    {latestAIDecision.reason}
                  </p>
                </div>

                {/* Candidate Action Rankings */}
                {latestAIDecision.candidates && latestAIDecision.candidates.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] uppercase font-bold text-stone-500">
                      候補手 評価スコア (0.0〜10.0)
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {latestAIDecision.candidates.slice(0, 4).map((cand, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-1.5 bg-stone-950/60 rounded-lg text-xs border border-stone-800/80"
                        >
                          <span className="truncate max-w-[170px] text-stone-300 text-[11px]">
                            {cand.action.description || cand.action.type}
                          </span>
                          <span className="font-mono font-bold text-amber-400 text-[11px]">
                            ★ {cand.score}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 text-center text-xs text-stone-600 bg-stone-950/40 rounded-xl">
                AIが行動を選択すると、ここに戦略的思考と評価値が表示されます。
              </div>
            )}
          </div>

          {/* Real-time Match Logs */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-3 shadow-lg flex flex-col h-[340px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                対戦ログ ({gameLogs.length}件)
              </span>

              {/* Log Category Filter */}
              <div className="flex items-center gap-1 text-[10px]">
                {(['ALL', 'COMBAT', 'PLAY', 'DAMAGE'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setLogFilter(filter)}
                    className={`px-1.5 py-0.5 rounded ${
                      logFilter === filter ? 'bg-stone-700 text-white font-bold' : 'text-stone-500'
                    }`}
                  >
                    {filter === 'ALL' ? '全' : filter === 'COMBAT' ? '戦闘' : filter === 'PLAY' ? '展開' : 'ダメ'}
                  </button>
                ))}
              </div>
            </div>

            {/* Log Stream */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
              {filteredLogs.map((log) => {
                const isCombat = log.type === 'COMBAT' || log.type === 'DAMAGE';
                const isDestroy = log.type === 'DESTROY';
                const isRune = log.type === 'RUNE';
                return (
                  <div
                    key={log.id}
                    className={`p-1.5 rounded-lg leading-relaxed ${
                      isCombat
                        ? 'bg-rose-950/40 text-rose-200 border-l-2 border-rose-500'
                        : isDestroy
                        ? 'bg-purple-950/40 text-purple-200 border-l-2 border-purple-500'
                        : isRune
                        ? 'bg-fuchsia-950/40 text-fuchsia-200 border-l-2 border-fuchsia-500'
                        : 'bg-stone-950/60 text-stone-300 border-l-2 border-stone-700'
                    }`}
                  >
                    <span className="text-stone-500 mr-1.5">[T{log.turn}]</span>
                    <span>{log.message}</span>
                  </div>
                );
              })}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
