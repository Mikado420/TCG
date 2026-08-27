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
  CardInstance,
} from '../types/game';
import { PRESET_DECKS } from '../data/presetDecks';
import { GameEngine } from '../engine/gameEngine';
import { AIService } from '../services/aiService';
import { CardItem } from './CardItem';
import { ArchiveOverlay } from './ArchiveOverlay';
import { ArcanaOverlay } from './ArcanaOverlay';
import { GameLogOverlay } from './GameLogOverlay';
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
  AlertCircle,
  X,
  BookOpen,
  ArrowRight,
  Settings,
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

  // Selection states for smooth touch interactions
  const [selectedHandInstanceId, setSelectedHandInstanceId] = useState<string | null>(null);
  const [selectedAttackerInstanceId, setSelectedAttackerInstanceId] = useState<string | null>(null);

  // Overlay modaled views
  const [archiveModalTarget, setArchiveModalTarget] = useState<'A' | 'B' | null>(null);
  const [arcanaModalTarget, setArcanaModalTarget] = useState<'A' | 'B' | null>(null);
  const [showLogModal, setShowLogModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);

  const autoPlayTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    setSelectedAttackerInstanceId(null);

    const actions = engine.getLegalActions(state);
    setLegalActions(actions);
  };

  useEffect(() => {
    startNewMatch();
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
    };
  }, [deckAId, deckBId]);

  // Execute an action
  const handleExecuteAction = async (action: Action) => {
    if (!gameState || gameState.gameStatus !== 'IN_PROGRESS' || isProcessingStep) return;

    setIsProcessingStep(true);
    try {
      const { nextState, log } = engine.step(gameState, action);
      setGameState(nextState);
      setGameLogs((prev) => [...prev, log]);

      setSelectedHandInstanceId(null);
      setSelectedAttackerInstanceId(null);

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
    let effectivePlayerId: PlayerId = activePlayer;
    let effectiveIsAI = activePlayer === 'PLAYER_A' ? playerAIsAI : playerBIsAI;

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
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [gameState, isAutoPlaying, playerAIsAI, playerBIsAI]);

  if (!gameState) {
    return (
      <div className="h-full w-full flex items-center justify-center text-stone-400">
        ゲーム盤面を初期化中...
      </div>
    );
  }

  const pA = gameState.playerA;
  const pB = gameState.playerB;
  const activeP = engine.getPlayer(gameState, gameState.activePlayer);
  const activeArcanaCountA = pA.arcana.filter((a) => !a.isRested).length;
  const activeArcanaCountB = pB.arcana.filter((a) => !a.isRested).length;

  // Determine current responding player for reactive phases
  let respondingPlayerId = gameState.activePlayer;
  if (gameState.phase === 'GUARD_STEP' && gameState.pendingCombat) {
    respondingPlayerId = engine.getOpponent(gameState, gameState.pendingCombat.attackerPlayerId).playerId;
  } else if (gameState.phase === 'RUNE_STEP' && gameState.pendingTrigger) {
    respondingPlayerId = gameState.pendingTrigger.triggeringPlayerId;
  }
  const isHumanTurn = respondingPlayerId === 'PLAYER_A' ? !playerAIsAI : !playerBIsAI;

  // Legal actions for the currently selected hand card
  const selectedHandActions = legalActions.filter(
    (leg) =>
      selectedHandInstanceId &&
      ((leg.action.payload as any)?.cardInstanceId === selectedHandInstanceId ||
        (leg.action.payload as any)?.evolveTargetInstanceId === selectedHandInstanceId)
  );

  // Turn End / Pass actions
  const passAction = legalActions.find(
    (a) => a.action.type === 'PASS' || a.category === 'PASS'
  );
  const guardPassAction = legalActions.find(
    (a) => a.action.type === 'GUARD' && (a.action.payload as any)?.guardUnitInstanceId === null
  );

  // Attackable target check for selected attacker
  const legalAttacksForSelectedAttacker = legalActions.filter(
    (a) =>
      a.action.type === 'ATTACK' &&
      (a.action.payload as any)?.attackerInstanceId === selectedAttackerInstanceId
  );

  const canAttackOpponentPlayer = legalAttacksForSelectedAttacker.some(
    (a) => (a.action.payload as any)?.targetUnitInstanceId === null
  );

  return (
    <div
      id="game-board-container"
      className="h-[calc(100dvh-56px)] w-full flex flex-col justify-between bg-stone-950 text-stone-100 overflow-hidden relative select-none p-1 sm:p-2"
    >
      {/* ============================================================ */}
      {/* 1. TOP STATUS & CONTROL BAR */}
      {/* ============================================================ */}
      <div className="h-9 w-full bg-stone-900/95 border border-stone-800 rounded-xl px-2 flex items-center justify-between gap-2 shrink-0 shadow-md">
        {/* Turn & Phase Indicator */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono font-black bg-stone-800 text-stone-200 px-2 py-0.5 rounded border border-stone-700">
            T{gameState.turnNumber}
          </span>
          <span
            className={`font-black text-[11px] px-2 py-0.5 rounded tracking-wide uppercase ${
              gameState.phase === 'ARCANA'
                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                : gameState.phase === 'ACTION'
                ? 'bg-amber-950 text-amber-300 border border-amber-600'
                : gameState.phase === 'GUARD_STEP'
                ? 'bg-sky-950 text-sky-300 border border-sky-500 animate-pulse'
                : gameState.phase === 'RUNE_STEP'
                ? 'bg-purple-950 text-purple-300 border border-purple-500 animate-pulse'
                : 'bg-stone-800 text-stone-300'
            }`}
          >
            {gameState.phase === 'ARCANA'
              ? 'アルカナ配置'
              : gameState.phase === 'ACTION'
              ? 'メイン'
              : gameState.phase === 'GUARD_STEP'
              ? 'ガード判定'
              : gameState.phase === 'RUNE_STEP'
              ? 'ルーン発動'
              : '終了'}
          </span>
          <span className="text-[11px] text-stone-400 hidden md:inline">
            手番: <strong className="text-white">{activeP.name}</strong> ({activeP.isAI ? 'AI' : '手動'})
          </span>
        </div>

        {/* Center Live Alert / Notice */}
        <div className="text-xs truncate max-w-md text-stone-300 font-medium text-center">
          {gameState.gameStatus === 'FINISHED' ? (
            <span className="text-amber-400 font-black bg-amber-950/80 px-2.5 py-0.5 rounded border border-amber-500">
              決着: {gameState.winReason}
            </span>
          ) : gameState.phase === 'GUARD_STEP' ? (
            <span className="text-sky-300 font-bold animate-pulse">
              相手が攻撃中！ガードするユニットを選択するか「スルー」してください
            </span>
          ) : gameState.phase === 'RUNE_STEP' ? (
            <span className="text-purple-300 font-bold animate-pulse">
              ルーン誘発！発動しますか？
            </span>
          ) : selectedAttackerInstanceId ? (
            <span className="text-rose-400 font-bold">
              攻撃先（相手ユニット または 相手リーダー）をタップしてください
            </span>
          ) : gameLogs.length > 0 ? (
            <span className="text-stone-400 text-[11px] truncate">
              {gameLogs[gameLogs.length - 1].message}
            </span>
          ) : (
            <span className="text-stone-500 text-[11px]">対戦開始</span>
          )}
        </div>

        {/* Right Tools: Logs, AI Step, Auto, Settings */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowLogModal(true)}
            className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 text-[11px] font-bold flex items-center gap-1 border border-stone-700"
            title="ログとAI思考を確認"
          >
            <Clock className="w-3.5 h-3.5 text-stone-400" />
            <span className="hidden sm:inline">ログ</span>
          </button>

          <button
            onClick={executeAITurn}
            disabled={isProcessingStep || gameState.gameStatus !== 'IN_PROGRESS'}
            className="px-2 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] font-bold flex items-center gap-1 border border-stone-700 disabled:opacity-40"
            title="AIに1手行動させる"
          >
            <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">AI 1手</span>
          </button>

          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            disabled={gameState.gameStatus !== 'IN_PROGRESS'}
            className={`px-2 py-1 rounded-lg text-[11px] font-black flex items-center gap-1 transition-all ${
              isAutoPlaying
                ? 'bg-rose-600 text-white animate-pulse'
                : 'bg-emerald-700 hover:bg-emerald-600 text-white'
            }`}
            title="自動で対戦を進める"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isAutoPlaying ? '停止' : '自動'}</span>
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            className="p-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white transition-colors border border-stone-700"
            title="デッキ・対戦設定"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. OPPONENT ZONE (Top Field) */}
      {/* ============================================================ */}
      <div
        id="opponent-zone"
        className={`h-[30%] w-full bg-stone-900/60 border rounded-xl p-1.5 flex flex-col justify-between transition-colors ${
          gameState.activePlayer === 'PLAYER_B'
            ? 'border-sky-500/60 shadow-md shadow-sky-950/40'
            : 'border-stone-800/80'
        }`}
      >
        {/* Opponent Status Row */}
        <div className="flex items-center justify-between gap-2 h-7 px-1">
          {/* Opponent Identity & Resources */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 font-bold text-xs text-sky-300">
              <div className="w-5 h-5 rounded-full bg-sky-950 border border-sky-500 flex items-center justify-center text-[10px]">
                {playerBIsAI ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
              </div>
              <span className="truncate max-w-[90px]">{pB.name}</span>
            </div>

            {/* Arcana Clickable Chip */}
            <button
              onClick={() => setArcanaModalTarget('B')}
              className="flex items-center gap-1 bg-stone-950 px-2 py-0.5 rounded-md border border-stone-800 hover:border-sky-500 text-[10px] text-stone-300"
              title="相手のアルカナ詳細を確認"
            >
              <Flame className="w-3 h-3 text-sky-400" />
              <span>アルカナ:</span>
              <strong className="text-sky-300 font-mono">{activeArcanaCountB}/{pB.arcana.length}</strong>
            </button>

            {/* Archive Clickable Chip */}
            <button
              onClick={() => setArchiveModalTarget('B')}
              className="flex items-center gap-1 bg-stone-950 px-2 py-0.5 rounded-md border border-stone-800 hover:border-sky-500 text-[10px] text-stone-300"
              title="相手の墓地（アーカイブ）を確認"
            >
              <BookOpen className="w-3 h-3 text-stone-400" />
              <span>墓地:</span>
              <strong className="text-white font-mono">{pB.archive.length}</strong>
            </button>

            <span className="text-[10px] text-stone-400 font-mono hidden sm:inline">
              デッキ:{pB.deck.length} 手札:{pB.hand.length}
            </span>
          </div>

          {/* Opponent HP (Clickable Target when attacking leader) */}
          <div
            onClick={() => {
              if (selectedAttackerInstanceId && canAttackOpponentPlayer) {
                const attackLeader = legalAttacksForSelectedAttacker.find(
                  (a) => (a.action.payload as any)?.targetUnitInstanceId === null
                );
                if (attackLeader) handleExecuteAction(attackLeader.action);
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg border transition-all ${
              selectedAttackerInstanceId && canAttackOpponentPlayer
                ? 'bg-rose-950 border-rose-500 ring-2 ring-rose-400 cursor-pointer animate-target-glow'
                : 'bg-stone-950 border-stone-800'
            }`}
            title={
              selectedAttackerInstanceId && canAttackOpponentPlayer
                ? 'タップして相手リーダーに直接攻撃！'
                : '相手HP'
            }
          >
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
            <span className="text-sm font-black font-mono text-white">{pB.hp}</span>
            <span className="text-[10px] text-stone-500">/ 20</span>
            {selectedAttackerInstanceId && canAttackOpponentPlayer && (
              <span className="text-[9px] font-black bg-rose-600 text-white px-1 rounded animate-pulse">
                攻撃可
              </span>
            )}
          </div>
        </div>

        {/* Opponent Battlefield Cards Area */}
        <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto px-2 py-0.5">
          {pB.battlefield.length === 0 ? (
            <div className="text-[11px] text-stone-600 italic">
              相手フィールドにユニットはいません
            </div>
          ) : (
            pB.battlefield.map((unit) => {
              const isAttackTarget = legalAttacksForSelectedAttacker.some(
                (a) => (a.action.payload as any)?.targetUnitInstanceId === unit.instanceId
              );

              return (
                <CardItem
                  key={unit.instanceId}
                  card={unit}
                  size="xs"
                  isInteractive={true}
                  isTargetable={isAttackTarget}
                  onInspect={onInspectCard}
                  onClick={() => {
                    if (selectedAttackerInstanceId) {
                      const att = legalAttacksForSelectedAttacker.find(
                        (a) => (a.action.payload as any)?.targetUnitInstanceId === unit.instanceId
                      );
                      if (att) {
                        handleExecuteAction(att.action);
                      }
                    } else {
                      onInspectCard(unit.baseCard);
                    }
                  }}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. CENTER BATTLE ARENA & REACTIVE PROMPT */}
      {/* ============================================================ */}
      <div className="h-10 w-full flex items-center justify-between px-3 bg-stone-950/80 border-y border-stone-800/80 shrink-0">
        {/* Guard Phase Actions prompt */}
        {gameState.phase === 'GUARD_STEP' && isHumanTurn ? (
          <div className="w-full flex items-center justify-between gap-3 animate-fade-in">
            <span className="text-xs font-black text-sky-300 flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-sky-400 animate-bounce" />
              相手の攻撃！自軍ユニットでガードしますか？
            </span>
            <div className="flex items-center gap-2">
              {guardPassAction && (
                <button
                  onClick={() => handleExecuteAction(guardPassAction.action)}
                  className="px-3 py-1 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-black text-xs border border-stone-600 shadow"
                >
                  スルー（ガードしない）
                </button>
              )}
            </div>
          </div>
        ) : gameState.phase === 'RUNE_STEP' && isHumanTurn ? (
          <div className="w-full flex items-center justify-between gap-3 animate-fade-in">
            <span className="text-xs font-black text-purple-300 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-purple-400 animate-bounce" />
              ルーン誘発確認！発動しますか？
            </span>
            <div className="flex items-center gap-2">
              {legalActions.map((leg, i) => (
                <button
                  key={i}
                  onClick={() => handleExecuteAction(leg.action)}
                  className="px-3 py-1 rounded-lg bg-purple-900 hover:bg-purple-800 text-purple-100 font-bold text-xs border border-purple-500 shadow"
                >
                  {leg.description}
                </button>
              ))}
            </div>
          </div>
        ) : gameState.phase === 'ARCANA' && isHumanTurn ? (
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-xs text-emerald-300 font-bold flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-emerald-400" />
              手札からアルカナに置くカードをタップ、またはパスしてください
            </span>
            {passAction && (
              <button
                onClick={() => handleExecuteAction(passAction.action)}
                className="px-3 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-200 border border-emerald-600 font-bold text-xs shadow"
              >
                アルカナに置かない (パス)
              </button>
            )}
          </div>
        ) : selectedHandActions.length > 0 ? (
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-xs text-amber-300 font-bold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> 選択中カードのアクション:
            </span>
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {selectedHandActions.map((act, i) => (
                <button
                  key={i}
                  onClick={() => handleExecuteAction(act.action)}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs shadow-md border border-amber-300 flex items-center gap-1"
                >
                  <span>{act.description}</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              ))}
              <button
                onClick={() => setSelectedHandInstanceId(null)}
                className="p-1 text-stone-400 hover:text-white"
                title="選択解除"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : selectedAttackerInstanceId ? (
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-xs text-rose-300 font-bold flex items-center gap-1">
              <Swords className="w-3.5 h-3.5" /> 攻撃先を選択中...
            </span>
            <button
              onClick={() => setSelectedAttackerInstanceId(null)}
              className="px-2.5 py-0.5 rounded-lg bg-stone-800 text-stone-300 text-xs font-bold hover:bg-stone-700"
            >
              攻撃キャンセル
            </button>
          </div>
        ) : (
          <div className="w-full flex items-center justify-between text-xs text-stone-400">
            <div className="flex items-center gap-2">
              <span className="text-stone-500">中央バトルフィールド</span>
              {gameState.pendingCombat && (
                <span className="text-rose-400 font-bold animate-pulse">
                  【戦闘進行中】
                </span>
              )}
            </div>
            {passAction && gameState.phase === 'ACTION' && isHumanTurn && (
              <button
                onClick={() => handleExecuteAction(passAction.action)}
                className="px-4 py-1 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-black text-xs shadow-md border border-amber-400 active:scale-95 transition-all"
              >
                ターン終了
              </button>
            )}
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. PLAYER BATTLEFIELD (My Board) */}
      {/* ============================================================ */}
      <div
        id="player-battlefield"
        className="h-[26%] w-full bg-stone-900/60 border border-stone-800/80 rounded-xl p-1.5 flex items-center justify-center gap-2 overflow-x-auto"
      >
        {pA.battlefield.length === 0 ? (
          <div className="text-[11px] text-stone-600 italic">
            あなたの場にユニットはいません（手札から召喚してください）
          </div>
        ) : (
          pA.battlefield.map((unit) => {
            const canAttack = legalActions.some(
              (a) =>
                a.action.type === 'ATTACK' &&
                (a.action.payload as any)?.attackerInstanceId === unit.instanceId
            );
            const isGuardTarget = legalActions.some(
              (a) =>
                a.action.type === 'GUARD' &&
                (a.action.payload as any)?.guardUnitInstanceId === unit.instanceId
            );
            const isSelectedAttacker = selectedAttackerInstanceId === unit.instanceId;

            return (
              <CardItem
                key={unit.instanceId}
                card={unit}
                size="xs"
                isInteractive={true}
                isSelected={isSelectedAttacker}
                isPlayable={canAttack && !selectedAttackerInstanceId}
                isGuardable={isGuardTarget}
                onInspect={onInspectCard}
                onClick={() => {
                  if (gameState.phase === 'GUARD_STEP' && isGuardTarget) {
                    const guardAct = legalActions.find(
                      (a) =>
                        a.action.type === 'GUARD' &&
                        (a.action.payload as any)?.guardUnitInstanceId === unit.instanceId
                    );
                    if (guardAct) handleExecuteAction(guardAct.action);
                  } else if (canAttack) {
                    setSelectedAttackerInstanceId(
                      isSelectedAttacker ? null : unit.instanceId
                    );
                  } else {
                    onInspectCard(unit.baseCard);
                  }
                }}
              />
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* 5. PLAYER CONTROLS & HAND (Bottom Field) */}
      {/* ============================================================ */}
      <div
        id="player-hand-zone"
        className={`h-[34%] w-full bg-stone-900/90 border rounded-xl p-1.5 flex flex-col justify-between transition-colors ${
          gameState.activePlayer === 'PLAYER_A'
            ? 'border-red-500/60 shadow-lg shadow-red-950/40'
            : 'border-stone-800'
        }`}
      >
        {/* Player Status Row */}
        <div className="flex items-center justify-between gap-2 h-7 px-1">
          {/* Player Identity & Resources */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 font-bold text-xs text-red-400">
              <div className="w-5 h-5 rounded-full bg-red-950 border border-red-500 flex items-center justify-center text-[10px]">
                {playerAIsAI ? <Bot className="w-3 h-3" /> : <User className="w-3 h-3" />}
              </div>
              <span className="truncate max-w-[90px]">{pA.name} (あなた)</span>
            </div>

            {/* Arcana Clickable Chip */}
            <button
              onClick={() => setArcanaModalTarget('A')}
              className="flex items-center gap-1 bg-stone-950 px-2 py-0.5 rounded-md border border-stone-800 hover:border-amber-500 text-[10px] text-stone-300"
              title="あなたのアルカナ詳細を確認"
            >
              <Flame className="w-3 h-3 text-amber-400" />
              <span>アルカナ:</span>
              <strong className="text-amber-300 font-mono">{activeArcanaCountA}/{pA.arcana.length}</strong>
            </button>

            {/* Archive Clickable Chip */}
            <button
              onClick={() => setArchiveModalTarget('A')}
              className="flex items-center gap-1 bg-stone-950 px-2 py-0.5 rounded-md border border-stone-800 hover:border-amber-500 text-[10px] text-stone-300"
              title="あなたの墓地（アーカイブ）を確認"
            >
              <BookOpen className="w-3 h-3 text-stone-400" />
              <span>墓地:</span>
              <strong className="text-white font-mono">{pA.archive.length}</strong>
            </button>

            <span className="text-[10px] text-stone-400 font-mono hidden sm:inline">
              デッキ:{pA.deck.length} 手札:{pA.hand.length}
            </span>
          </div>

          {/* Right: HP & End Turn Button */}
          <div className="flex items-center gap-2">
            {/* Player HP */}
            <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-0.5 rounded-lg border border-stone-800">
              <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500" />
              <span className="text-sm font-black font-mono text-white">{pA.hp}</span>
              <span className="text-[10px] text-stone-500">/ 20</span>
            </div>

            {/* Turn End Quick Button */}
            {passAction && gameState.phase === 'ACTION' && isHumanTurn && (
              <button
                onClick={() => handleExecuteAction(passAction.action)}
                className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs shadow-md border border-amber-300 active:scale-95"
              >
                ターン終了
              </button>
            )}
          </div>
        </div>

        {/* Player Interactive Hand Cards */}
        <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto px-2 py-0.5">
          {pA.hand.length === 0 ? (
            <div className="text-[11px] text-stone-600 italic">手札がありません</div>
          ) : (
            pA.hand.map((card) => {
              const isPlayable = legalActions.some(
                (a) =>
                  (a.action.payload as any)?.cardInstanceId === card.instanceId ||
                  (a.action.payload as any)?.evolveTargetInstanceId === card.instanceId
              );
              const isSelected = selectedHandInstanceId === card.instanceId;

              return (
                <CardItem
                  key={card.instanceId}
                  card={card}
                  size="xs"
                  isInteractive={true}
                  isSelected={isSelected}
                  isPlayable={isPlayable}
                  onInspect={onInspectCard}
                  onClick={() => {
                    // Tap card to select and show its available actions
                    setSelectedHandInstanceId(isSelected ? null : card.instanceId);
                  }}
                />
              );
            })
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 6. OVERLAYS & MODALS (Archive, Arcana, Logs, Settings) */}
      {/* ============================================================ */}
      {/* Archive Overlay */}
      <ArchiveOverlay
        isOpen={archiveModalTarget !== null}
        onClose={() => setArchiveModalTarget(null)}
        title={archiveModalTarget === 'A' ? `${pA.name} の墓地 (アーカイブ)` : `${pB.name} の墓地 (アーカイブ)`}
        cards={archiveModalTarget === 'A' ? pA.archive : pB.archive}
        onInspectCard={onInspectCard}
      />

      {/* Arcana Overlay */}
      <ArcanaOverlay
        isOpen={arcanaModalTarget !== null}
        onClose={() => setArcanaModalTarget(null)}
        title={arcanaModalTarget === 'A' ? `${pA.name} のアルカナ` : `${pB.name} のアルカナ`}
        arcanaCards={arcanaModalTarget === 'A' ? pA.arcana : pB.arcana}
        onInspectCard={onInspectCard}
      />

      {/* Match Log & AI Decision Overlay */}
      <GameLogOverlay
        isOpen={showLogModal}
        onClose={() => setShowLogModal(false)}
        logs={gameLogs}
        latestAIDecision={latestAIDecision}
      />

      {/* Settings Modal (Deck Selectors, Mode Switching) */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-lg p-5 shadow-2xl relative text-stone-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-400" />
                対戦設定 & デッキ変更
              </h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="p-1 text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Deck Selectors */}
            <div className="space-y-3 text-xs">
              {/* Player 1 Deck */}
              <div>
                <label className="text-stone-400 font-bold block mb-1">先攻 (Player 1) デッキ:</label>
                <div className="flex items-center gap-2">
                  <select
                    value={deckAId}
                    onChange={(e) => setDeckAId(e.target.value)}
                    className="flex-1 bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-amber-500"
                  >
                    {allAvailableDecks.map((d) => (
                      <option key={d.deckId} value={d.deckId} className="bg-stone-900">
                        {d.deckName} ({d.deckVersion})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setPlayerAIsAI(!playerAIsAI)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border ${
                      playerAIsAI
                        ? 'bg-amber-600 text-amber-100 border-amber-500'
                        : 'bg-blue-600 text-blue-100 border-blue-500'
                    }`}
                  >
                    {playerAIsAI ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    <span>{playerAIsAI ? 'AI' : '手動'}</span>
                  </button>
                </div>
              </div>

              {/* Player 2 Deck */}
              <div>
                <label className="text-stone-400 font-bold block mb-1">後攻 (Player 2) デッキ:</label>
                <div className="flex items-center gap-2">
                  <select
                    value={deckBId}
                    onChange={(e) => setDeckBId(e.target.value)}
                    className="flex-1 bg-stone-950 border border-stone-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-amber-500"
                  >
                    {allAvailableDecks.map((d) => (
                      <option key={d.deckId} value={d.deckId} className="bg-stone-900">
                        {d.deckName} ({d.deckVersion})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => setPlayerBIsAI(!playerBIsAI)}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 border ${
                      playerBIsAI
                        ? 'bg-amber-600 text-amber-100 border-amber-500'
                        : 'bg-blue-600 text-blue-100 border-blue-500'
                    }`}
                  >
                    {playerBIsAI ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    <span>{playerBIsAI ? 'AI' : '手動'}</span>
                  </button>
                </div>
              </div>

              {/* AI Engine toggle */}
              <div className="pt-2 border-t border-stone-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">AI思考エンジン</div>
                  <div className="text-[11px] text-stone-400">
                    {useGeminiForAI ? 'Gemini 3.7 (高精度な戦略思考)' : '高速Heuristic AI (ミリ秒応答)'}
                  </div>
                </div>
                <button
                  onClick={() => setUseGeminiForAI(!useGeminiForAI)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${
                    useGeminiForAI
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500'
                      : 'bg-stone-800 text-stone-300 border-stone-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>{useGeminiForAI ? 'Gemini 3.7' : 'Heuristic'}</span>
                </button>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between border-t border-stone-800 pt-3">
              <button
                onClick={() => {
                  startNewMatch();
                  setShowSettingsModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>再戦・試合リセット</span>
              </button>

              <button
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold text-xs"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
