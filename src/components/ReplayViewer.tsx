import React, { useState, useEffect, useRef } from 'react';
import { CardData, GameReplay, ReplayStep } from '../types/game';
import { CardItem } from './CardItem';
import {
  RotateCcw,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Heart,
  Swords,
  Shield,
  Layers,
  Flame,
  Activity,
} from 'lucide-react';

interface ReplayViewerProps {
  replays: GameReplay[];
  onInspectCard: (card: CardData) => void;
}

export const ReplayViewer: React.FC<ReplayViewerProps> = ({ replays, onInspectCard }) => {
  const [selectedReplayIndex, setSelectedReplayIndex] = useState<number>(0);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1000); // ms per step

  const playTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeReplay = replays[selectedReplayIndex] || null;

  useEffect(() => {
    setCurrentStepIndex(0);
    setIsPlaying(false);
  }, [selectedReplayIndex]);

  // Handle Play / Pause timer
  useEffect(() => {
    if (isPlaying && activeReplay && activeReplay.steps.length > 0) {
      playTimerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev >= activeReplay.steps.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playbackSpeed);
    } else {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    }

    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, playbackSpeed, activeReplay]);

  if (!activeReplay || activeReplay.steps.length === 0) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center bg-stone-900 border border-stone-800 rounded-2xl">
        <RotateCcw className="w-12 h-12 text-stone-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-stone-300">リプレイデータがありません</h3>
        <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
          「AI検証シミュレーション」を実行すると、実際の対戦ステップとAI思考過程を記録したサンプルリプレイがここに生成されます。
        </p>
      </div>
    );
  }

  const currentStep: ReplayStep = activeReplay.steps[currentStepIndex] || activeReplay.steps[0];
  const state = currentStep.state;

  return (
    <div id="replay-viewer-view" className="max-w-7xl mx-auto p-4 space-y-4 animate-fade-in">
      {/* Top Header & Replay Selector */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-400" />
              リプレイ再生・StateDiffビューアー
            </h2>
            <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
              勝者: {activeReplay.winner === 'PLAYER_A' ? activeReplay.deckA.deckName : activeReplay.deckB.deckName}
            </span>
          </div>
          <p className="text-xs text-stone-400">
            全 {activeReplay.steps.length} ステップ / {activeReplay.totalTurns} ターン決着 / シード: {activeReplay.randomSeed}
          </p>
        </div>

        {/* Replay Match Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400">記録試合:</span>
          <select
            value={selectedReplayIndex}
            onChange={(e) => setSelectedReplayIndex(Number(e.target.value))}
            className="bg-stone-950 border border-stone-700 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
          >
            {replays.map((rep, idx) => (
              <option key={idx} value={idx} className="bg-stone-900 text-white">
                Match #{idx + 1}: {rep.deckA.deckName} vs {rep.deckB.deckName} ({rep.totalTurns}T)
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Playback Control Scrubber */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Controls: Prev, Play/Pause, Next */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentStepIndex(Math.max(0, currentStepIndex - 1))}
              disabled={currentStepIndex === 0}
              className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white disabled:opacity-30"
              title="前へ (1手戻る)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-4 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
                isPlaying ? 'bg-red-600 text-white' : 'bg-amber-500 text-stone-950 hover:bg-amber-400'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-stone-950" />}
              <span>{isPlaying ? '一時停止' : '自動再生'}</span>
            </button>

            <button
              onClick={() =>
                setCurrentStepIndex(Math.min(activeReplay.steps.length - 1, currentStepIndex + 1))
              }
              disabled={currentStepIndex >= activeReplay.steps.length - 1}
              className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-white disabled:opacity-30"
              title="次へ (1手進める)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold text-stone-300 ml-2">
              Step {currentStepIndex + 1} / {activeReplay.steps.length}
            </span>
          </div>

          {/* Speed Selector */}
          <div className="flex items-center gap-1 text-xs">
            <span className="text-stone-400 mr-1">再生速度:</span>
            {[
              { ms: 1500, label: '0.5x' },
              { ms: 800, label: '1.0x' },
              { ms: 400, label: '2.0x' },
              { ms: 150, label: '5.0x' },
            ].map((sp) => (
              <button
                key={sp.ms}
                onClick={() => setPlaybackSpeed(sp.ms)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold ${
                  playbackSpeed === sp.ms
                    ? 'bg-amber-500 text-stone-950'
                    : 'bg-stone-950 text-stone-400 hover:text-white'
                }`}
              >
                {sp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Step Slider */}
        <input
          type="range"
          min={0}
          max={activeReplay.steps.length - 1}
          value={currentStepIndex}
          onChange={(e) => setCurrentStepIndex(Number(e.target.value))}
          className="w-full accent-amber-500 cursor-pointer h-2 bg-stone-950 rounded-lg"
        />
      </div>

      {/* Main Grid: Replay Board Snapshot & Step Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Board Visualizer (8 cols) */}
        <div className="lg:col-span-8 space-y-3">
          {/* Opponent Zone */}
          <div className="bg-stone-900/80 rounded-2xl p-3 border border-stone-800">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-xs text-stone-200">
                {activeReplay.deckB.deckName} (後攻)
              </span>
              <div className="flex items-center gap-1 text-rose-400 font-mono font-bold text-sm">
                <Shield className="w-4 h-4 text-rose-500 fill-rose-500" />
                <span>結界: {state.playerB.hp} / 5</span>
              </div>
            </div>

            {/* Battlefield */}
            <div className="min-h-[120px] bg-stone-950/60 rounded-xl p-2 border border-dashed border-stone-800 flex items-center gap-2 overflow-x-auto">
              {state.playerB.battlefield.length === 0 ? (
                <div className="w-full text-center text-xs text-stone-600">場にユニットはいません</div>
              ) : (
                state.playerB.battlefield.map((u) => (
                  <CardItem key={u.instanceId} card={u} size="sm" onInspect={onInspectCard} />
                ))
              )}
            </div>
          </div>

          {/* Action Step Banner */}
          <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono font-bold">
                Turn {state.turnNumber} ({state.phase})
              </span>
              <span className="text-stone-200 font-bold">
                {currentStep.action.description || currentStep.action.type}
              </span>
            </div>

            <span className="text-stone-500 font-mono text-[11px]">
              Active: {state.activePlayer === 'PLAYER_A' ? 'Player 1' : 'Player 2'}
            </span>
          </div>

          {/* Player A Zone */}
          <div className="bg-stone-900/80 rounded-2xl p-3 border border-stone-800">
            {/* Battlefield */}
            <div className="min-h-[120px] bg-stone-950/60 rounded-xl p-2 border border-dashed border-stone-800 flex items-center gap-2 overflow-x-auto mb-2">
              {state.playerA.battlefield.length === 0 ? (
                <div className="w-full text-center text-xs text-stone-600">場にユニットはいません</div>
              ) : (
                state.playerA.battlefield.map((u) => (
                  <CardItem key={u.instanceId} card={u} size="sm" onInspect={onInspectCard} />
                ))
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-stone-200">
                {activeReplay.deckA.deckName} (先攻)
              </span>
              <div className="flex items-center gap-1 text-rose-400 font-mono font-bold text-sm">
                <Shield className="w-4 h-4 text-rose-500 fill-rose-500" />
                <span>結界: {state.playerA.hp} / 5</span>
              </div>
            </div>
          </div>
        </div>

        {/* State Diff & AI Decision Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-3">
          {/* State Diff Inspector */}
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-3 shadow-lg space-y-2">
            <span className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              State Diff (この手の状態変化)
            </span>

            <div className="space-y-1 bg-stone-950 p-2.5 rounded-xl border border-stone-800 font-mono text-xs">
              <div className="text-stone-300">
                HP差分: P1({currentStep.diff.playerA_after.hp - currentStep.diff.playerA_before.hp >= 0 ? '+' : ''}
                {currentStep.diff.playerA_after.hp - currentStep.diff.playerA_before.hp}) / P2(
                {currentStep.diff.playerB_after.hp - currentStep.diff.playerB_before.hp >= 0 ? '+' : ''}
                {currentStep.diff.playerB_after.hp - currentStep.diff.playerB_before.hp})
              </div>
              <div className="text-stone-300">
                手札差分: P1({currentStep.diff.playerA_after.handCount - currentStep.diff.playerA_before.handCount >= 0 ? '+' : ''}
                {currentStep.diff.playerA_after.handCount - currentStep.diff.playerA_before.handCount}) / P2(
                {currentStep.diff.playerB_after.handCount - currentStep.diff.playerB_before.handCount >= 0 ? '+' : ''}
                {currentStep.diff.playerB_after.handCount - currentStep.diff.playerB_before.handCount})
              </div>
              <div className="text-stone-400">
                盤面差分: P1({currentStep.diff.playerA_after.fieldCount}体) / P2({currentStep.diff.playerB_after.fieldCount}体)
              </div>
              {currentStep.diff.descriptions.length > 0 && (
                <div className="text-amber-400 text-[11px] mt-1">
                  {currentStep.diff.descriptions.join(', ')}
                </div>
              )}
            </div>
          </div>

          {/* AI Decision at Step */}
          {currentStep.aiDecision && (
            <div className="bg-stone-900 border border-stone-800 rounded-2xl p-3 shadow-lg space-y-2">
              <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                AI 思考判断ログ (Turn {currentStep.aiDecision.turn})
              </span>

              <div className="p-2.5 bg-stone-950 rounded-xl border border-stone-800 text-xs text-stone-300 leading-relaxed">
                {currentStep.aiDecision.reason}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
