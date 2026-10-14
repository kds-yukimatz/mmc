# AI語句一致判定 実装報告

## 実装範囲

- `/training` の既存同期採点を先に表示し、任意の操作後にだけ `/v1/match` を呼ぶようにしました。AIの応答は点数を含まず、入力・登録済み語句の意味同等ペアだけです。
- 完全一致はクライアントで正規化後の1対1ペアとして固定し、残りをAI照合します。AI候補は型、index、1対1、固定一致との重複、果の3字下限、同一対象の明白な方向逆についてWorkerとクライアントの両方で検証します。AI成功時は果60・切り口25・同期採点の効果15で再計算し、失敗・未設定時は同期採点を使います。
- 結果画面に外部送信の案内、Worker共有トークンのsessionStorage入力欄、AI由来ペアの短い理由を追加しました。AI待ち中でも次へ進め、問題ID・queue index・入力snapshot・request generationで遅延応答を破棄します。未手動の正誤選択だけAI後の点数に追随します。
- 履歴には任意の `aiMatching` provenanceを表示・保存し、旧履歴やschema5を変更せず読めるようにしました。バックアップインポート時はprovenanceを検証します。
- `worker/` に認証、許可Origin CORS、8KiB入力上限、Rate Limiting binding、12秒モデルtimeout、JSON/index検証、モデル出力上限を追加しました。Qwenは思考ありで最大1536 tokenを使い、Cloudflare chat completionのcontentを扱います。reasoningのみ、非JSON、`finish_reason: length` は拒否してfallbackします。有料fallbackやトークン値は含めていません。
- `.env.production` に公開Worker URLだけを設定しました。URLは `https://mmc-ai-grading.mmc-kds-yukimatz.workers.dev` です。共有認証値はソース・設定ファイルに含めていません。

## 確認

- `npm test -- --run`: 149 tests passed.
- `npm run lint`: 0 errors。既存のAbstractionPages hook警告5件のみ。
- `npm run build`: successful。既存の大きなbundle warningあり。
- `cd worker && npm test`: 7 passed。認証/CORS、入力検証、サイズとrate limit、元index復元、完全一致のみのAI呼び出し省略、言い換え/方向逆/unknown、両Cloudflare応答形、reasoning-only/長さ上限、quota、malformed output、timeoutをモックで確認。
- Chromiumを使ったローカルブラウザ検証では、モック応答による25→85点の更新と履歴保存、手動の不正解選択維持、成功後の連続呼出抑止、次へ進んだ後の遅延応答破棄、認証失敗時のベース点保存を確認しました。これはUI経路の確認であり、モデル品質を示すものではありません。
- Qwen思考ありの小規模probeでは、13件の正例中8件を採用、5件を見逃し、明白な負例の誤採用は0件でした。保守的な参考判定として扱い、同義でも見逃す場合があるため、MMC模範解答を見て利用者が正誤を判断する案内を画面とREADMEに追加しました。
- Cloudflare Workerの最終デプロイはVersion `d459763d-ea0e-40ae-beee-997e31964bff` で成功しました。思考あり1536 token設定で公開API認証とhosted Case2023-II-Q2を実試験し、HTTP 200・4.36秒で「レンタル」↔「貸し出し」と「金銭負担軽減」↔「支払負担軽減」の2正例を採用し、「購入」は除外しました。「サービス」↔「提供サービス」は今回見逃し、3正例をすべて再現する試験は不合格でした。明白な負例は採用せず、安全寄りですが全語句の精度は保証しません。Pages公開だけ未確認です。GitHub Actionsのrepository variablesは権限不足で403のため、公開URLのみ `.env.production` から公開ビルドへ渡します。
