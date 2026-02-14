import React, { useCallback, useEffect, useMemo, useState, memo } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  Title,
} from 'chart.js';

import { Line } from 'react-chartjs-2';
import Vehicle6AreaChart from '../components/Vehicle6AreaChart.jsx';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  Title
);

function toYMD(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('fr-CA');
  return s;
}

function n0(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function normPlate(v) {
  return String(v || '').toUpperCase().replace(/\s+/g, '');
}

function fmtMoneyAr(v) {
  return n0(v).toLocaleString('fr-FR');
}

function fmtLiters(v) {
  const x = n0(v);
  return x % 1 === 0 ? String(x) : x.toFixed(2);
}

function buildQs(from, to) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return qs.toString();
}

function withQs(path, qs) {
  return qs ? `${path}?${qs}` : path;
}

function clampPct(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

/* ISO week start (Monday) as YYYY-MM-DD */
function isoWeekStart(ymd) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const day = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  d.setDate(d.getDate() - day);
  return d.toLocaleDateString('fr-CA');
}

// ✅ Agrège des logs (generator/other) en timeline (jour ou semaine)
function aggregateLogsTimeline(logs, valueField = 'montant_ar', threshold = 220) {
  const rows = Array.isArray(logs) ? logs : [];
  const daySet = new Set();
  const raw = [];

  for (const r of rows) {
    const d = toYMD(r?.log_date);
    if (!d) continue;
    daySet.add(d);
    raw.push({ d, v: n0(r?.[valueField]) });
  }

  const mode = daySet.size > threshold ? 'week' : 'day';
  const unitLabel = mode === 'week' ? 'semaines' : 'jours';

  const m = new Map();
  for (const p of raw) {
    const key = mode === 'week' ? isoWeekStart(p.d) : p.d;
    if (!key) continue;
    m.set(key, (m.get(key) || 0) + p.v);
  }

  const labels = Array.from(m.keys()).filter(Boolean).sort();
  const values = labels.map((k) => m.get(k));

  return { labels, values, labelsCount: labels.length, unitLabel, mode };
}

/* ===================== THEME HELPERS (CSS TOKENS) ===================== */
function cssVar(name, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || '').trim() || fallback;
}

function withAlpha(color, a = 1) {
  if (!color) return `rgba(0,0,0,${a})`;
  const c = String(color).trim();

  // rgba(...)
  if (c.startsWith('rgba(')) {
    return c.replace(/rgba\(([^)]+)\)/, (_, inside) => {
      const parts = inside.split(',').map((x) => x.trim());
      const r = parts[0] ?? '0';
      const g = parts[1] ?? '0';
      const b = parts[2] ?? '0';
      return `rgba(${r}, ${g}, ${b}, ${a})`;
    });
  }

  // rgb(...)
  if (c.startsWith('rgb(')) {
    const inside = c.slice(c.indexOf('(') + 1, c.lastIndexOf(')'));
    return `rgba(${inside}, ${a})`;
  }

  // hex
  if (c.startsWith('#')) {
    let h = c.replace('#', '');
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    if (h.length !== 6) return `rgba(0,0,0,${a})`;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  // fallback: on n'essaie pas de convertir des noms CSS
  return c;
}

function useChartTokens() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const el = document.documentElement;
    const obs = new MutationObserver(() => setTick((x) => x + 1));
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  return useMemo(() => {
    const themeName =
      (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || 'light';
    const isDark = themeName === 'dark';

    const surface = cssVar('--surface', isDark ? '#0b1220' : '#ffffff');
    const text = cssVar('--text', isDark ? '#e5e7eb' : '#0f172a');
    const muted = cssVar('--muted', isDark ? 'rgba(229,231,235,.62)' : '#64748b');
    const border = cssVar('--border', isDark ? 'rgba(255,255,255,.10)' : 'rgba(15,23,42,.12)');
    const accent = cssVar('--accent', isDark ? '#60a5fa' : '#2563eb');
    const ring = cssVar('--ring', isDark ? 'rgba(96,165,250,.30)' : 'rgba(37,99,235,.35)');
    const warning = cssVar('--warning', '#f59e0b');

    return {
      themeName,
      isDark,
      surface,
      text,
      muted,
      border,
      accent,
      ring,
      warning,

      grid: withAlpha(border, isDark ? 0.12 : 0.10),
      gridSoft: withAlpha(border, isDark ? 0.07 : 0.06),
      tooltipBg: withAlpha(surface, 0.96),
      tooltipBorder: withAlpha(border, isDark ? 0.22 : 0.25),
    };
  }, [tick]);
}

// ✅ Dataset “area + gradient” basé sur tokens (plus de regex fragile)
function makeAreaDataset(label, values, lineColor, fillAlpha = 0.22) {
  return {
    label,
    data: values,
    borderColor: lineColor,
    borderWidth: 2,
    tension: 0.42,
    pointRadius: 0,
    pointHitRadius: 10,
    fill: 'origin',
    backgroundColor: (ctx) => {
      const chart = ctx.chart;
      const area = chart.chartArea;
      const top = withAlpha(lineColor, fillAlpha);
      const bottom = withAlpha(lineColor, 0);

      if (!area) return top; // 1er rendu
      const g = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
      g.addColorStop(0, top);
      g.addColorStop(1, bottom);
      return g;
    },
  };
}

/* ✅ ajuste la taille en fonction de la longueur du nombre (sans casser 3 colonnes) */
function valueFontSizeFor(text) {
  const raw = String(text || '').replace(/\s/g, '').replace(/,/g, '');
  const len = raw.length;

  if (len >= 12) return 'clamp(12px, 0.95vw, 15px)';
  if (len >= 10) return 'clamp(13px, 1.05vw, 17px)';
  return 'clamp(16px, 1.25vw, 20px)';
}

/* ✅ media query hook */
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);
    onChange();
    if (m.addEventListener) m.addEventListener('change', onChange);
    else m.addListener(onChange);

    return () => {
      if (m.removeEventListener) m.removeEventListener('change', onChange);
      else m.removeListener(onChange);
    };
  }, [query]);

  return matches;
}

function PremiumKpiCard({
  title,
  subtitle,
  montant,
  liters,
  refills,
  pct,
  accent = 'emerald',
  onOpen,
}) {
  const accentMap = {
    emerald: { a1: '#34d399', a2: '#22c55e' },
    orange: { a1: '#fb923c', a2: '#f97316' },
    violet: { a1: '#a78bfa', a2: '#8b5cf6' },
    blue: { a1: '#60a5fa', a2: '#3b82f6' },
  };
  const acc = accentMap[accent] || accentMap.emerald;

  const moneyStr = fmtMoneyAr(montant);
  const litersStr = fmtLiters(liters);
  const refillsStr = String(n0(refills));

  const moneyFont = valueFontSizeFor(moneyStr);
  const litersFont = valueFontSizeFor(litersStr);
  const refillsFont = valueFontSizeFor(refillsStr);

  return (
    <div
      className="kpiPremium"
      style={{
        background:
          'radial-gradient(1200px 700px at 10% 10%, rgba(255,255,255,.08), transparent 55%), ' +
          'linear-gradient(180deg, #0b1220, #070b14)',
        border: '1px solid rgba(255,255,255,.08)',
        borderRadius: 18,
        padding: 16,
        boxShadow: '0 24px 70px rgba(0,0,0,.28)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: -1,
          background: `linear-gradient(90deg, ${acc.a1}, ${acc.a2})`,
          opacity: 0.08,
          filter: 'blur(18px)',
        }}
      />

      <div style={{ position: 'relative' }}>
        <div className="rowBetween" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10, rowGap: 10 }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#e5e7eb' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'rgba(229,231,235,.65)', marginTop: 2 }}>{subtitle}</div>
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(16,185,129,.10)',
              border: '1px solid rgba(16,185,129,.20)',
              color: '#a7f3d0',
              fontWeight: 800,
              fontSize: 12,
              whiteSpace: 'nowrap',
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 99,
                background: '#34d399',
                boxShadow: '0 0 0 4px rgba(52,211,153,.12)',
              }}
            />
            Active
          </div>
        </div>

        <div
          className="kpiMiniGrid"
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns:
              refills !== null && refills !== undefined ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <div
            className="kpiMini"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 14,
              padding: 12,
              position: 'relative',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>Montant (Ar)</div>
            <div
              className="kpiValue"
              style={{
                marginTop: 6,
                fontSize: moneyFont,
                fontWeight: 900,
                color: '#fff',
                lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`${moneyStr} Ar`}
            >
              {moneyStr}{' '}
              <span className="kpiUnit" style={{ fontSize: 'clamp(11px, .9vw, 12px)', opacity: 0.75 }}>
                Ar
              </span>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: 3,
                width: '100%',
                background: `linear-gradient(90deg, ${acc.a1}, ${acc.a2})`,
                opacity: 0.9,
              }}
            />
          </div>

          <div
            className="kpiMini"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 14,
              padding: 12,
              position: 'relative',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>Litres</div>
            <div
              className="kpiValue"
              style={{
                marginTop: 6,
                fontSize: litersFont,
                fontWeight: 900,
                color: '#dbeafe',
                lineHeight: 1.15,
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.02em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={`${litersStr} L`}
            >
              {litersStr}{' '}
              <span className="kpiUnit" style={{ fontSize: 'clamp(11px, .9vw, 12px)', opacity: 0.75 }}>
                L
              </span>
            </div>
            <div
              style={{
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: 3,
                width: '100%',
                background: 'linear-gradient(90deg, #22d3ee, #60a5fa)',
                opacity: 0.9,
              }}
            />
          </div>

          {(refills !== null && refills !== undefined) && (
            <div
              className="kpiMini"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 14,
                padding: 12,
                position: 'relative',
                overflow: 'hidden',
                minWidth: 0,
              }}
            >
              <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>Repleins</div>
              <div
                className="kpiValue"
                style={{
                  marginTop: 6,
                  fontSize: refillsFont,
                  fontWeight: 900,
                  color: '#bbf7d0',
                  lineHeight: 1.15,
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={refillsStr}
              >
                {refillsStr}
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  bottom: 0,
                  height: 3,
                  width: '100%',
                  background: 'linear-gradient(90deg, #34d399, #22c55e)',
                  opacity: 0.9,
                }}
              />
            </div>
          )}
        </div>

        <div style={{ marginTop: 14 }}>
          <div className="rowBetween" style={{ marginBottom: 8 }}>
            <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>Part du total (montant)</div>
            <div style={{ color: 'rgba(229,231,235,.80)', fontSize: 12, fontWeight: 900 }}>
              {clampPct(pct).toFixed(0)}%
            </div>
          </div>

          <div
            style={{
              height: 10,
              borderRadius: 999,
              background: 'rgba(255,255,255,.08)',
              border: '1px solid rgba(255,255,255,.10)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${clampPct(pct)}%`,
                background: `linear-gradient(90deg, ${acc.a1}, ${acc.a2})`,
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            className="kpiOpenBtn"
            onClick={onOpen}
            style={{
              padding: '10px 14px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,.10)',
              background: `linear-gradient(90deg, ${acc.a1}, ${acc.a2})`,
              color: '#06101f',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Ouvrir
          </button>
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children, right, className, style, height = 320 }) {
  return (
    <div className={`card ${className || ''}`} style={{ padding: 16, ...style }}>
      <div className="rowBetween" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {right || null}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function Dashboard() {
  const { token } = useAuth();

  const tokens = useChartTokens();
  const isNarrow = useMediaQuery('(max-width: 900px)');

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [byVehicle, setByVehicle] = useState([]);
  const [seriesByVehicleId, setSeriesByVehicleId] = useState({});

  const [generatorLogs, setGeneratorLogs] = useState([]);
  const [otherLogs, setOtherLogs] = useState([]);
  const [loadingGenOther, setLoadingGenOther] = useState(false);

  const [loading, setLoading] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch('/api/meta/vehicles', { token })
      .then((d) => setVehicles(d.vehicles || []))
      .catch(() => setVehicles([]));
  }, [token]);

  const vehicleList6 = useMemo(() => {
    const list = [...vehicles];
    list.sort((a, b) => String(a.plate || '').localeCompare(String(b.plate || '')));
    return list.slice(0, 6);
  }, [vehicles]);

  // ✅ Priorité aux véhicules qui ont réellement des données (top montant), sinon fallback sur la liste meta
  const vehicleTop6 = useMemo(() => {
    const topPlates = (byVehicle || []).slice(0, 6).map((r) => r.plate).filter(Boolean);
    if (!topPlates.length) return vehicleList6;

    const map = new Map((vehicles || []).map((v) => [normPlate(v.plate), v]));
    const picked = topPlates.map((p) => map.get(normPlate(p))).filter(Boolean);
    return picked.length ? picked : vehicleList6;
  }, [byVehicle, vehicles, vehicleList6]);

  const loadSeries6 = useCallback(
    async (qs, preferPlates = null) => {
      let list6 = [];

      const plates = (Array.isArray(preferPlates) && preferPlates.length)
        ? preferPlates
        : (byVehicle || []).slice(0, 6).map((r) => r.plate).filter(Boolean);

      if (plates.length && (vehicles || []).length) {
        const map = new Map((vehicles || []).map((v) => [normPlate(v.plate), v]));
        list6 = plates.map((p) => map.get(normPlate(p))).filter(Boolean);
      }

      if (!list6.length) list6 = vehicleTop6;
      if (!list6.length) list6 = vehicleList6;

      if (!list6.length) {
        setSeriesByVehicleId({});
        return;
      }

      setLoadingSeries(true);

      try {
        const ids = list6.map((v) => v.id).filter(Boolean).join(',');
        const p = new URLSearchParams(qs || '');
        p.set('vehicle_ids', ids);

        const bulk = await apiFetch(`/api/fuel/kpi/daily/bulk?${p.toString()}`, { token });
        const series = bulk?.series || {};

        const obj = {};
        for (const v of list6) {
          const pts = (series[v.id] || []).map((pt) => ({
            log_date: toYMD(pt.log_date),
            liters: n0(pt.liters),
            montant_ar: n0(pt.montant_ar),
            refills: n0(pt.refills),
          }));
          obj[v.id] = pts;
        }
        setSeriesByVehicleId(obj);
      } catch (_) {
        // ✅ fallback: 1 requête par véhicule
        try {
          const pairs = await Promise.all(
            list6.map(async (v) => {
              const qsv = new URLSearchParams(qs || '');
              qsv.set('vehicle_id', v.id);
              const d = await apiFetch(`/api/fuel/kpi/daily?${qsv.toString()}`, { token });
              const pts = (d.points || []).map((pt) => ({
                log_date: toYMD(pt.log_date),
                liters: n0(pt.liters),
                montant_ar: n0(pt.montant_ar),
                refills: n0(pt.refills),
              }));
              return [v.id, pts];
            })
          );

          const obj = {};
          for (const [id, pts] of pairs) obj[id] = pts;
          setSeriesByVehicleId(obj);
        } catch (_) {
          setSeriesByVehicleId({});
        }
      } finally {
        setLoadingSeries(false);
      }
    },
    [token, vehicles, byVehicle, vehicleTop6, vehicleList6]
  );

  const loadGenOtherLogs = useCallback(
    async (qs) => {
      if (!token) return;
      setLoadingGenOther(true);
      try {
        const [g, o] = await Promise.all([
          apiFetch(withQs('/api/fuel/generator', qs), { token }),
          apiFetch(withQs('/api/fuel/other', qs), { token }),
        ]);
        setGeneratorLogs(g?.logs || []);
        setOtherLogs(o?.logs || []);
      } catch (_) {
        setGeneratorLogs([]);
        setOtherLogs([]);
      } finally {
        setLoadingGenOther(false);
      }
    },
    [token]
  );

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQs(from, to);

      const [sum, top] = await Promise.all([
        apiFetch(withQs('/api/fuel/report/summary', qs), { token }),
        apiFetch(withQs('/api/fuel/kpi/by-vehicle', qs), { token }),
      ]);

      setSummary(sum || null);

      const rows = (top.rows || []).map((r) => ({
        plate: r.plate,
        liters: n0(r.liters),
        montant_ar: n0(r.montant_ar),
        refills: n0(r.refills),
      }));
      setByVehicle(rows);

      const plates6 = rows.slice(0, 6).map((r) => r.plate).filter(Boolean);
      await loadSeries6(qs, plates6);
    } catch (e) {
      setError(e?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!vehicles.length) return;
    const qs = buildQs(from, to);
    const plates6 = (byVehicle || []).slice(0, 6).map((r) => r.plate).filter(Boolean);
    loadSeries6(qs, plates6.length ? plates6 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length, byVehicle.length]);

  // ✅ Timeline “Graphique linéaire” pour Groupe électrogène + Autres
  useEffect(() => {
    const qs = buildQs(from, to);
    loadGenOtherLogs(qs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const safeSummary = useMemo(() => {
    const s = summary || {};
    const vehicle = s.vehicle || {};
    const generator = s.generator || {};
    const other = s.other || {};
    return {
      vehicle: {
        montant_ar: n0(vehicle.montant_ar),
        liters: n0(vehicle.liters),
        refills: n0(vehicle.refills),
      },
      generator: {
        montant_ar: n0(generator.montant_ar),
        liters: n0(generator.liters),
      },
      other: {
        montant_ar: n0(other.montant_ar),
        liters: n0(other.liters),
      },
    };
  }, [summary]);

  const totals = useMemo(() => {
    const totalMontant =
      safeSummary.vehicle.montant_ar +
      safeSummary.generator.montant_ar +
      safeSummary.other.montant_ar;
    const totalLiters =
      safeSummary.vehicle.liters +
      safeSummary.generator.liters +
      safeSummary.other.liters;
    return { totalMontant, totalLiters };
  }, [safeSummary]);

  const pctVehicle = useMemo(
    () => (safeSummary.vehicle.montant_ar / (totals.totalMontant || 1)) * 100,
    [safeSummary, totals]
  );
  const pctGenerator = useMemo(
    () => (safeSummary.generator.montant_ar / (totals.totalMontant || 1)) * 100,
    [safeSummary, totals]
  );
  const pctOther = useMemo(
    () => (safeSummary.other.montant_ar / (totals.totalMontant || 1)) * 100,
    [safeSummary, totals]
  );

  // ✅ Base options (token-aware)
  const baseLineOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 650 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        labels: { color: tokens.text, font: { weight: '700' } },
      },
      title: { display: false },
      tooltip: {
        enabled: true,
        displayColors: false,
        backgroundColor: tokens.tooltipBg,
        borderColor: tokens.tooltipBorder,
        borderWidth: 1,
        titleColor: tokens.text,
        bodyColor: tokens.muted,
        padding: 10,
        cornerRadius: 12,
      },
    },
    scales: {
      x: {
        ticks: {
          color: tokens.muted,
          font: { weight: '700' },
          maxRotation: 0,
          minRotation: 0,
          autoSkip: true,
          maxTicksLimit: isNarrow ? 7 : 12,
        },
        grid: { color: tokens.gridSoft, drawBorder: false },
      },
      y: {
        grid: { color: tokens.grid, drawBorder: false },
        ticks: { color: tokens.muted, font: { weight: '700' } },
      },
    },
  }), [tokens, isNarrow]);

  // ✅ Graphique multi-lignes (6 véhicules) — agrège semaine si trop de points
  const multiVehicleChart = useMemo(() => {
    const v6 = (vehicleTop6 && vehicleTop6.length ? vehicleTop6 : vehicleList6) || [];

    const rawDays = new Set();
    for (const v of v6) {
      const pts = seriesByVehicleId?.[v.id] || [];
      for (const p of pts) if (p?.log_date) rawDays.add(p.log_date);
    }
    const rawCount = rawDays.size;

    const mode = rawCount > 220 ? 'week' : 'day';
    const unitLabel = mode === 'week' ? 'semaines' : 'jours';

    const maps = v6.map((v) => {
      const pts = seriesByVehicleId?.[v.id] || [];
      const m = new Map();
      for (const p of pts) {
        const d = toYMD(p.log_date);
        if (!d) continue;
        const key = mode === 'week' ? isoWeekStart(d) : d;
        if (!key) continue;
        m.set(key, (m.get(key) || 0) + n0(p.montant_ar));
      }
      return m;
    });

    const labelsSet = new Set();
    for (const m of maps) for (const k of m.keys()) labelsSet.add(k);
    const labels = Array.from(labelsSet).filter(Boolean).sort();

    const series = v6.map((v, i) => {
      const m = maps[i];
      return {
        label: v.plate || `Véhicule ${i + 1}`,
        data: labels.map((k) => (m.has(k) ? m.get(k) : null)),
      };
    });

    return {
      labelsCount: labels.length,
      unitLabel,
      labels,
      series,
    };
  }, [vehicleTop6, vehicleList6, seriesByVehicleId]);

  const generatorTimeline = useMemo(
    () => aggregateLogsTimeline(generatorLogs, 'montant_ar'),
    [generatorLogs]
  );

  const otherTimeline = useMemo(
    () => aggregateLogsTimeline(otherLogs, 'montant_ar'),
    [otherLogs]
  );

  const miniAreaOptions = useMemo(() => ({
    ...baseLineOptions,
    plugins: {
      ...baseLineOptions.plugins,
      legend: { display: false },
    },
    scales: {
      ...baseLineOptions.scales,
      x: {
        ...baseLineOptions.scales.x,
        grid: { color: 'transparent', drawBorder: false }, // style premium (comme image 1)
      },
      y: {
        ...baseLineOptions.scales.y,
        ticks: {
          ...baseLineOptions.scales.y.ticks,
          callback: (v) => {
            const x = Number(v);
            if (!Number.isFinite(x)) return v;
            if (x >= 1_000_000) return (x / 1_000_000).toFixed(1) + 'M';
            if (x >= 1_000) return (x / 1_000).toFixed(0) + 'k';
            return String(x);
          },
        },
      },
    },
  }), [baseLineOptions]);

  // ✅ Couleurs basées tokens (warning / accent) => 100% cohérent UI
  const generatorLineData = useMemo(() => ({
    labels: generatorTimeline.labels,
    datasets: [
      makeAreaDataset('Montant (Ar)', generatorTimeline.values, tokens.warning, 0.22),
    ],
  }), [generatorTimeline, tokens.warning]);

  const otherLineData = useMemo(() => ({
    labels: otherTimeline.labels,
    datasets: [
      makeAreaDataset('Montant (Ar)', otherTimeline.values, tokens.accent, 0.20),
    ],
  }), [otherTimeline, tokens.accent]);

  return (
    <>
      <div className="rowBetween" style={{ alignItems: 'center' }}>
        <h2>Dashboard</h2>
        <div className="row" style={{ gap: 10 }}>
          <div className="field" style={{ minWidth: 180 }}>
            <label>Du</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ minWidth: 180 }}>
            <label>Au</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="row" style={{ alignItems: 'end' }}>
            <button className="btn" onClick={loadAll} disabled={loading || loadingSeries || loadingGenOther}>
              {(loading || loadingSeries || loadingGenOther) ? 'Chargement...' : 'Actualiser'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice" style={{ marginTop: 12, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      <div className="kpiRow3" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
        <PremiumKpiCard
          title="Véhicules"
          subtitle="Suivi carburant"
          montant={safeSummary.vehicle.montant_ar}
          liters={safeSummary.vehicle.liters}
          refills={safeSummary.vehicle.refills}
          pct={pctVehicle}
          accent="emerald"
          onOpen={() => (window.location.href = '/app/fuel')}
        />

        <PremiumKpiCard
          title="Groupe électrogène"
          subtitle="Suivi carburant"
          montant={safeSummary.generator.montant_ar}
          liters={safeSummary.generator.liters}
          refills={null}
          pct={pctGenerator}
          accent="orange"
          onOpen={() => (window.location.href = '/app/fuel')}
        />

        <PremiumKpiCard
          title="Autres"
          subtitle="Suivi carburant"
          montant={safeSummary.other.montant_ar}
          liters={safeSummary.other.liters}
          refills={null}
          pct={pctOther}
          accent="violet"
          onOpen={() => (window.location.href = '/app/fuel')}
        />
      </div>

      {/* ✅ 2 colonnes (gros chart full width + 2 petits charts) */}
      <div className="dashCharts3" style={{ marginTop: 16 }}>
        <ChartCard
          className="dashBigChart"
          title="Top 6 véhicules — évolution (Montant Ar)"
          right={<span className="badge badge-info">{multiVehicleChart.labelsCount} {multiVehicleChart.unitLabel}</span>}
        >
          {!vehicleTop6.length ? (
            <div className="notice" style={{ height: '100%' }}>
              Aucun véhicule trouvé.
            </div>
          ) : (
            multiVehicleChart.labelsCount ? (
              <Vehicle6AreaChart labels={multiVehicleChart.labels} series={multiVehicleChart.series} valueSuffix=" Ar" />
            ) : (
              <div className="notice" style={{ height: '100%' }}>
                Aucune donnée sur la période.
              </div>
            )
          )}
        </ChartCard>

        <ChartCard className="dashDonut1" title="Groupe électrogène — Montant (Ar)" height={210}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ flex: '0 0 190px', minHeight: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Graphique linéaire</div>
              <div style={{ fontSize: 13, color: tokens.muted, opacity: 0.95, marginBottom: 8 }}>
                Évolution du montant du groupe électrogène sur la période.
              </div>

              <div style={{ height: 140 }}>
                {loadingGenOther ? (
                  <div className="notice" style={{ height: '100%' }}>Chargement...</div>
                ) : generatorTimeline.labelsCount ? (
                  <Line data={generatorLineData} options={miniAreaOptions} />
                ) : (
                  <div className="notice" style={{ height: '100%' }}>Aucune donnée sur la période.</div>
                )}
              </div>
            </div>
          </div>
        </ChartCard>

        <ChartCard className="dashDonut2" title="Autres carburant — Montant (Ar)" height={210}>
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ flex: '0 0 190px', minHeight: 0 }}>
              <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>Graphique linéaire</div>
              <div style={{ fontSize: 13, color: tokens.muted, opacity: 0.95, marginBottom: 8 }}>
                Évolution du montant des autres carburants sur la période.
              </div>

              <div style={{ height: 140 }}>
                {loadingGenOther ? (
                  <div className="notice" style={{ height: '100%' }}>Chargement...</div>
                ) : otherTimeline.labelsCount ? (
                  <Line data={otherLineData} options={miniAreaOptions} />
                ) : (
                  <div className="notice" style={{ height: '100%' }}>Aucune donnée sur la période.</div>
                )}
              </div>
            </div>
          </div>
        </ChartCard>

        {/* table sur toute la largeur */}
        <div className="card dashSpanAll">
          <h3 style={{ marginBottom: 10 }}>Top véhicules (montant)</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: 520 }}>
              <thead>
                <tr>
                  <th>Véhicule</th>
                  <th>Montant</th>
                  <th>Litres</th>
                  <th>Repleins</th>
                </tr>
              </thead>
              <tbody>
                {byVehicle.slice(0, 10).map((r) => (
                  <tr key={r.plate}>
                    <td style={{ fontWeight: 900 }}>{r.plate}</td>
                    <td>{fmtMoneyAr(r.montant_ar)} Ar</td>
                    <td>{fmtLiters(r.liters)}</td>
                    <td>{r.refills}</td>
                  </tr>
                ))}
                {!byVehicle.length && (
                  <tr>
                    <td colSpan={4} style={{ padding: 14, color: '#6b7280' }}>
                      Aucune donnée
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        /* KPIs responsive (inchangé) */
        @media (max-width: 980px){
          .kpiRow3 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
        }
        @media (max-width: 620px){
          .kpiRow3 { grid-template-columns: 1fr !important; }
          .kpiPremium .kpiOpenBtn { width: 100% !important; }
        }
        @media (max-width: 520px){
          .kpiPremium .kpiMiniGrid { grid-template-columns: 1fr !important; }
          .kpiPremium .kpiValue { font-size: clamp(18px, 5vw, 22px) !important; }
          .kpiPremium .kpiUnit { font-size: clamp(12px, 3.5vw, 14px) !important; }
        }

        /* ✅ Dashboard charts = 2 colonnes */
        .dashCharts3{
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          align-items: start;
        }
        .dashBigChart{ grid-column: 1 / -1; }
        .dashSpanAll{ grid-column: 1 / -1; }

        @media (max-width: 720px){
          .dashCharts3{ grid-template-columns: 1fr; }
          .dashBigChart{ grid-column: auto; }
          .dashSpanAll{ grid-column: auto; }
        }
      `}</style>
    </>
  );
}

export default memo(Dashboard);
