# 果トレ 改修確認レポート

更新日: 2026-07-15

## 実装結果

- 48件すべてに設問文全文、MMC題意、各出典ページ、確認状態を追加
- JSONのsnake_caseをQuestion型のcamelCaseへ変換
- 出題画面と答え合わせ画面に設問文・MMC題意を表示
- 複数解答設問の16レコードに「今回のお題」を表示
- 字数制約を強調表示
- questionsのみを更新し、trainingResultsとsettingsを保持
- 問題JSONのPWAキャッシュをNetworkFirstへ変更

## 自動確認

- npm run test相当: 成功（6ファイル、17テスト）
- TypeScript型確認: 成功
- Vite本番ビルド: 成功（PWA service worker生成を含む）
- ESLint: エラーなし

## スマートフォン表示確認

- 390 × 844 pxで出題画面と答え合わせ画面を確認
- 設問文の文字サイズ: 16px
- 行の高さ: 30.4px
- 字数制約の強調表示: 確認済み
- 横スクロール: なし
- 複数題意／未確認表示: 自動テストで確認済み
