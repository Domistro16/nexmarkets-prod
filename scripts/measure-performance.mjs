import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const root = new URL('../', import.meta.url);
const reportUrl = new URL('artifacts/verification/performance-report.md', root);
const webPort = 4183;
const apiPort = 4023;
const baseUrl = `http://127.0.0.1:${webPort}`;
const certificationEdition = '0x4171D62F43B4168b07a01C04594455DBc3298437';
const routes = [
  { surface: 'Home', path: '/' },
  { surface: 'Discover', path: '/discover' },
  { surface: 'Launch detail', path: `/editions/${certificationEdition}` },
  { surface: 'Market', path: '/market' },
  { surface: 'Builder profile', path: '/dashboard/builder', afterReady: () => window.go?.('builder') },
  { surface: 'Dashboard', path: '/dashboard/holder' },
  { surface: 'Create', path: '/create' }
];

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function waitForOutput(child, matcher, timeout = 30_000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`SERVER_START_TIMEOUT:${buffer.slice(-500)}`)), timeout);
    const onData = (chunk) => {
      buffer += chunk.toString();
      if (matcher.test(buffer)) { clearTimeout(timer); resolve(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`SERVER_EXITED:${code}:${buffer.slice(-500)}`)); });
  });
}

async function measureRoute(browser, route) {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__nmPerformanceAudit = { cls: 0, passReadyAt: null, passReadyCount: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__nmPerformanceAudit.cls += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    } catch {}
    try {
      new MutationObserver(() => {
        const ready = document.querySelectorAll('.nm-pass-ready').length;
        if (ready && !window.__nmPerformanceAudit.passReadyAt) window.__nmPerformanceAudit.passReadyAt = performance.now();
        window.__nmPerformanceAudit.passReadyCount = ready;
      }).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    } catch {}
  });
  const started = Date.now();
  let navigationError = null;
  try { await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'commit', timeout: 30_000 }); } catch (error) { navigationError = error.message; }
  let ready = false;
  try { await page.waitForFunction(() => document.documentElement.classList.contains('nm-v2-ready'), { timeout: 20_000 }); ready = true; } catch {}
  if (route.afterReady) await page.evaluate(route.afterReady).catch(() => {});
  await page.waitForTimeout(500);
  const metrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType('resource');
    const bytes = (entry) => Number(entry.transferSize || entry.encodedBodySize || 0);
    const js = resources.filter((entry) => entry.initiatorType === 'script' || /\.m?js(?:\?|$)/u.test(entry.name));
    const images = resources.filter((entry) => entry.initiatorType === 'img' || /\.(?:png|jpe?g|webp|gif|avif|svg)(?:\?|$)/iu.test(entry.name));
    const frames = [...document.querySelectorAll('iframe')];
    const passHosts = [...document.querySelectorAll('.nm-final-v5-shell,.nm-project-v5-shell,.nm-discover-pass-shell,.nm-market-v5-shell,.nm-market-mini-v5-shell,.nm-dash-v5-shell,.nm-create-pass-shell,.nm-eight-pack-shell')];
    const malformed = passHosts.filter((host) => {
      const text = (host.textContent || '').trim();
      return !host.classList.contains('nm-pass-ready') && (text.length > 0 || host.querySelector('iframe'));
    }).length;
    const fastAudit = typeof window.nmFastPackAudit === 'function' ? window.nmFastPackAudit() : null;
    return {
      domContentLoaded: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? null,
      loadEvent: performance.getEntriesByType('navigation')[0]?.loadEventEnd ?? null,
      initialJsBytes: js.reduce((total, entry) => total + bytes(entry), 0),
      initialJsRequests: js.length,
      networkRequests: resources.length,
      imagePayloadBytes: images.reduce((total, entry) => total + bytes(entry), 0),
      imageRequests: images.length,
      iframeCount: frames.length,
      sameOriginIframeCount: frames.filter((frame) => { try { return new URL(frame.src || location.href).origin === location.origin; } catch { return true; } }).length,
      passHostCount: passHosts.length,
      passReadyCount: document.querySelectorAll('.nm-pass-ready').length,
      malformedPassCount: malformed,
      loosePassTextCount: [...document.querySelectorAll('.nm-final-v5-shell,.nm-project-v5-shell,.nm-discover-pass-shell,.nm-market-v5-shell,.nm-market-mini-v5-shell,.nm-dash-v5-shell,.nm-create-pass-shell')].filter((host) => !host.classList.contains('nm-pass-ready') && (host.textContent || '').trim()).length,
      cls: Number(window.__nmPerformanceAudit?.cls || 0),
      passReadyAt: window.__nmPerformanceAudit?.passReadyAt,
      fastAudit
    };
  }).catch((error) => ({ error: error.message }));
  const transition = await page.evaluate(async () => {
    if (!window.nexmarketsV2?.navigate) return null;
    const startedAt = performance.now();
    window.nexmarketsV2.navigate('/market');
    await new Promise((resolve) => setTimeout(resolve, 250));
    return { route: location.pathname, milliseconds: Math.round(performance.now() - startedAt) };
  }).catch(() => null);
  let packRender = null;
  if (route.surface === 'Create') {
    const probe = await page.evaluate(() => {
      if (typeof window.nmFinalMountPass !== 'function') return { mounted: false, reason: 'canonical renderer unavailable' };
      const host = document.createElement('div');
      host.id = 'nm-performance-pass-probe';
      host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:120px;height:200px;opacity:0;pointer-events:none';
      document.body.appendChild(host);
      const project = { name: 'Canonical renderer probe', state: 'live', color: '#5f6f50', category: 'tools', desc: 'Canonical renderer timing probe.' };
      const config = { project: { name: project.name, desc: project.desc, category: project.category }, edition: { name: 'PROBE EDITION', series: 'SERIES 01' }, design: { passDesign: 'classic', color: project.color, frame: 'gilt', frameColor: '#c8a84e', texture: 'none', textureTint: '#9b9b94' }, advantages: [] };
      window.__nmPerformancePassProbeStart = performance.now();
      return { mounted: Boolean(window.nmFinalMountPass(host, project, config, '#001 / 1', 120, false)) };
    }).catch((error) => ({ mounted: false, reason: error.message }));
    if (probe.mounted) {
      await page.waitForFunction(() => Boolean(document.querySelector('#nm-performance-pass-probe iframe')?.contentDocument?.getElementById('card-root')), { timeout: 8_000 }).catch(() => {});
      packRender = await page.evaluate(() => {
        const frame = document.querySelector('#nm-performance-pass-probe iframe');
        const card = frame?.contentDocument?.getElementById('card-root');
        return { mounted: true, ready: Boolean(card), elapsedMs: Math.round(performance.now() - Number(window.__nmPerformancePassProbeStart || performance.now())), iframeCount: document.querySelectorAll('#nm-performance-pass-probe iframe').length };
      }).catch((error) => ({ mounted: true, ready: false, error: error.message }));
    } else packRender = probe;
  }
  await page.close();
  return { surface: route.surface, path: route.path, ready, elapsedMs: Date.now() - started, navigationError, ...metrics, transition, packRender };
}

async function main() {
  const server = spawn(process.execPath, ['--env-file=.env', 'scripts/serve-web-testnet.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, NEXMARKETS_WEB_PORT: String(webPort), NEXMARKETS_API_PORT: String(apiPort) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForOutput(server, /web_started/u);
    const browser = await chromium.launch({ channel: 'chromium', headless: true });
    const results = [];
    for (const route of routes) results.push(await measureRoute(browser, route));
    await browser.close();
    const failed = results.filter((result) => !result.ready || result.navigationError || result.malformedPassCount > 0 || (result.packRender && (!result.packRender.mounted || !result.packRender.ready)));
    const lines = [
      '# Performance verification', '', `- Status: **${failed.length ? 'FAIL' : 'PASS'}**`, '- Measurement mode: fresh Chromium page per requested surface against the built production shell; no fixture API responses were injected.', '- Note: the local API was started with the configured environment. Backend availability is reported separately by the route result; it is not replaced with sample data.', '', '| Surface | Ready (ms) | JS bytes / requests | Requests | Image bytes / requests | Iframes | CLS | Pass hosts / ready | Malformed / loose | Market transition | Canonical Pack probe |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|', ...results.map((result) => `| ${result.surface} | ${result.ready ? result.elapsedMs : 'FAIL'} | ${result.initialJsBytes ?? 'n/a'} / ${result.initialJsRequests ?? 'n/a'} | ${result.networkRequests ?? 'n/a'} | ${result.imagePayloadBytes ?? 'n/a'} / ${result.imageRequests ?? 'n/a'} | ${result.iframeCount ?? 'n/a'} | ${Number(result.cls ?? 0).toFixed(4)} | ${result.passHostCount ?? 'n/a'} / ${result.passReadyCount ?? 'n/a'} | ${result.malformedPassCount ?? 'n/a'} / ${result.loosePassTextCount ?? 'n/a'} | ${result.transition ? `${result.transition.milliseconds} ms` : 'n/a'} | ${result.packRender ? `${result.packRender.ready ? result.packRender.elapsedMs + ' ms' : 'FAIL'}` : 'n/a'} |`), '', '## Regression checks', '', '- The audit records empty/loose/malformed Pack hosts separately from `.nm-pass-ready` hosts.', '- Public pages must not boot dozens of full Pack editors; the iframe and same-origin iframe counts above are the measured values.', '- Create includes an isolated timing probe for the canonical current renderer. It is not injected into production data or counted as a public Pack editor.', '- The result is a shell/performance measurement, not production certification; live API, database and chain gates remain independent.'
    ];
    await mkdir(new URL('artifacts/verification/', root), { recursive: true });
    await writeFile(reportUrl, `${lines.join('\n')}\n`, 'utf8');
    console.log(JSON.stringify({ status: failed.length ? 'FAIL' : 'PASS', results, report: reportUrl.pathname }));
    if (failed.length) process.exitCode = 1;
  } finally {
    server.kill('SIGTERM');
    await sleep(250);
  }
}

main().catch(async (error) => {
  await mkdir(new URL('artifacts/verification/', root), { recursive: true });
  await writeFile(reportUrl, `# Performance verification\n\n- Status: **BLOCKED**\n- Blocker: ${String(error.message).replaceAll('\n', ' ')}\n`, 'utf8');
  console.error(JSON.stringify({ status: 'BLOCKED', error: error.message, report: reportUrl.pathname }));
  process.exitCode = 2;
});
