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

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('BATTLE');
  const [hasApiKey, setHasApiKey] = useState<boolean>(false);
  const [inspectedCard, setInspectedCard] = useState<CardData | null>(null);

  // Custom Decks state stored in LocalStorage
  const [customDecks, setCustomDecks] = useState<Deck[]>(() => {
    try {
      const saved = localStorage.getItem('tcg_custom_decks');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load custom decks from localStorage');
    }
    return [];
  });

  // Verification Reports & Replays
  const [historicalReports, setHistoricalReports] = useState<VerificationReport[]>([]);
  const [currentReport, setCurrentReport] = useState<VerificationReport | null>(null);
  const [replays, setReplays] = useState<GameReplay[]>([]);

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
        console.warn('Health check failed:', err);
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
      try {
        localStorage.setItem('tcg_custom_decks', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to persist deck');
      }
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
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* Top Navigation */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} hasApiKey={hasApiKey} />

      {/* Main Content Area */}
      <main className="flex-1 pb-12">
        {activeTab === 'BATTLE' && (
          <GameBoard
            onInspectCard={(c) => setInspectedCard(c)}
            customDecks={customDecks}
            hasApiKey={hasApiKey}
          />
        )}

        {activeTab === 'VERIFY' && (
          <VerificationView
            customDecks={customDecks}
            onCompleteVerification={handleCompleteVerification}
            onNavigateToAnalytics={() => setActiveTab('ANALYTICS')}
            onNavigateToReplay={() => setActiveTab('REPLAY')}
          />
        )}

        {activeTab === 'ANALYTICS' && (
          <AnalyticsView
            report={currentReport}
            historicalReports={historicalReports}
            onSelectReport={(rep) => setCurrentReport(rep)}
          />
        )}

        {activeTab === 'REPLAY' && (
          <ReplayViewer replays={replays} onInspectCard={(c) => setInspectedCard(c)} />
        )}

        {activeTab === 'DECK_BUILDER' && (
          <DeckBuilder
            onInspectCard={(c) => setInspectedCard(c)}
            onSaveCustomDeck={handleSaveCustomDeck}
            onTestDeck={handleTestDeck}
            customDecks={customDecks}
          />
        )}

        {activeTab === 'DEBUG' && <DebugView />}
      </main>

      {/* Card Detail Modal */}
      <CardDetailModal card={inspectedCard} onClose={() => setInspectedCard(null)} />
    </div>
  );
};

export default App;
