const { chromium } = require('playwright');

const BASE = 'http://localhost:8081';
const OUT  = '/tmp/screenshots';

// iPhone 14 Pro Max: 1284×2778 px at 3× → logical 428×926
const VP    = { width: 428, height: 926 };
const SCALE = 3;

const USERNAME = 'screenshotuser';
const PASSWORD = 'Screenshot123!';

const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function settle(page, ms = 2000) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await wait(ms);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: SCALE,
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();

  // ── 1. LOGIN SCREEN ──────────────────────────────────────────
  await page.goto(BASE);
  await settle(page, 2500);
  await page.screenshot({ path: `${OUT}/01_login.png` });
  console.log('✓ 01_login.png');

  // ── 2. REGISTER SCREEN ───────────────────────────────────────
  // Click "Sign Up" link
  await page.getByText('Sign Up').click();
  await settle(page, 1200);
  await page.screenshot({ path: `${OUT}/02_register.png` });
  console.log('✓ 02_register.png');

  // Navigate back to login and log in
  await page.getByText('Sign In').first().click().catch(() => page.goto(BASE));
  await settle(page, 1200);

  const userInput = page.getByPlaceholder('Username');
  const passInput = page.getByPlaceholder('Password');
  await userInput.fill(USERNAME);
  await passInput.fill(PASSWORD);

  // ── 3. LOGIN SCREEN WITH FILLED FORM ─────────────────────────
  await page.screenshot({ path: `${OUT}/03_login_filled.png` });
  console.log('✓ 03_login_filled.png');

  await page.getByText('Sign In').last().click();
  await settle(page, 3000);

  // ── 4. QUESTS LIST ───────────────────────────────────────────
  await page.screenshot({ path: `${OUT}/04_quests.png` });
  console.log('✓ 04_quests.png');

  // ── 5. QUEST DETAIL ──────────────────────────────────────────
  // Click first quest card
  const cards = page.locator('[data-testid="quest-card"]');
  const count = await cards.count();
  if (count > 0) {
    await cards.first().click();
  } else {
    // Fallback: click any pressable element that looks like a card
    await page.locator('div').filter({ hasText: 'Morning Routine' }).first().click().catch(() => {});
  }
  await settle(page, 1500);
  await page.screenshot({ path: `${OUT}/05_quest_detail.png` });
  console.log('✓ 05_quest_detail.png');

  // ── 6. QUEST DETAIL SCROLLED ─────────────────────────────────
  await page.evaluate(() => { const el = document.querySelector('html'); if(el) el.scrollTop = 400; });
  await page.evaluate(() => { document.querySelectorAll('*').forEach(el => { if(el.scrollTop > 0) return; el.scrollTop = 400; }); });
  await wait(600);
  await page.screenshot({ path: `${OUT}/06_quest_detail_scrolled.png` });
  console.log('✓ 06_quest_detail_scrolled.png');

  // ── 7. UPLOADS TAB ───────────────────────────────────────────
  await page.goto(`${BASE}/`);
  await settle(page, 2000);
  // Click the uploads tab (cloud-upload icon)
  const uploadsTab = page.getByText('Uploads').first();
  await uploadsTab.click().catch(async () => {
    await page.goto(`${BASE}/(tabs)/uploads`);
  });
  await settle(page, 1500);
  await page.screenshot({ path: `${OUT}/07_uploads.png` });
  console.log('✓ 07_uploads.png');

  // ── 8. RECORDINGS TAB ────────────────────────────────────────
  const recordingsTab = page.getByText('Recordings').first();
  await recordingsTab.click().catch(async () => {
    await page.goto(`${BASE}/(tabs)/recordings`);
  });
  await settle(page, 1500);
  await page.screenshot({ path: `${OUT}/08_recordings.png` });
  console.log('✓ 08_recordings.png');

  // ── 9. ACCOUNT SCREEN ────────────────────────────────────────
  const accountTab = page.getByText('Account').first();
  await accountTab.click().catch(async () => {
    await page.goto(`${BASE}/(tabs)/account`);
  });
  await settle(page, 1500);
  await page.screenshot({ path: `${OUT}/09_account.png` });
  console.log('✓ 09_account.png');

  // ── 10. QUESTS with scroll ────────────────────────────────────
  const questsTab = page.getByText('Quests').first();
  await questsTab.click().catch(async () => {
    await page.goto(`${BASE}/`);
  });
  await settle(page, 1500);
  // Scroll down to reveal more quests
  await page.mouse.wheel(0, 350);
  await wait(700);
  await page.screenshot({ path: `${OUT}/10_quests_scrolled.png` });
  console.log('✓ 10_quests_scrolled.png');

  await browser.close();
  console.log('\n✅ All 10 screenshots saved to /tmp/screenshots/');
})().catch(e => { console.error(e); process.exit(1); });
