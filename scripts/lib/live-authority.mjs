// Adapt the archived presentation document to the live runtime without
// changing the byte-exact design reference. Fail the build if a hook drifts.
import { readFileSync } from 'node:fs';
import { applyOuterfieldBranding } from './outerfield-branding.mjs';

const packReadabilityStyle = readFileSync(new URL('../../apps/web/public/pack-readability.css', import.meta.url), 'utf8');
const classicGlassReadabilityStyle = readFileSync(new URL('../../apps/web/public/classic-glass-readability.css', import.meta.url), 'utf8');
const classicGlassLayout = readFileSync(new URL('../../apps/web/public/classic-glass-layout.js', import.meta.url), 'utf8');
const classicGlassEmbed = JSON.stringify('<style id="nm-classic-glass-readability">' + classicGlassReadabilityStyle + '</style><script id="nm-classic-glass-layout">' + classicGlassLayout + '</script>').replace(/</g, '\\u003c');

export function liveAuthority(html) {
  const replace = (before, after) => {
    if (!html.includes(before) || html.indexOf(before) !== html.lastIndexOf(before)) throw new Error(`Live authority hook missing or ambiguous: ${before}`);
    html = html.replace(before, () => after);
  };
  replace('function managedKeys(){', 'function managedKeys(){\n if(Array.isArray(window.__nmManagedBuilderKeys))return window.__nmManagedBuilderKeys.slice();');
  replace('function projectsFor(key){', 'function projectsFor(key){if(window.__nmBuilderProjectsForKey&&window.__nmManagedBuilderKeys?.includes(key))return window.__nmBuilderProjectsForKey(key);');
  replace('function builderStats(key){', 'function builderStats(key){const live=window.__nmBuilderStatsForKey?.(key);if(live)return live;');
  replace('function p10Creator(){return dashboardState.launches.length>0}', 'function p10Creator(){return (window.__nmManagedBuilderKeys||[]).length>0||dashboardState.launches.length>0}');
  replace('function dashKey(){const keys=managedKeys();', 'function dashKey(){const keys=managedKeys();const selected=window.nexmarketsV2?.state?.selectedBuilderId;if(keys.includes(selected))window.nmEliteDashboardBuilderKey=selected;');
  replace('Get there early.<br><em>Own your place.</em>', 'Find what’s next.<br><em>Get in early.</em>');
  replace('Tokenized stock rewards require the Edition to use Base.', 'Tokenized stock rewards are not available on Robinhood yet.');
  replace('Find promising products early. Get a limited Pass with a clear Advantage and your own serial. Use what it gives you, keep it, or sell it later when the Market opens.', 'Meet promising projects before the crowd. Pick up a numbered Pass, see exactly what comes with it, then keep it or trade it when its Market opens.');
  replace('<button class="btn primary" onclick="nmEliteSaveBuilderProfile(\'${E(key)}\')">Save public profile</button>', '<button class="btn primary" data-nm-builder-profile-save="${E(key)}" onclick="nmEliteSaveBuilderProfile(\'${E(key)}\')">Save public profile</button>');
  replace('totalRoyalty=Number(e.royaltyAvailable||0)+Number(e.royaltyLocked||0)', 'totalRoyalty=Number(e.royaltyEarned??(Number(e.royaltyAvailable||0)+Number(e.royaltyLocked||0)))');
  replace("${e.royaltyAvailable?'Available':'Withdrawn'}", "${e.royaltyAvailable?'Available':e.royaltyWithdrawn?'Withdrawn':'No balance'}");
  // The same fitted stylesheet reaches native previews, iframe previews and
  // exported objects, including labels hidden inside their shadow roots.
  replace('style.textContent=FIT_STYLE;', `style.textContent=FIT_STYLE+${JSON.stringify(packReadabilityStyle)};`);
  replace("src=src.replace('</head>',EMBED_CSS+'</head>');", `src=src.replace('</head>',EMBED_CSS+${classicGlassEmbed}+'</head>');`);
  replace('function legacyPassHTML(o={}){', `(()=>{const s=document.createElement('style');s.id='nm-pack-readability-global';s.textContent=${JSON.stringify(packReadabilityStyle)};(document.head||document.documentElement).append(s)})();function legacyPassHTML(o={}){`);
  for (const [before, after] of [
    ['desc:{sizes:[13.2,12.5,11.8],lines:2,lh:1.2}', 'desc:{sizes:[16,15,14],lines:3,lh:1.2}'],
    ['desc:{sizes:[13.4,12.7,12],lines:3,lh:1.22}', 'desc:{sizes:[16,15,14],lines:3,lh:1.22}'],
    ['desc:{sizes:[13.1,12.4,11.7],lines:3,lh:1.2}', 'desc:{sizes:[16,15,14],lines:3,lh:1.2}'],
    ['desc:{sizes:[13.4,12.7,12],lines:3,lh:1.2}', 'desc:{sizes:[16,15,14],lines:3,lh:1.2}'],
    ['desc:{sizes:[12.3,11.6,10.9],lines:2,lh:1.18}', 'desc:{sizes:[16,15,14],lines:3,lh:1.18}'],
    ['desc:{sizes:[13,12.3,11.6],lines:3,lh:1.2}', 'desc:{sizes:[16,15,14],lines:3,lh:1.2}'],
    ['desc:{sizes:[12,11.4,10.8],lines:3,lh:1.22}', 'desc:{sizes:[16,15,14],lines:3,lh:1.22}'],
    ['desc:{sizes:[12.3,11.6,10.9],lines:3,lh:1.2}', 'desc:{sizes:[16,15,14],lines:3,lh:1.2}'],
  ]) replace(before, after);
  replace('const clipped=results.filter(x=>!x.fit).length;', "root.querySelectorAll('.pack-back .back-benefit strong').forEach(el=>results.push(fitEl(el,{sizes:[26,24,22,20,18],lines:1,lh:1.05})));const clipped=results.filter(x=>!x.fit).length;");
  return applyOuterfieldBranding(html);
}
