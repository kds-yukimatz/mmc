import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { strict as assert } from 'node:assert'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const content = JSON.parse(readFileSync(new URL('../public/data/kahotore_mmc_sparring_2026_v1.json', import.meta.url)))
const additional = JSON.parse(readFileSync(new URL('../public/data/kahotore_mmc_training_2026_v1.json', import.meta.url)))
const additionalMaterials = [...new Set(additional.records.map((record) => record.material_label))]
const publicCount = 51 + content.records.length + additional.records.length
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true })
const origin = process.env.DEV_URL || 'http://127.0.0.1:4173'
const checks = [], errors = []
const context = await browser.newContext({ viewport: { width: 360, height: 780 } })
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
const record = (name) => { checks.push(name); console.log('PASS ' + name) }
const ready = async () => { await page.getByRole('button', { name: '1分はじめる', exact: true }).waitFor() }

try {
  await page.goto(origin)
  await ready()
  const oldHistory = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    const result = { id: 'sparring-legacy-proof', questionId: '2025-I-Q2', answeredAt: '2026-10-01T00:00:00.000Z',
      inputCuts: ['事業戦略'], inputFruitKeywords: ['経営資源'], keywordScore: 60, cutScore: 25, effectScore: 0,
      totalScore: 85, selfRating: 2, needsReview: false }
    await db.trainingResults.put(result)
    const question = await db.questions.get('2025-I-Q2')
    await db.questions.put({ ...question, id: 'private-sparring-proof', privateImport: true, answerStatus: 'unverified' })
    return result
  })
  await page.reload()
  await ready()
  const restored = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    const questions = await db.questions.toArray()
    return { base: questions.filter((q) => !q.privateImport && q.year < 2026).length,
      sparring: questions.filter((q) => q.materialLabel === '直前スパーリング①').length,
      additional: questions.filter((q) => !q.privateImport && q.materialLabel && q.materialLabel !== '直前スパーリング①').length,
      private: await db.questions.get('private-sparring-proof'), history: await db.trainingResults.get('sparring-legacy-proof') }
  })
  assert.equal(restored.base, 51)
  assert.equal(restored.sparring, 15)
  assert.equal(restored.additional, additional.records.length)
  assert.equal(restored.private.privateImport, true)
  assert.deepEqual(restored.history, oldHistory)
  record('教材再読込後も本試51件・新規15件・私的教材・既存履歴を保持')

  await page.goto(origin + '/#/overview')
  await page.getByLabel('教材', { exact: true }).selectOption('直前スパーリング①')
  assert.equal(await page.getByLabel('年度', { exact: true }).inputValue(), '2026')
  assert.deepEqual(await page.getByLabel('事例', { exact: true }).locator('option').evaluateAll((items) => items.map((x) => x.value)), ['I', 'II', 'III'])
  for (const caseType of ['I', 'II', 'III']) {
    await page.getByLabel('事例', { exact: true }).selectOption(caseType)
    await page.locator('.overview-card').first().waitFor()
    assert.equal(await page.locator('.overview-card').count(), 5)
    const first = page.locator('.overview-card').first()
    await first.getByRole('button', { name: /果キーワード/ }).click()
    await first.getByRole('button', { name: 'MMC模範解答を見る' }).click()
    const expected = content.records.find((q) => q.case === caseType)
    assert.equal(await first.locator('.overview-model-answer > p').innerText(), expected.model_answer)
    assert.deepEqual(await first.locator('.keyword-content > ul > li').allTextContents(), expected.fruit_keywords)
  }
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 780 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false, `overview overflow at ${width}`)
  }
  await page.getByLabel('教材', { exact: true }).selectOption('本試験過去問')
  assert.equal(await page.getByLabel('年度', { exact: true }).inputValue(), '2025')
  record('教材・年度・事例の選択、全15問の一覧、果と模範解答、320～430px表示')

  for (const material of additionalMaterials) {
    await page.getByLabel('教材', { exact: true }).selectOption(material)
    assert.equal(await page.getByLabel('年度', { exact: true }).inputValue(), '2026')
    assert.deepEqual(await page.getByLabel('事例', { exact: true }).locator('option').evaluateAll((items) => items.map((item) => item.value)), ['I', 'II', 'III'])
    for (const caseType of ['I', 'II', 'III']) {
      await page.getByLabel('事例', { exact: true }).selectOption(caseType)
      const expected = additional.records.filter((record) => record.material_label === material && record.case === caseType)
      assert.equal(await page.locator('.overview-card').count(), expected.length, `${material} ${caseType}`)
      for (const card of await page.locator('.overview-card').all()) {
        const reveal = card.getByRole('button', { name: /果キーワード/ })
        const id = (await reveal.getAttribute('aria-controls')).replace('keywords-', '')
        const raw = expected.find((record) => record.id === id)
        assert.ok(raw, id)
        assert.equal(await card.locator('.question-text').textContent(), raw.question_text, id)
        await reveal.click()
        await card.getByRole('button', { name: 'MMC模範解答を見る' }).click()
        assert.equal(await card.locator('.overview-model-answer > p').innerText(), raw.model_answer, id)
        assert.deepEqual(await card.locator('.keyword-content > ul > li').allTextContents(), raw.fruit_keywords, id)
      }
    }
  }
  record(`追加${additionalMaterials.length}教材・27事例の全${additional.records.length}回答単位を一覧表示し、設問・果・モデルを照合`)

  await page.goto(origin + '/#/setup')
  await page.getByRole('button', { name: '直前スパーリング①', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '事例 IV', exact: true }).count(), 0)
  await page.getByRole('button', { name: '事例 III', exact: true }).click()
  await page.getByRole('button', { name: '2026年度', exact: true }).click()
  assert.equal(await page.locator('.setup-footer strong').innerText(), '5')
  await page.getByRole('button', { name: '演習を始める', exact: true }).click()
  await page.getByPlaceholder('切り口を入力').waitFor()
  const expected = content.records.find((q) => q.id === '2026-SP1-III-Q1')
  for (const cut of expected.cuts) {
    await page.getByPlaceholder('切り口を入力').fill(cut)
    await page.getByPlaceholder('切り口を入力').press('Enter')
  }
  await page.getByRole('button', { name: '因・果を考える →', exact: true }).click()
  for (const keyword of expected.fruit_keywords) {
    await page.getByPlaceholder('果キーワードを入力').fill(keyword)
    await page.getByPlaceholder('果キーワードを入力').press('Enter')
  }
  await page.getByRole('button', { name: '答え合わせ', exact: true }).click()
  await page.locator('.score-hero').waitFor()
  assert.ok(Number(await page.locator('.score > strong').innerText()) >= 85)
  assert.equal(await page.locator('.model-answer > p:not(.eyebrow)').innerText(), expected.model_answer)
  await page.getByRole('checkbox', { name: /復習対象にする/ }).check()
  await page.getByRole('button', { name: '次の問題へ', exact: true }).click()
  await page.getByPlaceholder('切り口を入力').waitFor()
  const saved = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    return { result: await db.trainingResults.where('questionId').equals('2026-SP1-III-Q1').first(),
      old: await db.trainingResults.get('sparring-legacy-proof') }
  })
  assert.equal(saved.result.keywordScore, 60)
  assert.equal(saved.result.cutScore, 25)
  assert.equal(saved.result.needsReview, true)
  assert.deepEqual(saved.old, oldHistory)
  await page.goto(origin + '/#/setup?review=1')
  await page.getByRole('button', { name: '直前スパーリング①', exact: true }).click()
  assert.equal(await page.locator('.setup-footer strong').innerText(), '1')
  record('新規問題の出題・既存採点・履歴確定・弱点復習、既存履歴の無変更')

  for (const material of additionalMaterials) {
    await page.goto(origin + '/#/setup')
    // Start this independent exercise without the preceding weak-review filter.
    await page.reload()
    await page.getByRole('button', { name: material, exact: true }).click()
    await page.getByRole('button', { name: '事例 I', exact: true }).click()
    const expectedCount = additional.records.filter((record) => record.material_label === material && record.case === 'I').length
    assert.equal(Number(await page.locator('.setup-footer strong').innerText()), expectedCount, material)
    await page.getByRole('button', { name: '演習を始める', exact: true }).click()
    await page.getByPlaceholder('切り口を入力').waitFor()
    const id = await page.evaluate(async () => {
      const { useTrainingStore } = await import('/src/features/training/trainingStore.ts')
      const state = useTrainingStore.getState()
      return state.queue[state.index].id
    })
    const raw = additional.records.find((record) => record.id === id)
    assert.equal(raw.material_label, material)
    for (const cut of raw.cuts) {
      await page.getByPlaceholder('切り口を入力').fill(cut)
      await page.getByPlaceholder('切り口を入力').press('Enter')
    }
    await page.getByRole('button', { name: '因・果を考える →', exact: true }).click()
    for (const keyword of raw.fruit_keywords) {
      await page.getByPlaceholder('果キーワードを入力').fill(keyword)
      await page.getByPlaceholder('果キーワードを入力').press('Enter')
    }
    await page.getByRole('button', { name: '答え合わせ', exact: true }).click()
    await page.locator('.score-hero').waitFor()
    assert.ok(Number(await page.locator('.score > strong').innerText()) >= 85, id)
    assert.equal(await page.locator('.model-answer > p:not(.eyebrow)').innerText(), raw.model_answer)
    await page.getByRole('button', { name: '次の問題へ', exact: true }).click()
    await page.getByPlaceholder('切り口を入力').waitFor()
    const saved = await page.evaluate(async (questionId) => {
      const { db } = await import('/src/db/indexedDb.ts')
      return db.trainingResults.where('questionId').equals(questionId).first()
    }, id)
    assert.equal(saved.keywordScore, 60, id)
    assert.equal(saved.cutScore, 25, id)
  }
  const oldAfterAdditional = await page.evaluate(async () => { const { db } = await import('/src/db/indexedDb.ts'); return db.trainingResults.get('sparring-legacy-proof') })
  assert.deepEqual(oldAfterAdditional, oldHistory)
  record(`追加${additionalMaterials.length}教材それぞれの出題・入力・既存採点・保存を確認し、既存履歴を保持`)

  await page.goto(origin + '/#/setup')
  for (const material of ['応用答練', '強化答練①']) await page.getByRole('button', { name: material, exact: true }).click()
  await page.getByRole('button', { name: '20問', exact: true }).click()
  assert.equal(Number(await page.locator('.setup-footer strong').innerText()), 20)
  await page.getByRole('button', { name: '事例 II', exact: true }).click()
  await page.getByRole('button', { name: '2026年度', exact: true }).click()
  assert.equal(Number(await page.locator('.setup-footer strong').innerText()), 11)
  await page.getByRole('button', { name: '演習を始める', exact: true }).click()
  await page.getByPlaceholder('切り口を入力').waitFor()
  const combinedIds = await page.evaluate(async () => {
    const { useTrainingStore } = await import('/src/features/training/trainingStore.ts')
    return useTrainingStore.getState().queue.map((question) => question.id).sort()
  })
  assert.deepEqual(combinedIds, additional.records.filter((record) => ['応用答練', '強化答練①'].includes(record.material_label) && record.case === 'II').map((record) => record.id).sort())
  record('教材の複数選択と年度・事例条件の組合せ')

  await page.goto(origin + '/#/dictionary')
  await page.getByLabel('教材', { exact: true }).selectOption('直前スパーリング①')
  assert.match(await page.locator('.dictionary-count').innerText(), /55語/)
  await page.getByRole('tab', { name: '頻出ランキング' }).click()
  assert.equal(await page.locator('.ranking-list > li').count(), 55)
  await page.getByLabel('教材', { exact: true }).selectOption('本試験過去問')
  assert.ok(await page.locator('.ranking-list > li').count() > 55)
  for (const material of additionalMaterials) {
    await page.getByLabel('教材', { exact: true }).selectOption(material)
    const expected = await page.evaluate(async (material) => {
      const { db } = await import('/src/db/indexedDb.ts')
      const { buildFruitKeywordRanking } = await import('/src/features/keyword-dictionary/keywordDictionary.ts')
      return buildFruitKeywordRanking((await db.questions.toArray()).filter((question) => question.materialLabel === material))
    }, material)
    assert.equal(await page.locator('.ranking-list > li').count(), expected.length, material)
  }
  record('教材別の辞典・ランキングを分離し本試頻度へ答練を加算しない')

  // Failure of a new dataset must not delete already saved public or private data.
  await context.route('**/data/kahotore_mmc_sparring_2026_v1.json', (route) => route.fulfill({ status: 503, body: 'temporarily unavailable' }))
  await page.goto(origin)
  await ready()
  assert.equal(await page.evaluate(async () => { const { db } = await import('/src/db/indexedDb.ts'); return db.questions.count() }), publicCount + 1)
  const backup = await page.evaluate(async () => { const { exportBackup } = await import('/src/features/micro/backup.ts'); return JSON.parse(await (await exportBackup()).text()) })
  assert.equal(backup.schemaVersion, 4)
  assert.deepEqual(backup.results.find((result) => result.id === oldHistory.id), oldHistory)
  assert.ok(backup.results.some((result) => result.questionId === '2026-SP1-III-Q1'))
  record('追加教材の取得失敗時に保存済み問題と履歴を維持、バックアップ出力')

  const production = await browser.newContext({ viewport: { width: 360, height: 780 } })
  try {
    const prod = await production.newPage()
    prod.on('pageerror', (error) => errors.push(error.message))
    await prod.goto((process.env.PREVIEW_URL || 'http://127.0.0.1:4174') + '/#/overview')
    await prod.getByLabel('教材', { exact: true }).waitFor()
    await prod.evaluate(async () => { await navigator.serviceWorker.ready })
    await production.setOffline(true)
    await prod.reload()
    await prod.getByLabel('教材', { exact: true }).selectOption('直前スパーリング①')
    await prod.getByLabel('事例', { exact: true }).selectOption('III')
    assert.equal(await prod.locator('.overview-card').count(), 5)
    await prod.locator('.overview-card').first().getByRole('button', { name: /果キーワード/ }).click()
    await prod.locator('.overview-card').first().getByRole('button', { name: 'MMC模範解答を見る' }).click()
    assert.equal(await prod.locator('.overview-model-answer > p').innerText(), content.records.find((record) => record.id === '2026-SP1-III-Q1').model_answer)
    for (const material of additionalMaterials) {
      await prod.getByLabel('教材', { exact: true }).selectOption(material)
      const expected = additional.records.filter((record) => record.material_label === material && record.case === 'III')
      assert.equal(await prod.locator('.overview-card').count(), expected.length, material)
      const first = prod.locator('.overview-card').first()
      const reveal = first.getByRole('button', { name: /果キーワード/ })
      const id = (await reveal.getAttribute('aria-controls')).replace('keywords-', '')
      await reveal.click()
      await first.getByRole('button', { name: 'MMC模範解答を見る' }).click()
      assert.equal(await first.locator('.overview-model-answer > p').innerText(), expected.find((record) => record.id === id).model_answer, id)
    }
    record('本番PWAを完全オフラインで再起動し、新規教材の設問・果・模範解答を表示')
  } finally {
    await production.close()
  }
  assert.deepEqual(errors, [])
  if (process.env.REPORT_PATH) writeFileSync(process.env.REPORT_PATH, JSON.stringify({ checks, errors, at: new Date().toISOString() }, null, 2))
} finally {
  await context.close()
  await browser.close()
}
