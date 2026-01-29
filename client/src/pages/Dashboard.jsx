import React, { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function fmtAr(n) {
  const v = Number(n || 0);
  return v.toLocaleString('fr-FR');
}

export default function Dashboard() {
  const { token } = useAuth();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [summary, setSummary] = useState(null);
  const [daily, setDaily] = useState([]);
  const [byVehicle, setByVehicle] = useState([]);
  const [err, setErr] = useState(null);

  async function load() {
    setErr(null);
    try {
      const s = await apiFetch(`/api/fuel/report/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token });
      const d = await apiFetch(`/api/fuel/kpi/daily?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token });
      const bv = await apiFetch(`/api/fuel/kpi/by-vehicle?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { token });
      setSummary(s);
      setDaily(d.points || []);
      setByVehicle(bv.rows || []);
    } catch (e) {
      setErr(e.message);
    }
  }

  useEffect(() => { load(); // initial
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chartData = useMemo(() => {
    const labels = daily.map(p => p.log_date || '');
    return {
      labels,
      datasets: [
        { label: 'Montant véhicule (Ar)', data: daily.map(p => Number(p.montant_ar || 0)) },
        { label: 'Litres véhicule', data: daily.map(p => Number(p.liters || 0)) }
      ]
    };
  }, [daily]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="card" style={{ flex: 1 }}>
          <div className="h1">Dashboard</div>
          <div className="row" style={{ gap: 10, alignItems: 'end' }}>
            <div>
              <div className="label">Du</div>
              <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div>
              <div className="label">Au</div>
              <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <button className="btn" onClick={load}>Actualiser</button>
          </div>
          {err && <div className="error" style={{ marginTop: 10 }}>{err}</div>}
        </div>
      </div>

      {summary && (
        <div className="row" style={{ gap: 12, marginBottom: 12 }}>
          <div className="card" style={{ flex: 1 }}>
            <div className="h2">Véhicules</div>
            <div>Montant: <b>{fmtAr(summary.vehicle?.montant_ar)} Ar</b></div>
            <div>Litres: <b>{Number(summary.vehicle?.liters || 0).toFixed(2)}</b></div>
            <div>Repleins: <b>{summary.vehicle?.refills || 0}</b></div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="h2">Groupe électrogène</div>
            <div>Montant: <b>{fmtAr(summary.generator?.montant_ar)} Ar</b></div>
            <div>Litres: <b>{Number(summary.generator?.liters || 0).toFixed(2)}</b></div>
          </div>
          <div className="card" style={{ flex: 1 }}>
            <div className="h2">Autres</div>
            <div>Montant: <b>{fmtAr(summary.other?.montant_ar)} Ar</b></div>
            <div>Litres: <b>{Number(summary.other?.liters || 0).toFixed(2)}</b></div>
          </div>
        </div>
      )}

      <div className="row" style={{ gap: 12 }}>
        <div className="card" style={{ flex: 2 }}>
          <div className="h2">Véhicule - évolution par jour</div>
          <Line data={chartData} />
        </div>
        <div className="card" style={{ flex: 1 }}>
          <div className="h2">Top véhicules (montant)</div>
          <div className="tableWrap">
            <table>
              <thead>
                <tr><th>Véhicule</th><th>Montant</th><th>Litres</th></tr>
              </thead>
              <tbody>
                {byVehicle.slice(0, 12).map((r) => (
                  <tr key={r.plate}>
                    <td>{r.plate}</td>
                    <td>{fmtAr(r.montant_ar)} Ar</td>
                    <td>{Number(r.liters || 0).toFixed(2)}</td>
                  </tr>
                ))}
                {!byVehicle.length && <tr><td colSpan="3" className="muted">Aucune donnée</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
