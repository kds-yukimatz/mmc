import { createRequire } from 'node:module'
import { strict as assert } from 'node:assert'
import { writeFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || 'chrome',
  headless: true,
})
const context = await browser.newContext({
  viewport: { width: 360, height: 780 },
})
const page = await context.newPage(),
  errors = []
page.on('pageerror', (e) => errors.push(e.message))
const origin = process.env.DEV_URL || 'http://127.0.0.1:4173',
  checks = []
try {
  await page.goto(origin + '/#/abstraction')
  await page.getByRole('heading', { name: '与件を読む前の練習' }).waitFor()
  await page.getByRole('button', { name: /題意 → 果候補/ }).click()
  await page
    .getByRole('heading', {
      name: '経営統合後、従業員の意欲と継続的な就業を支える人材施策',
    })
    .waitFor()
  assert.equal(await page.getByText('MMC 模範解答').count(), 0)
  checks.push('abstract prompt hides original answer before grading')
  await page.getByLabel('棚（任意）').fill('人事')
  await page
    .getByLabel(/代表的な候補を3つ/)
    .fill('適正配置、評価報酬制度整備、定着促進')
  await page.getByRole('button', { name: '答え合わせ' }).click()
  await page.getByRole('heading', { name: '◎ 十分' }).waitFor()
  checks.push('B grading and result view')
  for (const width of [320, 360, 390, 430]) {
    await page.setViewportSize({ width, height: 780 })
    await page.waitForTimeout(80)
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth + 1,
    )
    assert.equal(overflow, false, `horizontal overflow at ${width}px`)
  }
  checks.push('responsive widths 320/360/390/430px')
  const shot = process.env.SCREENSHOT_PATH
  if (shot) await page.screenshot({ path: shot, fullPage: true })
  if (errors.length) throw new Error(errors.join('\n'))
  const report = { checks, errors, at: new Date().toISOString() }
  if (process.env.REPORT_PATH)
    writeFileSync(process.env.REPORT_PATH, JSON.stringify(report, null, 2))
  console.log(checks.map((x) => 'PASS ' + x).join('\n'))
} finally {
  await context.close()
  await browser.close()
}
