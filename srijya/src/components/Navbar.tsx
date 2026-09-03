import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowRight, CloseIcon, MenuIcon, MoonIcon, SunIcon } from '@/components/Icons';
import { Logo } from '@/components/Logo';
import { useTheme } from '@/lib/theme';
import { COMPANY, NAV_LINKS } from '@/site.config';

function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      /* The label states what pressing it does, not what the current state is —
         a screen-reader user gets the action, which is the useful half. */
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[3px] text-ink-2 transition-colors duration-300 hover:text-ink ${className}`}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  /* The bar is transparent over the hero and grows a hairline once the page has
     moved, so the header never sits on a visible edge at rest. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Any navigation closes the overlay, including a hash link to a section on the
  // page already showing.
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      // Keep Tab inside the overlay: with the page behind it still in the
      // document, tabbing out would land on links the visitor cannot see.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'relative py-1 text-[0.875rem] font-medium tracking-[-0.006em] transition-colors duration-300',
      isActive ? 'text-ink' : 'text-ink-2 hover:text-ink',
    ].join(' ');

  return (
    <header
      className={`sticky top-0 z-50 transition-colors duration-300 ${
        scrolled ? 'border-b border-line bg-paper/85 backdrop-blur-md' : 'border-b border-transparent'
      }`}
    >
      <div className="container-tl flex h-[68px] items-center justify-between gap-6 md:h-[76px]">
        <Link to="/" aria-label={`${COMPANY.name} — home`} className="shrink-0">
          <Logo />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) =>
            link.href.includes('#') ? (
              /* A section link, not a page — NavLink would never match it. */
              <Link
                key={link.href}
                to={link.href}
                className="py-1 text-[0.875rem] font-medium tracking-[-0.006em] text-ink-2 transition-colors duration-300 hover:text-ink"
              >
                {link.label}
              </Link>
            ) : (
              <NavLink key={link.href} to={link.href} className={navLinkClass}>
                {link.label}
              </NavLink>
            )
          )}
        </nav>

        <div className="flex items-center gap-1 md:gap-3">
          <ThemeToggle />
          <Link
            to="/contact"
            className="hidden items-center gap-2 border-b border-line-2 py-1 text-[0.875rem] font-semibold tracking-[-0.006em] text-ink transition-colors duration-300 hover:border-ink md:inline-flex"
          >
            Let&rsquo;s talk
            <ArrowRight size={15} />
          </Link>

          <button
            ref={menuButtonRef}
            type="button"
            className="-mr-2 inline-flex h-11 w-11 items-center justify-center text-ink md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Full-screen overlay. Rendered only while open so its links stay out of the
          tab order the rest of the time. */}
      {open && (
        <div
          id="mobile-nav"
          ref={panelRef}
          className="fixed inset-0 top-[68px] z-40 flex flex-col bg-paper md:hidden"
        >
          <nav aria-label="Primary" className="container-tl flex flex-col pt-4">
            {NAV_LINKS.map((link, index) => (
              <Link
                key={link.href}
                to={link.href}
                className="border-b border-line py-5 text-[1.5rem] font-medium tracking-[-0.028em] text-ink"
              >
                <span className="index-num mr-4 align-middle">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="container-tl mt-auto pb-10 pt-8">
            <Link to="/contact" className="btn btn-primary w-full">
              Let&rsquo;s talk
              <ArrowRight />
            </Link>
            <p className="label mt-6">{COMPANY.location}</p>
          </div>
        </div>
      )}
    </header>
  );
}
