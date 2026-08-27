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
import { CardItem, FACTION_THEMES } from './CardItem';
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
  Bot,
  User,
  Zap,
  Info,
  X,
  BookOpen,
  ArrowRight,
  Settings,
  Menu,
  Wrench,
  Activity,
  BarChart3,
  Bug,
  HelpCircle,
  Eye,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { AppTab } from './Navbar';

interface GameBoardProps {
  onInspectCard: (card: CardData) => void;
  onNavigateTab?: (tab: AppTab) => void;
  customDecks: Deck[];
  hasApiKey: boolean;
}

interface DragState {
  card: CardData | CardInstance;
  source: 'HAND' | 'PLAYER_UNIT' | 'GUARD_UNIT';
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  isDragging: boolean;
}

export const GameBoard: React.FC<GameBoardProps> = ({
  onInspectCard,
  onNavigateTab,
  customDecks,
  hasApiKey,
}) => {
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

  // Selection states
  const [selectedHandInstanceId, setSelectedHandInstanceId] = useState<string | null>(null);
  const [selectedAttackerInstanceId, setSelectedAttackerInstanceId] = useState<string | null>(null);

  // Drag and Drop state
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredDropZone, setHoveredDropZone] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);

  // Overlay modaled views
  const [archiveModalTarget, setArchiveModalTarget] = useState<'A' | 'B' | null>(null);
  const [arcanaModalTarget, setArcanaModalTarget] = useState<'A' | 'B' | null>(null);
  const [showLogModal, setShowLogModal] = useState<boolean>(false);
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [showMenuDrawer, setShowMenuDrawer] = useState<boolean>(false);

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
    setDragState(null);

    const actions = engine.getLegalActions(state);
    setLegalActions(actions);
  };

  useEffect(() => {
    startNewMatch();
    return () => {
      if (autoPlayTimerRef.current) clearInterval(autoPlayTimerRef.current);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
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
      setDragState(null);

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

    let isCurrentAI = gameState.activePlayer === 'PLAYER_A' ? playerAIsAI : playerBIsAI;

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

  // ==========================================
  // Pointer-based Drag & Drop Handlers
  // ==========================================
  const handlePointerDown = (
    e: React.PointerEvent,
    card: CardData | CardInstance,
    source: 'HAND' | 'PLAYER_UNIT' | 'GUARD_UNIT'
  ) => {
    if (!isHumanTurn || isProcessingStep) return;

    isLongPressTriggeredRef.current = false;
    const baseCard = 'baseCard' in card ? card.baseCard : card;

    // Start long-press timer for 450ms inspect
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      onInspectCard(baseCard);
      setDragState(null);
    }, 450);

    setDragState({
      card,
      source,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      isDragging: false,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;

    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const distSq = dx * dx + dy * dy;

    // If moved > 8px, cancel long-press and initiate active drag
    if (distSq > 64) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      setDragState((prev) =>
        prev
          ? {
              ...prev,
              currentX: e.clientX,
              currentY: e.clientY,
              isDragging: true,
            }
          : null
      );

      // Detect element under pointer
      const elem = document.elementFromPoint(e.clientX, e.clientY);
      if (elem) {
        const dropZoneElem = elem.closest('[data-dropzone]');
        if (dropZoneElem) {
          const zoneId = dropZoneElem.getAttribute('data-dropzone');
          setHoveredDropZone(zoneId);
          return;
        }
      }
      setHoveredDropZone(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!dragState) return;

    if (isLongPressTriggeredRef.current) {
      setDragState(null);
      setHoveredDropZone(null);
      return;
    }

    const { card, source, isDragging } = dragState;
    const cardInstId = 'instanceId' in card ? card.instanceId : undefined;

    if (isDragging && cardInstId) {
      // 1. Hand Card Dragged
      if (source === 'HAND') {
        // Drop on Arcana Zone in ARCANA phase
        if (
          gameState?.phase === 'ARCANA' &&
          (hoveredDropZone === 'ARCANA_ZONE' || hoveredDropZone === 'PLAYER_ARCANA')
        ) {
          const arcAction = legalActions.find(
            (a) => a.action.type === 'SET_ARCANA' && (a.action.payload as any)?.cardInstanceId === cardInstId
          );
          if (arcAction) {
            handleExecuteAction(arcAction.action);
            setDragState(null);
            setHoveredDropZone(null);
            return;
          }
        }

        // Drop on Battlefield in ACTION phase
        if (gameState?.phase === 'ACTION' && hoveredDropZone === 'PLAYER_BATTLEFIELD') {
          const playAction = legalActions.find(
            (a) =>
              (a.action.type === 'PLAY_UNIT' ||
                a.action.type === 'PLAY_SPELL' ||
                a.action.type === 'SET_RUNE' ||
                a.action.type === 'PLAY_DOMAIN') &&
              (a.action.payload as any)?.cardInstanceId === cardInstId
          );
          if (playAction) {
            handleExecuteAction(playAction.action);
            setDragState(null);
            setHoveredDropZone(null);
            return;
          }
        }

        // Drop on Base Unit for Evolution
        if (gameState?.phase === 'ACTION' && hoveredDropZone?.startsWith('UNIT_A_')) {
          const baseUnitInstId = hoveredDropZone.replace('UNIT_A_', '');
          const evolveAction = legalActions.find(
            (a) =>
              a.action.type === 'EVOLVE' &&
              (a.action.payload as any)?.cardInstanceId === cardInstId &&
              (a.action.payload as any)?.baseUnitInstanceId === baseUnitInstId
          );
          if (evolveAction) {
            handleExecuteAction(evolveAction.action);
            setDragState(null);
            setHoveredDropZone(null);
            return;
          }
        }
      }

      // 2. Unit Dragged for Attack
      if (source === 'PLAYER_UNIT') {
        // Direct Attack on Opponent Leader
        if (hoveredDropZone === 'OPPONENT_LEADER' || hoveredDropZone === 'OPPONENT_HP') {
          const leaderAttack = legalActions.find(
            (a) =>
              a.action.type === 'ATTACK' &&
              (a.action.payload as any)?.attackerInstanceId === cardInstId &&
              (a.action.payload as any)?.targetType === 'PLAYER'
          );
          if (leaderAttack) {
            handleExecuteAction(leaderAttack.action);
            setDragState(null);
            setHoveredDropZone(null);
            return;
          }
        }

        // Attack on Opponent Unit
        if (hoveredDropZone?.startsWith('UNIT_B_')) {
          const targetUnitInstId = hoveredDropZone.replace('UNIT_B_', '');
          const unitAttack = legalActions.find(
            (a) =>
              a.action.type === 'ATTACK' &&
              (a.action.payload as any)?.attackerInstanceId === cardInstId &&
              (a.action.payload as any)?.targetType === 'UNIT' &&
              (a.action.payload as any)?.targetUnitInstanceId === targetUnitInstId
          );
          if (unitAttack) {
            handleExecuteAction(unitAttack.action);
            setDragState(null);
            setHoveredDropZone(null);
            return;
          }
        }
      }

      // 3. Guard Unit Dragged in GUARD_STEP
      if (source === 'GUARD_UNIT') {
        if (hoveredDropZone === 'COMBAT_ZONE' || hoveredDropZone === 'OPPONENT_BATTLEFIELD') {
          const guardAction = legalActions.find(
            (a) =>
              a.action.type === 'GUARD' &&
              (a.action.payload as any)?.guardInstanceId === cardInstId &&
              (a.action.payload as any)?.doGuard === true
          );
          if (guardAction) {
            handleExecuteAction(guardAction.action);
            setDragState(null);
            setHoveredDropZone(null);
            return;
          }
        }
      }
    } else if (!isDragging && cardInstId) {
      // Tap / Click Handler
      if (source === 'HAND') {
        // In ARCANA phase, single tap on hand card shows direct Arcana placement action or toggles
        setSelectedHandInstanceId(selectedHandInstanceId === cardInstId ? null : cardInstId);
        setSelectedAttackerInstanceId(null);
      } else if (source === 'PLAYER_UNIT') {
        setSelectedAttackerInstanceId(selectedAttackerInstanceId === cardInstId ? null : cardInstId);
        setSelectedHandInstanceId(null);
      } else if (source === 'GUARD_UNIT') {
        const guardAction = legalActions.find(
          (a) =>
            a.action.type === 'GUARD' &&
            (a.action.payload as any)?.guardInstanceId === cardInstId &&
            (a.action.payload as any)?.doGuard === true
        );
        if (guardAction) handleExecuteAction(guardAction.action);
      }
    }

    setDragState(null);
    setHoveredDropZone(null);
  };

  if (!gameState) {
    return (
      <div className="h-full w-full flex items-center justify-center text-stone-400 bg-stone-950">
        ゲーム盤面を初期化中...
      </div>
    );
  }

  const pA = gameState.playerA;
  const pB = gameState.playerB;
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

  // Legal actions for selected hand card
  const selectedHandActions = legalActions.filter(
    (leg) =>
      selectedHandInstanceId &&
      ((leg.action.payload as any)?.cardInstanceId === selectedHandInstanceId ||
        (leg.action.payload as any)?.evolveTargetInstanceId === selectedHandInstanceId)
  );

  // Legal attacks for selected attacker
  const legalAttacksForSelectedAttacker = legalActions.filter(
    (leg) =>
      leg.action.type === 'ATTACK' &&
      (leg.action.payload as any)?.attackerInstanceId === selectedAttackerInstanceId
  );
  const canAttackOpponentPlayer = legalAttacksForSelectedAttacker.some(
    (a) => (a.action.payload as any)?.targetType === 'PLAYER'
  );

  // Pass Action (Turn End, Skip Arcana, Guard Pass, Rune Pass)
  const passAction = legalActions.find((a) => a.category === 'PASS');

  // Check if Arcana placement is currently legal for Player A
  const canPlaceArcana =
    gameState.phase === 'ARCANA' &&
    isHumanTurn &&
    legalActions.some((a) => a.action.type === 'SET_ARCANA');

  // Determine pending attacker card for combat animation
  const pendingAttackerUnit = gameState.pendingCombat
    ? engine
        .getPlayer(gameState, gameState.pendingCombat.attackerPlayerId)
        .battlefield.find((u) => u.instanceId === gameState.pendingCombat!.attackerInstanceId)
    : null;

  return (
    <div
      id="game-board-container"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => {
        setDragState(null);
        setHoveredDropZone(null);
      }}
      className="h-full w-full flex flex-col justify-between bg-stone-950 text-stone-100 overflow-hidden relative select-none"
    >
      {/* ============================================================ */}
      {/* 1. TOP OPPONENT AREA: Minimal HUD + Opponent Hand */}
      {/* ============================================================ */}
      <div className="w-full shrink-0 flex items-center justify-between px-2 pt-1 pb-0.5 border-b border-stone-800/60 bg-stone-950/80 z-20">
        {/* Left: Opponent Info Chip */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-1 bg-stone-900/90 border border-stone-700/80 px-2 py-0.5 rounded-full text-xs text-sky-300 shadow-sm">
            <div className="w-4 h-4 rounded-full bg-sky-950 border border-sky-400 flex items-center justify-center text-[9px]">
              {playerBIsAI ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
            </div>
            <span className="font-black truncate max-w-[80px] sm:max-w-[120px]">{pB.name}</span>
          </div>

          {/* Opponent HP (Targetable during attacks) */}
          <div
            data-dropzone="OPPONENT_LEADER"
            onClick={() => {
              if (selectedAttackerInstanceId && canAttackOpponentPlayer) {
                const attackLeader = legalAttacksForSelectedAttacker.find(
                  (a) => (a.action.payload as any)?.targetType === 'PLAYER'
                );
                if (attackLeader) handleExecuteAction(attackLeader.action);
              }
            }}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all ${
              selectedAttackerInstanceId && canAttackOpponentPlayer
                ? 'bg-rose-950 border-rose-500 ring-2 ring-rose-400 cursor-pointer animate-target-glow scale-105'
                : hoveredDropZone === 'OPPONENT_LEADER'
                ? 'bg-rose-900 border-rose-400 ring-4 ring-rose-400 scale-110'
                : 'bg-stone-900 border-stone-800'
            }`}
            title="相手リーダーHP"
          >
            <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
            <span className="text-xs font-black font-mono text-white">{pB.hp}</span>
            <span className="text-[9px] text-stone-500 font-mono">/20</span>
            {selectedAttackerInstanceId && canAttackOpponentPlayer && (
              <span className="text-[8px] font-black bg-rose-600 text-white px-1 rounded animate-pulse">
                攻撃可
              </span>
            )}
          </div>

          {/* Deck, Archive, Arcana Compact Badges */}
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400">
              D:{pB.deck.length}
            </span>

            <button
              onClick={() => setArchiveModalTarget('B')}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-sky-400 text-stone-300"
              title="相手の墓地 (アーカイブ)"
            >
              <BookOpen className="w-2.5 h-2.5 text-stone-400" />
              <span>{pB.archive.length}</span>
            </button>

            <button
              onClick={() => setArcanaModalTarget('B')}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-sky-400 text-sky-300 font-bold"
              title="相手のアルカナ"
            >
              <Flame className="w-2.5 h-2.5 text-sky-400" />
              <span>{activeArcanaCountB}/{pB.arcana.length}</span>
            </button>
          </div>
        </div>

        {/* Center: Opponent Stacked Hand Cards */}
        <div className="flex items-center justify-center -space-x-4 overflow-hidden max-w-[200px] sm:max-w-[280px]">
          {pB.hand.map((_, i) => (
            <div
              key={i}
              className="w-7 h-10 rounded bg-gradient-to-br from-stone-800 via-stone-900 to-stone-950 border border-stone-700 shadow-sm shrink-0 flex items-center justify-center text-[8px] text-stone-500 font-mono"
            >
              ★
            </div>
          ))}
        </div>

        {/* Right: Quick Menu & Settings Button */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsAutoPlaying(!isAutoPlaying)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 border transition-all ${
              isAutoPlaying
                ? 'bg-emerald-600 text-white border-emerald-400 animate-pulse'
                : 'bg-stone-800 text-stone-300 border-stone-700 hover:bg-stone-700'
            }`}
            title="AI自動対戦の開始/停止"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>{isAutoPlaying ? 'AUTO中' : 'AUTO'}</span>
          </button>

          <button
            id="open-game-menu-btn"
            onClick={() => setShowMenuDrawer(true)}
            className="p-1 rounded-full bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-white border border-stone-700 transition-colors"
            title="対戦メニュー"
          >
            <Menu className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. OPPONENT BATTLEFIELD (Top Half Battlefield) */}
      {/* ============================================================ */}
      <div
        data-dropzone="OPPONENT_BATTLEFIELD"
        className="flex-1 w-full flex items-center justify-center gap-2 px-3 py-1 overflow-x-auto relative z-10"
      >
        {pB.battlefield.length === 0 ? (
          <div className="text-[10px] text-stone-600 italic tracking-widest font-mono">
            OPPONENT FIELD
          </div>
        ) : (
          pB.battlefield.map((unit) => {
            const isTargetableForAttack = legalAttacksForSelectedAttacker.some(
              (a) =>
                (a.action.payload as any)?.targetType === 'UNIT' &&
                (a.action.payload as any)?.targetUnitInstanceId === unit.instanceId
            );

            return (
              <div
                key={unit.instanceId}
                data-dropzone={`UNIT_B_${unit.instanceId}`}
                className="relative shrink-0"
              >
                <CardItem
                  card={unit}
                  size="xs"
                  isInteractive={true}
                  isTargetable={isTargetableForAttack}
                  onInspect={onInspectCard}
                  onClick={() => {
                    if (selectedAttackerInstanceId && isTargetableForAttack) {
                      const attackAction = legalAttacksForSelectedAttacker.find(
                        (a) =>
                          (a.action.payload as any)?.targetType === 'UNIT' &&
                          (a.action.payload as any)?.targetUnitInstanceId === unit.instanceId
                      );
                      if (attackAction) handleExecuteAction(attackAction.action);
                    } else {
                      onInspectCard(unit.baseCard);
                    }
                  }}
                />
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. CENTER BATTLE STRIP: Minimal Turn HUD & Action Prompts */}
      {/* ============================================================ */}
      <div
        data-dropzone="COMBAT_ZONE"
        className="w-full shrink-0 flex items-center justify-between px-3 py-0.5 bg-stone-900/60 border-y border-stone-800/80 backdrop-blur-xs z-20"
      >
        {/* Left: Turn & Phase Indicator */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-black text-amber-400 font-mono tracking-wider">
            TURN {gameState.turnNumber}
          </span>
          <span
            className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${
              gameState.phase === 'ARCANA'
                ? 'bg-amber-950 text-amber-300 border-amber-500'
                : gameState.phase === 'ACTION'
                ? 'bg-sky-950 text-sky-300 border-sky-500'
                : gameState.phase === 'GUARD_STEP'
                ? 'bg-rose-950 text-rose-300 border-rose-500 animate-pulse'
                : gameState.phase === 'RUNE_STEP'
                ? 'bg-purple-950 text-purple-300 border-purple-500 animate-bounce'
                : 'bg-stone-800 text-stone-300 border-stone-600'
            }`}
          >
            {gameState.phase === 'ARCANA'
              ? 'アルカナフェイズ'
              : gameState.phase === 'ACTION'
              ? 'メイン行動'
              : gameState.phase === 'GUARD_STEP'
              ? 'ガードステップ'
              : gameState.phase === 'RUNE_STEP'
              ? 'ルーン誘発'
              : 'ドロー'}
          </span>
        </div>

        {/* Center: Dynamic Tactical Prompt */}
        <div className="flex items-center gap-1.5 text-xs">
          {gameState.phase === 'GUARD_STEP' && isHumanTurn ? (
            <span className="text-rose-300 font-bold flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-rose-400 animate-bounce" />
              相手の攻撃！ガードするユニットを選択、またはスルーしてください
            </span>
          ) : gameState.phase === 'RUNE_STEP' && isHumanTurn ? (
            <span className="text-purple-300 font-bold flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-purple-400 animate-bounce" />
              ルーン誘発！発動しますか？
            </span>
          ) : gameState.phase === 'ARCANA' && isHumanTurn ? (
            <span className="text-amber-300 font-bold flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
              手札をアルカナにドラッグ、またはカードをタップしてセットしてください
            </span>
          ) : selectedAttackerInstanceId ? (
            <span className="text-rose-300 font-bold flex items-center gap-1">
              <Swords className="w-3.5 h-3.5 text-rose-400 animate-pulse" />
              攻撃対象（相手ユニットまたはリーダーHP）を選択してください
            </span>
          ) : (
            <span className="text-stone-400 text-[11px]">
              {isHumanTurn ? 'あなたの行動番です' : '相手の行動中...'}
            </span>
          )}
        </div>

        {/* Right: Quick In-Context Actions (Skip Arcana, Pass Guard, Cancel Attack) */}
        <div className="flex items-center gap-1">
          {selectedAttackerInstanceId && (
            <button
              onClick={() => setSelectedAttackerInstanceId(null)}
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold border border-stone-600"
            >
              攻撃解除
            </button>
          )}

          {gameState.phase === 'ARCANA' && isHumanTurn && passAction && (
            <button
              onClick={() => handleExecuteAction(passAction.action)}
              className="px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 text-[10px] font-bold border border-stone-600"
            >
              アルカナスキップ
            </button>
          )}

          {gameState.phase === 'GUARD_STEP' && isHumanTurn && passAction && (
            <button
              onClick={() => handleExecuteAction(passAction.action)}
              className="px-2.5 py-0.5 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 text-[10px] font-bold border border-rose-600"
            >
              スルー（防御しない）
            </button>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. PLAYER BATTLEFIELD (Bottom Half Battlefield) */}
      {/* ============================================================ */}
      <div
        data-dropzone="PLAYER_BATTLEFIELD"
        className={`flex-1 w-full flex items-center justify-center gap-2 px-3 py-1 overflow-x-auto relative z-10 transition-colors ${
          dragState?.source === 'HAND' && gameState.phase === 'ACTION'
            ? 'bg-emerald-950/20 ring-1 ring-emerald-500/40 rounded-xl'
            : ''
        }`}
      >
        {pA.battlefield.length === 0 ? (
          <div className="text-[10px] text-stone-600 italic tracking-widest font-mono">
            {dragState?.source === 'HAND' && gameState.phase === 'ACTION'
              ? 'ここにドロップして召喚・発動'
              : 'YOUR FIELD'}
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
                (a.action.payload as any)?.guardInstanceId === unit.instanceId
            );
            const isSelectedAttacker = selectedAttackerInstanceId === unit.instanceId;

            return (
              <div
                key={unit.instanceId}
                data-dropzone={`UNIT_A_${unit.instanceId}`}
                onPointerDown={(e) =>
                  handlePointerDown(
                    e,
                    unit,
                    gameState.phase === 'GUARD_STEP' ? 'GUARD_UNIT' : 'PLAYER_UNIT'
                  )
                }
                className="relative shrink-0"
              >
                <CardItem
                  card={unit}
                  size="xs"
                  isInteractive={true}
                  isSelected={isSelectedAttacker}
                  isPlayable={canAttack && !selectedAttackerInstanceId && isHumanTurn}
                  isGuardable={isGuardTarget && isHumanTurn}
                  onInspect={onInspectCard}
                />
              </div>
            );
          })
        )}
      </div>

      {/* ============================================================ */}
      {/* 5. PLAYER HUD & FAN/OVERLAPPING HAND (Bottom Area) */}
      {/* ============================================================ */}
      <div className="w-full shrink-0 flex items-center justify-between px-2 pt-0.5 pb-1 border-t border-stone-800/60 bg-stone-950/90 relative z-30">
        {/* Left: Player Info & Arcana Drop Target */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Player Identity */}
          <div className="flex items-center gap-1 bg-stone-900/90 border border-stone-700/80 px-2 py-0.5 rounded-full text-xs text-amber-300 shadow-sm">
            <div className="w-4 h-4 rounded-full bg-amber-950 border border-amber-400 flex items-center justify-center text-[9px]">
              {playerAIsAI ? <Bot className="w-2.5 h-2.5" /> : <User className="w-2.5 h-2.5" />}
            </div>
            <span className="font-black truncate max-w-[80px] sm:max-w-[120px]">{pA.name}</span>
          </div>

          {/* Player HP */}
          <div className="flex items-center gap-1 bg-stone-900 px-2 py-0.5 rounded-full border border-stone-800">
            <Heart className="w-3 h-3 text-rose-500 fill-rose-500" />
            <span className="text-xs font-black font-mono text-white">{pA.hp}</span>
            <span className="text-[9px] text-stone-500 font-mono">/20</span>
          </div>

          {/* Deck, Archive, Arcana (ARCANA is prominent drop target during ARCANA phase) */}
          <div className="flex items-center gap-1 text-[10px] font-mono">
            <span className="px-1.5 py-0.5 rounded bg-stone-900 border border-stone-800 text-stone-400">
              D:{pA.deck.length}
            </span>

            <button
              onClick={() => setArchiveModalTarget('A')}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-amber-400 text-stone-300"
              title="あなたの墓地 (アーカイブ)"
            >
              <BookOpen className="w-2.5 h-2.5 text-stone-400" />
              <span>{pA.archive.length}</span>
            </button>

            {/* Arcana Slot & Drop Target */}
            <button
              id="player-arcana-hud"
              data-dropzone="ARCANA_ZONE"
              onClick={() => setArcanaModalTarget('A')}
              className={`flex items-center gap-0.5 px-2 py-0.5 rounded-full border font-bold transition-all ${
                canPlaceArcana
                  ? 'bg-amber-950 border-amber-400 ring-2 ring-amber-400 text-amber-200 animate-pulse-ring'
                  : hoveredDropZone === 'ARCANA_ZONE'
                  ? 'bg-amber-900 border-amber-300 ring-4 ring-amber-300 text-white scale-110'
                  : 'bg-stone-900 hover:bg-stone-800 border-stone-800 text-amber-300'
              }`}
              title="アルカナ確認 / 手札をドロップしてセット"
            >
              <Flame className="w-3 h-3 text-amber-400 fill-amber-400" />
              <span>アルカナ:</span>
              <strong className="text-white font-mono">{activeArcanaCountA}/{pA.arcana.length}</strong>
            </button>
          </div>
        </div>

        {/* Center: Fan / Overlapping Hand Cards */}
        <div className="flex-1 flex items-end justify-center px-2 pb-0.5 relative">
          <div className="flex items-end justify-center -space-x-5 sm:-space-x-7 transition-all max-w-full">
            {pA.hand.length === 0 ? (
              <div className="text-[10px] text-stone-600 italic py-4 font-mono">手札なし</div>
            ) : (
              pA.hand.map((card, index) => {
                const isPlayable = legalActions.some(
                  (a) =>
                    (a.action.payload as any)?.cardInstanceId === card.instanceId ||
                    (a.action.payload as any)?.evolveTargetInstanceId === card.instanceId
                );
                const isSelected = selectedHandInstanceId === card.instanceId;

                return (
                  <div
                    key={card.instanceId}
                    onPointerDown={(e) => handlePointerDown(e, card, 'HAND')}
                    style={{ zIndex: isSelected ? 40 : index + 1 }}
                    className={`transition-all duration-150 transform hover:-translate-y-4 hover:z-30 shrink-0 ${
                      isSelected ? '-translate-y-6 scale-105 z-40' : ''
                    }`}
                  >
                    <CardItem
                      card={card}
                      size="xs"
                      isInteractive={true}
                      isSelected={isSelected}
                      isPlayable={isPlayable && isHumanTurn}
                      onInspect={onInspectCard}
                    />

                    {/* Quick Action Bubble when Card is Tapped / Selected */}
                    {isSelected && isHumanTurn && (
                      <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-stone-900 border border-amber-400 rounded-full px-2 py-1 shadow-2xl z-50 animate-fade-in whitespace-nowrap">
                        {gameState.phase === 'ARCANA' ? (
                          <button
                            onClick={() => {
                              const arcAction = legalActions.find(
                                (a) =>
                                  a.action.type === 'SET_ARCANA' &&
                                  (a.action.payload as any)?.cardInstanceId === card.instanceId
                              );
                              if (arcAction) handleExecuteAction(arcAction.action);
                            }}
                            className="px-2 py-0.5 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-950 text-[10px] font-black flex items-center gap-1"
                          >
                            <Flame className="w-2.5 h-2.5 fill-current" />
                            <span>アルカナにセット</span>
                          </button>
                        ) : selectedHandActions.length > 0 ? (
                          selectedHandActions.map((act, i) => (
                            <button
                              key={i}
                              onClick={() => handleExecuteAction(act.action)}
                              className="px-2 py-0.5 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-950 text-[10px] font-black flex items-center gap-1"
                            >
                              <span>{act.description}</span>
                              <ArrowRight className="w-2.5 h-2.5" />
                            </button>
                          ))
                        ) : (
                          <span className="text-[10px] text-stone-400 px-1">利用可能行動なし</span>
                        )}

                        <button
                          onClick={() => onInspectCard(card.baseCard)}
                          className="px-1.5 py-0.5 rounded-full bg-stone-800 hover:bg-stone-700 text-stone-300 text-[10px] font-bold"
                          title="カード詳細"
                        >
                          詳細
                        </button>
                        <button
                          onClick={() => setSelectedHandInstanceId(null)}
                          className="p-0.5 text-stone-400 hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: End Turn Button */}
        <div className="shrink-0 pl-1">
          {passAction && gameState.phase === 'ACTION' && isHumanTurn ? (
            <button
              id="end-turn-btn"
              onClick={() => handleExecuteAction(passAction.action)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-stone-950 font-black text-xs shadow-lg shadow-amber-600/30 border border-amber-300 active:scale-95 transition-all flex items-center gap-1"
            >
              <span>ターン終了</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-stone-900 border border-stone-800 text-[10px] text-stone-500 font-mono">
              {isHumanTurn ? '待機中' : '相手ターン'}
            </div>
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 6. FLOATING DRAG GHOST PREVIEW */}
      {/* ============================================================ */}
      {dragState && dragState.isDragging && (
        <div
          style={{
            position: 'fixed',
            left: dragState.currentX - 35,
            top: dragState.currentY - 50,
            pointerEvents: 'none',
            zIndex: 9999,
          }}
          className="opacity-90 scale-105 shadow-2xl"
        >
          <CardItem card={dragState.card} size="xs" isInteractive={false} />
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. SLIM COMPACT MENU DRAWER / MODAL */}
      {/* ============================================================ */}
      {showMenuDrawer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
          onClick={() => setShowMenuDrawer(false)}
        >
          <div
            className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-md p-4 shadow-2xl relative text-stone-100 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Menu className="w-4 h-4 text-amber-400" />
                対戦メニュー
              </h3>
              <button
                onClick={() => setShowMenuDrawer(false)}
                className="p-1 text-stone-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Options */}
            <div className="space-y-2 text-xs">
              <button
                onClick={() => {
                  setShowMenuDrawer(false);
                  setShowLogModal(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-200"
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span>対戦ログ & AI思考ログ</span>
                </div>
                <span className="text-[10px] text-stone-500 font-mono">{gameLogs.length}件</span>
              </button>

              <button
                onClick={() => {
                  setShowMenuDrawer(false);
                  setShowSettingsModal(true);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-200"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-amber-400" />
                  <span>対戦設定 & デッキ変更</span>
                </div>
                <span className="text-[10px] text-stone-500">変更</span>
              </button>

              <button
                onClick={() => {
                  startNewMatch();
                  setShowMenuDrawer(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-stone-950 hover:bg-stone-800 border border-stone-800 text-amber-300"
              >
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  <span>試合をリセット (再開)</span>
                </div>
              </button>
            </div>

            {/* Mode Navigation */}
            {onNavigateTab && (
              <div className="pt-2 border-t border-stone-800">
                <div className="text-[11px] font-bold text-stone-400 mb-2">他画面へ移動 (対戦を中断):</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    onClick={() => {
                      setShowMenuDrawer(false);
                      onNavigateTab('DECK_BUILDER');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white flex items-center gap-1 text-[10px] font-bold"
                  >
                    <Wrench className="w-3 h-3 text-amber-400" />
                    <span>デッキ構築</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenuDrawer(false);
                      onNavigateTab('VERIFY');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white flex items-center gap-1 text-[10px] font-bold"
                  >
                    <Activity className="w-3 h-3 text-emerald-400" />
                    <span>AI検証</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenuDrawer(false);
                      onNavigateTab('ANALYTICS');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white flex items-center gap-1 text-[10px] font-bold"
                  >
                    <BarChart3 className="w-3 h-3 text-sky-400" />
                    <span>勝率分析</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenuDrawer(false);
                      onNavigateTab('REPLAY');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white flex items-center gap-1 text-[10px] font-bold"
                  >
                    <RotateCcw className="w-3 h-3 text-purple-400" />
                    <span>リプレイ</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowMenuDrawer(false);
                      onNavigateTab('DEBUG');
                    }}
                    className="px-2 py-1.5 rounded-lg bg-stone-950 hover:bg-stone-800 border border-stone-800 text-stone-300 hover:text-white flex items-center gap-1 text-[10px] font-bold"
                  >
                    <Bug className="w-3 h-3 text-rose-400" />
                    <span>デバッグ</span>
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setShowMenuDrawer(false)}
              className="w-full py-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white font-bold text-xs"
            >
              対戦に戻る
            </button>
          </div>
        </div>
      )}

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

      {/* Settings Modal */}
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

            <div className="space-y-3 text-xs">
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
                        : 'bg-stone-800 text-stone-300 border-stone-700'
                    }`}
                  >
                    {playerAIsAI ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    <span>{playerAIsAI ? 'AI操作' : '手動操作'}</span>
                  </button>
                </div>
              </div>

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
                        ? 'bg-sky-600 text-sky-100 border-sky-500'
                        : 'bg-stone-800 text-stone-300 border-stone-700'
                    }`}
                  >
                    {playerBIsAI ? <Bot className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
                    <span>{playerBIsAI ? 'AI操作' : '手動操作'}</span>
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-stone-800">
                <div>
                  <span className="font-bold text-stone-300 block">AI思考エンジン</span>
                  <span className="text-[10px] text-stone-500">
                    {useGeminiForAI ? 'Gemini 3.7 Flashによる推論' : '高速ルールベース評価器'}
                  </span>
                </div>
                <button
                  onClick={() => setUseGeminiForAI(!useGeminiForAI)}
                  className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 border ${
                    useGeminiForAI
                      ? 'bg-purple-900 text-purple-200 border-purple-500'
                      : 'bg-stone-800 text-stone-400 border-stone-700'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>{useGeminiForAI ? 'Gemini 3.7' : 'Heuristic'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800">
              <button
                onClick={() => {
                  startNewMatch();
                  setShowSettingsModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs"
              >
                設定を適用して再開
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
