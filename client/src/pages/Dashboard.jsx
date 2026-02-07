// client/src/pages/Dashboard.jsx
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

import { Line, Doughnut } from 'react-chartjs-2';

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

function fmtMoneyAr(v) {
  return n0(v).toLocaleString('fr-FR');
}

function fmtLiters(v) {
  const x = n0(v);
  // garde 2 décimales mais sans forcer les zéros inutiles
  return x % 1 === 0 ? String(x) : x.toFixed(2);
}

function buildQs(from, to) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  return qs.toString();
}

function clampPct(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

function pickPalette(i) {
  const palette = [
    { line: '#34d399', fill: 'rgba(52,211,153,.12)' }, // emerald
    { line: '#60a5fa', fill: 'rgba(96,165,250,.12)' }, // blue
    { line: '#f472b6', fill: 'rgba(244,114,182,.12)' }, // pink
    { line: '#fb923c', fill: 'rgba(251,146,60,.12)' },  // orange
    { line: '#a78bfa', fill: 'rgba(167,139,250,.12)' }, // violet
    { line: '#22d3ee', fill: 'rgba(34,211,238,.12)' },  // cyan
  ];
  return palette[i % palette.length];
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
        <div className="rowBetween" style={{ alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, color: '#e5e7eb' }}>{title}</div>
            <div style={{ fontSize: 12, color: 'rgba(229,231,235,.65)', marginTop: 2 }}>
              {subtitle}
            </div>
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
          style={{
            marginTop: 14,
            display: 'grid',
            gridTemplateColumns: refills !== null && refills !== undefined ? 'repeat(3, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))',
            gap: 12,
          }}
        >
          <div
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 14,
              padding: 12,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>Montant (Ar)</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: '#fff' }}>
              {fmtMoneyAr(montant)} <span style={{ fontSize: 14, opacity: 0.75 }}>Ar</span>
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
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
              border: '1px solid rgba(255,255,255,.08)',
              borderRadius: 14,
              padding: 12,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>Litres</div>
            <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: '#dbeafe' }}>
              {fmtLiters(liters)} <span style={{ fontSize: 14, opacity: 0.75 }}>L</span>
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
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))',
                border: '1px solid rgba(255,255,255,.08)',
                borderRadius: 14,
                padding: 12,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>Repleins</div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: '#bbf7d0' }}>
                {n0(refills)}
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
            <div style={{ color: 'rgba(229,231,235,.65)', fontSize: 12, fontWeight: 800 }}>
              Part du total (montant)
            </div>
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

function ChartCard({ title, children, right }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="rowBetween" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {right || null}
      </div>
      <div style={{ height: 320 }}>
        {children}
      </div>
    </div>
  );
}

function Dashboard() {
  const { token } = useAuth();

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dailyTotal, setDailyTotal] = useState([]);
  const [byVehicle, setByVehicle] = useState([]);
  const [seriesByVehicleId, setSeriesByVehicleId] = useState({}); // { [id]: points[] }

  const [loading, setLoading] = useState(false);
  const [loadingSeries, setLoadingSeries] = useState(false);
  const [error, setError] = useState(null);

  // ✅ Charge la liste des véhicules
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

    const loadSeries6 = useCallback(async (qs) => {
    // ✅ Séries individuelles pour 6 véhicules (1 seule requête backend)
    if (!vehicleList6.length) {
      setSeriesByVehicleId({});
      return;
    }

    setLoadingSeries(true);
    try {
      const ids = vehicleList6.map((v) => v.id).join(',');
      const bulk = await apiFetch(`/api/fuel/kpi/daily/bulk?${qs}&vehicle_ids=${encodeURIComponent(ids)}`, { token });
      const series = bulk?.series || {};

      const obj = {};
      for (const v of vehicleList6) {
        const pts = (series[v.id] || []).map((p) => ({
          log_date: toYMD(p.log_date),
          liters: n0(p.liters),
          montant_ar: n0(p.montant_ar),
          refills: n0(p.refills),
        }));
        obj[v.id] = pts;
      }

      setSeriesByVehicleId(obj);
    } catch (_) {
      setSeriesByVehicleId({});
    } finally {
      setLoadingSeries(false);
    }
  }, [token, vehicleList6]);

async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQs(from, to);

      const [sum, daily, top] = await Promise.all([
        apiFetch(`/api/fuel/report/summary?${qs}`, { token }),
        apiFetch(`/api/fuel/kpi/daily?${qs}`, { token }),
        apiFetch(`/api/fuel/kpi/by-vehicle?${qs}`, { token }),
      ]);

      setSummary(sum || null);

      const points = (daily.points || []).map((p) => ({
        log_date: toYMD(p.log_date),
        liters: n0(p.liters),
        montant_ar: n0(p.montant_ar),
        refills: n0(p.refills),
      }));
      setDailyTotal(points);

      const rows = (top.rows || []).map((r) => ({
        plate: r.plate,
        liters: n0(r.liters),
        montant_ar: n0(r.montant_ar),
        refills: n0(r.refills),
      }));
      setByVehicle(rows);

      await loadSeries6(qs);
    } catch (e) {
      setError(e?.message || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }

  // 1er chargement + recharge si la liste des véhicules arrive après
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // ✅ Quand les véhicules sont chargés, on charge UNIQUEMENT les 6 séries (pas tout le dashboard)
    if (vehicles.length) {
      const qs = buildQs(from, to);
      loadSeries6(qs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles.length]);

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

  const pctVehicle = useMemo(() => {
    const t = totals.totalMontant || 1;
    return (safeSummary.vehicle.montant_ar / t) * 100;
  }, [safeSummary, totals]);

  const pctGenerator = useMemo(() => {
    const t = totals.totalMontant || 1;
    return (safeSummary.generator.montant_ar / t) * 100;
  }, [safeSummary, totals]);

  const pctOther = useMemo(() => {
    const t = totals.totalMontant || 1;
    return (safeSummary.other.montant_ar / t) * 100;
  }, [safeSummary, totals]);

  const baseLineOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top' },
      tooltip: { enabled: true },
      title: { display: false },
    },
    scales: {
      x: {
        ticks: { maxRotation: 45, minRotation: 45 },
        grid: { color: 'rgba(15,23,42,.06)' },
      },
      y: {
        grid: { color: 'rgba(15,23,42,.06)' },
        ticks: { callback: (v) => String(v) },
      },
    },
  }), []);

  // ===== Line double-axe : Total véhicules (Montant vs Litres)
  const totalVehicleChart = useMemo(() => {
    const labels = dailyTotal.map((p) => p.log_date);
    return {
      data: {
        labels,
        datasets: [
          {
            label: 'Montant véhicule (Ar)',
            data: dailyTotal.map((p) => p.montant_ar),
            borderColor: '#34d399',
            backgroundColor: 'rgba(52,211,153,.12)',
            tension: 0.35,
            fill: true,
            yAxisID: 'y',
            pointRadius: 0,
          },
          {
            label: 'Litres véhicule',
            data: dailyTotal.map((p) => p.liters),
            borderColor: '#60a5fa',
            backgroundColor: 'rgba(96,165,250,.10)',
            tension: 0.35,
            fill: false,
            yAxisID: 'y1',
            pointRadius: 0,
          },
        ],
      },
      options: {
        ...baseLineOptions,
        scales: {
          x: baseLineOptions.scales.x,
          y: {
            position: 'left',
            grid: { color: 'rgba(15,23,42,.06)' },
            ticks: {
              callback: (v) => String(v),
            },
          },
          y1: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              callback: (v) => String(v),
            },
          },
        },
      },
    };
  }, [dailyTotal, baseLineOptions]);

  // ===== Doughnut Montant : Groupe vs Autres
  const doughnutMontant = useMemo(() => ({
    data: {
      labels: ['Groupe électrogène', 'Autres'],
      datasets: [
        {
          label: 'Montant (Ar)',
          data: [safeSummary.generator.montant_ar, safeSummary.other.montant_ar],
          backgroundColor: ['rgba(251,146,60,.75)', 'rgba(167,139,250,.75)'],
          borderColor: ['rgba(251,146,60,1)', 'rgba(167,139,250,1)'],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    animation: false,
      plugins: { legend: { position: 'bottom' } },
      cutout: '68%',
    },
  }), [safeSummary]);

  // ===== Doughnut Litres : Groupe vs Autres
  const doughnutLiters = useMemo(() => ({
    data: {
      labels: ['Groupe électrogène', 'Autres'],
      datasets: [
        {
          label: 'Litres',
          data: [safeSummary.generator.liters, safeSummary.other.liters],
          backgroundColor: ['rgba(34,211,238,.70)', 'rgba(96,165,250,.70)'],
          borderColor: ['rgba(34,211,238,1)', 'rgba(96,165,250,1)'],
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
    animation: false,
      plugins: { legend: { position: 'bottom' } },
      cutout: '68%',
    },
  }), [safeSummary]);

  // ===== Multi-axes : 6 véhicules (Montant) — 1 axe par véhicule (axes secondaires masqués)
  const multiVehicleChart = useMemo(() => {
    const ids = vehicleList6.map((v) => v.id);
    const allDates = new Set();
    for (const id of ids) {
      const pts = seriesByVehicleId[id] || [];
      for (const p of pts) allDates.add(p.log_date);
    }
    const labels = Array.from(allDates);
    labels.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    const scales = {
      x: {
        ticks: { maxRotation: 45, minRotation: 45 },
        grid: { color: 'rgba(15,23,42,.06)' },
      },
    };

    const datasets = vehicleList6.map((v, idx) => {
      const pts = seriesByVehicleId[v.id] || [];
      const map = new Map(pts.map((p) => [p.log_date, p.montant_ar]));
      const pal = pickPalette(idx);
      const axisId = `y_${v.id}`;

      // ✅ un axe par véhicule
      scales[axisId] = {
        position: idx % 2 === 0 ? 'left' : 'right',
        display: idx === 0, // n'affiche que le 1er axe (sinon trop chargé)
        grid: idx === 0 ? { color: 'rgba(15,23,42,.06)' } : { drawOnChartArea: false },
        ticks: idx === 0 ? { callback: (val) => String(val) } : { display: false },
      };

      return {
        label: v.plate || `Véhicule ${idx + 1}`,
        data: labels.map((d) => n0(map.get(d))),
        borderColor: pal.line,
        backgroundColor: pal.fill,
        tension: 0.35,
        fill: false,
        yAxisID: axisId,
        pointRadius: 0,
      };
    });

    return {
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
    animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top' },
          tooltip: { enabled: true },
        },
        scales,
      },
    };
  }, [vehicleList6, seriesByVehicleId]);

  // ===== 6 charts individuels : (Montant + Litres en double axe)
  const perVehicleCharts = useMemo(() => {
    return vehicleList6.map((v, idx) => {
      const pts = seriesByVehicleId[v.id] || [];
      const labels = pts.map((p) => p.log_date);
      const pal = pickPalette(idx);

      return {
        key: v.id,
        plate: v.plate,
        data: {
          labels,
          datasets: [
            {
              label: 'Montant (Ar)',
              data: pts.map((p) => p.montant_ar),
              borderColor: pal.line,
              backgroundColor: pal.fill,
              tension: 0.35,
              fill: true,
              yAxisID: 'y',
              pointRadius: 0,
            },
            {
              label: 'Litres',
              data: pts.map((p) => p.liters),
              borderColor: '#60a5fa',
              backgroundColor: 'rgba(96,165,250,.10)',
              tension: 0.35,
              fill: false,
              yAxisID: 'y1',
              pointRadius: 0,
            },
          ],
        },
        options: {
          ...baseLineOptions,
          scales: {
            x: baseLineOptions.scales.x,
            y: {
              position: 'left',
              grid: { color: 'rgba(15,23,42,.06)' },
              ticks: { callback: (val) => String(val) },
            },
            y1: {
              position: 'right',
              grid: { drawOnChartArea: false },
              ticks: { callback: (val) => String(val) },
            },
          },
        },
      };
    });
  }, [vehicleList6, seriesByVehicleId, baseLineOptions]);

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
            <button className="btn" onClick={loadAll} disabled={loading || loadingSeries}>
              {(loading || loadingSeries) ? 'Chargement...' : 'Actualiser'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="notice" style={{ marginTop: 12, color: '#b91c1c' }}>
          {error}
        </div>
      )}

      {/* KPI cards premium */}
      <div
        className="kpiRow3"
        style={{
          marginTop: 14,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 14,
        }}
      >
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

      {/* Charts zone */}
      <div
        style={{
          marginTop: 16,
          display: 'grid',
          gridTemplateColumns: '1.2fr .8fr',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {/* Total véhicules double axe */}
        <ChartCard
          title="Véhicules — évolution par jour (total)"
          right={
            <span className="badge badge-info">
              {dailyTotal.length} jours
            </span>
          }
        >
          <Line data={totalVehicleChart.data} options={totalVehicleChart.options} />
        </ChartCard>

        {/* Right column: doughnuts + top table */}
        <div style={{ display: 'grid', gap: 14 }}>
          <ChartCard title="Groupe électrogène vs Autres — Montant (Ar)">
            <Doughnut data={doughnutMontant.data} options={doughnutMontant.options} />
          </ChartCard>

          <ChartCard title="Groupe électrogène vs Autres — Litres">
            <Doughnut data={doughnutLiters.data} options={doughnutLiters.options} />
          </ChartCard>

          <div className="card">
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
      </div>

     

    

      {/* Responsive quick fix sans toucher styles.css */}
      <style>{`
        
        @media (max-width: 900px){
          .kpiRow3 { grid-template-columns: 200px !important; }
        }
        @media (max-width: 720px){
          .dashGrid3 { grid-template-columns: 200px !important; }
        }
      `}</style>
    </>
  );
}



export default memo(Dashboard);