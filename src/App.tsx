import React, { useState, useEffect } from 'react';
import { CardData, Deck, GameReplay, VerificationReport } from './types/game';
import { PRESET_DECKS } from './data/presetDecks';
import { Navbar, AppTab } from './components/Navbar';
import { GameBoard } from './components/GameBoard';
import { VerificationView } from './components/VerificationView';
import { AnalyticsView } from './components/AnalyticsView';
import { ReplayViewer } from './components/ReplayViewer';
import { DeckBuilder } from './components/DeckBuilder';
import { DebugView } from './components/DebugView';
import { CardDetailModal } from './components/CardDetailModal';
import { OrientationWarning } from './components/OrientationWarning';
import { pwaController, PWAState } from './pwa';
import { safeStorage } from './utils/storage';
import { Sparkles, RefreshCw, X } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('BATTLE');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [inspectedCard, setInspectedCard] = useState<CardData | null>(null);

  // PWA update notification state
  const [pwaState, setPwaState] = useState<PWAState>({
    isRegistered: false,
    hasUpdate: false,
    waitingWorker: null,
  });
  const [dismissUpdateBanner, setDismissUpdateBanner] = useState<boolean>(false);

  // Custom Decks state stored safely in LocalStorage
  const [customDecks, setCustomDecks] = useState<Deck[]>(() => {
    return safeStorage.get<Deck[]>('tcg_custom_decks', []);
  });

  // Verification Reports & Replays
  const [historicalReports, setHistoricalReports] = useState<VerificationReport[]>([]);
  const [currentReport, setCurrentReport] = useState<VerificationReport | null>(null);
  const [replays, setReplays] = useState<GameReplay[]>([]);

  // Subscribe to PWA updates
  useEffect(() => {
    const unsubscribe = pwaController.subscribe((state) => {
      setPwaState(state);
    });
    return unsubscribe;
  }, []);

  // Check backend health & API key status
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((data) => {
        if (data && data.hasApiKey) {
          setHasApiKey(true);
        }
      })
      .catch((err) => {
        // Offline / GitHub Pages fallback
        console.log('Health check skipped (running in offline/static client mode)');
      });
  }, []);

  const handleSaveCustomDeck = (deck: Deck) => {
    setCustomDecks((prev) => {
      const existingIdx = prev.findIndex((d) => d.deckId === deck.deckId || d.deckName === deck.deckName);
      let updated: Deck[];
      if (existingIdx !== -1) {
        updated = [...prev];
        updated[existingIdx] = deck;
      } else {
        updated = [deck, ...prev];
      }
      safeStorage.set('tcg_custom_decks', updated);
      return updated;
    });
    alert(`デッキ「${deck.deckName} (${deck.deckVersion})」を保存しました。`);
  };

  const handleTestDeck = (deck: Deck) => {
    handleSaveCustomDeck(deck);
    setActiveTab('VERIFY');
  };

  const handleCompleteVerification = (report: VerificationReport, newReplays: GameReplay[]) => {
    setCurrentReport(report);
    setHistoricalReports((prev) => [report, ...prev]);
    if (newReplays && newReplays.length > 0) {
      setReplays(newReplays);
    }
  };

  return (
    <div className="h-full h-[100dvh] w-full bg-stone-950 text-stone-100 flex flex-col font-sans overflow-hidden select-none">
      {/* Landscape orientation alert for portrait mobile screens */}
      <OrientationWarning />

      {/* Discreet PWA Update Banner (Never forces auto-reload during battle) */}
      {pwaState.hasUpdate && !dismissUpdateBanner && (
        <div className="w-full bg-gradient-to-r from-amber-600 to-amber-700 text-stone-950 px-3 py-1.5 flex items-center justify-between text-xs font-bold shadow-lg z-50 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-stone-950 fill-stone-950" />
            <span>新しいバージョンが利用可能です。</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => pwaController.applyUpdate()}
              className="px-3 py-0.5 rounded-full bg-stone-950 hover:bg-stone-900 text-amber-300 text-[11px] font-black flex items-center gap-1 shadow-sm active:scale-95 transition-all"
            >
              <RefreshCw className="w-3 h-3" />
              <span>今すぐ更新</span>
            </button>
            <button
              onClick={() => setDismissUpdateBanner(true)}
              className="p-1 hover:bg-amber-800 rounded-full text-stone-900 transition-colors"
              title="後で"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Top Slim Navigation (Hidden during BATTLE to maximize 100% full screen game client) */}
      {activeTab !== 'BATTLE' && (
        <Navbar activeTab={activeTab} onSelectTab={setActiveTab} hasApiKey={hasApiKey} />
      )}

      {/* Main Game Screen Viewport */}
      <main className="flex-1 h-full w-full overflow-hidden relative">
        {activeTab === 'BATTLE' && (
          <GameBoard
            onInspectCard={(c) => setInspectedCard(c)}
            onNavigateTab={setActiveTab}
            customDecks={customDecks}
            hasApiKey={hasApiKey}
          />
        )}

        {activeTab === 'VERIFY' && (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <VerificationView
              customDecks={customDecks}
              onCompleteVerification={handleCompleteVerification}
              onNavigateToAnalytics={() => setActiveTab('ANALYTICS')}
              onNavigateToReplay={() => setActiveTab('REPLAY')}
            />
          </div>
        )}

        {activeTab === 'ANALYTICS' && (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <AnalyticsView
              report={currentReport}
              historicalReports={historicalReports}
              onSelectReport={(rep) => setCurrentReport(rep)}
            />
          </div>
        )}

        {activeTab === 'REPLAY' && (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <ReplayViewer replays={replays} onInspectCard={(c) => setInspectedCard(c)} />
          </div>
        )}

        {activeTab === 'DECK_BUILDER' && (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <DeckBuilder
              onInspectCard={(c) => setInspectedCard(c)}
              onSaveCustomDeck={handleSaveCustomDeck}
              onTestDeck={handleTestDeck}
              customDecks={customDecks}
            />
          </div>
        )}

        {activeTab === 'DEBUG' && (
          <div className="h-full overflow-y-auto p-3 sm:p-4">
            <DebugView />
          </div>
        )}
      </main>

      {/* Global Card Detail Modal */}
      <CardDetailModal card={inspectedCard} onClose={() => setInspectedCard(null)} />
    </div>
  );
};

export default App;

