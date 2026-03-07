import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';
import Modal from '../components/Modal.jsx';

const LOGBOOK_TYPES = [
  { value: 'SERVICE', label: 'SERVICE' },
  { value: 'MISSION', label: 'MISSION' },
];

function ymd(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

function timeToMin(t) {
  if (!t) return null;
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

// accepte: "90", "90min", "1h30", "1:30"
function parseDurationToMinutes(input) {
  if (input === null || input === undefined) return null;
  const s0 = String(input).trim();
  if (!s0) return null;

  const s = s0.toLowerCase().replace(/\s+/g, '');

  if (/^\d+$/.test(s)) return Number(s);

  const m1 = s.match(/^(\d+)min$/);
  if (m1) return Number(m1[1]);

  const m2 = s.match(/^(\d+)h(\d+)?$/);
  if (m2) {
    const h = Number(m2[1]);
    const mn = m2[2] ? Number(m2[2]) : 0;
    return h * 60 + mn;
  }

  const m3 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m3) return Number(m3[1]) * 60 + Number(m3[2]);

  return null;
}

function draftKey(id) {
  return `prirtem:logbook:draft:${id}`;
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function makeEmptyTrip(baseDate = '') {
  return {
    date: baseDate || '',
    departHeure: '',
    departKm: '',
    debutTrajet: '',
    finTrajet: '',
    lieuStationnement: '',
    dureeStationnement: '',
    arriveeHeure: '',
    arriveeKm: '',
    personnesTransportees: '',
    emargement: '',
    isMission: false,
    missionLabel: '',
  };
}

function makeEmptySupply(baseDate = '') {
  return {
    date: baseDate || '',
    compteurKm: '',
    litres: '',
    montantAr: '',
  };
}

function mapTripFromApi(t) {
  return {
    date: ymd(t.trip_date ?? t.date),
    departHeure: t.depart_time ? String(t.depart_time).slice(0, 5) : '',
    departKm: t.depart_km ?? '',
    debutTrajet: t.route_start ?? '',
    finTrajet: t.route_end ?? '',
    lieuStationnement: t.parking_place ?? '',
    dureeStationnement: t.parking_duration_min != null ? String(t.parking_duration_min) : '',
    arriveeHeure: t.arrival_time ? String(t.arrival_time).slice(0, 5) : '',
    arriveeKm: t.arrival_km ?? '',
    personnesTransportees: t.passengers ?? '',
    emargement: t.emargement ?? '',
    isMission: !!(t.is_mission ?? t.isMission),
    missionLabel: t.mission_label ?? '',
  };
}

function mapSupplyFromApi(s) {
  return {
    date: ymd(s.supply_date ?? s.date),
    compteurKm: s.compteur_km ?? '',
    litres: s.liters ?? '',
    montantAr: s.montant_ar ?? '',
  };
}

// ✅ '' ne doit pas devenir 0
function toNumOrNaN(v) {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function computeKmFromTrips(trajets) {
  let service = 0;
  let mission = 0;

  for (const t of trajets) {
    const dep = toNumOrNaN(t.departKm);
    const arr = toNumOrNaN(t.arriveeKm);
    if (!Number.isFinite(dep) || !Number.isFinite(arr)) continue;

    const d = arr - dep;
    if (!Number.isFinite(d)) continue;

    const delta = Math.max(0, d);
    if (t.isMission) mission += delta;
    else service += delta;
  }

  return { service_km: Math.round(service), mission_km: Math.round(mission) };
}

function validateAll({ logbook, trajets, carburants }) {
  const errors = [];
  const warnings = [];

  const ps = ymd(logbook?.period_start);
  const pe = ymd(logbook?.period_end);

  trajets.forEach((t, idx) => {
    const row = idx + 1;
    if (!t.date) errors.push(`Trajet #${row}: date manquante`);
    if (ps && pe && t.date) {
      if (t.date < ps || t.date > pe) errors.push(`Trajet #${row}: date hors période (${ps} → ${pe})`);
    }

    if (!t.isMission) {
      const depKm = t.departKm === '' ? null : Number(t.departKm);
      const arrKm = t.arriveeKm === '' ? null : Number(t.arriveeKm);
      if (depKm != null && (!Number.isFinite(depKm) || depKm < 0)) errors.push(`Trajet #${row}: km départ invalide`);
      if (arrKm != null && (!Number.isFinite(arrKm) || arrKm < 0)) errors.push(`Trajet #${row}: km arrivée invalide`);
      if (Number.isFinite(depKm) && Number.isFinite(arrKm) && arrKm < depKm) errors.push(`Trajet #${row}: arrivéeKm < départKm`);

      const depT = timeToMin(t.departHeure);
      const arrT = timeToMin(t.arriveeHeure);
      if (t.departHeure && depT === null) errors.push(`Trajet #${row}: heure départ invalide`);
      if (t.arriveeHeure && arrT === null) errors.push(`Trajet #${row}: heure arrivée invalide`);
      if (depT != null && arrT != null && arrT < depT) errors.push(`Trajet #${row}: heure arrivée < heure départ`);

      if (t.dureeStationnement) {
        const mins = parseDurationToMinutes(t.dureeStationnement);
        if (mins == null) warnings.push(`Trajet #${row}: durée stationnement non reconnue`);
        if (mins != null && (mins < 0 || mins > 24 * 60)) warnings.push(`Trajet #${row}: durée stationnement bizarre (${mins} min)`);
      }
    } else {
      if (!t.missionLabel) warnings.push(`Trajet #${row}: mission sans libellé`);
    }
  });

  carburants.forEach((s, idx) => {
    const row = idx + 1;
    if (!s.date) errors.push(`Carburant #${row}: date manquante`);
    if (ps && pe && s.date) {
      if (s.date < ps || s.date > pe) warnings.push(`Carburant #${row}: date hors période`);
    }

    const km = Number(s.compteurKm);
    const L = Number(s.litres);
    const ar = Number(s.montantAr);

    if (s.compteurKm !== '' && !Number.isFinite(km)) errors.push(`Carburant #${row}: compteur invalide`);
    if (s.litres !== '' && !Number.isFinite(L)) errors.push(`Carburant #${row}: litres invalide`);
    if (s.montantAr !== '' && !Number.isFinite(ar)) errors.push(`Carburant #${row}: montant invalide`);
  });

  return { errors, warnings };
}

function FieldGrid({ children }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: 12,
        alignItems: 'end',
      }}
    >
      {children}
    </div>
  );
}

export default function LogbookEdit() {
  const { token, user } = useAuth();
  const { id } = useParams();

  const canEdit = ['LOGISTIQUE', 'ADMIN'].includes(user?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [logbook, setLogbook] = useState(null);

  const [trajets, setTrajets] = useState([]);
  const [carburants, setCarburants] = useState([]);

  const [corbeille, setCorbeille] = useState({ trajets: [], carburants: [] });
  const [showCorbeille, setShowCorbeille] = useState(false);

  const locked = logbook?.status === 'LOCKED';

  // Paste Excel modal
  const [pasteModal, setPasteModal] = useState(null); // {kind:'trips'|'fuel', text:''}

  // ✅ Add/Edit modals (nouveau)
  const [tripModal, setTripModal] = useState(null); // {mode:'add'|'edit', idx:number|null, data:Trip}
  const [supplyModal, setSupplyModal] = useState(null); // {mode:'add'|'edit', idx:number|null, data:Supply}

  async function load() {
    if (!token || !id) return;
    setLoading(true);
    setErr(null);

    try {
      const data = await apiFetch(`/api/logbooks/${id}`, { token });

      const book = data?.logbook || data?.item || null;
      if (!book) throw new Error('Réponse API invalide: logbook/item manquant');

      const tripsRaw = Array.isArray(data?.trips) ? data.trips : [];
      const suppliesRaw = Array.isArray(data?.supplies) ? data.supplies : [];

      const base = {
        logbook: book,
        trajets: tripsRaw.map(mapTripFromApi),
        carburants: suppliesRaw.map(mapSupplyFromApi),
        corbeille: { trajets: [], carburants: [] },
      };

      const draftRaw = localStorage.getItem(draftKey(id));
      const draft = draftRaw ? safeJsonParse(draftRaw) : null;

      if (draft?.logbookId && String(draft.logbookId) === String(id)) {
        setLogbook({ ...base.logbook, ...draft.logbookEdits });
        setTrajets(Array.isArray(draft.trajets) ? draft.trajets : base.trajets);
        setCarburants(Array.isArray(draft.carburants) ? draft.carburants : base.carburants);
        setCorbeille(draft.corbeille || base.corbeille);
      } else {
        setLogbook(base.logbook);
        setTrajets(base.trajets);
        setCarburants(base.carburants);
        setCorbeille(base.corbeille);
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id, token]);

  // autosave local draft
  useEffect(() => {
    if (loading || !logbook) return;
    const payload = {
      logbookId: id,
      savedAt: Date.now(),
      logbookEdits: {
        objet: logbook.objet ?? '',
        chauffeur_signature: logbook.chauffeur_signature ?? '',
        service_km: logbook.service_km ?? 0,
        mission_km: logbook.mission_km ?? 0,
        logbook_type: logbook.logbook_type || 'SERVICE',
      },
      trajets,
      carburants,
      corbeille,
    };
    localStorage.setItem(draftKey(id), JSON.stringify(payload));
  }, [loading, id, logbook, trajets, carburants, corbeille]);

  function clearLocalDraft() {
    localStorage.removeItem(draftKey(id));
  }

  const kmAuto = useMemo(() => computeKmFromTrips(trajets), [trajets]);

  const kmMismatch = useMemo(() => {
    if (!logbook) return false;
    const s = Number(logbook.service_km || 0);
    const m = Number(logbook.mission_km || 0);
    return (Math.abs(s - kmAuto.service_km) > 0) || (Math.abs(m - kmAuto.mission_km) > 0);
  }, [logbook, kmAuto]);

  const validation = useMemo(() => {
    if (!logbook) return { errors: [], warnings: [] };
    return validateAll({ logbook, trajets, carburants });
  }, [logbook, trajets, carburants]);

  const title = useMemo(() => {
    const t = (logbook?.logbook_type || 'SERVICE');
    return t === 'MISSION' ? 'JOURNAL DE BORD VOITURE MISSION' : 'JOURNAL DE BORD VOITURE';
  }, [logbook]);

  // =========================
  // ✅ MODALS: Add/Edit Trip
  // =========================
  function openAddTripModal() {
    if (locked || !canEdit) return;
    const baseDate = ymd(logbook?.period_start);
    setTripModal({ mode: 'add', idx: null, data: makeEmptyTrip(baseDate) });
  }

  function openEditTripModal(idx) {
    if (locked || !canEdit) return;
    const x = trajets[idx];
    if (!x) return;
    setTripModal({ mode: 'edit', idx, data: { ...x } });
  }

  function saveTripModal() {
    if (!tripModal || locked || !canEdit) return;
    const { mode, idx, data } = tripModal;

    if (mode === 'add') setTrajets((prev) => [...prev, data]);
    else if (mode === 'edit' && idx != null) setTrajets((prev) => prev.map((t, i) => (i === idx ? data : t)));

    setTripModal(null);
  }

  function deleteTrip(idx) {
    if (locked || !canEdit) return;
    const x = trajets[idx];
    if (!x) return;
    setCorbeille((prev) => ({ ...prev, trajets: [...prev.trajets, x] }));
    setTrajets((prev) => prev.filter((_, i) => i !== idx));
  }

  // =========================
  // ✅ MODALS: Add/Edit Supply
  // =========================
  function openAddSupplyModal() {
    if (locked || !canEdit) return;
    const baseDate = ymd(logbook?.period_start);
    setSupplyModal({ mode: 'add', idx: null, data: makeEmptySupply(baseDate) });
  }

  function openEditSupplyModal(idx) {
    if (locked || !canEdit) return;
    const x = carburants[idx];
    if (!x) return;
    setSupplyModal({ mode: 'edit', idx, data: { ...x } });
  }

  function saveSupplyModal() {
    if (!supplyModal || locked || !canEdit) return;
    const { mode, idx, data } = supplyModal;

    if (mode === 'add') setCarburants((prev) => [...prev, data]);
    else if (mode === 'edit' && idx != null) setCarburants((prev) => prev.map((s, i) => (i === idx ? data : s)));

    setSupplyModal(null);
  }

  function deleteSupply(idx) {
    if (locked || !canEdit) return;
    const x = carburants[idx];
    if (!x) return;
    setCorbeille((prev) => ({ ...prev, carburants: [...prev.carburants, x] }));
    setCarburants((prev) => prev.filter((_, i) => i !== idx));
  }

  function restoreTrip(idx) {
    if (locked || !canEdit) return;
    const x = corbeille.trajets[idx];
    if (!x) return;
    setTrajets((prev) => [...prev, x]);
    setCorbeille((prev) => ({ ...prev, trajets: prev.trajets.filter((_, i) => i !== idx) }));
  }

  function restoreSupply(idx) {
    if (locked || !canEdit) return;
    const x = corbeille.carburants[idx];
    if (!x) return;
    setCarburants((prev) => [...prev, x]);
    setCorbeille((prev) => ({ ...prev, carburants: prev.carburants.filter((_, i) => i !== idx) }));
  }

  function emptyTrash() {
    if (locked || !canEdit) return;
    if (window.confirm('Vider la corbeille ?')) setCorbeille({ trajets: [], carburants: [] });
  }

  function applyAutoKm() {
    if (!canEdit || locked) return;
    setLogbook((prev) => ({
      ...prev,
      service_km: kmAuto.service_km,
      mission_km: kmAuto.mission_km,
    }));
  }

  async function saveAll() {
    if (!canEdit || locked) return;

    if (validation.errors.length) {
      alert('❌ Corrige d’abord:\n\n' + validation.errors.map((x) => `- ${x}`).join('\n'));
      return;
    }
    if (validation.warnings.length) {
      const ok = window.confirm(
        '⚠️ Il y a des avertissements.\n\n' +
        validation.warnings.map((x) => `- ${x}`).join('\n') +
        '\n\nContinuer ?'
      );
      if (!ok) return;
    }

    try {
      const headerBody = {
        objet: logbook.objet ?? '',
        chauffeur_signature: logbook.chauffeur_signature ?? '',
        service_km: Number(logbook.service_km || 0),
        mission_km: Number(logbook.mission_km || 0),
      };

      // type modifiable uniquement en DRAFT
      if ((logbook.status === 'DRAFT') && logbook.logbook_type) {
        headerBody.logbook_type = logbook.logbook_type;
      }

      await apiFetch(`/api/logbooks/${id}`, {
        token,
        method: 'PUT',
        body: headerBody,
      });

      const tripsPayload = trajets.map((t, idx) => ({
        trip_date: t.date,
        depart_time: t.isMission ? null : (t.departHeure || null),
        depart_km: t.isMission ? null : (t.departKm === '' ? null : Number(t.departKm)),
        route_start: t.isMission ? null : (t.debutTrajet || null),
        route_end: t.isMission ? null : (t.finTrajet || null),
        parking_place: t.isMission ? null : (t.lieuStationnement || null),
        parking_duration_min: t.isMission ? null : parseDurationToMinutes(t.dureeStationnement),
        arrival_time: t.isMission ? null : (t.arriveeHeure || null),
        arrival_km: t.isMission ? null : (t.arriveeKm === '' ? null : Number(t.arriveeKm)),
        passengers: t.isMission ? null : (t.personnesTransportees || null),
        emargement: t.isMission ? null : (t.emargement || null),
        is_mission: !!t.isMission,
        mission_label: t.isMission ? (t.missionLabel || 'MISSION') : null,
        row_order: idx + 1,
      }));

      await apiFetch(`/api/logbooks/${id}/trips`, {
        token,
        method: 'PUT',
        body: { trips: tripsPayload },
      });

      const suppliesPayload = carburants.map((s) => ({
        supply_date: s.date,
        compteur_km: s.compteurKm === '' ? null : Number(s.compteurKm),
        liters: s.litres === '' ? null : Number(s.litres),
        montant_ar: s.montantAr === '' ? null : Number(s.montantAr),
      }));

      await apiFetch(`/api/logbooks/${id}/supplies`, {
        token,
        method: 'PUT',
        body: { supplies: suppliesPayload },
      });

      clearLocalDraft();
      alert('✅ Enregistré');
      await load();
    } catch (e) {
      alert('❌ Erreur: ' + (e.message || String(e)));
    }
  }

  async function submitLogbook() {
    if (!canEdit || locked) return;
    if (validation.errors.length) {
      alert('❌ Impossible de soumettre:\n\n' + validation.errors.map((x) => `- ${x}`).join('\n'));
      return;
    }
    if (!window.confirm('Soumettre ce journal ?')) return;
    try {
      await apiFetch(`/api/logbooks/${id}/submit`, { token, method: 'PATCH' });
      await load();
      alert('✅ Journal soumis.');
    } catch (e) {
      alert('❌ ' + (e.message || String(e)));
    }
  }

  async function lockLogbook() {
    if (!canEdit || locked) return;
    if (!window.confirm('Verrouiller définitivement ? (Aucune modification ensuite)')) return;
    try {
      await apiFetch(`/api/logbooks/${id}/lock`, { token, method: 'PATCH' });
      clearLocalDraft();
      await load();
      alert('🔒 Journal verrouillé.');
    } catch (e) {
      alert('❌ ' + (e.message || String(e)));
    }
  }

  function handlePrint() {
    window.open(`/print/logbook/${id}`, '_blank', 'noopener,noreferrer');
  }

  function openPaste(kind) {
    setPasteModal({ kind, text: '' });
  }

  function parseTSVTrips(tsv) {
    const lines = tsv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const cols = line.split('\t');
      const t = makeEmptyTrip();
      t.date = (cols[0] || '').slice(0, 10);
      t.departHeure = (cols[1] || '').slice(0, 5);
      t.departKm = cols[2] ?? '';
      t.debutTrajet = cols[3] ?? '';
      t.finTrajet = cols[4] ?? '';
      t.lieuStationnement = cols[5] ?? '';
      t.dureeStationnement = cols[6] ?? '';
      t.arriveeHeure = (cols[7] || '').slice(0, 5);
      t.arriveeKm = cols[8] ?? '';
      t.personnesTransportees = cols[9] ?? '';
      t.emargement = cols[10] ?? '';
      const isM = String(cols[11] || '').toLowerCase();
      t.isMission = isM === '1' || isM === 'true' || isM === 'yes' || isM === 'mission';
      t.missionLabel = cols[12] ?? '';
      out.push(t);
    }
    return out;
  }

  function parseTSVSupplies(tsv) {
    const lines = tsv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const cols = line.split('\t');
      const s = makeEmptySupply();
      s.date = (cols[0] || '').slice(0, 10);
      s.compteurKm = cols[1] ?? '';
      s.litres = cols[2] ?? '';
      s.montantAr = cols[3] ?? '';
      out.push(s);
    }
    return out;
  }

  function applyPaste() {
    if (!pasteModal) return;
    if (!canEdit || locked) return;

    try {
      if (pasteModal.kind === 'trips') {
        const items = parseTSVTrips(pasteModal.text);
        setTrajets((prev) => [...prev, ...items]);
      } else {
        const items = parseTSVSupplies(pasteModal.text);
        setCarburants((prev) => [...prev, ...items]);
      }
      setPasteModal(null);
    } catch (e) {
      alert('❌ Erreur parsing: ' + (e.message || String(e)));
    }
  }

  if (loading) return <div className="card">Chargement...</div>;
  if (err) return <div className="card"><div className="error">{err}</div><Link to="/app/logbooks">Retour</Link></div>;
  if (!logbook) return <div className="card">Journal introuvable.</div>;

  const corbeilleCount = (corbeille.trajets.length + corbeille.carburants.length);
  const plateLabel = logbook.plate || logbook.vehicle_plate || logbook.vehiclePlate || '—';

  return (
    <div className="container">
      {/* HEADER */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="rowBetween" style={{ alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              background: '#111827',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: 12,
              minWidth: 88,
              textAlign: 'center'
            }}>
              <div style={{ fontWeight: 900, lineHeight: 1 }}>CEP</div>
              <div style={{ fontSize: 11, opacity: .9 }}>PRIRTEM</div>
            </div>

            <div>
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>{title}</div>
              <div className="muted" style={{ fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span><b>Immatriculation:</b> {plateLabel}</span>
                <span><b>Période:</b> {ymd(logbook.period_start)} → {ymd(logbook.period_end)}</span>
                <span className={`badge ${logbook.status === 'LOCKED' ? 'badge-bad' : logbook.status === 'SUBMITTED' ? 'badge-info' : 'badge-warn'}`}>
                  {logbook.status}
                </span>
                <span className={`badge ${logbook.logbook_type === 'MISSION' ? 'badge-warn' : 'badge-info'}`}>
                  {logbook.logbook_type || 'SERVICE'}
                </span>
                {kmMismatch && <span className="badge badge-bad">⚠ km incohérents vs trajets</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <Link className="btn btn-outline" to="/app/logbooks">← Retour</Link>
            <button className="btn btn-outline" onClick={handlePrint}>Imprimer</button>

            {canEdit && !locked && (
              <>
                <button className="btn btn-outline" onClick={() => openPaste('trips')}>Coller trajets (Excel)</button>
                <button className="btn btn-outline" onClick={() => openPaste('fuel')}>Coller carburant (Excel)</button>
                <button className="btn btn-outline" onClick={applyAutoKm}>Auto-calculer km</button>
                <button className="btn" onClick={saveAll}>Enregistrer</button>
                <button className="btn btn-secondary" onClick={submitLogbook}>Soumettre</button>
                <button className="btn btn-danger" onClick={lockLogbook}>Verrouiller</button>
              </>
            )}

            <button className="btn btn-outline" onClick={() => setShowCorbeille((v) => !v)}>
              Corbeille ({corbeilleCount})
            </button>
          </div>
        </div>

        {/* Header fields */}
        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: 1, minWidth: 280 }}>
            <div className="label">Objet</div>
            <input
              className="input"
              value={logbook.objet ?? ''}
              disabled={!canEdit || locked}
              onChange={(e) => setLogbook({ ...logbook, objet: e.target.value })}
              placeholder="(optionnel)"
            />
          </div>

          <div className="field" style={{ minWidth: 220 }}>
            <div className="label">Type de journal</div>
            <select
              className="input"
              value={logbook.logbook_type || 'SERVICE'}
              disabled={!canEdit || locked || logbook.status !== 'DRAFT'}
              onChange={(e) => setLogbook({ ...logbook, logbook_type: e.target.value })}
            >
              {LOGBOOK_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <div className="muted" style={{ fontSize: 12 }}>
              Modifiable uniquement tant que <b>DRAFT</b>.
            </div>
          </div>

          <div className="field" style={{ minWidth: 220 }}>
            <div className="label">Chauffeur (signature)</div>
            <input
              className="input"
              value={logbook.chauffeur_signature ?? ''}
              disabled={!canEdit || locked}
              onChange={(e) => setLogbook({ ...logbook, chauffeur_signature: e.target.value })}
              placeholder="Nom / signature"
            />
          </div>
        </div>

        <div className="row" style={{ gap: 12, marginTop: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 220 }}>
            <div className="label">Service (km)</div>
            <input
              className="input"
              type="number"
              value={logbook.service_km ?? 0}
              disabled={!canEdit || locked}
              onChange={(e) => setLogbook({ ...logbook, service_km: e.target.value })}
            />
            <div className="muted" style={{ fontSize: 12 }}>Auto: {kmAuto.service_km}</div>
          </div>

          <div className="field" style={{ minWidth: 220 }}>
            <div className="label">Mission (km)</div>
            <input
              className="input"
              type="number"
              value={logbook.mission_km ?? 0}
              disabled={!canEdit || locked}
              onChange={(e) => setLogbook({ ...logbook, mission_km: e.target.value })}
            />
            <div className="muted" style={{ fontSize: 12 }}>Auto: {kmAuto.mission_km}</div>
          </div>

          {validation.errors.length > 0 && (
            <div className="card" style={{ flex: 1, border: '1px solid #ef4444' }}>
              <div style={{ fontWeight: 800, color: '#b91c1c' }}>Erreurs ({validation.errors.length})</div>
              <ul className="muted" style={{ margin: '8px 0 0 18px' }}>
                {validation.errors.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}
                {validation.errors.length > 6 && <li>…</li>}
              </ul>
            </div>
          )}

          {validation.errors.length === 0 && validation.warnings.length > 0 && (
            <div className="card" style={{ flex: 1, border: '1px solid #f59e0b' }}>
              <div style={{ fontWeight: 800, color: '#92400e' }}>Avertissements ({validation.warnings.length})</div>
              <ul className="muted" style={{ margin: '8px 0 0 18px' }}>
                {validation.warnings.slice(0, 6).map((x, i) => <li key={i}>{x}</li>)}
                {validation.warnings.length > 6 && <li>…</li>}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* TRAJETS */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="rowBetween" style={{ alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Trajets</h3>
          {canEdit && !locked && (
            <button className="btn btn-outline" onClick={openAddTripModal}>+ Ajouter une ligne</button>
          )}
        </div>

        <div style={{ overflow: 'auto', marginTop: 10 }}>
          <table className="table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Départ h</th>
                <th>Départ km</th>
                <th>Début</th>
                <th>Fin</th>
                <th>Stationnement</th>
                <th>Durée</th>
                <th>Arrivée h</th>
                <th>Arrivée km</th>
                <th>Personnes</th>
                <th>Émargement</th>
                <th>Mission</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {trajets.map((t, idx) => (
                <tr key={idx}>
                  <td>{t.date || '—'}</td>
                  <td>{t.departHeure || '—'}</td>
                  <td>{t.departKm !== '' ? t.departKm : '—'}</td>
                  <td>{t.debutTrajet || '—'}</td>
                  <td>{t.finTrajet || '—'}</td>
                  <td>{t.lieuStationnement || '—'}</td>
                  <td>{t.dureeStationnement || '—'}</td>
                  <td>{t.arriveeHeure || '—'}</td>
                  <td>{t.arriveeKm !== '' ? t.arriveeKm : '—'}</td>
                  <td>{t.personnesTransportees || '—'}</td>
                  <td>{t.emargement || '—'}</td>
                  <td>
                    {t.isMission ? (
                      <span className="badge badge-warn">MISSION{t.missionLabel ? `: ${t.missionLabel}` : ''}</span>
                    ) : (
                      <span className="badge badge-info">SERVICE</span>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canEdit && !locked && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditTripModal(idx)}>Modifier</button>
                        <button className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={() => deleteTrip(idx)}>🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {!trajets.length && (
                <tr><td colSpan={13} className="muted">Aucun trajet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CARBURANTS */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="rowBetween" style={{ alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Approvisionnement carburant</h3>
          {canEdit && !locked && (
            <button className="btn btn-outline" onClick={openAddSupplyModal}>+ Ajouter</button>
          )}
        </div>

        <div style={{ overflow: 'auto', marginTop: 10 }}>
          <table className="table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Compteur km</th>
                <th>Litres</th>
                <th>Montant (Ar)</th>
                <th style={{ width: 160 }}></th>
              </tr>
            </thead>
            <tbody>
              {carburants.map((s, idx) => (
                <tr key={idx}>
                  <td>{s.date || '—'}</td>
                  <td>{s.compteurKm !== '' ? s.compteurKm : '—'}</td>
                  <td>{s.litres !== '' ? s.litres : '—'}</td>
                  <td>{s.montantAr !== '' ? s.montantAr : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {canEdit && !locked && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => openEditSupplyModal(idx)}>Modifier</button>
                        <button className="btn btn-danger btn-sm" style={{ marginLeft: 8 }} onClick={() => deleteSupply(idx)}>🗑</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}

              {!carburants.length && (
                <tr><td colSpan={5} className="muted">Aucun approvisionnement.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CORBEILLE */}
      {showCorbeille && (
        <div className="card">
          <div className="rowBetween" style={{ alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>Corbeille</h3>
            {canEdit && !locked && (
              <button className="btn btn-outline" onClick={emptyTrash}>Vider</button>
            )}
          </div>

          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="card">
              <div style={{ fontWeight: 800 }}>Trajets supprimés ({corbeille.trajets.length})</div>
              <ul className="muted" style={{ marginTop: 10 }}>
                {corbeille.trajets.map((t, idx) => (
                  <li key={idx} style={{ marginBottom: 8 }}>
                    {t.date || '—'} — {(t.debutTrajet || '...')} → {(t.finTrajet || '...')}
                    {canEdit && !locked && (
                      <button className="btn btn-sm btn-outline" style={{ marginLeft: 10 }} onClick={() => restoreTrip(idx)}>
                        Restaurer
                      </button>
                    )}
                  </li>
                ))}
                {!corbeille.trajets.length && <li>—</li>}
              </ul>
            </div>

            <div className="card">
              <div style={{ fontWeight: 800 }}>Carburants supprimés ({corbeille.carburants.length})</div>
              <ul className="muted" style={{ marginTop: 10 }}>
                {corbeille.carburants.map((s, idx) => (
                  <li key={idx} style={{ marginBottom: 8 }}>
                    {s.date || '—'} — {s.litres || '…'} L
                    {canEdit && !locked && (
                      <button className="btn btn-sm btn-outline" style={{ marginLeft: 10 }} onClick={() => restoreSupply(idx)}>
                        Restaurer
                      </button>
                    )}
                  </li>
                ))}
                {!corbeille.carburants.length && <li>—</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL AJOUT/MODIF TRAJET */}
      {tripModal && (
        <Modal
          title={tripModal.mode === 'add' ? 'Ajouter un trajet' : 'Modifier le trajet'}
          onClose={() => setTripModal(null)}
          width={980}
        >
          <FieldGrid>
            <div className="field">
              <div className="label">Date</div>
              <input
                className="input"
                type="date"
                value={tripModal.data.date}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, date: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Mission ?</div>
              <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={!!tripModal.data.isMission}
                  onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, isMission: e.target.checked } })}
                />
                <span className="muted">isMission</span>
              </label>
            </div>

            {tripModal.data.isMission && (
              <div className="field">
                <div className="label">Libellé mission</div>
                <input
                  className="input"
                  value={tripModal.data.missionLabel}
                  onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, missionLabel: e.target.value } })}
                  placeholder="Ex: Livraison / Course / ..."
                />
              </div>
            )}

            <div className="field">
              <div className="label">Départ heure</div>
              <input
                className="input"
                type="time"
                value={tripModal.data.departHeure}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, departHeure: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Départ km</div>
              <input
                className="input"
                type="number"
                value={tripModal.data.departKm}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, departKm: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Début trajet</div>
              <input
                className="input"
                value={tripModal.data.debutTrajet}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, debutTrajet: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Fin trajet</div>
              <input
                className="input"
                value={tripModal.data.finTrajet}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, finTrajet: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Lieu stationnement</div>
              <input
                className="input"
                value={tripModal.data.lieuStationnement}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, lieuStationnement: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Durée stationnement</div>
              <input
                className="input"
                value={tripModal.data.dureeStationnement}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, dureeStationnement: e.target.value } })}
                placeholder="ex: 45 / 1h30"
              />
            </div>

            <div className="field">
              <div className="label">Arrivée heure</div>
              <input
                className="input"
                type="time"
                value={tripModal.data.arriveeHeure}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, arriveeHeure: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Arrivée km</div>
              <input
                className="input"
                type="number"
                value={tripModal.data.arriveeKm}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, arriveeKm: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Personnes transportées</div>
              <input
                className="input"
                value={tripModal.data.personnesTransportees}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, personnesTransportees: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Émargement</div>
              <input
                className="input"
                value={tripModal.data.emargement}
                disabled={!!tripModal.data.isMission}
                onChange={(e) => setTripModal({ ...tripModal, data: { ...tripModal.data, emargement: e.target.value } })}
              />
            </div>
          </FieldGrid>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outline" onClick={() => setTripModal(null)}>Annuler</button>
            <button className="btn" onClick={saveTripModal}>
              {tripModal.mode === 'add' ? 'Ajouter' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}

      {/* MODAL AJOUT/MODIF CARBURANT */}
      {supplyModal && (
        <Modal
          title={supplyModal.mode === 'add' ? 'Ajouter un approvisionnement' : 'Modifier l’approvisionnement'}
          onClose={() => setSupplyModal(null)}
          width={820}
        >
          <FieldGrid>
            <div className="field">
              <div className="label">Date</div>
              <input
                className="input"
                type="date"
                value={supplyModal.data.date}
                onChange={(e) => setSupplyModal({ ...supplyModal, data: { ...supplyModal.data, date: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Compteur km</div>
              <input
                className="input"
                type="number"
                value={supplyModal.data.compteurKm}
                onChange={(e) => setSupplyModal({ ...supplyModal, data: { ...supplyModal.data, compteurKm: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Litres</div>
              <input
                className="input"
                type="number"
                value={supplyModal.data.litres}
                onChange={(e) => setSupplyModal({ ...supplyModal, data: { ...supplyModal.data, litres: e.target.value } })}
              />
            </div>

            <div className="field">
              <div className="label">Montant (Ar)</div>
              <input
                className="input"
                type="number"
                value={supplyModal.data.montantAr}
                onChange={(e) => setSupplyModal({ ...supplyModal, data: { ...supplyModal.data, montantAr: e.target.value } })}
              />
            </div>
          </FieldGrid>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <button className="btn btn-outline" onClick={() => setSupplyModal(null)}>Annuler</button>
            <button className="btn" onClick={saveSupplyModal}>
              {supplyModal.mode === 'add' ? 'Ajouter' : 'Enregistrer'}
            </button>
          </div>
        </Modal>
      )}

      {/* PASTE MODAL */}
      {pasteModal && (
        <Modal
          title={pasteModal.kind === 'trips' ? 'Coller trajets depuis Excel (TSV)' : 'Coller carburant depuis Excel (TSV)'}
          onClose={() => setPasteModal(null)}
          width={900}
        >
          <div className="muted" style={{ marginBottom: 10 }}>
            Colle ici (colonnes séparées par TAB).<br />
            {pasteModal.kind === 'trips'
              ? 'Format: date, depHeure, depKm, debut, fin, lieu, duree, arrHeure, arrKm, personnes, emargement, isMission, missionLabel'
              : 'Format: date, compteur, litres, montant'}
          </div>

          <textarea
            className="input"
            style={{ height: 260, fontFamily: 'monospace' }}
            value={pasteModal.text}
            onChange={(e) => setPasteModal({ ...pasteModal, text: e.target.value })}
            placeholder="Colle ici…"
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button className="btn btn-outline" onClick={() => setPasteModal(null)}>Annuler</button>
            <button className="btn" onClick={applyPaste}>Importer</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
