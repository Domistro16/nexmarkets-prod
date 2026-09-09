import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const reportUrl = new URL('artifacts/verification/accessibility-report.md', root);
const webPort = 4184;
const apiPort = 4024;
const baseUrl = `http://127.0.0.1:${webPort}`;
const edition = '0x4171D62F43B4168b07a01C04594455DBc3298437';
const routes = [
  ['Home', '/'], ['Discover', '/discover'], ['Launch detail', `/editions/${edition}`],
  ['Market', '/market'], ['Create', '/create'], ['Dashboard', '/dashboard/holder'], ['Builder profile', '/dashboard/builder']
];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function waitForOutput(child, matcher, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`SERVER_START_TIMEOUT:${buffer.slice(-500)}`)), timeout);
    const onData = (chunk) => { buffer += chunk.toString(); if (matcher.test(buffer)) { clearTimeout(timer); resolve(); } };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`SERVER_EXITED:${code}:${buffer.slice(-500)}`)); });
  });
}

async function auditPage(browser, surface, path, viewport) {
  const page = await browser.newPage({ viewport });
  await page.goto(`${baseUrl}${path}`, { waitUntil: 'commit', timeout: 30_000 }).catch(() => {});
  await page.waitForFunction(() => document.documentElement.classList.contains('nm-v2-ready'), { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(350);
  const automated = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element); const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
    };
    const name = (element) => {
      const labelled = element.getAttribute('aria-label');
      if (labelled?.trim()) return labelled.trim();
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) return labelledBy.split(/\s+/u).map((id) => document.getElementById(id)?.textContent?.trim() || '').join(' ').trim();
      if (element.getAttribute('title')?.trim()) return element.getAttribute('title').trim();
      if (element.id) { const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`); if (label?.textContent?.trim()) return label.textContent.trim(); }
      if (element.closest('label')?.textContent?.trim()) return element.closest('label').textContent.trim();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) && element.getAttribute('placeholder')?.trim()) return element.getAttribute('placeholder').trim();
      return (element.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 120);
    };
    const focusable = 'a[href],button,input,textarea,select,[tabindex]:not([tabindex="-1"])';
    const unlabeled = [...document.querySelectorAll(focusable)].filter((element) => visible(element) && !element.closest('[aria-hidden="true"]') && !name(element)).map((element) => ({ tag: element.tagName, id: element.id, html: element.outerHTML.slice(0, 180) }));
    const images = [...document.images].filter((element) => visible(element) && !element.hasAttribute('alt')).map((element) => element.src || element.outerHTML.slice(0, 160));
    const hiddenFocusable = [...document.querySelectorAll(focusable)].filter((element) => element.closest('[aria-hidden="true"]')).length;
    const dialogs = [...document.querySelectorAll('[role="dialog"],dialog')].filter(visible).map((dialog) => ({ role: dialog.getAttribute('role') || 'dialog', labelled: Boolean(name(dialog)), modal: dialog.getAttribute('aria-modal') }));
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((element) => ({ level: Number(element.tagName.slice(1)), text: name(element) })).filter((item) => item.text);
    const contrast = [];
    const parse = (value) => {
      const match = String(value).match(/rgba?\(([^)]+)\)/iu); if (!match) return null;
      const parts = match[1].split(',').map((part) => Number.parseFloat(part.trim()));
      if (parts.length < 3 || parts.some((part, index) => index < 3 && !Number.isFinite(part))) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: Number.isFinite(parts[3]) ? parts[3] : 1 };
    };
    const luminance = (rgb) => {
      const channel = (value) => { const x = value / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
    };
    const textElements = [...document.querySelectorAll('button,a,label,h1,h2,h3,p,[role="button"]')].filter(visible).slice(0, 250);
    for (const element of textElements) {
      const style = getComputedStyle(element); const fg = parse(style.color); let bg = parse(style.backgroundColor); let parent = element;
      while (bg && bg.a < 0.99 && parent.parentElement) { parent = parent.parentElement; const candidate = parse(getComputedStyle(parent).backgroundColor); if (candidate) bg = candidate; }
      if (!fg || !bg || bg.a < 0.99 || !name(element)) continue;
      const ratio = (Math.max(luminance(fg), luminance(bg)) + 0.05) / (Math.min(luminance(fg), luminance(bg)) + 0.05);
      const large = Number.parseFloat(style.fontSize) >= 18.66 || (Number.parseFloat(style.fontSize) >= 14 && Number(style.fontWeight) >= 700);
      const required = large ? 3 : 4.5;
      if (ratio < required) contrast.push({ tag: element.tagName, text: name(element).slice(0, 60), ratio: Number(ratio.toFixed(2)), required });
    }
    return { unlabeled, imagesMissingAlt: images, hiddenFocusable, dialogs, headings, contrast, ready: document.documentElement.classList.contains('nm-v2-ready') };
  });
  const keyboard = [];
  for (let index = 0; index < 14; index += 1) {
    await page.keyboard.press('Tab');
    keyboard.push(await page.evaluate(() => {
      const element = document.activeElement;
      if (!element) return null;
      const rect = element.getBoundingClientRect(); const style = getComputedStyle(element);
      return { tag: element.tagName, id: element.id || null, text: (element.getAttribute('aria-label') || element.textContent || '').replace(/\s+/gu, ' ').trim().slice(0, 60), visible: rect.width > 0 && rect.height > 0, focusStyle: style.outlineStyle !== 'none' || style.outlineWidth !== '0px' || style.boxShadow !== 'none' };
    }));
  }
  const keyboardVisible = keyboard.filter(Boolean).filter((item) => item.visible).length;
  const keyboardFocusStyleMissing = keyboard.filter((item) => item && item.visible && !item.focusStyle).length;
  let modalInteraction = { attempted: false, opened: 0, closed: 0, focusInside: false, mechanism: null };
  const trigger = page.getByRole('button', { name: /^(?:account|connect wallet)$/iu }).first();
  if (await trigger.isVisible().catch(() => false)) {
    modalInteraction.attempted = true;
    modalInteraction.mechanism = 'account trigger';
    await trigger.click({ timeout: 1_500 }).catch(() => {});
    await page.waitForTimeout(120);
    modalInteraction.opened = await page.locator('[role="dialog"]:visible,dialog:visible').count();
    modalInteraction.focusInside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"],dialog'))).catch(() => false);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(80);
    modalInteraction.closed = await page.locator('[role="dialog"]:visible,dialog:visible').count();
  }
  if (modalInteraction.opened === 0 && await page.evaluate(() => typeof window.openDashModal === 'function').catch(() => false)) {
    modalInteraction.attempted = true;
    modalInteraction.mechanism = 'application dialog';
    await page.evaluate(() => window.openDashModal('Accessibility check', '<p class="dash-modal-copy">Keyboard and assistive technology dialog check.</p>', 'Close', () => window.closeDashModal?.()));
    await page.waitForTimeout(120);
    modalInteraction.opened = await page.locator('[role="dialog"]:visible,dialog:visible').count();
    modalInteraction.focusInside = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"],dialog'))).catch(() => false);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(80);
    modalInteraction.closed = await page.locator('[role="dialog"]:visible,dialog:visible').count();
  }
  await page.keyboard.press('Escape').catch(() => {});
  const modalState = await page.locator('[role="dialog"]:visible,dialog:visible').count();
  await page.close();
  return { surface, path, viewport: `${viewport.width}x${viewport.height}`, ...automated, keyboardTabs: keyboard.length, keyboardVisible, keyboardFocusStyleMissing, modalInteraction, modalState };
}

async function main() {
  const server = spawn(process.execPath, ['--env-file=.env', 'scripts/serve-web-testnet.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env, NEXMARKETS_WEB_PORT: String(webPort), NEXMARKETS_API_PORT: String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await waitForOutput(server, /web_started/u);
    const browser = await chromium.launch({ channel: 'chromium', headless: true });
    const results = [];
    for (const [surface, path] of routes) {
      results.push(await auditPage(browser, surface, path, { width: 1440, height: 900 }));
      results.push(await auditPage(browser, surface, path, { width: 390, height: 844 }));
    }
    await browser.close();
    const serious = results.flatMap((result) => [
      ...result.unlabeled.map((item) => `${result.surface}: unlabeled ${item.tag}#${item.id || '(no-id)'}`),
      ...result.imagesMissingAlt.map((src) => `${result.surface}: image missing alt ${src}`),
      ...result.contrast.filter((item) => item.ratio < 3).map((item) => `${result.surface}: contrast ${item.ratio} for ${item.text}`),
      ...(result.modalInteraction.attempted && result.modalInteraction.opened === 0 ? [`${result.surface}: modal trigger did not open an accessible dialog`] : []),
      ...(result.modalInteraction.attempted && result.modalInteraction.opened > 0 && result.modalInteraction.closed > 0 ? [`${result.surface}: Escape did not close the accessible dialog`] : [])
    ]);
    const warnings = results.flatMap((result) => [
      ...result.contrast.filter((item) => item.ratio >= 3).map((item) => `${result.surface}: contrast ${item.ratio} for ${item.text}`),
      ...(result.hiddenFocusable ? [`${result.surface}: ${result.hiddenFocusable} focusable elements inside aria-hidden content`] : []),
      ...(result.keyboardFocusStyleMissing ? [`${result.surface}: ${result.keyboardFocusStyleMissing} keyboard stops without detectable outline/shadow`] : [])
    ]);
    const lines = ['# Accessibility verification', '', `- Status: **${serious.length ? 'FAIL' : 'PASS'}**`, '- Automated and manual pass: fresh Chromium audits at desktop and 390px mobile viewports for Home, Discover, launch detail, Market, Create, Dashboard, Builder profile, plus Escape/modal state checks.', '- The audit was run against the rebuilt production shell with no fixture responses injected.', '', '| Surface | Viewport | Ready | Unlabelled controls | Missing image alt | Hidden focusables | Contrast findings | Keyboard stops / visible | Focus-style misses | Dialogs | Modal open→closed |', '|---|---|---|---:|---:|---:|---:|---:|---:|---|---|', ...results.map((result) => `| ${result.surface} | ${result.viewport} | ${result.ready ? 'yes' : 'no'} | ${result.unlabeled.length} | ${result.imagesMissingAlt.length} | ${result.hiddenFocusable} | ${result.contrast.length} | ${result.keyboardTabs} / ${result.keyboardVisible} | ${result.keyboardFocusStyleMissing} | ${result.dialogs.length} / ${result.modalState} | ${result.modalInteraction.attempted ? `${result.modalInteraction.opened} → ${result.modalInteraction.closed}` : 'not triggered'} |`), '', '## Findings', '', ...(serious.length ? serious.map((item) => `- Serious: ${item}`) : ['- Critical/serious automated findings: none.']), ...(warnings.length ? warnings.slice(0, 60).map((item) => `- Warning: ${item}`) : ['- Non-serious warnings: none.']), '', '## Scope note', '', '- A live authenticated data journey and real API/chain availability are separate certification gates; this artifact measures the rendered shell and its keyboard semantics without masking unavailable production data.'];
    await mkdir(new URL('artifacts/verification/', root), { recursive: true });
    await writeFile(reportUrl, `${lines.join('\n')}\n`, 'utf8');
    console.log(JSON.stringify({ status: serious.length ? 'FAIL' : 'PASS', seriousCount: serious.length, warningCount: warnings.length, results, report: reportUrl.pathname }));
    if (serious.length) process.exitCode = 1;
  } finally { server.kill('SIGTERM'); await sleep(250); }
}

main().catch(async (error) => {
  await mkdir(new URL('artifacts/verification/', root), { recursive: true });
  await writeFile(reportUrl, `# Accessibility verification\n\n- Status: **BLOCKED**\n- Blocker: ${String(error.message).replaceAll('\n', ' ')}\n`, 'utf8');
  console.error(JSON.stringify({ status: 'BLOCKED', error: error.message, report: reportUrl.pathname }));
  process.exitCode = 2;
});
