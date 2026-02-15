import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch, getApiUrl } from '../utils/api.js';
import Modal from '../components/Modal.jsx';
import './Fuel.css';

function fmt(v) {
  if (v === null || v === undefined || v === '') return '';
  return String(v);
}

// ✅ Convertit n'importe quel format en "YYYY-MM-DD"
function toYMD(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('fr-CA');
  return s;
}

function toMoneyAr(v) {
  const n = Number(v || 0);
  return n.toLocaleString('fr-FR');
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtNum(v, { decimals = 0 } = {}) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

const asInt = (v) => (v === '' || v === null || v === undefined ? null : Number.parseInt(v, 10));
const asFloat = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

function KpiCard({ label, value, hint, icon = 'stats-chart-outline', tone = 'a' }) {
  return (
    <div className={`fuel-kpi-card tone-${tone}`}>
      <div className="fuel-kpi-top">
        <div className="fuel-kpi-icon">
          <ion-icon name={icon} />
        </div>
        <div className="fuel-kpi-meta">
          <div className="fuel-kpi-label">{label}</div>
          <div className="fuel-kpi-value">{value}</div>
        </div>
      </div>
      {hint ? <div className="fuel-kpi-hint">{hint}</div> : null}
    </div>
  );
}

function Badge({ yes }) {
  return (
    <span className={`fuel-badge ${yes ? 'fuel-badge--yes' : 'fuel-badge--no'}`}>
      {yes ? 'Oui' : 'Non'}
    </span>
  );
}

function IconBtn({ title, onClick, icon, variant }) {
  return (
    <button
      type="button"
      className={`fuel-icon-btn ${variant ? `fuel-icon-btn--${variant}` : ''}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      <ion-icon name={icon} />
    </button>
  );
}

const SORTABLE_KEYS = new Set(['log_date', 'liters', 'montant_ar']);

export default function Fuel() {
  const { token, user } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();

  const urlTab = String(searchParams.get('tab') || '').toLowerCase();
  const initialTab = ['vehicle', 'generator', 'other'].includes(urlTab) ? urlTab : 'vehicle';

  const [tab, setTab] = useState(initialTab);

  // ✅ Synchronise l'onglet avec l'URL (utile pour les boutons "Ouvrir" du Dashboard + back/forward)
  useEffect(() => {
    const t = String(searchParams.get('tab') || '').toLowerCase();
    if (t && t !== tab && ['vehicle', 'generator', 'other'].includes(t)) {
      setTab(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const current = String(searchParams.get('tab') || '').toLowerCase();
    if (current !== tab) {
      const next = new URLSearchParams(searchParams);
      next.set('tab', tab);
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [vehicles, setVehicles] = useState([]);
  const [vehicleId, setVehicleId] = useState('');
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState(null);

  // ✅ UX: densité
  const [density, setDensity] = useState('comfort'); // comfort | compact

  // ✅ Tri UI
  const [sort, setSort] = useState({ key: 'log_date', dir: 'desc' });

  // ✅ Recherche + filtres avancés
  const [q, setQ] = useState('');
  const [advOpen, setAdvOpen] = useState(false);

  const [chauffeurFilter, setChauffeurFilter] = useState('');
  const [refillFilter, setRefillFilter] = useState('all'); // all | yes | no (vehicle)
  const [montantMin, setMontantMin] = useState('');
  const [montantMax, setMontantMax] = useState('');
  const [litersMin, setLitersMin] = useState('');
  const [litersMax, setLitersMax] = useState('');

  // ✅ Pagination client
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  // ========== ÉTAT POUR CRUD ==========
  const [viewModal, setViewModal] = useState(null); // {log}
  const [editModal, setEditModal] = useState(null); // {log, draft}
  const [createModal, setCreateModal] = useState(null); // { draft }

  const canManage = user && ['LOGISTIQUE', 'ADMIN'].includes(user.role);
  const canExport = canManage;

  useEffect(() => {
    apiFetch('/api/meta/vehicles', { token })
      .then((d) => setVehicles(d.vehicles || []))
      .catch(() => setVehicles([]));
  }, [token]);

  async function load() {
    setError(null);

    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (tab === 'vehicle' && vehicleId) qs.set('vehicle_id', vehicleId);

    // ✅ Optimisation: si “Plein = Oui”, demander backend only_refill=true
    if (tab === 'vehicle' && refillFilter === 'yes') qs.set('only_refill', 'true');

    try {
      const d = await apiFetch(`/api/fuel/${tab}?${qs.toString()}`, { token });
      const fixed = (d.logs || []).map((r) => ({ ...r, log_date: toYMD(r.log_date) }));
      setLogs(fixed);
      setPage(1);
    } catch (e) {
      setError(e.message);
      setLogs([]);
      setPage(1);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function exportCsv() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    if (tab === 'vehicle' && vehicleId) qs.set('vehicle_id', vehicleId);

    const url = `${getApiUrl()}/api/fuel/export/${encodeURIComponent(tab)}?${qs.toString()}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const txt = await res.text();
      alert(`Export failed: ${txt}`);
      return;
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `export_${tab}_${from || 'all'}_${to || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ========== VOIR ==========
  function openView(log) {
    setViewModal({ log: { ...log, log_date: toYMD(log.log_date) } });
  }

  // ========== MODIFIER ==========
  function openEdit(log) {
    const fixedLog = { ...log, log_date: toYMD(log.log_date) };
    setEditModal({ log: fixedLog, draft: { ...fixedLog } });
  }

  async function saveEdit() {
    if (!editModal) return;
    setError(null);
    try {
      const endpoint = `/api/fuel/${tab}/${editModal.log.id}`;
      await apiFetch(endpoint, { token, method: 'PUT', body: editModal.draft });
      setEditModal(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  // ========== SUPPRIMER ==========
  async function handleDelete(log) {
    if (!confirm(`Supprimer cette ligne ?\n${log.log_date || ''}`)) return;
    setError(null);
    try {
      await apiFetch(`/api/fuel/${tab}/${log.id}`, { token, method: 'DELETE' });
      await load();
      alert('✅ Envoyé dans la corbeille');
    } catch (e) {
      setError(e.message);
    }
  }

  // ========== AJOUTER ==========
  function openCreate() {
    const today = toYMD(new Date());
    if (tab === 'vehicle') {
      setCreateModal({
        draft: {
          vehicle_id: vehicleId || '',
          log_date: today,
          km_depart: null,
          km_arrivee: null,
          km_jour: null,
          compteur: null,
          liters: null,
          montant_ar: null,
          chauffeur: '',
          frns: '',
          lien: ''
        }
      });
      return;
    }
    if (tab === 'generator') {
      setCreateModal({ draft: { log_date: today, liters: null, montant_ar: null } });
      return;
    }
    setCreateModal({ draft: { log_date: today, liters: null, montant_ar: null, lien: '' } });
  }

  async function saveCreate() {
    if (!createModal) return;
    setError(null);

    const d = { ...createModal.draft };
    if (!d.log_date) return alert('La date est obligatoire');
    if (tab === 'vehicle' && !d.vehicle_id) return alert('Sélectionne un véhicule');

    if (tab === 'vehicle') {
      const dep = d.km_depart ?? null;
      const arr = d.km_arrivee ?? null;
      d.km_jour = dep !== null && arr !== null ? (arr - dep) : null;
    }

    try {
      await apiFetch(`/api/fuel/${tab}`, { method: 'POST', token, body: d });
      setCreateModal(null);
      await load();
      alert('✅ Entrée ajoutée');
    } catch (e) {
      setError(e.message || 'Erreur ajout');
    }
  }

  const columns = useMemo(() => {
    if (tab === 'vehicle') {
      return [
        { key: 'log_date', label: 'Date', cls: 'nowrap' },
        { key: 'plate', label: 'Véhicule', cls: 'nowrap' },
        { key: 'day_name', label: 'Jour', cls: 'nowrap' },

        { key: 'km_depart', label: 'Km départ', cls: 'num nowrap' },
        { key: 'km_arrivee', label: 'Km arrivée', cls: 'num nowrap' },
        { key: 'km_jour', label: 'Km/j', cls: 'num nowrap' },
        { key: 'compteur', label: 'Compteur', cls: 'num nowrap' },

        { key: 'liters', label: 'Litres', cls: 'num nowrap' },
        { key: 'montant_ar', label: 'Montant (Ar)', cls: 'num nowrap' },

        { key: 'is_refill', label: 'Plein', cls: 'center nowrap' },

        { key: 'chauffeur', label: 'Chauffeur', cls: 'ellipsis' },
        { key: 'frns', label: 'Fournisseur', cls: 'ellipsis' },

        { key: 'lien', label: 'Lien', cls: 'nowrap' }
      ];
    }

    if (tab === 'generator') {
      return [
        { key: 'log_date', label: 'Date', cls: 'nowrap' },
        { key: 'liters', label: 'Litres', cls: 'num nowrap' },
        { key: 'montant_ar', label: 'Montant (Ar)', cls: 'num nowrap' },
        { key: 'source_file_name', label: 'Fichier', cls: 'ellipsis' }
      ];
    }

    return [
      { key: 'log_date', label: 'Date', cls: 'nowrap' },
      { key: 'liters', label: 'Litres', cls: 'num nowrap' },
      { key: 'montant_ar', label: 'Montant (Ar)', cls: 'num nowrap' },
      { key: 'lien', label: 'Lien', cls: 'nowrap' },
      { key: 'source_file_name', label: 'Fichier', cls: 'ellipsis' }
    ];
  }, [tab]);

  function renderCell(row, col) {
    const k = col.key;
    const v = row[k];

    if (k === 'log_date') return toYMD(v);
    if (k === 'montant_ar') return toMoneyAr(v);
    if (k === 'liters') return fmtNum(v, { decimals: 2 });

    if (k === 'km_depart' || k === 'km_arrivee' || k === 'km_jour' || k === 'compteur') {
      return fmtNum(v, { decimals: 0 });
    }

    if (k === 'is_refill') return <Badge yes={!!row.is_refill} />;

    if (k === 'lien' && v) {
      return (
        <a className="fuel-link" href={v} target="_blank" rel="noreferrer">
          Ouvrir
        </a>
      );
    }

    return fmt(v);
  }

  // ✅ Reset page si filtres changent
  useEffect(() => {
    setPage(1);
  }, [q, chauffeurFilter, refillFilter, montantMin, montantMax, litersMin, litersMax, pageSize, tab, vehicleId, from, to]);

  // ✅ Filter client (recherche + avancés)
  const filteredLogs = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const chf = chauffeurFilter.trim().toLowerCase();

    const minM = montantMin === '' ? null : Number(montantMin);
    const maxM = montantMax === '' ? null : Number(montantMax);
    const minL = litersMin === '' ? null : Number(litersMin);
    const maxL = litersMax === '' ? null : Number(litersMax);

    const hasNum = (x) => x !== null && x !== undefined && x !== '' && Number.isFinite(Number(x));
    const n = (x) => Number(x);

    return logs.filter((r) => {
      if (qq) {
        const blob = [r.plate, r.chauffeur, r.frns, r.source_file_name, r.lien]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!blob.includes(qq)) return false;
      }

      if (chf) {
        const v = (r.chauffeur || '').toLowerCase();
        if (!v.includes(chf)) return false;
      }

      if (tab === 'vehicle') {
        if (refillFilter === 'yes' && !r.is_refill) return false;
        if (refillFilter === 'no' && r.is_refill) return false;
      }

      if (minM !== null) {
        if (!hasNum(r.montant_ar)) return false;
        if (n(r.montant_ar) < minM) return false;
      }
      if (maxM !== null) {
        if (!hasNum(r.montant_ar)) return false;
        if (n(r.montant_ar) > maxM) return false;
      }

      if (minL !== null) {
        if (!hasNum(r.liters)) return false;
        if (n(r.liters) < minL) return false;
      }
      if (maxL !== null) {
        if (!hasNum(r.liters)) return false;
        if (n(r.liters) > maxL) return false;
      }

      return true;
    });
  }, [logs, q, chauffeurFilter, refillFilter, montantMin, montantMax, litersMin, litersMax, tab]);

  // ✅ KPIs basés sur ce que l’utilisateur VOIT (filtré)
  const kpi = useMemo(() => {
    const totalLiters = filteredLogs.reduce((s, r) => s + toNum(r.liters), 0);
    const totalMontant = filteredLogs.reduce((s, r) => s + toNum(r.montant_ar), 0);

    let refills = 0;
    let kmTotal = 0;

    if (tab === 'vehicle') {
      for (const r of filteredLogs) {
        if (r.is_refill) refills += 1;

        if (r.km_jour !== null && r.km_jour !== undefined && r.km_jour !== '') {
          kmTotal += toNum(r.km_jour);
        } else if (r.km_depart != null && r.km_arrivee != null) {
          kmTotal += Math.max(0, toNum(r.km_arrivee) - toNum(r.km_depart));
        }
      }
    }

    const conso = tab === 'vehicle' && kmTotal > 0 ? totalLiters / (kmTotal / 100) : null;

    return { totalLiters, totalMontant, refills, kmTotal, conso, count: filteredLogs.length };
  }, [filteredLogs, tab]);

  // ✅ Tri (sur la liste filtrée)
  const sortedLogs = useMemo(() => {
    const key = sort?.key;
    const dir = sort?.dir === 'asc' ? 1 : -1;
    if (!key || !SORTABLE_KEYS.has(key)) return filteredLogs;

    const getVal = (r) => {
      if (key === 'log_date') return toYMD(r.log_date || '');
      if (key === 'liters') return r.liters;
      if (key === 'montant_ar') return r.montant_ar;
      return r[key];
    };

    const isNullish = (v) => v === null || v === undefined || v === '';

    const arr = [...filteredLogs];
    arr.sort((a, b) => {
      const av = getVal(a);
      const bv = getVal(b);

      const an = isNullish(av);
      const bn = isNullish(bv);
      if (an && bn) return 0;
      if (an) return 1;
      if (bn) return -1;

      if (key === 'log_date') {
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return 0;
      }

      const na = Number(av);
      const nb = Number(bv);
      if (Number.isNaN(na) || Number.isNaN(nb)) return 0;
      if (na < nb) return -1 * dir;
      if (na > nb) return 1 * dir;
      return 0;
    });

    return arr;
  }, [filteredLogs, sort]);

  function toggleSort(colKey) {
    if (!SORTABLE_KEYS.has(colKey)) return;
    setSort((prev) => {
      if (!prev || prev.key !== colKey) return { key: colKey, dir: 'asc' };
      return { key: colKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  }

  function sortIcon(colKey) {
    if (!SORTABLE_KEYS.has(colKey)) return null;
    if (sort?.key !== colKey) return <ion-icon name="swap-vertical-outline" />;
    return sort.dir === 'asc' ? <ion-icon name="caret-up-outline" /> : <ion-icon name="caret-down-outline" />;
  }

  function ariaSortFor(colKey) {
    if (!SORTABLE_KEYS.has(colKey)) return undefined;
    if (sort?.key !== colKey) return 'none';
    return sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  // ✅ Pagination (après tri)
  const total = sortedLogs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clamp(page, 1, totalPages);

  const startIdx = (safePage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const pageRows = sortedLogs.slice(startIdx, endIdx);

  const canPrev = safePage > 1;
  const canNext = safePage < totalPages;

  // ✅ Détails: ordre plus "humain" (évite l'effet 2 colonnes perdu)
  const labelMap = useMemo(() => {
    const m = new Map();
    for (const c of columns) m.set(c.key, c.label);
    return m;
  }, [columns]);

  const viewDetailItems = useMemo(() => {
    if (!viewModal?.log) return [];

    const orderByTab = {
      vehicle: [
        'log_date',
        'plate',
        'day_name',
        'chauffeur',
        'frns',
        'is_refill',
        'km_depart',
        'km_arrivee',
        'km_jour',
        'compteur',
        'liters',
        'montant_ar',
        'lien'
      ],
      generator: ['log_date', 'liters', 'montant_ar', 'source_file_name'],
      other: ['log_date', 'liters', 'montant_ar', 'lien', 'source_file_name']
    };

    const order = orderByTab[tab] || columns.map((c) => c.key);

    return order
      .filter((k) => labelMap.has(k))
      .map((k) => {
        const col = columns.find((c) => c.key === k) || { key: k, label: labelMap.get(k) || k };
        return {
          key: k,
          label: labelMap.get(k) || col.label || k,
          value: renderCell(viewModal.log, col)
        };
      });
  }, [viewModal, tab, columns, labelMap]);

  return (
    <>
      <div className="row fuel-title-row">
        <h2>Suivi carburant</h2>
        <div className="row fuel-tabs">
          <button className={`btn ${tab === 'vehicle' ? '' : 'btn-secondary'}`} onClick={() => setTab('vehicle')}>
            Véhicules
          </button>
          <button className={`btn ${tab === 'generator' ? '' : 'btn-secondary'}`} onClick={() => setTab('generator')}>
            Groupe électrogène
          </button>
          <button className={`btn ${tab === 'other' ? '' : 'btn-secondary'}`} onClick={() => setTab('other')}>
            Autres
          </button>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {/* ===================== FILTRES ===================== */}
        <div className="fuel-toolbar">
          <div className="fuel-toolbar-left">
            <div className="field">
              <label>Du</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>

            <div className="field">
              <label>Au</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>

            {tab === 'vehicle' && (
              <div className="field">
                <label>Véhicule</label>
                <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="fuel-select">
                  <option className="fuel-option-muted" value="">
                    (Tous)
                  </option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ✅ Recherche rapide */}
            <div className="field fuel-search">
              <label>Recherche</label>
              <div className="fuel-search-box">
                <ion-icon name="search-outline" />
                <input
                  placeholder="Immatriculation / chauffeur / fournisseur..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                {q ? (
                  <button className="fuel-search-clear" type="button" onClick={() => setQ('')} title="Effacer">
                    <ion-icon name="close-outline" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="fuel-toolbar-right">
            {/* Toggle densité */}
            <div className="fuel-density-toggle" title="Densité d'affichage">
              <button
                type="button"
                className={`fuel-density-btn ${density === 'comfort' ? 'is-active' : ''}`}
                onClick={() => setDensity('comfort')}
              >
                Confort
              </button>
              <button
                type="button"
                className={`fuel-density-btn ${density === 'compact' ? 'is-active' : ''}`}
                onClick={() => setDensity('compact')}
              >
                Compact
              </button>
            </div>

            <button className="btn" onClick={load}>
              <ion-icon name="refresh-outline" />
              Actualiser
            </button>

            <button className="btn btn-secondary" type="button" onClick={() => setAdvOpen((v) => !v)}>
              <ion-icon name={advOpen ? 'chevron-up-outline' : 'chevron-down-outline'} />
              Filtres avancés
            </button>

            {canExport && (
              <button className="btn btn-secondary" onClick={exportCsv}>
                <ion-icon name="download-outline" />
                Export CSV
              </button>
            )}

            {canManage && (
              <button className="btn btn-outline" onClick={openCreate} title="Ajouter une entrée">
                <ion-icon name="add-outline" />
                Ajouter
              </button>
            )}
          </div>
        </div>

        {/* ✅ Filtres avancés */}
        {advOpen && (
          <div className="fuel-adv">
            <div className="fuel-adv-grid">
              <div className="field">
                <label>Chauffeur (contient)</label>
                <input
                  value={chauffeurFilter}
                  onChange={(e) => setChauffeurFilter(e.target.value)}
                  placeholder="ex: Rija"
                />
              </div>

              {tab === 'vehicle' && (
                <div className="field">
                  <label>Plein</label>
                  <select value={refillFilter} onChange={(e) => setRefillFilter(e.target.value)} className="fuel-select">
                    <option className="fuel-option-muted" value="all">
                      Tous
                    </option>
                    <option value="yes">Oui</option>
                    <option value="no">Non</option>
                  </select>
                </div>
              )}

              <div className="field">
                <label>Montant min (Ar)</label>
                <input
                  type="number"
                  value={montantMin}
                  onChange={(e) => setMontantMin(e.target.value)}
                  placeholder="ex: 50000"
                />
              </div>

              <div className="field">
                <label>Montant max (Ar)</label>
                <input
                  type="number"
                  value={montantMax}
                  onChange={(e) => setMontantMax(e.target.value)}
                  placeholder="ex: 200000"
                />
              </div>

              <div className="field">
                <label>Litres min</label>
                <input
                  type="number"
                  step="0.01"
                  value={litersMin}
                  onChange={(e) => setLitersMin(e.target.value)}
                  placeholder="ex: 10"
                />
              </div>

              <div className="field">
                <label>Litres max</label>
                <input
                  type="number"
                  step="0.01"
                  value={litersMax}
                  onChange={(e) => setLitersMax(e.target.value)}
                  placeholder="ex: 60"
                />
              </div>
            </div>

            <div className="fuel-adv-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setChauffeurFilter('');
                  setRefillFilter('all');
                  setMontantMin('');
                  setMontantMax('');
                  setLitersMin('');
                  setLitersMax('');
                }}
              >
                Réinitialiser
              </button>

              {tab === 'vehicle' && refillFilter === 'yes' && (
                <div className="fuel-adv-note">
                  Astuce: “Plein = Oui” est aussi appliqué côté backend au prochain Actualiser.
                </div>
              )}
            </div>
          </div>
        )}

        {error && <div className="notice fuel-error">{error}</div>}

        {/* ===================== KPI CARDS (AU-DESSUS DU TABLEAU) ===================== */}
        <div className="fuel-kpi-grid">
          <KpiCard
            label="Total Litres"
            value={fmtNum(kpi.totalLiters, { decimals: 2 })}
            hint="Selon filtres actifs"
            icon="water-outline"
            tone="a"
          />
          <KpiCard
            label="Total Montant (Ar)"
            value={toMoneyAr(kpi.totalMontant)}
            hint="Selon filtres actifs"
            icon="cash-outline"
            tone="b"
          />

          {tab === 'vehicle' ? (
            <>
              <KpiCard
                label="Km total (approx.)"
                value={fmtNum(Math.round(kpi.kmTotal), { decimals: 0 })}
                hint="Basé sur Km/j"
                icon="speedometer-outline"
                tone="c"
              />
              <KpiCard
                label="Conso moyenne (L/100)"
                value={kpi.conso === null ? '—' : kpi.conso.toFixed(2)}
                hint={kpi.conso === null ? 'Renseigne des km' : 'Total litres / km total'}
                icon="analytics-outline"
                tone="d"
              />
              <KpiCard
                label="Nb pleins"
                value={fmtNum(kpi.refills, { decimals: 0 })}
                hint="Selon filtres actifs"
                icon="flash-outline"
                tone="e"
              />
            </>
          ) : (
            <KpiCard
              label="Nb d’entrées"
              value={fmtNum(kpi.count, { decimals: 0 })}
              hint="Selon filtres actifs"
              icon="list-outline"
              tone="c"
            />
          )}
        </div>

        {/* ===================== TABLE ===================== */}
        <div className="tableWrap fuel-table-wrap">
          <table className={`table fuel-table ${density === 'compact' ? 'is-compact' : ''}`}>
            <thead>
              <tr>
                {columns.map((c) => {
                  const sortable = SORTABLE_KEYS.has(c.key);
                  return (
                    <th
                      key={c.key}
                      className={`${c.cls || ''} ${sortable ? 'fuel-th-sortable' : ''}`}
                      onClick={() => toggleSort(c.key)}
                      role={sortable ? 'button' : undefined}
                      aria-sort={ariaSortFor(c.key)}
                      title={sortable ? 'Trier' : undefined}
                    >
                      <span className="fuel-th-inner">
                        <span>{c.label}</span>
                        {sortable ? <span className="fuel-th-icon">{sortIcon(c.key)}</span> : null}
                      </span>
                    </th>
                  );
                })}

                {canManage && (
                  <th className="center nowrap sticky-actions" style={{ width: 150 }}>
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {pageRows.map((row, idx) => (
                <tr key={row.id || idx} className={row.is_mission ? 'row-mission' : ''}>
                  {columns.map((c) => (
                    <td key={c.key} className={c.cls || ''}>
                      {renderCell(row, c)}
                    </td>
                  ))}

                  {canManage && (
                    <td className="center nowrap sticky-actions">
                      <div className="fuel-actions">
                        <IconBtn title="Voir" icon="eye-outline" onClick={() => openView(row)} />
                        <IconBtn title="Modifier" icon="create-outline" onClick={() => openEdit(row)} />
                        <IconBtn
                          title="Corbeille"
                          icon="trash-outline"
                          variant="danger"
                          onClick={() => handleDelete(row)}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {!pageRows.length && (
                <tr>
                  <td colSpan={columns.length + (canManage ? 1 : 0)} className="fuel-empty">
                    Aucune donnée
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ===================== PAGINATION ===================== */}
        <div className="fuel-pager">
          <div className="fuel-pager-left">
            <span className="fuel-pager-count">
              {total ? (
                <>
                  Affichage <b>{startIdx + 1}</b>–<b>{endIdx}</b> sur <b>{total}</b>
                </>
              ) : (
                <>Aucun résultat</>
              )}
            </span>

            <div className="fuel-pager-size">
              <span>Par page</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="fuel-select"
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="fuel-pager-right">
            <button className="btn btn-outline btn-sm" disabled={!canPrev} onClick={() => setPage((p) => p - 1)}>
              <ion-icon name="chevron-back-outline" />
              Précédent
            </button>

            <div className="fuel-pager-page">
              Page <b>{safePage}</b> / <b>{totalPages}</b>
            </div>

            <button className="btn btn-outline btn-sm" disabled={!canNext} onClick={() => setPage((p) => p + 1)}>
              Suivant
              <ion-icon name="chevron-forward-outline" />
            </button>
          </div>
        </div>
      </div>

      {/* ===================== MODAL CREATE ===================== */}
      {createModal && (
        <Modal title="Ajouter une entrée" onClose={() => setCreateModal(null)} width={700}>
          <div className="grid2">
            {tab === 'vehicle' && (
              <>
                <div className="field">
                  <label>Véhicule</label>
                  <select
                    value={createModal.draft.vehicle_id}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, vehicle_id: e.target.value } })
                    }
                    className="fuel-select"
                  >
                    <option className="fuel-option-muted" value="">
                      — Choisir —
                    </option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(createModal.draft.log_date) || ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, log_date: e.target.value } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Km départ</label>
                  <input
                    type="number"
                    value={createModal.draft.km_depart ?? ''}
                    onChange={(e) => {
                      const val = asInt(e.target.value);
                      const draft = { ...createModal.draft, km_depart: val };
                      const dep = draft.km_depart ?? null;
                      const arr = draft.km_arrivee ?? null;
                      draft.km_jour = dep !== null && arr !== null ? arr - dep : null;
                      setCreateModal({ ...createModal, draft });
                    }}
                  />
                </div>

                <div className="field">
                  <label>Km arrivée</label>
                  <input
                    type="number"
                    value={createModal.draft.km_arrivee ?? ''}
                    onChange={(e) => {
                      const val = asInt(e.target.value);
                      const draft = { ...createModal.draft, km_arrivee: val };
                      const dep = draft.km_depart ?? null;
                      const arr = draft.km_arrivee ?? null;
                      draft.km_jour = dep !== null && arr !== null ? arr - dep : null;
                      setCreateModal({ ...createModal, draft });
                    }}
                  />
                </div>

                <div className="field">
                  <label>Km/j (calculé auto)</label>
                  <input type="number" value={createModal.draft.km_jour ?? ''} disabled className="fuel-readonly" />
                </div>

                <div className="field">
                  <label>Compteur</label>
                  <input
                    type="number"
                    value={createModal.draft.compteur ?? ''}
                    onChange={(e) =>
                      setCreateModal({
                        ...createModal,
                        draft: { ...createModal.draft, compteur: asInt(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createModal.draft.liters ?? ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, liters: asFloat(e.target.value) } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={createModal.draft.montant_ar ?? ''}
                    onChange={(e) =>
                      setCreateModal({
                        ...createModal,
                        draft: { ...createModal.draft, montant_ar: asInt(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Chauffeur</label>
                  <input
                    value={createModal.draft.chauffeur || ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, chauffeur: e.target.value } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Fournisseur / Station</label>
                  <input
                    value={createModal.draft.frns || ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, frns: e.target.value } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Lien</label>
                  <input
                    value={createModal.draft.lien || ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, lien: e.target.value } })
                    }
                  />
                </div>
              </>
            )}

            {tab === 'generator' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(createModal.draft.log_date) || ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, log_date: e.target.value } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createModal.draft.liters ?? ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, liters: asFloat(e.target.value) } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={createModal.draft.montant_ar ?? ''}
                    onChange={(e) =>
                      setCreateModal({
                        ...createModal,
                        draft: { ...createModal.draft, montant_ar: asInt(e.target.value) }
                      })
                    }
                  />
                </div>
              </>
            )}

            {tab === 'other' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(createModal.draft.log_date) || ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, log_date: e.target.value } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={createModal.draft.liters ?? ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, liters: asFloat(e.target.value) } })
                    }
                  />
                </div>

                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={createModal.draft.montant_ar ?? ''}
                    onChange={(e) =>
                      setCreateModal({
                        ...createModal,
                        draft: { ...createModal.draft, montant_ar: asInt(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Lien</label>
                  <input
                    value={createModal.draft.lien || ''}
                    onChange={(e) =>
                      setCreateModal({ ...createModal, draft: { ...createModal.draft, lien: e.target.value } })
                    }
                  />
                </div>
              </>
            )}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setCreateModal(null)}>
              Annuler
            </button>
            <button className="btn" onClick={saveCreate}>
              <ion-icon name="save-outline" />
              Ajouter
            </button>
          </div>
        </Modal>
      )}

      {/* ===================== MODAL VOIR (✅ LISTE LISIBLE) ===================== */}
      {viewModal && (
        <Modal title="Détails" onClose={() => setViewModal(null)} width={700}>
          <div className="fuel-details">
            {viewDetailItems.map((it) => (
              <div key={it.key} className="fuel-details-row">
                <div className="fuel-details-label">{it.label}</div>
                <div className="fuel-details-value">{it.value}</div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ===================== MODAL MODIFIER ===================== */}
      {editModal && (
        <Modal title="Modifier" onClose={() => setEditModal(null)} width={700}>
          <div className="grid2">
            {tab === 'vehicle' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(editModal.draft.log_date) || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, log_date: e.target.value } })}
                  />
                </div>

                <div className="field">
                  <label>Km départ</label>
                  <input
                    type="number"
                    value={editModal.draft.km_depart ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      const draft = { ...editModal.draft, km_depart: val };
                      if (draft.km_arrivee !== null && val !== null) draft.km_jour = draft.km_arrivee - val;
                      setEditModal({ ...editModal, draft });
                    }}
                  />
                </div>

                <div className="field">
                  <label>Km arrivée</label>
                  <input
                    type="number"
                    value={editModal.draft.km_arrivee ?? ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? null : Number(e.target.value);
                      const draft = { ...editModal.draft, km_arrivee: val };
                      if (draft.km_depart !== null && val !== null) draft.km_jour = val - draft.km_depart;
                      setEditModal({ ...editModal, draft });
                    }}
                  />
                </div>

                <div className="field">
                  <label>Km/j (calculé auto)</label>
                  <input type="number" value={editModal.draft.km_jour ?? ''} disabled className="fuel-readonly" />
                </div>

                <div className="field">
                  <label>Compteur</label>
                  <input
                    type="number"
                    value={editModal.draft.compteur ?? ''}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        draft: { ...editModal.draft, compteur: e.target.value === '' ? null : Number(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModal.draft.liters ?? ''}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        draft: { ...editModal.draft, liters: e.target.value === '' ? null : Number(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={editModal.draft.montant_ar ?? ''}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        draft: { ...editModal.draft, montant_ar: e.target.value === '' ? null : Number(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Chauffeur</label>
                  <input
                    value={editModal.draft.chauffeur || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, chauffeur: e.target.value } })}
                  />
                </div>

                <div className="field">
                  <label>Fournisseur / Station</label>
                  <input
                    value={editModal.draft.frns || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, frns: e.target.value } })}
                  />
                </div>

                <div className="field">
                  <label>Lien</label>
                  <input
                    value={editModal.draft.lien || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, lien: e.target.value } })}
                  />
                </div>
              </>
            )}

            {tab === 'generator' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(editModal.draft.log_date) || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, log_date: e.target.value } })}
                  />
                </div>

                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModal.draft.liters ?? ''}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        draft: { ...editModal.draft, liters: e.target.value === '' ? null : Number(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={editModal.draft.montant_ar ?? ''}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        draft: { ...editModal.draft, montant_ar: e.target.value === '' ? null : Number(e.target.value) }
                      })
                    }
                  />
                </div>
              </>
            )}

            {tab === 'other' && (
              <>
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={toYMD(editModal.draft.log_date) || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, log_date: e.target.value } })}
                  />
                </div>

                <div className="field">
                  <label>Litres</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editModal.draft.liters ?? ''}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        draft: { ...editModal.draft, liters: e.target.value === '' ? null : Number(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Montant (Ar)</label>
                  <input
                    type="number"
                    value={editModal.draft.montant_ar ?? ''}
                    onChange={(e) =>
                      setEditModal({
                        ...editModal,
                        draft: { ...editModal.draft, montant_ar: e.target.value === '' ? null : Number(e.target.value) }
                      })
                    }
                  />
                </div>

                <div className="field">
                  <label>Lien</label>
                  <input
                    value={editModal.draft.lien || ''}
                    onChange={(e) => setEditModal({ ...editModal, draft: { ...editModal.draft, lien: e.target.value } })}
                  />
                </div>
              </>
            )}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 16, gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setEditModal(null)}>
              Annuler
            </button>
            <button className="btn" onClick={saveEdit}>
              <ion-icon name="save-outline" />
              Enregistrer
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}