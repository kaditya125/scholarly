import { useEffect, useState } from 'react';
import {
  Navigation, Sun, Moon, CloudSun, Cloud, CloudFog,
  CloudDrizzle, CloudRain, CloudSnow, CloudLightning, Loader2,
} from 'lucide-react';

type Weather = {
  city: string;
  temp: number;
  high: number;
  low: number;
  code: number;
  isDay: boolean;
};

// Map WMO weather codes (Open-Meteo) to a label + icon.
function describe(code: number, isDay: boolean) {
  if (code === 0) return { label: isDay ? 'Sunny' : 'Clear', Icon: isDay ? Sun : Moon };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', Icon: CloudSun };
  if (code === 3) return { label: 'Cloudy', Icon: Cloud };
  if (code === 45 || code === 48) return { label: 'Foggy', Icon: CloudFog };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', Icon: CloudDrizzle };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { label: 'Rainy', Icon: CloudRain };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { label: 'Snow', Icon: CloudSnow };
  if (code >= 95) return { label: 'Storm', Icon: CloudLightning };
  return { label: 'Clear', Icon: isDay ? Sun : Moon };
}

export function WeatherWidget() {
  const [data, setData] = useState<Weather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async (lat: number, lon: number, cityHint?: string) => {
      try {
        const wRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
        );
        const w = await wRes.json();

        let city = cityHint;
        if (!city) {
          try {
            const gRes = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
            );
            const g = await gRes.json();
            city = g.city || g.locality || g.principalSubdivision || 'Your location';
          } catch {
            city = 'Your location';
          }
        }

        if (cancelled) return;
        setData({
          city: city as string,
          temp: Math.round(w.current.temperature_2m),
          code: w.current.weather_code,
          isDay: w.current.is_day === 1,
          high: Math.round(w.daily.temperature_2m_max[0]),
          low: Math.round(w.daily.temperature_2m_min[0]),
        });
      } catch {
        /* leave data null → widget hides gracefully */
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    // Default to Patna (BPSC region) if geolocation is unavailable or denied.
    const fallback = () => load(25.5941, 85.1376, 'Patna');

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => load(pos.coords.latitude, pos.coords.longitude),
        () => fallback(),
        { timeout: 6000, maximumAge: 1000 * 60 * 30 }
      );
    } else {
      fallback();
    }

    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] p-4 flex items-center justify-center min-h-[76px]">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!data) return null;

  const { label, Icon } = describe(data.code, data.isDay);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b] px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Icon className="w-8 h-8 text-amber-400 dark:text-amber-300 shrink-0" strokeWidth={1.75} />
        <div>
          <div className="flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-gray-400">
            {data.city}
            <Navigation className="w-3 h-3 text-slate-400 fill-current -rotate-45" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
            {data.temp}°C
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-medium text-slate-600 dark:text-gray-300">{label}</div>
        <div className="text-[12px] text-slate-400 dark:text-gray-500">H:{data.high}° L:{data.low}°</div>
      </div>
    </div>
  );
}
