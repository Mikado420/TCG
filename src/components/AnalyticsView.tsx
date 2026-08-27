import React, { useState } from 'react';
import { CardUsageStats, MatchupStat, VerificationReport } from '../types/game';
import {
  BarChart3,
  TrendingUp,
  Award,
  ArrowUpDown,
  Download,
  AlertCircle,
  Sparkles,
  Shield,
  Swords,
  Flame,
  Zap,
  CheckCircle2,
} from 'lucide-react';

interface AnalyticsViewProps {
  report: VerificationReport | null;
  historicalReports: VerificationReport[];
  onSelectReport: (report: VerificationReport) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  report,
  historicalReports,
  onSelectReport,
}) => {
  const [sortField, setSortField] = useState<keyof CardUsageStats>('usageRate');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [compareReportId, setCompareReportId] = useState<string>('');

  if (!report) {
    return (
      <div className="max-w-7xl mx-auto p-8 text-center bg-stone-900 border border-stone-800 rounded-2xl">
        <BarChart3 className="w-12 h-12 text-stone-600 mx-auto mb-3" />
        <h3 className="text-base font-bold text-stone-300">検証データがまだありません</h3>
        <p className="text-xs text-stone-500 mt-1 max-w-md mx-auto">
          「AI検証シミュレーション」タブでデッキの対戦シミュレーションを実行すると、ここに詳細な勝率・カード個別統計・相性マトリクスが表示されます。
        </p>
      </div>
    );
  }

  const sortedCardStats = [...report.cardStats].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortAsc ? valA - valB : valB - valA;
    }
    return 0;
  });

  const handleSort = (field: keyof CardUsageStats) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const compareReport = historicalReports.find((r) => r.verificationId === compareReportId);

  // Export Analytics CSV
  const handleExportCSV = () => {
    let csv = 'Card ID,Card Name,Faction,Copies,Usage Rate (%),Win Rate When Used (%),Win Rate When Not Used (%)\n';
    for (const cs of report.cardStats) {
      csv += `"${cs.cardId}","${cs.cardName}","${cs.faction}",${cs.copiesInDeck},${cs.usageRate},${cs.winRateWhenUsed},${cs.winRateWhenNotUsed}\n`;
    }
    const dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `analytics_${report.targetDeck.deckName}_${report.verificationId}.csv`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div id="analytics-view" className="max-w-7xl mx-auto p-4 space-y-4 animate-fade-in">
      {/* Top Header & Report Switcher */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-white">
              デッキ分析: {report.targetDeck.deckName} ({report.targetDeck.deckVersion})
            </h2>
            <span className="bg-amber-500/20 text-amber-300 text-xs font-bold px-2 py-0.5 rounded-full border border-amber-500/40">
              {report.totalMatches.toLocaleString()} 試合完了
            </span>
          </div>
          <p className="text-xs text-stone-400">
            実施日時: {new Date(report.timestamp).toLocaleString()} / Card Pool Ver.2.2
          </p>
        </div>

        {/* Action Controls & Report Selector */}
        <div className="flex flex-wrap items-center gap-2">
          {historicalReports.length > 1 && (
            <div className="flex items-center gap-1.5 bg-stone-950 px-2.5 py-1 rounded-xl border border-stone-800 text-xs">
              <span className="text-stone-400">履歴切替:</span>
              <select
                value={report.verificationId}
                onChange={(e) => {
                  const rep = historicalReports.find((r) => r.verificationId === e.target.value);
                  if (rep) onSelectReport(rep);
                }}
                className="bg-transparent text-amber-300 font-bold focus:outline-none"
              >
                {historicalReports.map((r) => (
                  <option key={r.verificationId} value={r.verificationId} className="bg-stone-900 text-white">
                    {r.targetDeck.deckName} ({r.targetDeck.deckVersion}) - {r.overallWinRate}%
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold flex items-center gap-1.5 border border-stone-700"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV出力</span>
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Overall Win Rate */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              総合勝率 (Overall Win Rate)
            </div>
            <div className="text-3xl font-black font-mono text-amber-400 mt-1">
              {report.overallWinRate}%
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              {report.totalWins}勝 {report.totalLosses}敗 {report.totalDraws}分
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Award className="w-6 h-6" />
          </div>
        </div>

        {/* First Turn vs Second Turn */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              先攻 / 後攻 勝率
            </div>
            <div className="text-xl font-black font-mono text-white mt-1 flex items-center gap-2">
              <span className="text-emerald-400">{report.firstTurnWinRate}%</span>
              <span className="text-stone-600">/</span>
              <span className="text-sky-400">{report.secondTurnWinRate}%</span>
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              差分: {(report.firstTurnWinRate - report.secondTurnWinRate).toFixed(1)}% (
              {report.firstTurnWinRate > report.secondTurnWinRate ? '先攻有利' : '後攻有利'})
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Match Duration & HP */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              平均決着ターン数
            </div>
            <div className="text-3xl font-black font-mono text-stone-100 mt-1">
              {report.avgTurns} <span className="text-sm font-normal text-stone-500">ターン</span>
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              平均残存ライフ: {report.avgFinalHp} HP
            </div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Shield className="w-6 h-6" />
          </div>
        </div>

        {/* Streaks */}
        <div className="bg-stone-900/80 border border-stone-800 rounded-2xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-stone-400 uppercase tracking-wider">
              最大連勝 / 最大連敗
            </div>
            <div className="text-2xl font-black font-mono text-emerald-400 mt-1">
              {report.maxWinStreak} <span className="text-xs text-stone-400">連勝</span>{' '}
              <span className="text-stone-600">/</span>{' '}
              <span className="text-rose-400">{report.maxLossStreak}</span>{' '}
              <span className="text-xs text-stone-400">連敗</span>
            </div>
            <div className="text-[11px] text-stone-500 mt-0.5">安定度指数: 良好</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Swords className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Matchup Matrix Breakdown */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg">
        <h3 className="text-sm font-black text-stone-200 mb-3 flex items-center gap-2">
          <Swords className="w-4 h-4 text-amber-400" />
          アーキタイプ別 相性マトリクス (Matchup Matrix)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {report.matchups.map((m) => (
            <div
              key={m.opponentDeckId}
              className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-stone-200 truncate">{m.opponentDeckName}</span>
                <span
                  className={`font-mono font-black text-sm ${
                    m.winRate >= 55 ? 'text-emerald-400' : m.winRate >= 45 ? 'text-amber-400' : 'text-rose-400'
                  }`}
                >
                  {m.winRate}%
                </span>
              </div>

              {/* Progress bar for matchup win rate */}
              <div className="w-full h-1.5 bg-stone-900 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    m.winRate >= 55 ? 'bg-emerald-500' : m.winRate >= 45 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${m.winRate}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-stone-500">
                <span>{m.wins}勝 {m.losses}敗</span>
                <span>先攻: {m.firstTurnWinRate}% / 後攻: {m.secondTurnWinRate}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Card Performance Table */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-black text-stone-200">採用カード個別 パフォーマンス統計</h3>
            <p className="text-[11px] text-stone-500">
              各カードの採用枚数、使用率、および「プレイした試合の勝率」と「引けなかった試合の勝率」の比較
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-stone-800 text-stone-400 font-bold uppercase text-[10px]">
                <th className="py-2.5 px-3">カード名 / 系統</th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                  onClick={() => handleSort('copiesInDeck')}
                >
                  <div className="flex items-center gap-1">
                    <span>投入数</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                  onClick={() => handleSort('usageRate')}
                >
                  <div className="flex items-center gap-1">
                    <span>使用率 (%)</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                  onClick={() => handleSort('winRateWhenUsed')}
                >
                  <div className="flex items-center gap-1">
                    <span>使用時 勝率</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th
                  className="py-2.5 px-3 cursor-pointer hover:text-white"
                  onClick={() => handleSort('winRateWhenNotUsed')}
                >
                  <div className="flex items-center gap-1">
                    <span>非使用時 勝率</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-2.5 px-3">貢献度 (Delta)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 font-mono">
              {sortedCardStats.map((card) => {
                const delta = parseFloat((card.winRateWhenUsed - card.winRateWhenNotUsed).toFixed(1));
                const isPositive = delta > 0;

                return (
                  <tr key={card.cardId} className="hover:bg-stone-950/60 transition-colors">
                    <td className="py-2.5 px-3 font-sans">
                      <div className="font-bold text-stone-200">{card.cardName}</div>
                      <div className="text-[10px] text-stone-500 font-mono">
                        {card.cardId} • {card.faction}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-amber-300 font-bold">{card.copiesInDeck} 枚</td>
                    <td className="py-2.5 px-3 text-stone-300">{card.usageRate}%</td>
                    <td className="py-2.5 px-3 text-emerald-400 font-bold">{card.winRateWhenUsed}%</td>
                    <td className="py-2.5 px-3 text-stone-400">{card.winRateWhenNotUsed}%</td>
                    <td className="py-2.5 px-3 font-bold">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] ${
                          isPositive
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {isPositive ? `+${delta}%` : `${delta}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Version Comparison Section */}
      {historicalReports.length > 1 && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-stone-200 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              デッキバージョン比較 (A/B Test Comparison)
            </h3>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-400">比較対象:</span>
              <select
                value={compareReportId}
                onChange={(e) => setCompareReportId(e.target.value)}
                className="bg-stone-950 border border-stone-700 rounded-lg px-2.5 py-1 text-white font-bold"
              >
                <option value="">比較するバージョンを選択...</option>
                {historicalReports
                  .filter((r) => r.verificationId !== report.verificationId)
                  .map((r) => (
                    <option key={r.verificationId} value={r.verificationId}>
                      {r.targetDeck.deckName} ({r.targetDeck.deckVersion}) - {r.overallWinRate}%
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {compareReport && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-stone-950 rounded-xl border border-stone-800 text-xs">
              <div className="text-center">
                <div className="text-stone-400 font-bold">{report.targetDeck.deckName} ({report.targetDeck.deckVersion})</div>
                <div className="text-2xl font-black font-mono text-amber-400 mt-1">
                  {report.overallWinRate}%
                </div>
              </div>

              <div className="text-center flex flex-col justify-center items-center border-x border-stone-800">
                <div className="text-[10px] text-stone-500 font-bold uppercase">勝率差分</div>
                <div
                  className={`text-xl font-black font-mono mt-1 ${
                    report.overallWinRate >= compareReport.overallWinRate
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                  }`}
                >
                  {(report.overallWinRate - compareReport.overallWinRate) >= 0 ? '+' : ''}
                  {(report.overallWinRate - compareReport.overallWinRate).toFixed(1)}%
                </div>
              </div>

              <div className="text-center">
                <div className="text-stone-400 font-bold">
                  {compareReport.targetDeck.deckName} ({compareReport.targetDeck.deckVersion})
                </div>
                <div className="text-2xl font-black font-mono text-stone-400 mt-1">
                  {compareReport.overallWinRate}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
