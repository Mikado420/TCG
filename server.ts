import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// Lazy Google GenAI Client
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

// ==========================================
// API Routes
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    rulesVersion: '2026.1',
    cardPoolVersion: 'Ver.2.2',
  });
});

// AI Decision Endpoint (Tactical TCG Action Selection)
app.post('/api/ai/decision', async (req, res) => {
  try {
    const { visibleState, legalActions, aiPlayerId } = req.body;
    if (!visibleState || !legalActions || legalActions.length === 0) {
      return res.status(400).json({ error: 'visibleState and non-empty legalActions are required' });
    }

    const ai = getGenAI();
    if (!ai) {
      // Return flag to client to use Heuristic AI fallback
      return res.json({
        fallback: true,
        reason: 'No GEMINI_API_KEY configured on server. Used Heuristic AI.',
      });
    }

    const systemPrompt = `You are a Grandmaster TCG AI Player in a high-strategy card game (80-card pool Ver 2.2).
Your goal is to maximize your win probability by evaluating board state, tempo, card advantage, mana curves, lethal threats, and enemy triggers.

Given the current visible GameState and the list of Legal Actions (0-indexed):
1. Analyze your board vs opponent board, HP levels, active arcana mana, and threats.
2. Evaluate candidates and select the single BEST action index from the legal actions list.
3. Provide a clear tactical reasoning in Japanese.

You must respond with valid JSON adhering to this structure:
{
  "selectedIndex": number,
  "reason": "string (Japanese explanation of strategic reasoning)",
  "evaluations": [
    {
      "index": number,
      "score": number (0.0 to 10.0),
      "rationale": "string"
    }
  ]
}`;

    const prompt = `Current Game State:
${JSON.stringify(visibleState, null, 2)}

Legal Actions:
${JSON.stringify(
  legalActions.map((act: any, idx: number) => ({
    index: idx,
    description: act.description,
    category: act.category,
    cardName: act.cardName,
  })),
  null,
  2
)}

Select the optimal action index and provide reasoning.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: `${systemPrompt}\n\n${prompt}` }] },
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      return res.json({ fallback: true, reason: 'Failed to parse Gemini JSON response.' });
    }

    const selectedIndex =
      typeof parsed.selectedIndex === 'number' &&
      parsed.selectedIndex >= 0 &&
      parsed.selectedIndex < legalActions.length
        ? parsed.selectedIndex
        : 0;

    return res.json({
      fallback: false,
      selectedIndex,
      selectedAction: legalActions[selectedIndex].action,
      reason: parsed.reason || 'Gemini戦略分析による最適行動',
      evaluations: parsed.evaluations || [],
    });
  } catch (error: any) {
    console.error('Gemini Decision API Error:', error);
    return res.json({
      fallback: true,
      reason: `Gemini API Error: ${error.message || 'Unknown error'}. Fallback to Heuristic AI.`,
    });
  }
});

// AI Strategic Analysis & Commentary Endpoint
app.post('/api/ai/explain', async (req, res) => {
  try {
    const { visibleState } = req.body;
    const ai = getGenAI();
    if (!ai) {
      return res.json({
        analysis: '【戦況分析】現在の盤面は互角の攻防が続いています。アルカナの効率的な運用と相手ガードへの対処が鍵となります。',
      });
    }

    const prompt = `あなたはプロTCG解説者兼コーチです。以下の局面（プレイヤー視点）の戦況を日本語で簡潔にプロ目線で分析してください。
- 現在の優勢度（盤面、リソース、ライフ）
- 次のターンの狙い目・勝ち筋
- 警戒すべき相手の動き

GameState:
${JSON.stringify(visibleState, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
      },
    });

    res.json({ analysis: response.text });
  } catch (error: any) {
    res.json({
      analysis: '戦況分析の取得中にエラーが発生しました。盤面の有利トレードとアルカナ管理を維持してください。',
    });
  }
});

// AI Match Replay Post-Mortem Analysis
app.post('/api/ai/analyze-match', async (req, res) => {
  try {
    const { matchSummary } = req.body;
    const ai = getGenAI();
    if (!ai) {
      return res.json({
        review: '【総括】序盤のマナカーブとテンポ維持が勝敗を分けました。デッキの平均コスト配分と除去スペルの採用枚数の調整が有効です。',
      });
    }

    const prompt = `あなたはTCGのシミュレーション分析官です。以下の対戦結果サマリーを基に、勝因・敗因・デッキ調整の提案（キーカードの採用枚数など）を日本語で具体的にフィードバックしてください。

Match Data:
${JSON.stringify(matchSummary, null, 2)}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.3,
      },
    });

    res.json({ review: response.text });
  } catch (error: any) {
    res.json({
      review: '対戦レビューの生成に失敗しました。',
    });
  }
});

// ==========================================
// Vite Middleware & Server Start
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TCG Simulator Server running on http://localhost:${PORT}`);
  });
}

startServer();
