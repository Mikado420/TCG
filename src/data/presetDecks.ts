import { Deck } from '../types/game';
import { CARD_POOL_VERSION } from './cards';

export const PRESET_DECKS: Deck[] = [
  {
    deckId: 'preset-red-aggro',
    deckName: '朱 フォウナ速攻アグロ (Red Aggro)',
    faction: 'RED',
    deckVersion: 'v2.3',
    cardPoolVersion: CARD_POOL_VERSION,
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
    description: '低コストフォウナとラピッド・ウルフの速攻で序盤から敵結界を削り、統獣王グラディオンで決着をつけるアグロデッキ。',
    cards: [
      // 40 cards total
      'A-01', 'A-01', 'A-01', 'A-01', // リトル・ボア (4)
      'A-02', 'A-02', 'A-02', 'A-02', // シルバー・ホーン (4)
      'A-03', 'A-03', 'A-03', 'A-03', // ワイルド・レオン (4)
      'A-04', 'A-04', 'A-04', 'A-04', // アストラ・ドラゴン (4)
      'A-05', 'A-05', 'A-05', 'A-05', // ラピッド・ウルフ (4)
      'A-06', 'A-06', 'A-06',         // レイジ・ガルド (3)
      'A-08', 'A-08', 'A-08',         // 弾雷兵ボレトス (3)
      'A-11', 'A-11', 'A-11',         // 統獣王グラディオン (3)
      'A-12', 'A-12', 'A-12', 'A-12', // 燃える闘志 (4)
      'A-14', 'A-14', 'A-14',         // フレア・トリガー (3)
      'A-15', 'A-15',                 // 百獣の狩場 (2)
      'N-02', 'N-02',                 // 星花妖精ルリア (2)
    ],
  },
  {
    deckId: 'preset-blue-control',
    deckName: '蒼 テンポ・バウンスコントロール (Blue Control)',
    faction: 'BLUE',
    deckVersion: 'v2.3',
    cardPoolVersion: CARD_POOL_VERSION,
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
    description: 'バウンスとドローでアドバンテージを稼ぎ、大魔導師アストラとガード不能アタッカーで敵結界を攻略するコントロールデッキ。',
    cards: [
      'B-01', 'B-01', 'B-01', 'B-01', // 静寂の魔導師エイル (4)
      'B-02', 'B-02', 'B-02', 'B-02', // 先見者オルフェ (4)
      'B-03', 'B-03', 'B-03', 'B-03', // 霧影の魔導師レイ (4)
      'B-04', 'B-04', 'B-04', 'B-04', // 星詠者セリア (4)
      'B-06', 'B-06', 'B-06', 'B-06', // 蒼雷の魔導師カイ (4)
      'B-08', 'B-08', 'B-08',         // 銀霧の魔導師ノア (3)
      'B-09', 'B-09', 'B-09',         // 静水の魔導師ルーク (3)
      'B-11', 'B-11',                 // 大魔導師アストラ (2)
      'B-12', 'B-12', 'B-12', 'B-12', // 啓示の魔術書 (4)
      'B-14', 'B-14', 'B-14',         // ヴォルテ・リターン (3)
      'B-15', 'B-15',                 // 蒼天の書庫 (2)
      'N-03', 'N-03', 'N-03',         // ルーン・ブレイク (3)
    ],
  },
  {
    deckId: 'preset-green-ramp',
    deckName: '翠 アルカナ加速ビッグランプ (Green Ramp)',
    faction: 'GREEN',
    deckVersion: 'v2.3',
    cardPoolVersion: CARD_POOL_VERSION,
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
    description: 'リーファや木漏れ日の恩恵でアルカナを急速に増やし、アルカナ7枚シナジーと大型トロール群で叩き潰すランプデッキ。',
    cards: [
      'C-01', 'C-01', 'C-01', 'C-01', // 風花妖精ミア (4)
      'C-02', 'C-02', 'C-02', 'C-02', // 星羽妖精リル (4)
      'C-03', 'C-03', 'C-03', 'C-03', // 宝花妖精ノエラ (4)
      'C-04', 'C-04', 'C-04', 'C-04', // 若葉妖精リーファ (4)
      'C-05', 'C-05', 'C-05',         // グロウ・トロール (3)
      'C-06', 'C-06', 'C-06',         // エレナ・アイビー (3)
      'C-07', 'C-07', 'C-07',         // 月光妖精リゼ (3)
      'C-09', 'C-09', 'C-09',         // グランド・トロール (3)
      'C-10', 'C-10',                 // アース・トロール (2)
      'C-11', 'C-11',                 // 精霊神セレフィア (2)
      'C-12', 'C-12', 'C-12', 'C-12', // 木漏れ日の恩恵 (4)
      'C-15', 'C-15',                 // 大樹の残響 (2)
      'N-04', 'N-04',                 // 無彩の雷光 (2)
    ],
  },
  {
    deckId: 'preset-holy-guard',
    deckName: '聖 鉄壁ガーディアンディフェンス (Holy Guard)',
    faction: 'HOLY',
    deckVersion: 'v2.3',
    cardPoolVersion: CARD_POOL_VERSION,
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
    description: '堅牢な【ガード】持ちガーディアンとレスト妨害で相手の攻撃を完封し、聖天護神アルディアスや光彩聖域で逆転する防壁デッキ。',
    cards: [
      'D-01', 'D-01', 'D-01', 'D-01', // 白壁の聖護者レオン・ヴァイス (4)
      'D-02', 'D-02', 'D-02', 'D-02', // 銀盾の聖護者アレン・クロス (4)
      'D-03', 'D-03', 'D-03', 'D-03', // 光の聖使徒セイル (4)
      'D-04', 'D-04', 'D-04', 'D-04', // 城壁の聖護者ミレイ・フォード (4)
      'D-06', 'D-06', 'D-06',         // 星詠の聖使徒ノエル (3)
      'D-07', 'D-07', 'D-07',         // 鋼壁の聖護者カイル・ローディ (3)
      'D-08', 'D-08', 'D-08', 'D-08', // セレス・アーク (4)
      'D-10', 'D-10',                 // ホワイト・アーク (2)
      'D-11', 'D-11', 'D-11',         // 聖天護神アルディアス (3)
      'D-12', 'D-12', 'D-12',         // 聖なる戒め (3)
      'D-13', 'D-13', 'D-13',         // ホーリー・フォートレス (3)
      'D-14', 'D-14', 'D-14',         // 三重聖壁 (3)
    ],
  },
  {
    deckId: 'preset-dark-reanimator',
    deckName: '冥 アーカイブ破壊＆リアニメイト (Dark Reanimator)',
    faction: 'DARK',
    deckVersion: 'v2.3',
    cardPoolVersion: CARD_POOL_VERSION,
    createdAt: '2026-03-01',
    updatedAt: '2026-03-01',
    description: 'ハンデスと除去で相手のリソースを枯渇させ、墓地肥やしから不死王ベルゼネクで何度でも蘇るリアニメイトデッキ。',
    cards: [
      'E-01', 'E-01', 'E-01', 'E-01', // 墓守の亡者ネグロ (4)
      'E-02', 'E-02', 'E-02', 'E-02', // 黒衣の亡者グリム (4)
      'E-03', 'E-03', 'E-03', 'E-03', // 夜影の亡者ネイド (4)
      'E-04', 'E-04', 'E-04', 'E-04', // 深淵の悪魔アビロト (4)
      'E-05', 'E-05', 'E-05',         // 還魂の亡者バウル (3)
      'E-06', 'E-06', 'E-06',         // 処刑の悪魔ギルテト (3)
      'E-07', 'E-07', 'E-07',         // グレイブ・ゴースト (3)
      'E-08', 'E-08',                 // 死刃の亡者デレイ (2)
      'E-10', 'E-10',                 // 冥王の悪魔ダルクト (2)
      'E-11', 'E-11', 'E-11',         // 不死王ベルゼネク (3)
      'E-12', 'E-12', 'E-12', 'E-12', // 死者の呪詛 (4)
      'E-14', 'E-14',                 // ネクロ・コール (2)
      'E-15', 'E-15',                 // 終夜の宴 (2)
    ],
  },
];

export interface DeckValidationResult {
  valid: boolean;
  isValid: boolean;
  errors: string[];
}

export function validateDeck(deck: Deck): DeckValidationResult {
  const errors: string[] = [];

  if (deck.cards.length !== 40) {
    errors.push(`デッキ枚数は40枚である必要があります（現在: ${deck.cards.length}枚）`);
  }

  const counts: Record<string, number> = {};
  for (const cardId of deck.cards) {
    counts[cardId] = (counts[cardId] || 0) + 1;
    if (counts[cardId] > 4) {
      errors.push(`カード「${cardId}」が4枚を超えています（現在: ${counts[cardId]}枚）`);
    }
  }

  const isOk = errors.length === 0;
  return {
    valid: isOk,
    isValid: isOk,
    errors,
  };
}
