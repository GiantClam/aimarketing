export const FRONTEND_SLIDES_VIEWPORT_BASE_CSS = `
html, body {
  height: 100%;
  overflow-x: hidden;
  margin: 0;
}

html {
  scroll-snap-type: y mandatory;
  scroll-behavior: smooth;
}

body {
  background: var(--deck-bg);
  color: var(--deck-fg);
  font-family: var(--font-body);
}

.slide {
  width: 100vw;
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
  scroll-snap-align: start;
  display: grid;
  place-items: center;
  position: relative;
  box-sizing: border-box;
  padding: var(--viewport-frame);
}

.slide-content {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  width: min(
    calc(100vw - (var(--viewport-frame) * 2)),
    calc((100dvh - (var(--viewport-frame) * 2)) * 16 / 9)
  );
  height: min(
    calc(100dvh - (var(--viewport-frame) * 2)),
    calc((100vw - (var(--viewport-frame) * 2)) * 9 / 16)
  );
  aspect-ratio: 16 / 9;
  overflow: hidden;
  padding: var(--slide-padding);
  box-sizing: border-box;
  max-width: calc(100vw - (var(--viewport-frame) * 2));
  max-height: calc(100dvh - (var(--viewport-frame) * 2));
  margin: 0 auto;
  position: relative;
}

:root {
  --title-size: clamp(2.2rem, 5.8vw, 5.6rem);
  --h2-size: clamp(1.4rem, 3.5vw, 2.7rem);
  --h3-size: clamp(1rem, 2.3vw, 1.6rem);
  --body-size: clamp(0.88rem, 1.45vw, 1.1rem);
  --small-size: clamp(0.7rem, 0.95vw, 0.9rem);
  --slide-padding: clamp(1.4rem, 5vw, 4.8rem);
  --viewport-frame: clamp(0.65rem, 1.8vw, 1.4rem);
  --content-gap: clamp(1rem, 2.2vw, 2.4rem);
  --element-gap: clamp(0.45rem, 1.1vw, 1.1rem);
}

.deck {
  min-height: 100vh;
  min-height: 100dvh;
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  font: 700 var(--small-size)/1 var(--font-mono);
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.title {
  margin: 0;
  font: 900 var(--title-size)/0.98 var(--font-title);
  letter-spacing: -0.04em;
}

.subtitle {
  margin: 0;
  max-width: min(58ch, 68vw);
  font-size: var(--body-size);
  line-height: 1.45;
}

.chip-row,
.bullet-list,
.number-list,
.timeline-list {
  display: grid;
  gap: clamp(0.55rem, 1vw, 0.95rem);
}

.bullet-list,
.number-list,
.timeline-list {
  padding: 0;
  margin: 0;
  list-style: none;
}

.panel {
  border: 1px solid var(--deck-border);
  background: var(--deck-panel);
  border-radius: clamp(1rem, 2vw, 2rem);
  box-shadow: 0 20px 60px -34px rgba(0, 0, 0, 0.5);
}

.grid-2 {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: clamp(0.75rem, 1.5vw, 1.5rem);
}

.grid-4 {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(0.75rem, 1.5vw, 1.5rem);
}

.footer-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: auto;
  font: 600 var(--small-size)/1.2 var(--font-mono);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.progress {
  width: min(28vw, 360px);
  height: 4px;
  background: color-mix(in srgb, var(--deck-fg) 12%, transparent);
  overflow: hidden;
  border-radius: 999px;
}

.progress > span {
  display: block;
  height: 100%;
  background: var(--deck-accent);
}

.nav {
  position: fixed;
  right: clamp(0.9rem, 2vw, 1.5rem);
  bottom: clamp(0.9rem, 2vw, 1.5rem);
  z-index: 10;
  display: inline-flex;
  gap: 0.55rem;
}

.nav button {
  border: 1px solid color-mix(in srgb, var(--deck-fg) 16%, transparent);
  background: color-mix(in srgb, var(--deck-panel) 88%, rgba(255, 255, 255, 0.06));
  color: var(--deck-fg);
  border-radius: 999px;
  padding: 0.6rem 0.85rem;
  font: 700 var(--small-size)/1 var(--font-mono);
  cursor: pointer;
}

@media (max-width: 900px) {
  .grid-2,
  .grid-4 {
    grid-template-columns: 1fr;
  }
}

@media (max-height: 700px) {
  :root {
    --viewport-frame: clamp(0.45rem, 1.4vw, 0.9rem);
    --slide-padding: clamp(0.8rem, 3vw, 2.2rem);
    --content-gap: clamp(0.45rem, 1.5vw, 1rem);
    --title-size: clamp(1.65rem, 4vw, 3rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.2s !important;
  }
  html {
    scroll-behavior: auto;
  }
}
`

export function buildFrontendSlidesControllerScript() {
  return `
  class PresentationController {
    constructor() {
      this.slides = Array.from(document.querySelectorAll('.slide'));
      this.current = 0;
      this.bind();
      this.observe();
    }

    bind() {
      window.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
          event.preventDefault();
          this.go(1);
        }
        if (event.key === 'ArrowUp' || event.key === 'PageUp') {
          event.preventDefault();
          this.go(-1);
        }
      });

      let touchStartY = 0;
      window.addEventListener('touchstart', (event) => {
        touchStartY = event.touches[0]?.clientY ?? 0;
      }, { passive: true });

      window.addEventListener('touchend', (event) => {
        const touchEndY = event.changedTouches[0]?.clientY ?? 0;
        const delta = touchStartY - touchEndY;
        if (Math.abs(delta) < 40) return;
        this.go(delta > 0 ? 1 : -1);
      }, { passive: true });

      document.querySelector('[data-nav="prev"]')?.addEventListener('click', () => this.go(-1));
      document.querySelector('[data-nav="next"]')?.addEventListener('click', () => this.go(1));
    }

    observe() {
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        }
      }, { threshold: 0.55 });

      this.slides.forEach((slide) => observer.observe(slide));
    }

    go(offset) {
      this.current = Math.max(0, Math.min(this.current + offset, this.slides.length - 1));
      this.slides[this.current]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  window.addEventListener('DOMContentLoaded', () => new PresentationController());
  `
}
