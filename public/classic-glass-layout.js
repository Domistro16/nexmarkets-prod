// Keep full descriptions readable while giving longer copy more room.
document.addEventListener('DOMContentLoaded', () => {
  const card = document.getElementById('card-root');
  if (!card) return;
  let pending = false;
  function fitFront() {
    pending = false;
    const design = card.dataset.passDesign;
    if (design !== 'classic' && design !== 'glass') return;
    const face = card.querySelector(design === 'classic' ? '.card-front' : '.card-front-glass');
    const description = face?.querySelector(design === 'classic' ? '.f-desc' : '.glass-desc');
    const register = face?.querySelector(design === 'classic' ? '.collectible-meta' : '.glass-register');
    if (!face || !description || !register) return;
    const registerStart = register.querySelector('.edition-line') || register;
    const maxArt = card.clientWidth - 44;
    const overflow = () => Math.max(
      face.scrollHeight - face.clientHeight,
      description.getBoundingClientRect().bottom + 10 - registerStart.getBoundingClientRect().top,
      0
    );
    for (const fontSize of [24, 22]) {
      card.style.setProperty('--nm-card-copy-size', `${fontSize}px`);
      let artSize = maxArt;
      card.style.setProperty('--nm-card-art-size', `${artSize}px`);
      let excess = overflow();
      while (excess > 1 && artSize > 280) {
        artSize = Math.max(280, artSize - Math.max(4, Math.ceil(excess)));
        card.style.setProperty('--nm-card-art-size', `${artSize}px`);
        excess = overflow();
      }
      if (excess <= 1) break;
    }
  }
  function schedule() {
    if (pending) return;
    pending = true;
    // The Create preview can be hidden while it hydrates or changes design.
    // A microtask still fits its copy when animation frames are throttled.
    queueMicrotask(fitFront);
  }
  new MutationObserver(schedule).observe(card, {
    childList: true, characterData: true, subtree: true,
    attributes: true, attributeFilter: ['data-pass-design']
  });
  document.fonts.ready.then(schedule);
  schedule();
});
