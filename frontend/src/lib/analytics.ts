/**
 * Unified Analytics Module for Sadhya
 * Supports Google Analytics 4 (GA4) & PostHog for:
 * - Real-time SPA Route Pageviews
 * - User Journey Tracking & Session Recordings
 * - Click Maps & Funnels
 * - Custom Conversion Events
 */

import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    dataLayer: any[];
    gtag?: (...args: any[]) => void;
    posthog?: any;
  }
}

// ── Configuration ─────────────────────────────────────────────────────────────
const GA_MEASUREMENT_ID = (import.meta.env.VITE_GA_MEASUREMENT_ID || 'G-LF1WXJ09YY').trim();
const POSTHOG_KEY = (import.meta.env.VITE_POSTHOG_KEY || '').trim();
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST || 'https://app.posthog.com').trim();

/**
 * Initialize Client Analytics (GA4 + PostHog)
 */
export function initAnalytics() {
  if (typeof window === 'undefined') return;

  // 1. GA4 Initialization
  if (GA_MEASUREMENT_ID && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false, // Managed manually via React Router SPA listener
    });
  }

  // 2. PostHog Initialization (Loads script asynchronously if key is configured)
  if (POSTHOG_KEY && !window.posthog) {
    (function (t: any, e: any) {
      var o, n, p, r;
      e.__SV ||
        ((window as any).posthog = e,
        (e._i = []),
        (e.init = function (i: any, s: any, a: any) {
          function g(t: any, e: any) {
            var o = e.split('.');
            2 == o.length && ((t = t[o[0]]), (e = o[1])),
              (t[e] = function () {
                t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
              });
          }
          ((p = t.createElement('script')).type = 'text/javascript'),
            (p.async = !0),
            (p.src = s.api_host + '/static/array.js'),
            (r = t.getElementsByTagName('script')[0]).parentNode.insertBefore(p, r);
          var u = e;
          for (
            void 0 !== a ? (u = e[a] = []) : (a = 'posthog'),
              u.people = u.people || [],
              u.toString = function (t: any) {
                var e = 'posthog';
                return 'posthog' !== a && (e += '.' + a), t || (e += ' (stub)'), e;
              },
              u.people.toString = function () {
                return u.toString(1) + '.people (stub)';
              },
              o =
                'init capture register register_once unregister unregister_once identify set_config get_distinct_id getGroups setPersonProperties group resetOptInOutState isFeatureEnabled onFeatureFlags reloadFeatureFlags reset setPersonPropertiesForFlags getSessionId getSessionUrl'.split(
                  ' '
                ),
              n = 0;
            n < o.length;
            n++
          )
            g(u, o[n]);
          e._i.push([i, s, a]);
        }),
        (e.__SV = 1));
    })(document, (window as any).posthog || []);

    if (window.posthog) {
      window.posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        capture_pageview: false, // Managed manually in React Router
        capture_pageleave: true,
        autocapture: true, // Auto tracks click maps & interactions
        session_recording: {
          maskAllInputs: false,
          maskInputOptions: { password: true },
        },
      });
    }
  }
}

/**
 * Track an SPA Page View
 */
export function trackPageView(path: string, title?: string) {
  const pageTitle = title || document.title;

  // Track in GA4
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: pageTitle,
      page_location: window.location.href,
    });
  }

  // Track in PostHog
  if (typeof window !== 'undefined' && window.posthog?.capture) {
    window.posthog.capture('$pageview', {
      $current_url: window.location.href,
      $pathname: path,
      title: pageTitle,
    });
  }
}

/**
 * Track a Custom Action / Conversion Event
 */
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  // GA4
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('event', eventName, properties || {});
  }

  // PostHog
  if (typeof window !== 'undefined' && window.posthog?.capture) {
    window.posthog.capture(eventName, properties || {});
  }
}

/**
 * Identify a Logged-in Student or Teacher
 */
export function identifyUser(userId: string, traits?: Record<string, any>) {
  // GA4
  if (typeof window !== 'undefined' && typeof window.gtag === 'function') {
    window.gtag('set', 'user_properties', {
      user_id: userId,
      ...traits,
    });
  }

  // PostHog
  if (typeof window !== 'undefined' && window.posthog?.identify) {
    window.posthog.identify(userId, traits || {});
  }
}

/**
 * React Component for Automated SPA Navigation Tracking
 * Mount inside <BrowserRouter>
 */
export function AnalyticsTracker() {
  const location = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        const id = (window as any).requestIdleCallback(() => initAnalytics(), { timeout: 3000 });
        return () => (window as any).cancelIdleCallback(id);
      } else {
        const timer = setTimeout(() => initAnalytics(), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        (window as any).requestIdleCallback(() => trackPageView(location.pathname + location.search), { timeout: 3000 });
      } else {
        trackPageView(location.pathname + location.search);
      }
    }
  }, [location.pathname, location.search]);

  return null;
}
