// Apply the public brand to both the page and its encoded Pass documents.
// Case-sensitive words keep API names, storage keys and contract identifiers intact.
function rebrandPresentation(source) {
  return source
    .replace(/\bNexMarkets\b|\bNex Markets\b/g, 'Outerfield')
    .replace(/\bNEXMARKETS\b|\bNEX MARKETS\b/g, 'OUTERFIELD')
    .replaceAll('${d.logo} Markets', 'Outerfield')
    .replaceAll('${d.logo} MARKETS', 'OUTERFIELD')
    .replaceAll('${inlineLogoContent(d.logo)} Markets', 'Outerfield')
    .replaceAll('${inlineLogoContent(d.logo)} MARKETS', 'OUTERFIELD')
    .replaceAll('${d.logo} graded archive', 'Outerfield graded archive')
    .replaceAll("||'NEX'", "||'OF'")
    .replaceAll('value="NEX"', 'value="OF"')
    .replaceAll('NEX-GCP-001', 'OF-GCP-001')
    .replaceAll('class="back-seal-text">N</span>', 'class="back-seal-text">O</span>');
}

export function applyOuterfieldBranding(html) {
  const sources = new Set();
  html = html.replace(/(\bconst\s+(PASS_B64|NM_EIGHT_PACK_SOURCE_B64)\s*=\s*)(['"])([A-Za-z0-9+/=]+)\3/g,
    (_match, declaration, name, quote, encoded) => {
      sources.add(name);
      const document = Buffer.from(encoded, 'base64').toString('utf8');
      const branded = Buffer.from(rebrandPresentation(document), 'utf8').toString('base64');
      return declaration + quote + branded + quote;
    });
  if (sources.size !== 2) throw new Error('Outerfield branding requires both embedded Pass sources');
  return rebrandPresentation(html);
}
