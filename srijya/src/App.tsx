import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import AskSrijya from '@/components/AskSrijya';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import { useRevealObserver } from '@/lib/reveal';
import About from '@/pages/About';
import CapabilitiesPage from '@/pages/CapabilitiesPage';
import Company from '@/pages/Company';
import Contact from '@/pages/Contact';
import Help from '@/pages/Help';
import Home from '@/pages/Home';
import { hasShipped } from '@/content/shipped';
import { hasTeam } from '@/content/team';
import NotFound from '@/pages/NotFound';
import Privacy from '@/pages/Privacy';
import ProductSadhya from '@/pages/ProductSadhya';
import Products from '@/pages/Products';
import StartWithYourIdea from '@/pages/StartWithYourIdea';
import Security from '@/pages/Security';
import Shipped from '@/pages/Shipped';
import Team from '@/pages/Team';
import Terms from '@/pages/Terms';

/*
 * Every page is imported directly rather than lazily.
 *
 * The whole site — ten pages, one SVG motif, no charts, no editor, no auth — is a
 * few tens of kilobytes of application code on top of React. Splitting it would
 * trade a single cached download for a request waterfall on each navigation, which
 * is the wrong trade at this size. React and the router are still split out as
 * `vendor` so they cache independently of the content.
 */

/**
 * Scroll behaviour for a client-side router.
 *
 * Two cases the browser no longer handles for us: a new page should start at the
 * top, and a link carrying a hash (`/#approach`, `/capabilities#software-development`)
 * should land on that section — including when the hash arrives with a page that
 * has not rendered yet.
 *
 * The offset is measured from the sticky header rather than left to each section's
 * `scroll-margin-top`, so a section linked from anywhere lands clear of the bar
 * whatever that bar's height is at the current breakpoint. `window.scrollTo` does
 * the work instead of `Element.scrollIntoView()`: the latter is the more obvious
 * call, but it silently does nothing in some embedded/automation browsers, and a
 * navigation that quietly fails to move is worse than one that lands a few pixels
 * off.
 */
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }

    /** Where the section should sit: clear of the sticky header, plus a little air. */
    const targetTop = (): number | null => {
      let target: Element | null = null;
      try {
        target = document.querySelector(hash);
      } catch {
        /* A hash that is not a valid selector is simply not a target. */
      }
      if (!target) return null;
      const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
      return Math.max(target.getBoundingClientRect().top + window.scrollY - headerHeight - 24, 0);
    };

    const first = targetTop();
    if (first === null) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return;
    }

    let cancelled = false;
    let requested = first;

    const go = (top: number) => {
      requested = top;
      window.scrollTo({ top, left: 0, behavior: reduced ? 'auto' : 'smooth' });
    };

    /* Scroll immediately rather than from inside requestAnimationFrame. The route's
       DOM is already committed by the time an effect runs, and a tab that is not
       being rendered — opened in the background, or restored while hidden — never
       fires an animation frame at all, so a hash link that waited for one would
       quietly do nothing. */
    go(first);

    /* Then correct, because the first measurement is taken against a page that has
       not finished settling. The web font is the big one: until it arrives, text
       wraps to different line counts and every section below the fold sits at the
       wrong offset — on this site that is a few hundred pixels of drift, which is
       the difference between landing on a heading and landing halfway through the
       section above it. Re-measure on the next frame and again once fonts resolve,
       and move only if the target actually shifted, so a smooth scroll in flight is
       never restarted for a pixel or two. */
    const correct = () => {
      if (cancelled) return;
      const settled = targetTop();
      if (settled !== null && Math.abs(settled - requested) > 4) go(settled);
    };

    const frame = requestAnimationFrame(correct);
    void document.fonts?.ready.then(correct).catch(() => {
      /* No font loading API, or fonts failed: the first measurement stands. */
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [pathname, hash]);

  return null;
}

function Shell() {
  const { pathname } = useLocation();
  useRevealObserver(pathname);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <ScrollManager />
      <Navbar />
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/capabilities" element={<CapabilitiesPage />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/sadhya" element={<ProductSadhya />} />
          <Route path="/help" element={<Help />} />
          {/* Routed only once there is a real person to show, so /team is a 404
              rather than an empty page while the list is empty. */}
          {hasTeam ? <Route path="/team" element={<Team />} /> : null}
          {/* Same gate as /team: no entries, no page. */}
          {hasShipped ? <Route path="/shipped" element={<Shipped />} /> : null}
          <Route path="/security" element={<Security />} />
          <Route path="/start" element={<StartWithYourIdea />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/company" element={<Company />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <AskSrijya />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
