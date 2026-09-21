// Adapt the archived presentation document to the live runtime without
// changing the byte-exact design reference. Fail the build if a hook drifts.
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
  replace('<button class="btn primary" onclick="nmEliteSaveBuilderProfile(\'${E(key)}\')">Save public profile</button>', '<button class="btn primary" data-nm-builder-profile-save="${E(key)}" onclick="nmEliteSaveBuilderProfile(\'${E(key)}\')">Save public profile</button>');
  replace('totalRoyalty=Number(e.royaltyAvailable||0)+Number(e.royaltyLocked||0)', 'totalRoyalty=Number(e.royaltyEarned??(Number(e.royaltyAvailable||0)+Number(e.royaltyLocked||0)))');
  replace("${e.royaltyAvailable?'Available':'Withdrawn'}", "${e.royaltyAvailable?'Available':e.royaltyWithdrawn?'Withdrawn':'No balance'}");
  return html;
}
