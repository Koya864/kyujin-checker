# 求人チェッカー（kyujin-checker）

求人票PDFを取り込み、業界基準で条件の良い点・注意点を判定し、重要箇所に色分けマーカーを引く社内向けWebアプリ。

## セットアップ

```bash
npm install
```

`.env.local` を開き、ご自身の Anthropic APIキーを貼り付けてください：

```
ANTHROPIC_API_KEY=（ここに貼り付け）
```

> APIキーを入れると本番判定（Claude）に切り替わります。キーがなくても `MOCK_ANALYZE=1` の間はUI確認用のサンプル判定が動きます。

## 起動

```bash
npm run dev
```

ブラウザで求人票PDFをアップロード → 判定結果とマーカーが表示されます。

## 仕組み

- PDF抽出（座標付き）: `src/lib/pdf.ts`（pdf.js）
- 判定: `src/app/api/analyze/route.ts`（Claude API）
- マーカー描画: `src/components/PdfViewer.tsx`（画面オーバーレイ）／`src/lib/annotate.ts`（焼き込みPDF出力・pdf-lib）
- 業界基準ナレッジ: `src/lib/standards.json`（このファイルを編集して基準を育てる）

## 判定方式

Claudeが「判定根拠にした原文の逐語スパン」を返し、その箇所を本文中で座標特定してマーカーを塗ります（単純なキーワード一致ではありません）。
緑=好条件／黄=要確認／赤=要注意。

## 今後（次フェーズ）

- お客様ごとの希望条件マッチング（希望登録 → 求人ごとのマッチ度%、マッチ=緑/外れ=赤の連動）
- Supabaseによる判定結果・ナレッジの保存と蓄積
