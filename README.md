# 果トレ

中小企業診断士2次試験のMMCメソッドに基づき、題意要約から「切り口」と「果キーワード」を想起する個人学習PWAです。問題・履歴・設定はすべて端末内に保存され、インターネット接続がない環境でも利用できます。

## 主な機能

- 2023〜2025年度、事例I〜IVの48問を収録
- 年度・事例・未回答・要復習・出題数による絞り込み
- タグ形式の切り口／果キーワード入力
- 表記正規化・部分一致・同義語辞書を使った100点満点の採点
- 4段階の自己評価と復習指定
- 学習履歴、端末内保存、JSONバックアップ／復元
- 制限時間、同義語判定、ダークモード
- PWA、オフライン対応、スマートフォン優先UI

## サンプル画面

| ホーム | 演習 |
| --- | --- |
| ![果トレ ホーム画面](outputs/kahotore-home-mobile.png) | ![果トレ 演習画面](outputs/kahotore-training-mobile.png) |

## セットアップ

Node.js 20以降を用意し、プロジェクト直下で次を実行します。

```bash
npm install
npm run dev
```

表示されたURLをブラウザで開きます。スマートフォンではブラウザの「ホーム画面に追加」からアプリのように起動できます。

## 確認とビルド

```bash
npm run test
npm run lint
npm run build
```

成果物は `dist/` に生成されます。ローカルで本番版を確認する場合は `npm run preview` を使います。

## GitHub Pagesへの公開

1. このフォルダーをGitHubリポジトリへpushします。
2. リポジトリの **Settings → Pages** を開き、Sourceを **GitHub Actions** にします。
3. 以下のワークフローを `.github/workflows/deploy.yml` として追加します。

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

`vite.config.ts` は相対パスでビルドする設定のため、リポジトリ名にかかわらず配信できます。履歴は各端末のIndexedDBに保存されるため、公開しても他人と共有されません。

## 問題データの更新

`public/data/kahotore_mmc_base_v1.json` を同じ構造のJSONで置き換えます。各レコードの `id` は不変にし、内容を更新した場合は `version` を上げてください。次回起動時に問題テーブルが更新され、既存の学習履歴は保持されます。

主要項目は `id`, `year`, `case`, `question_no`, `question_summary`, `model_answer`, `fruit_keywords`, `cuts`, `status`, `version` です。

## 学習履歴のバックアップ

設定画面の「履歴をエクスポート」でJSONを保存します。復元先の端末で「履歴をインポート」を選ぶと、既存履歴を残したままID単位で統合します。ブラウザのサイトデータを削除する前や端末変更前にエクスポートしてください。

## 設計

- `domain/`: 問題、回答履歴、採点結果の型
- `repositories/`: 問題取得・履歴永続化の境界
- `services/`: 正規化、同義語、採点
- `features/training/`: 演習セッションの状態
- `db/`: Dexie / IndexedDB

採点は `GradingService`、問題取得と履歴保存はRepositoryインターフェースを介します。AI意味採点やクラウド同期へ移行するときは、画面を大きく変えず実装を差し替えられます。

## 現在の採点

- 果キーワード: 60点（登録語に対する一致割合）
- 切り口: 25点（登録語に対する一致割合）
- 効果語: 15点（対象語1種類につき5点、上限15点）

入力はNFKC正規化、空白・記号除去、小文字化を行い、部分一致と同義語辞書を適用します。

## 未実装・拡張候補

- AIによる意味採点と採点理由
- SM-2等を使った間隔反復と「今日の復習」スケジュール
- 因キーワード、設問全文、複数模範解答
- 分野別の弱点分析、CSV出力
- Firebase等による暗号化された端末間同期
- 問題編集UIとデータ検証ツール

## データについて

初期データは `mmc/kahotore_mmc_base_v1.json` を使用しています。設問は全文ではなく題意要約で、模範解答はOCR・目視補正された学習用データです。
