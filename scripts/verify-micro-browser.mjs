import { createRequire } from 'node:module'
import { strict as assert } from 'node:assert'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'chrome',
  headless: true,
})
const checks = []
const record = (name) => {
  checks.push(name)
  console.log('PASS ' + name)
}
const origin = process.env.DEV_URL || 'http://127.0.0.1:4173'
const context = await browser.newContext({
  viewport: { width: 360, height: 780 },
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const enter = async (targetPage, label) => {
  await targetPage.waitForFunction(
    (label) =>
      [...document.querySelectorAll('button')].some(
        (button) => button.innerText.trim() === label && !button.disabled,
      ),
    label,
  )
  await targetPage
    .getByRole('button', { name: label, exact: true })
    .press('Enter')
}
try {
  await context.route('**/migration-probe', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><body>Migration probe</body></html>',
    }),
  )
  await page.goto(origin + '/migration-probe')
  await page.evaluate(async () => {
    const request = indexedDB.open('kahotore', 30)
    await new Promise((resolve, reject) => {
      request.onupgradeneeded = () => {
        const schemas = {
          questions: ['year', 'case', 'groupId', 'version'],
          trainingResults: [
            'questionId',
            'legacyGroupId',
            'answeredAt',
            'selfRating',
            'needsReview',
          ],
          settings: [],
          weaknessProfiles: [],
        }
        for (const [name, indices] of Object.entries(schemas)) {
          const s = request.result.createObjectStore(name, { keyPath: 'id' })
          for (const index of indices) s.createIndex(index, index)
        }
      }
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
    const db = request.result,
      tx = db.transaction(
        ['questions', 'trainingResults', 'settings', 'weaknessProfiles'],
        'readwrite',
      )
    tx.objectStore('settings').put({
      id: 'app',
      timerEnabled: false,
      timerSeconds: 180,
      synonymsEnabled: true,
      darkMode: true,
    })
    tx.objectStore('trainingResults').put({
      id: 'legacy-proof',
      questionId: '2025-I-Q1',
      answeredAt: '2026-10-01T01:00:00.000Z',
      inputCuts: [],
      inputFruitKeywords: [],
      keywordScore: 60,
      cutScore: 25,
      effectScore: 15,
      totalScore: 100,
      selfRating: 3,
      needsReview: false,
    })
    tx.objectStore('weaknessProfiles').put({
      id: 'legacy-proof',
      tags: ['私的タグ'],
    })
    tx.objectStore('questions').put({
      id: 'private-proof',
      year: 2026,
      case: 'I',
      questionNo: '1',
      groupId: 'private-proof',
      answerUnitLabel: '私的問題',
      questionText: '非公開',
      questionSummary: '非公開',
      mmcTheme: [],
      themeStatus: 'unverified',
      questionStatus: 'unverified',
      modelAnswer: '非公開',
      fruitKeywords: ['私的教材'],
      cuts: [],
      status: 'active',
      answerStatus: 'unverified',
      privateImport: true,
      version: 'private-v1',
    })
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
  await page.goto(origin)
  await page.getByRole('button', { name: '1分はじめる', exact: true }).waitFor()
  const migration = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    return {
      version: db.verno,
      history: await db.trainingResults.get('legacy-proof'),
      private: await db.questions.get('private-proof'),
      settings: await db.settings.get('app'),
      profiles: await db.weaknessProfiles.count(),
      micro: await db.microStates.count(),
    }
  })
  assert.equal(migration.version, 4)
  assert.equal(migration.history.totalScore, 100)
  assert.equal(migration.private.privateImport, true)
  assert.equal(migration.settings.darkMode, true)
  assert.equal(migration.profiles, 1)
  assert.equal(migration.micro, 0)
  record('Dexie v3→v4: 旧100点履歴・私的教材・設定・タグ保持、新習熟は未確認')
  await enter(page, '1分はじめる')
  await page.getByRole('button', { name: '答えを確認', exact: true }).waitFor()
  assert.equal(
    await page.getByText('許容する言い換え：', { exact: false }).count(),
    0,
  )
  record('初回は1タップで問題、正解と選択肢を非表示')
  const cueBefore = await page.locator('.micro-prompt').innerText()
  await page.reload()
  await page.getByRole('button', { name: '続きから', exact: true }).click()
  assert.equal(await page.locator('.micro-prompt').innerText(), cueBefore)
  assert.equal(
    await page.getByText('今回確認する果', { exact: true }).count(),
    0,
  )
  record('解答公開前のrefresh: 同じcueと非公開状態を復元')
  await enter(page, 'ヒント（2択）')
  await enter(page, '答えを確認')
  assert.equal(
    await page
      .getByRole('button', { name: 'すぐ出た', exact: true })
      .isDisabled(),
    true,
  )
  await page.reload()
  await page.getByRole('button', { name: '続きから', exact: true }).click()
  await page.getByText('今回確認する果', { exact: true }).waitFor()
  assert.equal(
    await page
      .getByRole('button', { name: 'すぐ出た', exact: true })
      .isDisabled(),
    true,
  )
  record('解答公開後・ヒントのrefresh: 解答とfast禁止を復元')
  const shown = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    return await db.microAttempts.count()
  })
  assert.equal(shown, 0)
  record('解答閲覧だけでは回答・新規枠を消費しない')
  await enter(page, '迷った・一部')
  await enter(page, 'ここで終わる')
  await page
    .getByRole('heading', { name: 'ここまででOK', exact: true })
    .waitFor()
  const count = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    return await db.microAttempts.count()
  })
  assert.equal(count, 1)
  record(
    'キーボードEnterで開始・ヒント・公開・判定・終了、未回答の2問目は記録しない',
  )
  const dbChecks = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    const repo = await import('/src/features/micro/repository.ts')
    const backup = await import('/src/features/micro/backup.ts')
    await db.transaction(
      'rw',
      [db.microAttempts, db.microStates, db.microSessions, db.microPlans],
      async () => {
        await db.microAttempts.clear()
        await db.microStates.clear()
        await db.microSessions.clear()
        await db.microPlans.clear()
      },
    )
    const [s1, s2] = await Promise.all([
      repo.startSession(),
      repo.startSession(),
    ])
    const shared = s1.id === s2.id
    const revealed = await repo.saveSession({
      ...s1,
      revealed: true,
      activeRevealMs: 1000,
      activeMs: 35000,
    })
    const [done, duplicate] = await Promise.all([
      repo.confirm(revealed, 'fast'),
      repo.confirm(revealed, 'fast'),
    ])
    const atomic =
      (await db.microAttempts.count()) === 1 &&
      (await db.microPlans.get('micro')).slotCursor === 1 &&
      done.id === duplicate.id &&
      done.ordinal === 2
    // A stale tab cannot undo ordinal or revealed state.
    const stale = await repo.saveSession({ ...s1, status: 'paused' })
    const staleSafe =
      stale.ordinal === 2 && stale.confirmedAttemptIds.length === 1
    const next = await repo.saveSession({
      ...done,
      revealed: true,
      activeRevealMs: 100,
      activeMs: 61000,
    })
    const original = db.microAttempts.add.bind(db.microAttempts)
    db.microAttempts.add = () =>
      Promise.reject(new Error('Injected storage failure'))
    let failed = false
    try {
      await repo.confirm(next, 'miss')
    } catch {
      failed = true
    }
    db.microAttempts.add = original
    const unchanged =
      (await db.microAttempts.count()) === 1 &&
      (await db.microSessions.get(next.id)).ordinal === 2
    const retry = await repo.confirm(next, 'miss')
    const timeEnd =
      retry.status === 'completed' && (await db.microAttempts.count()) === 2
    const text = await (await backup.exportBackup()).text(),
      parsed = backup.parseBackup(text)
    await backup.importBackup(text)
    await backup.importBackup(text)
    const duplicateImport = (await db.microAttempts.count()) === 2
    const changed = JSON.parse(text)
    changed.profiles[0].tags = ['衝突']
    let conflict = false
    try {
      await backup.importBackup(JSON.stringify(changed))
    } catch (e) {
      conflict = e.message.includes('内容不一致')
    }
    const invalid = JSON.parse(text)
    invalid.microAttempts[0].grade = 'wrong'
    let rejected = false
    try {
      await backup.importBackup(JSON.stringify(invalid))
    } catch {
      rejected = true
    }
    const old = {
      schemaVersion: 2,
      results: [{ ...parsed.results[0], id: 'v2-import-proof' }],
    }
    await backup.importBackup(JSON.stringify(old))
    const oldImport = Boolean(await db.trainingResults.get('v2-import-proof'))
    // Restore into empty new-mode stores without disturbing legacy/private stores.
    await db.transaction(
      'rw',
      [db.microAttempts, db.microStates, db.microSessions, db.microPlans],
      async () => {
        await db.microAttempts.clear()
        await db.microStates.clear()
        await db.microSessions.clear()
        await db.microPlans.clear()
      },
    )
    await backup.importBackup(text)
    const restored =
      (await db.microAttempts.count()) === 2 &&
      (await db.microStates.count()) === 2 &&
      Boolean(await db.questions.get('private-proof'))
    const cursorBefore = (await db.microPlans.get('micro')).slotCursor
    await repo.updatePlan({ inputMode: 'typed' })
    const preferencesSafe =
      (await db.microPlans.get('micro')).slotCursor === cursorBefore
    const typed = await repo.startSession(),
      typedReveal = await repo.saveSession({
        ...typed,
        revealed: true,
        input: ['許容語と不一致の回答'],
        activeRevealMs: 100,
      })
    const typedDone = await repo.confirm(typedReveal, 'fast')
    const capped =
      (await db.microAttempts.get(`${typed.id}:1`)).grade === 'hesitant'
    await repo.finishSession(typedDone)
    await repo.updatePlan({ inputMode: 'mental' })
    return {
      shared,
      atomic,
      staleSafe,
      failed,
      unchanged,
      timeEnd,
      duplicateImport,
      conflict,
      rejected,
      oldImport,
      restored,
      preferencesSafe,
      capped,
    }
  })
  for (const [name, success] of Object.entries(dbChecks)) {
    assert.equal(success, true, name)
    record('実DBトランザクション: ' + name)
  }
  const secondPage = await context.newPage()
  await secondPage.goto(origin)
  await secondPage
    .getByRole('button', { name: '1分はじめる', exact: true })
    .waitFor()
  const sharedSessions = await Promise.all(
    [page, secondPage].map((p) =>
      p.evaluate(async () => {
        const repo = await import('/src/features/micro/repository.ts')
        return (await repo.startSession()).id
      }),
    ),
  )
  assert.equal(sharedSessions[0], sharedSessions[1])
  const snapshotHeld = await secondPage.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts'),
      repo = await import('/src/features/micro/repository.ts')
    const s = (await repo.getData()).session,
      original = s.cardSnapshot.mapping.explanation
    repo.content.mappings.find(
      (m) => m.id === s.cardSnapshot.mapping.id,
    ).explanation = '更新された教材'
    const saved = await db.microSessions.get(s.id)
    await repo.finishSession(saved)
    return saved.cardSnapshot.mapping.explanation === original
  })
  assert.equal(snapshotHeld, true)
  await secondPage.close()
  record('実際の2タブから同時開始でactiveは1件、教材変更時も開始snapshotを保持')
  await page.goto(origin + '/#/')
  await enter(page, '1分はじめる')
  await page.getByRole('button', { name: '答えを確認', exact: true }).waitFor()
  await page.evaluate(() =>
    window.dispatchEvent(new Event('kahotore-update-ready')),
  )
  assert.equal(
    await page.getByRole('button', { name: '更新する', exact: true }).count(),
    0,
  )
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByRole('button', { name: '続きから', exact: true }).waitFor()
  const before = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    const open = (await db.microSessions.toArray()).find(
      (s) => s.status === 'paused',
    )
    return open.activeMs
  })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.getByRole('button', { name: '続きから', exact: true }).click()
  await enter(page, 'ここで終わる')
  await page.getByRole('button', { name: '更新する', exact: true }).waitFor()
  record('セット中の更新は保留し、終了後に更新操作を表示')
  const after = await page.evaluate(async () => {
    const { db } = await import('/src/db/indexedDb.ts')
    return (await db.microSessions.toArray()).sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    )[0].activeMs
  })
  assert.ok(after - before < 1000)
  record('visibilitychangeで時間停止、背景の1.2秒を加算しない')
  await context.route('**/data/kahotore_mmc_base_v2.json', (route) =>
    route.abort(),
  )
  await page.goto(origin)
  await page.getByRole('button', { name: '1分はじめる', exact: true }).waitFor()
  record('旧教材のネットワーク失敗時も有効なDB教材で起動')
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > 360),
    false,
  )
  const controls = await page
    .locator('.micro-page button')
    .evaluateAll((elements) =>
      elements.map((el) => el.getBoundingClientRect().height),
    )
  assert.ok(controls.every((h) => h >= 44))
  await page.getByRole('link', { name: '教材', exact: true }).click()
  await page
    .getByRole('link', { name: '旧ホーム・各練習', exact: true })
    .waitFor()
  await page.locator('.micro-panel select').first().selectOption('stock')
  await page
    .getByText('専門知識を活用した提案販売力', { exact: false })
    .first()
    .waitFor()
  record('教材辞典のA/B復習ストックに、新規小問化したB項目を表示')
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > 360),
    false,
  )
  await page.screenshot({
    path: process.env.SCREENSHOT_PATH || 'micro-materials-mobile.png',
    fullPage: true,
  })
  record('360px横スクロールなし・44px操作・旧練習への導線')
  const empty = await browser.newContext(),
    emptyPage = await empty.newPage()
  await empty.route('**/data/kahotore_mmc_base_v2.json', (route) =>
    route.abort(),
  )
  await emptyPage.goto(origin)
  await emptyPage
    .getByText('最初にオンラインで教材を準備してね', { exact: true })
    .waitFor()
  await empty.close()
  record('未準備でネットワーク失敗なら初回オンライン準備を案内')
  assert.deepEqual(errors, [])
  const production = await browser.newContext({
      viewport: { width: 360, height: 780 },
    }),
    prod = await production.newPage()
  await prod.goto(process.env.PREVIEW_URL || 'http://127.0.0.1:4174')
  await prod.getByRole('button', { name: '1分はじめる', exact: true }).waitFor()
  const cdp = await production.newCDPSession(prod)
  const manifest = await cdp.send('Page.getAppManifest')
  assert.equal(JSON.parse(manifest.data).display, 'standalone')
  assert.equal(JSON.parse(manifest.data).start_url, './')
  assert.equal(manifest.errors.length, 0)
  record('PWA manifest: standalone・相対start_url・エラーなし')
  await prod.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.active?.state
  })
  await production.setOffline(true)
  await prod.reload()
  await prod.getByRole('button', { name: '1分はじめる', exact: true }).click()
  // The build may already have a restored set. Continue if needed.
  if (await prod.getByRole('button', { name: '続きから', exact: true }).count())
    await prod.getByRole('button', { name: '続きから', exact: true }).click()
  await prod.getByRole('button', { name: '答えを確認', exact: true }).click()
  await prod.reload()
  await prod.getByRole('button', { name: '続きから', exact: true }).click()
  await prod.getByRole('button', { name: 'すぐ出た', exact: true }).click()
  if (
    await prod
      .getByRole('button', { name: 'ここで終わる', exact: true })
      .count()
  )
    await prod
      .getByRole('button', { name: 'ここで終わる', exact: true })
      .click()
  await prod
    .getByRole('heading', { name: 'ここまででOK', exact: true })
    .waitFor()
  record(
    '本番PWA: 初回準備後に完全オフラインで起動・開始・公開・refresh復元・確定・結果',
  )
  await production.close()
  writeFileSync(
    process.env.REPORT_PATH || 'micro-browser-verification.json',
    JSON.stringify({ checks, errors }, null, 2),
  )
} finally {
  await browser.close()
}
