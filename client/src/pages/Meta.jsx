// client/src/pages/Meta.jsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../utils/api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/ToastContext.jsx';
import Modal from '../components/Modal.jsx';
import './Meta.css';

const ENERGY_OPTIONS = [
  { value: '', label: 'Tous' },
  { value: 'DIESEL', label: 'Diesel' },
  { value: 'ESSENCE', label: 'Essence' },
  { value: 'ELECTRIQUE', label: 'Électrique' },
  { value: 'HYBRIDE', label: 'Hybride' },
  { value: 'GAZ', label: 'Gaz' },
  { value: 'AUTRE', label: 'Autre' }
];

const ACTIVE_FILTERS = [
  { value: 'all', label: 'Tous' },
  { value: 'active', label: 'Actifs' },
  { value: 'inactive', label: 'Inactifs' }
];

const DEFAULT_NEW_VEHICLE = {
  plate: '',
  brand: '',
  model: '',
  energy_type: 'DIESEL',
  seats: 5,
  label: '',
  is_active: true,
  vehicle_type: '',
  tank_capacity_l: '',
  ref_consumption_l_100: '',
  last_service_at: '',
  next_service_at: '',
  notes: ''
};

const DEFAULT_NEW_DRIVER = {
  first_name: '',
  last_name: '',
  phone: '',
  matricule: '',
  license_no: '',
  license_expiry: '',
  cin: '',
  address: '',
  is_active: true
};

function PlusIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="metaBtnIconSvg">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

/* ✅ Icône Historique */
function HistoryIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="metaBtnIconSvg">
      <path
        d="M3 12a9 9 0 1 0 3-6.708"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M3 4v5h5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 7v6l4 2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ✅ Icône Corbeille */
function TrashIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" className="metaBtnIconSvg">
      <path
        d="M4 7h16"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M10 11v7M14 11v7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M6 7l1 14h10l1-14"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 7V4h6v3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function toNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normPlate(v) {
  if (!v) return '';
  return String(v).replace(/\s+/g, '').toUpperCase();
}

function safeNumberOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmtDT(v) {
  if (!v) return '';
  try {
    const d = new Date(v);
    return new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  } catch {
    return String(v);
  }
}

function Switch({ checked, onChange, disabled }) {
  const id = useMemo(() => `sw_${Math.random().toString(16).slice(2)}`, []);
  return (
    <label className="metaSwitch" onClick={(e) => e.stopPropagation()}>
      <input
        id={id}
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange?.(e.target.checked)}
        disabled={disabled}
      />
      <span className="metaTrack">
        <span className="metaThumb" />
      </span>
    </label>
  );
}

function validateVehicle(v) {
  const errors = {};
  const plate = normPlate(v.plate);
  if (!plate || plate.length < 3) errors.plate = 'Immatriculation requise (min 3)';
  const seats = Number(v.seats);
  if (!Number.isFinite(seats) || seats < 1) errors.seats = 'Places doit être un nombre ≥ 1';
  if (!v.energy_type) errors.energy_type = 'Carburant requis';
  return errors;
}

function sanitizeVehiclePayload(v) {
  return {
    plate: normPlate(v.plate),
    brand: toNull(v.brand),
    model: toNull(v.model),
    energy_type: toNull(v.energy_type),
    seats: safeNumberOrNull(v.seats) ?? 5,
    label: toNull(v.label),
    is_active: !!v.is_active,

    vehicle_type: toNull(v.vehicle_type),
    tank_capacity_l: safeNumberOrNull(v.tank_capacity_l),
    ref_consumption_l_100: safeNumberOrNull(v.ref_consumption_l_100),
    last_service_at: toNull(v.last_service_at),
    next_service_at: toNull(v.next_service_at),
    notes: toNull(v.notes)
  };
}

function validateDriver(d) {
  const errors = {};
  if (!toNull(d.first_name)) errors.first_name = 'Prénom requis';
  if (!toNull(d.last_name)) errors.last_name = 'Nom requis';
  return errors;
}

function sanitizeDriverPayload(d) {
  return {
    first_name: toNull(d.first_name),
    last_name: toNull(d.last_name),
    phone: toNull(d.phone),
    matricule: toNull(d.matricule),
    license_no: toNull(d.license_no),
    license_expiry: toNull(d.license_expiry),
    cin: toNull(d.cin),
    address: toNull(d.address),
    is_active: !!d.is_active
  };
}

function kpiCounts(items) {
  const total = items.length;
  const active = items.filter((x) => !!x.is_active).length;
  const inactive = total - active;
  return { total, active, inactive };
}

export default function Meta() {
  const { token } = useAuth();
  const toast = useToast();
  const addToast = toast?.addToast || (() => {});

  const [tab, setTab] = useState('vehicles');

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  // Toolbar states
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  // Vehicles toolbar
  const [energyFilter, setEnergyFilter] = useState('');
  const [vehSort, setVehSort] = useState('plate'); // plate | seats | energy_type
  const [vehSortDir, setVehSortDir] = useState('asc');

  // Drivers toolbar
  const [drvSort, setDrvSort] = useState('name'); // name | phone | matricule
  const [drvSortDir, setDrvSortDir] = useState('asc');

  // Pagination
  const PAGE_SIZE = 15;
  const [vehShown, setVehShown] = useState(PAGE_SIZE);
  const [drvShown, setDrvShown] = useState(PAGE_SIZE);

  // Create forms (in modals)
  const [newVehicle, setNewVehicle] = useState({ ...DEFAULT_NEW_VEHICLE });
  const [newDriver, setNewDriver] = useState({ ...DEFAULT_NEW_DRIVER });

  // Create modals
  const [createVehicleOpen, setCreateVehicleOpen] = useState(false);
  const [createDriverOpen, setCreateDriverOpen] = useState(false);
  const [creatingVehicle, setCreatingVehicle] = useState(false);
  const [creatingDriver, setCreatingDriver] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null); // { kind:'vehicle'|'driver', row }
  const [edit, setEdit] = useState(null); // { kind:'vehicle'|'driver', row, assignId }

  const [history, setHistory] = useState(null); // { type:'vehicle'|'driver', id, title }
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [v, d] = await Promise.all([
        apiFetch('/api/meta/vehicles', { token }),
        apiFetch('/api/meta/drivers', { token })
      ]);
      setVehicles(Array.isArray(v?.vehicles) ? v.vehicles : []);
      setDrivers(Array.isArray(d?.drivers) ? d.drivers : []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const vehiclesKpi = useMemo(() => kpiCounts(vehicles), [vehicles]);
  const driversKpi = useMemo(() => kpiCounts(drivers), [drivers]);

  const qLower = q.trim().toLowerCase();

  const vehiclesFiltered = useMemo(() => {
    let list = [...vehicles];

    if (qLower) {
      list = list.filter((v) => {
        const hay = [v.plate, v.brand, v.model, v.energy_type, v.label, v.driver_name, v.vehicle_type]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(qLower);
      });
    }

    if (activeFilter !== 'all') {
      const want = activeFilter === 'active';
      list = list.filter((v) => !!v.is_active === want);
    }

    if (energyFilter) {
      list = list.filter((v) => String(v.energy_type || '').toUpperCase() === energyFilter);
    }

    list.sort((a, b) => {
      const dir = vehSortDir === 'asc' ? 1 : -1;
      if (vehSort === 'seats') return dir * ((Number(a.seats) || 0) - (Number(b.seats) || 0));
      const av = String(a[vehSort] || '').toUpperCase();
      const bv = String(b[vehSort] || '').toUpperCase();
      return dir * av.localeCompare(bv);
    });

    return list;
  }, [vehicles, qLower, activeFilter, energyFilter, vehSort, vehSortDir]);

  const driversFiltered = useMemo(() => {
    let list = [...drivers];

    if (qLower) {
      list = list.filter((d) => {
        const hay = [d.full_name, d.first_name, d.last_name, d.phone, d.matricule, d.vehicle_plate]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(qLower);
      });
    }

    if (activeFilter !== 'all') {
      const want = activeFilter === 'active';
      list = list.filter((d) => !!d.is_active === want);
    }

    list.sort((a, b) => {
      const dir = drvSortDir === 'asc' ? 1 : -1;
      if (drvSort === 'phone') return dir * String(a.phone || '').localeCompare(String(b.phone || ''));
      if (drvSort === 'matricule') return dir * String(a.matricule || '').localeCompare(String(b.matricule || ''));
      const an = String(a.full_name || `${a.first_name || ''} ${a.last_name || ''}`).trim();
      const bn = String(b.full_name || `${b.first_name || ''} ${b.last_name || ''}`).trim();
      return dir * an.localeCompare(bn);
    });

    return list;
  }, [drivers, qLower, activeFilter, drvSort, drvSortDir]);

  const vehToShow = useMemo(() => vehiclesFiltered.slice(0, vehShown), [vehiclesFiltered, vehShown]);
  const drvToShow = useMemo(() => driversFiltered.slice(0, drvShown), [driversFiltered, drvShown]);

  const vehicleErrors = useMemo(() => validateVehicle(newVehicle), [newVehicle]);
  const canCreateVehicle = Object.keys(vehicleErrors).length === 0;

  const driverErrors = useMemo(() => validateDriver(newDriver), [newDriver]);
  const canCreateDriver = Object.keys(driverErrors).length === 0;

  function openCreateVehicle() {
    setErr(null);
    setNewVehicle({ ...DEFAULT_NEW_VEHICLE });
    setCreateVehicleOpen(true);
  }

  function openCreateDriver() {
    setErr(null);
    setNewDriver({ ...DEFAULT_NEW_DRIVER });
    setCreateDriverOpen(true);
  }

  async function createVehicle() {
    setErr(null);
    if (!canCreateVehicle) {
      addToast('Veuillez corriger les champs requis.', 'warning');
      return;
    }
    setCreatingVehicle(true);
    try {
      await apiFetch('/api/meta/vehicles', { method: 'POST', token, body: sanitizeVehiclePayload(newVehicle) });
      addToast('Véhicule ajouté ✅', 'success');
      setCreateVehicleOpen(false);
      setNewVehicle({ ...DEFAULT_NEW_VEHICLE });
      await loadAll();
    } catch (e) {
      addToast(e.message || 'Erreur', 'error');
      setErr(String(e.message || e));
    } finally {
      setCreatingVehicle(false);
    }
  }

  async function createDriver() {
    setErr(null);
    if (!canCreateDriver) {
      addToast('Veuillez corriger les champs requis.', 'warning');
      return;
    }
    setCreatingDriver(true);
    try {
      await apiFetch('/api/meta/drivers', { method: 'POST', token, body: sanitizeDriverPayload(newDriver) });
      addToast('Chauffeur ajouté ✅', 'success');
      setCreateDriverOpen(false);
      setNewDriver({ ...DEFAULT_NEW_DRIVER });
      await loadAll();
    } catch (e) {
      addToast(e.message || 'Erreur', 'error');
      setErr(String(e.message || e));
    } finally {
      setCreatingDriver(false);
    }
  }

  async function toggleVehicleActive(row, next) {
    const prev = row.is_active;
    setVehicles((p) => p.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)));
    try {
      await apiFetch(`/api/meta/vehicles/${row.id}`, { method: 'PUT', token, body: sanitizeVehiclePayload({ ...row, is_active: next }) });
      addToast('Mise à jour OK ✅', 'success');
    } catch (e) {
      setVehicles((p) => p.map((x) => (x.id === row.id ? { ...x, is_active: prev } : x)));
      addToast(e.message || 'Erreur', 'error');
    }
  }

  async function toggleDriverActive(row, next) {
    const prev = row.is_active;
    setDrivers((p) => p.map((x) => (x.id === row.id ? { ...x, is_active: next } : x)));
    try {
      await apiFetch(`/api/meta/drivers/${row.id}`, { method: 'PUT', token, body: sanitizeDriverPayload({ ...row, is_active: next }) });
      addToast('Mise à jour OK ✅', 'success');
    } catch (e) {
      setDrivers((p) => p.map((x) => (x.id === row.id ? { ...x, is_active: prev } : x)));
      addToast(e.message || 'Erreur', 'error');
    }
  }

  function openEditVehicle(row) {
    setEdit({ kind: 'vehicle', row: { ...row }, assignId: row.driver_id || '' });
  }

  function openEditDriver(row) {
    setEdit({ kind: 'driver', row: { ...row }, assignId: row.vehicle_id || '' });
  }

  async function saveEdit() {
    if (!edit) return;
    setErr(null);

    try {
      if (edit.kind === 'vehicle') {
        const row = edit.row;
        const payload = sanitizeVehiclePayload(row);

        await apiFetch(`/api/meta/vehicles/${row.id}`, { method: 'PUT', token, body: payload });

        const currentDriverId = row.driver_id || '';
        const nextDriverId = edit.assignId || '';

        if (currentDriverId !== nextDriverId) {
          if (!nextDriverId) {
            await apiFetch(`/api/meta/vehicles/${row.id}/unassign`, { method: 'PATCH', token });
          } else {
            await apiFetch(`/api/meta/assignments`, { method: 'POST', token, body: { vehicle_id: row.id, driver_id: nextDriverId } });
          }
        }

        addToast('Véhicule modifié ✅', 'success');
      } else {
        const row = edit.row;
        const payload = sanitizeDriverPayload(row);

        await apiFetch(`/api/meta/drivers/${row.id}`, { method: 'PUT', token, body: payload });

        const currentVehicleId = row.vehicle_id || '';
        const nextVehicleId = edit.assignId || '';

        if (currentVehicleId !== nextVehicleId) {
          if (!nextVehicleId) {
            if (currentVehicleId) {
              await apiFetch(`/api/meta/vehicles/${currentVehicleId}/unassign`, { method: 'PATCH', token });
            }
          } else {
            await apiFetch(`/api/meta/assignments`, { method: 'POST', token, body: { vehicle_id: nextVehicleId, driver_id: row.id } });
          }
        }

        addToast('Chauffeur modifié ✅', 'success');
      }

      setEdit(null);
      await loadAll();
    } catch (e) {
      addToast(e.message || 'Erreur', 'error');
      setErr(String(e.message || e));
    }
  }

  function openHistoryForVehicle(v) {
    setHistory({ type: 'vehicle', id: v.id, title: `Historique affectations — ${v.plate}` });
  }

  function openHistoryForDriver(d) {
    const name = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim();
    setHistory({ type: 'driver', id: d.id, title: `Historique affectations — ${name || d.id}` });
  }

  const loadHistory = useCallback(async () => {
    if (!history) return;
    setHistoryLoading(true);
    try {
      const qs = history.type === 'vehicle' ? `?vehicle_id=${history.id}` : `?driver_id=${history.id}`;
      const data = await apiFetch(`/api/meta/assignments${qs}`, { token });
      setHistoryRows(Array.isArray(data?.assignments) ? data.assignments : []);
    } catch (e) {
      addToast(e.message || 'Erreur', 'error');
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [history, token, addToast]);

  useEffect(() => {
    if (history) loadHistory();
  }, [history, loadHistory]);

  async function doDeleteConfirmed() {
    if (!confirmDelete) return;
    try {
      if (confirmDelete.kind === 'vehicle') {
        await apiFetch(`/api/meta/vehicles/${confirmDelete.row.id}`, { method: 'DELETE', token });
        addToast('Envoyé à la corbeille ✅', 'success');
      } else {
        await apiFetch(`/api/meta/drivers/${confirmDelete.row.id}`, { method: 'DELETE', token });
        addToast('Envoyé à la corbeille ✅', 'success');
      }
      setConfirmDelete(null);
      await loadAll();
    } catch (e) {
      addToast(e.message || 'Erreur', 'error');
    }
  }

  return (
    <div className="metaPage">
      <div className="rowBetween">
        <h1 style={{ margin: 0 }}>Véhicules & Chauffeurs</h1>
        <div className="metaTabs">
          <button className={`metaTab ${tab === 'vehicles' ? 'active' : ''}`} onClick={() => setTab('vehicles')}>
            Véhicules
          </button>
          <button className={`metaTab ${tab === 'drivers' ? 'active' : ''}`} onClick={() => setTab('drivers')}>
            Chauffeurs
          </button>

          {tab === 'vehicles' ? (
            <button className="btn btn-outline btn-sm metaNewBtn" onClick={openCreateVehicle}>
              <span className="metaBtnIcon"><PlusIcon size={16} /></span>
              Nouveau véhicule
            </button>
          ) : (
            <button className="btn btn-outline btn-sm metaNewBtn" onClick={openCreateDriver}>
              <span className="metaBtnIcon"><PlusIcon size={16} /></span>
              Nouveau chauffeur
            </button>
          )}

          <button className="btn btn-outline btn-sm" onClick={loadAll}>
            Recharger
          </button>
        </div>
      </div>

      {err && <div className="error">{err}</div>}

      {/* KPI */}
      <div className="metaKpis">
        {tab === 'vehicles' ? (
          <>
            <div className="metaKpi">
              <div className="kTitle">Total véhicules</div>
              <div className="kValue">{vehiclesKpi.total}</div>
            </div>
            <div className="metaKpi">
              <div className="kTitle">Actifs</div>
              <div className="kValue">{vehiclesKpi.active}</div>
            </div>
            <div className="metaKpi">
              <div className="kTitle">Inactifs</div>
              <div className="kValue">{vehiclesKpi.inactive}</div>
            </div>
          </>
        ) : (
          <>
            <div className="metaKpi">
              <div className="kTitle">Total chauffeurs</div>
              <div className="kValue">{driversKpi.total}</div>
            </div>
            <div className="metaKpi">
              <div className="kTitle">Actifs</div>
              <div className="kValue">{driversKpi.active}</div>
            </div>
            <div className="metaKpi">
              <div className="kTitle">Inactifs</div>
              <div className="kValue">{driversKpi.inactive}</div>
            </div>
          </>
        )}
      </div>

      {/* Toolbar */}
      <div className="card">
        <div className="metaToolbar">
          <div className="field">
            <div className="label">Recherche</div>
            <input
              placeholder={tab === 'vehicles' ? 'Immatriculation, marque, modèle, chauffeur...' : 'Nom, téléphone, matricule, véhicule...'}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setVehShown(PAGE_SIZE);
                setDrvShown(PAGE_SIZE);
              }}
            />
          </div>

          <div className="field" style={{ minWidth: 180 }}>
            <div className="label">Actif</div>
            <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
              {ACTIVE_FILTERS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {tab === 'vehicles' && (
            <>
              <div className="field" style={{ minWidth: 200 }}>
                <div className="label">Carburant</div>
                <select value={energyFilter} onChange={(e) => setEnergyFilter(e.target.value)}>
                  {ENERGY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ minWidth: 200 }}>
                <div className="label">Tri</div>
                <select value={vehSort} onChange={(e) => setVehSort(e.target.value)}>
                  <option value="plate">Immatriculation</option>
                  <option value="seats">Places</option>
                  <option value="energy_type">Carburant</option>
                </select>
              </div>

              <div className="field" style={{ minWidth: 140 }}>
                <div className="label">Sens</div>
                <select value={vehSortDir} onChange={(e) => setVehSortDir(e.target.value)}>
                  <option value="asc">Asc</option>
                  <option value="desc">Desc</option>
                </select>
              </div>
            </>
          )}

          {tab === 'drivers' && (
            <>
              <div className="field" style={{ minWidth: 200 }}>
                <div className="label">Tri</div>
                <select value={drvSort} onChange={(e) => setDrvSort(e.target.value)}>
                  <option value="name">Nom</option>
                  <option value="phone">Téléphone</option>
                  <option value="matricule">Matricule</option>
                </select>
              </div>

              <div className="field" style={{ minWidth: 140 }}>
                <div className="label">Sens</div>
                <select value={drvSortDir} onChange={(e) => setDrvSortDir(e.target.value)}>
                  <option value="asc">Asc</option>
                  <option value="desc">Desc</option>
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="muted">Chargement...</div>
      ) : tab === 'vehicles' ? (
        <>
          <div className="card">
            <div className="rowBetween">
              <h2 style={{ margin: 0 }}>Véhicules</h2>
              <span className="metaTiny">Clique une ligne pour “Modifier”.</span>
            </div>

            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="table metaStickyHead">
                <thead>
                  <tr>
                    <th>Immatriculation</th>
                    <th>Marque</th>
                    <th>Modèle</th>
                    <th>Carburant</th>
                    <th>Places</th>
                    <th>Type</th>
                    <th>Chauffeur</th>
                    <th>Actif</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {vehToShow.length ? (
                    vehToShow.map((v) => (
                      <tr key={v.id} className="metaRowClickable" onClick={() => openEditVehicle(v)}>
                        <td style={{ fontWeight: 900 }}>{v.plate}</td>
                        <td>{v.brand || <span className="muted">—</span>}</td>
                        <td>{v.model || <span className="muted">—</span>}</td>
                        <td>
                          {v.energy_type ? (
                            <span className="metaChip">{String(v.energy_type).toUpperCase()}</span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>{v.seats ?? <span className="muted">—</span>}</td>
                        <td>{v.vehicle_type || <span className="muted">—</span>}</td>
                        <td>{v.driver_name || <span className="muted">Non affecté</span>}</td>
                        <td>
                          <Switch checked={!!v.is_active} onChange={(next) => toggleVehicleActive(v, next)} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="metaActions" onClick={(e) => e.stopPropagation()}>
                            <button className="btn btn-outline btn-sm metaActionBtn" onClick={() => openHistoryForVehicle(v)}>
                              <span className="metaBtnIcon"><HistoryIcon size={16} /></span>
                              Historique
                            </button>
                            <button
                              className="btn btn-danger btn-sm metaActionBtn"
                              onClick={() => setConfirmDelete({ kind: 'vehicle', row: v })}
                            >
                              <span className="metaBtnIcon"><TrashIcon size={16} /></span>
                              Corbeille
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="muted">Aucun résultat</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {vehiclesFiltered.length > vehShown && (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={() => setVehShown((n) => n + PAGE_SIZE)}>
                  Charger plus
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="card">
            <div className="rowBetween">
              <h2 style={{ margin: 0 }}>Chauffeurs</h2>
              <span className="metaTiny">Clique une ligne pour “Modifier”.</span>
            </div>

            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table className="table metaStickyHead">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Téléphone</th>
                    <th>Matricule</th>
                    <th>Permis</th>
                    <th>Expiration</th>
                    <th>Véhicule</th>
                    <th>Actif</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drvToShow.length ? (
                    drvToShow.map((d) => {
                      const name = d.full_name || `${d.first_name || ''} ${d.last_name || ''}`.trim();
                      return (
                        <tr key={d.id} className="metaRowClickable" onClick={() => openEditDriver(d)}>
                          <td style={{ fontWeight: 900 }}>{name || <span className="muted">—</span>}</td>
                          <td>{d.phone || <span className="muted">—</span>}</td>
                          <td>{d.matricule || <span className="muted">—</span>}</td>
                          <td>{d.license_no || <span className="muted">—</span>}</td>
                          <td>{d.license_expiry || <span className="muted">—</span>}</td>
                          <td>{d.vehicle_plate || <span className="muted">Non affecté</span>}</td>
                          <td>
                            <Switch checked={!!d.is_active} onChange={(next) => toggleDriverActive(d, next)} />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="metaActions" onClick={(e) => e.stopPropagation()}>
                              <button className="btn btn-outline btn-sm metaActionBtn" onClick={() => openHistoryForDriver(d)}>
                                <span className="metaBtnIcon"><HistoryIcon size={16} /></span>
                                Historique
                              </button>
                              <button
                                className="btn btn-danger btn-sm metaActionBtn"
                                onClick={() => setConfirmDelete({ kind: 'driver', row: d })}
                              >
                                <span className="metaBtnIcon"><TrashIcon size={16} /></span>
                                Corbeille
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="muted">Aucun résultat</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {driversFiltered.length > drvShown && (
              <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
                <button className="btn btn-outline" onClick={() => setDrvShown((n) => n + PAGE_SIZE)}>
                  Charger plus
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="muted">
        💡 “Corbeille” = suppression logique. Pour supprimer définitivement : menu <b>Corbeille</b>.
      </div>

      {/* CREATE VEHICLE MODAL */}
      {createVehicleOpen && (
        <Modal title="Nouveau véhicule" onClose={() => (creatingVehicle ? null : setCreateVehicleOpen(false))} width={980}>
          <div className="metaFormGrid">
            <div className="field">
              <div className="label">Immatriculation *</div>
              <input
                value={newVehicle.plate}
                onChange={(e) => setNewVehicle((p) => ({ ...p, plate: e.target.value }))}
                placeholder="39111WWT"
              />
              {vehicleErrors.plate && <div className="error">{vehicleErrors.plate}</div>}
            </div>

            <div className="field">
              <div className="label">Marque</div>
              <input
                value={newVehicle.brand}
                onChange={(e) => setNewVehicle((p) => ({ ...p, brand: e.target.value }))}
                placeholder="Toyota"
              />
            </div>

            <div className="field">
              <div className="label">Modèle</div>
              <input
                value={newVehicle.model}
                onChange={(e) => setNewVehicle((p) => ({ ...p, model: e.target.value }))}
                placeholder="Hilux"
              />
            </div>

            <div className="field">
              <div className="label">Carburant *</div>
              <select
                value={newVehicle.energy_type}
                onChange={(e) => setNewVehicle((p) => ({ ...p, energy_type: e.target.value }))}
              >
                {ENERGY_OPTIONS.filter((x) => x.value !== '').map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {vehicleErrors.energy_type && <div className="error">{vehicleErrors.energy_type}</div>}
            </div>

            <div className="field">
              <div className="label">Places *</div>
              <input
                type="number"
                min={1}
                step={1}
                value={newVehicle.seats}
                onChange={(e) => setNewVehicle((p) => ({ ...p, seats: e.target.value }))}
              />
              {vehicleErrors.seats && <div className="error">{vehicleErrors.seats}</div>}
            </div>

            <div className="field">
              <div className="label">Libellé (ex: Couleur)</div>
              <input
                value={newVehicle.label}
                onChange={(e) => setNewVehicle((p) => ({ ...p, label: e.target.value }))}
                placeholder="Noir"
              />
            </div>

            <div className="field">
              <div className="label">Type véhicule</div>
              <input
                value={newVehicle.vehicle_type}
                onChange={(e) => setNewVehicle((p) => ({ ...p, vehicle_type: e.target.value }))}
                placeholder="4x4 / Camion / ..."
              />
            </div>

            <div className="field">
              <div className="label">Réservoir (L)</div>
              <input
                type="number"
                min={0}
                step="0.1"
                value={newVehicle.tank_capacity_l}
                onChange={(e) => setNewVehicle((p) => ({ ...p, tank_capacity_l: e.target.value }))}
                placeholder="80"
              />
            </div>

            <div className="field">
              <div className="label">Conso ref (L/100)</div>
              <input
                type="number"
                min={0}
                step="0.1"
                value={newVehicle.ref_consumption_l_100}
                onChange={(e) => setNewVehicle((p) => ({ ...p, ref_consumption_l_100: e.target.value }))}
                placeholder="9.5"
              />
            </div>

            <div className="field">
              <div className="label">Dernier entretien</div>
              <input
                type="date"
                value={newVehicle.last_service_at || ''}
                onChange={(e) => setNewVehicle((p) => ({ ...p, last_service_at: e.target.value }))}
              />
            </div>

            <div className="field">
              <div className="label">Prochain entretien</div>
              <input
                type="date"
                value={newVehicle.next_service_at || ''}
                onChange={(e) => setNewVehicle((p) => ({ ...p, next_service_at: e.target.value }))}
              />
            </div>

            <div className="field metaSpan2">
              <div className="label">Observations</div>
              <input
                value={newVehicle.notes}
                onChange={(e) => setNewVehicle((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Notes..."
              />
            </div>
          </div>

          <div className="rowBetween" style={{ marginTop: 16 }}>
            <span className="muted">Les champs marqués * sont obligatoires.</span>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setCreateVehicleOpen(false)} disabled={creatingVehicle}>
                Annuler
              </button>
              <button className="btn" disabled={!canCreateVehicle || creatingVehicle} onClick={createVehicle}>
                {creatingVehicle ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* CREATE DRIVER MODAL */}
      {createDriverOpen && (
        <Modal title="Nouveau chauffeur" onClose={() => (creatingDriver ? null : setCreateDriverOpen(false))} width={980}>
          <div className="metaFormGrid">
            <div className="field">
              <div className="label">Prénom *</div>
              <input
                value={newDriver.first_name}
                onChange={(e) => setNewDriver((p) => ({ ...p, first_name: e.target.value }))}
                placeholder="Jean"
              />
              {driverErrors.first_name && <div className="error">{driverErrors.first_name}</div>}
            </div>

            <div className="field">
              <div className="label">Nom *</div>
              <input
                value={newDriver.last_name}
                onChange={(e) => setNewDriver((p) => ({ ...p, last_name: e.target.value }))}
                placeholder="Rakoto"
              />
              {driverErrors.last_name && <div className="error">{driverErrors.last_name}</div>}
            </div>

            <div className="field">
              <div className="label">Téléphone</div>
              <input
                value={newDriver.phone}
                onChange={(e) => setNewDriver((p) => ({ ...p, phone: e.target.value }))}
                placeholder="034..."
              />
            </div>

            <div className="field">
              <div className="label">Matricule</div>
              <input
                value={newDriver.matricule}
                onChange={(e) => setNewDriver((p) => ({ ...p, matricule: e.target.value }))}
                placeholder="DRV-001"
              />
            </div>

            <div className="field">
              <div className="label">Permis</div>
              <input
                value={newDriver.license_no}
                onChange={(e) => setNewDriver((p) => ({ ...p, license_no: e.target.value }))}
                placeholder="Permis N°..."
              />
            </div>

            <div className="field">
              <div className="label">Expiration permis</div>
              <input
                type="date"
                value={newDriver.license_expiry || ''}
                onChange={(e) => setNewDriver((p) => ({ ...p, license_expiry: e.target.value }))}
              />
            </div>

            <div className="field">
              <div className="label">CIN</div>
              <input
                value={newDriver.cin}
                onChange={(e) => setNewDriver((p) => ({ ...p, cin: e.target.value }))}
                placeholder="201..."
              />
            </div>

            <div className="field metaSpan2">
              <div className="label">Adresse</div>
              <input
                value={newDriver.address}
                onChange={(e) => setNewDriver((p) => ({ ...p, address: e.target.value }))}
                placeholder="Adresse..."
              />
            </div>
          </div>

          <div className="rowBetween" style={{ marginTop: 16 }}>
            <span className="muted">Les champs marqués * sont obligatoires.</span>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-outline" onClick={() => setCreateDriverOpen(false)} disabled={creatingDriver}>
                Annuler
              </button>
              <button className="btn" disabled={!canCreateDriver || creatingDriver} onClick={createDriver}>
                {creatingDriver ? 'Ajout...' : 'Ajouter'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {edit && (
        <Modal
          title={edit.kind === 'vehicle' ? `Modifier véhicule — ${edit.row.plate}` : 'Modifier chauffeur'}
          onClose={() => setEdit(null)}
          width={900}
        >
          {/* (inchangé : ton code d’edit complet est supposé être ici) */}
          {/* Tu peux garder exactement ton bloc Edit que tu avais déjà. */}
          <div className="muted">Edit modal inchangée (garde ton bloc existant).</div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="Supprimer définitivement ?" onClose={() => setConfirmDelete(null)} width={720}>
          <div className="metaDangerHint">
            <div style={{ fontWeight: 1000, marginBottom: 6 }}>
              Attention : cette action envoie l’élément dans la corbeille.
            </div>
            <div className="metaTiny">
              La suppression définitive se fait dans le menu <b>Corbeille</b>.
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={{ fontWeight: 900 }}>
              {confirmDelete.kind === 'vehicle'
                ? `Véhicule : ${confirmDelete.row.plate}`
                : `Chauffeur : ${confirmDelete.row.full_name || `${confirmDelete.row.first_name || ''} ${confirmDelete.row.last_name || ''}`.trim()}`}
            </div>
          </div>

          <div className="rowBetween" style={{ marginTop: 16 }}>
            <button className="btn btn-outline" onClick={() => setConfirmDelete(null)}>
              Annuler
            </button>
            <button className="btn btn-danger" onClick={doDeleteConfirmed}>
              Envoyer à la corbeille
            </button>
          </div>
        </Modal>
      )}

      {/* History */}
      {history && (
        <Modal title={history.title} onClose={() => setHistory(null)} width={860}>
          {historyLoading ? (
            <div className="muted">Chargement...</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Véhicule</th>
                    <th>Chauffeur</th>
                    <th>Début</th>
                    <th>Fin</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.length ? (
                    historyRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.vehicle_plate}</td>
                        <td>{r.driver_name}</td>
                        <td>{fmtDT(r.start_at)}</td>
                        <td>{r.end_at ? fmtDT(r.end_at) : <span className="metaChip">ACTIF</span>}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="muted">Aucun historique</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
