import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

const draftKey = (id) => `prirtem:logbook:${id}:draft:v1`;

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function genId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `${Date.now()}-${Math.random()}`;
}

/**
 * Accepte:
 * - "150" => 150 min
 * - "2h" => 120
 * - "2h30" => 150
 * - "02:30" => 150
 */
function parseDurationToMinutes(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;

  if (/^\d+$/.test(s)) return Number(s);

  // 2h30 / 2h / 2 h 30
  const m1 = s.match(/^(\d+)\s*h\s*(\d+)?$/i);
  if (m1) {
    const h = Number(m1[1] || 0);
    const min = Number(m1[2] || 0);
    return h * 60 + min;
  }

  // 02:30
  const m2 = s.match(/^(\d+)\s*:\s*(\d+)$/);
  if (m2) {
    const h = Number(m2[1] || 0);
    const min = Number(m2[2] || 0);
    return h * 60 + min;
  }

  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function minutesToPretty(v) {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  const nn = Math.round(n);
  if (nn < 60) return String(nn);
  const h = Math.floor(nn / 60);
  const m = nn % 60;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function mapTripFromApi(t) {
  return {
    id: (t.id ?? genId()),
    date: (t.trip_date || '').slice(0, 10),
    departHeure: t.depart_time || '',
    departKm: t.depart_km ?? '',
    debutTrajet: t.route_start || '',
    finTrajet: t.route_end || '',
    lieuStationnement: t.parking_place || '',
    dureeStationnement: t.parking_duration_min ?? '',
    arriveeHeure: t.arrival_time || '',
    arriveeKm: t.arrival_km ?? '',
    personnesTransportees: t.passengers || '',
    emargement: t.emargement || '',
    isMission: !!t.is_mission,
    missionLabel: t.mission_label || '',
  };
}

function mapSupplyFromApi(s) {
  return {
    id: (s.id ?? genId()),
    date: (s.supply_date || '').slice(0, 10),
    compteurKm: s.compteur_km ?? '',
    litres: s.liters ?? '',
    montantAr: s.montant_ar ?? '',
  };
}

function sameId(a, b) {
  return String(a) === String(b);
}

export default function LogbookEdit() {
  const { token, user } = useAuth();
  const { id } = useParams();

  const canEdit = ['LOGISTIQUE', 'ADMIN'].includes(user?.role);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [logbook, setLogbook] = useState(null);

  // Filtre période (UI only)
  const [headerFilter, setHeaderFilter] = useState({
    dateDebut: '',
    dateFin: '',
  });

  // Trajets
  const [trajets, setTrajets] = useState([]);
  const [showTrajetForm, setShowTrajetForm] = useState(false);
  // ✅ Correctif: on stocke l'ID du trajet en cours d'édition (et non l'index)
  const [editingTrajetId, setEditingTrajetId] = useState(null);

  const [currentTrajet, setCurrentTrajet] = useState({
    date: '',
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
  });

  // Carburants
  const [carburants, setCarburants] = useState([]);
  const [showCarburantForm, setShowCarburantForm] = useState(false);
  const [editingCarburant, setEditingCarburant] = useState(null);
  const [currentCarburant, setCurrentCarburant] = useState({
    date: '',
    compteurKm: '',
    litres: '',
    montantAr: '',
  });

  // Corbeille (UI only)
  const [corbeille, setCorbeille] = useState({ trajets: [], carburants: [] });
  const [showCorbeille, setShowCorbeille] = useState(false);

  const locked = logbook?.status === 'LOCKED';

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch(`/api/logbooks/${id}`, { token });
      const book = data.logbook;

      const base = {
        logbook: book,
        headerFilter: {
          dateDebut: (book?.period_start || '').slice(0, 10),
          dateFin: (book?.period_end || '').slice(0, 10),
        },
        trajets: (data.trips || []).map(mapTripFromApi),
        carburants: (data.supplies || []).map(mapSupplyFromApi),
        corbeille: { trajets: [], carburants: [] },
      };

      // Restore draft si dispo
      const draftRaw = localStorage.getItem(draftKey(id));
      const draft = draftRaw ? safeJsonParse(draftRaw) : null;

      if (draft?.logbookId !== undefined && sameId(draft.logbookId, id)) {
        setLogbook({ ...base.logbook, ...draft.logbookEdits });
        setHeaderFilter(draft.headerFilter || base.headerFilter);
        setTrajets(Array.isArray(draft.trajets) ? draft.trajets : base.trajets);
        setCarburants(Array.isArray(draft.carburants) ? draft.carburants : base.carburants);
        setCorbeille(draft.corbeille || base.corbeille);
      } else {
        setLogbook(base.logbook);
        setHeaderFilter(base.headerFilter);
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

  // ✅ Ajout token en dépendance (évite un load avec token périmé après login/refresh)
  useEffect(() => { load(); }, [id, token]);

  // Sauvegarde brouillon local (UI)
  useEffect(() => {
    if (loading) return;
    if (!logbook) return;

    const payload = {
      logbookId: id,
      savedAt: Date.now(),
      headerFilter,
      logbookEdits: {
        objet: logbook.objet ?? '',
        chauffeur_signature: logbook.chauffeur_signature ?? '',
        service_km: logbook.service_km ?? 0,
        mission_km: logbook.mission_km ?? 0,
      },
      trajets,
      carburants,
      corbeille,
    };
    localStorage.setItem(draftKey(id), JSON.stringify(payload));
  }, [loading, id, headerFilter, logbook, trajets, carburants, corbeille]);

  function clearLocalDraft() {
    localStorage.removeItem(draftKey(id));
    alert('✅ Brouillon local supprimé.');
  }

  // ===== Trajets =====
  function resetTrajetForm() {
    setCurrentTrajet({
      date: '',
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
    });
    setShowTrajetForm(false);
    setEditingTrajetId(null);
  }

  function handleAddTrajet() {
    if (locked || !canEdit) return;

    const isMission = !!currentTrajet.isMission;

    if (!currentTrajet.date) {
      alert('Veuillez renseigner la date.');
      return;
    }

    if (!isMission) {
      if (currentTrajet.departKm === '' || currentTrajet.arriveeKm === '') {
        alert('Veuillez remplir au minimum les kilomètres départ/arrivée.');
        return;
      }
    } else {
      if (!String(currentTrajet.missionLabel || '').trim()) {
        alert('Veuillez renseigner le libellé de mission.');
        return;
      }
    }

    const item = { ...currentTrajet, id: currentTrajet.id || genId() };

    // ✅ Correctif: update par ID (fiable même si liste filtrée/triée)
    if (editingTrajetId !== null) {
      const idx = trajets.findIndex((x) => sameId(x.id, editingTrajetId));
      if (idx !== -1) {
        const updated = [...trajets];
        updated[idx] = item;
        setTrajets(updated);
      } else {
        setTrajets([...trajets, item]);
      }
    } else {
      setTrajets([...trajets, item]);
    }

    resetTrajetForm();
  }

  // ✅ Correctif: on reçoit l'ID, pas l'index
  function handleEditTrajet(trajetId) {
    if (locked || !canEdit) return;
    const idx = trajets.findIndex((x) => sameId(x.id, trajetId));
    if (idx === -1) return;
    setCurrentTrajet(trajets[idx]);
    setEditingTrajetId(trajetId);
    setShowTrajetForm(true);
  }

  // ✅ Correctif: delete par ID
  function handleDeleteTrajet(trajetId) {
    if (locked || !canEdit) return;
    const idx = trajets.findIndex((x) => sameId(x.id, trajetId));
    if (idx === -1) return;
    const trajetToDelete = trajets[idx];
    setCorbeille((prev) => ({ ...prev, trajets: [...prev.trajets, trajetToDelete] }));
    setTrajets(trajets.filter((x) => !sameId(x.id, trajetId)));
  }

  // ===== Carburants =====
  function resetCarburantForm() {
    setCurrentCarburant({ date: '', compteurKm: '', litres: '', montantAr: '' });
    setShowCarburantForm(false);
    setEditingCarburant(null);
  }

  function handleAddCarburant() {
    if (locked || !canEdit) return;

    if (!currentCarburant.date || currentCarburant.compteurKm === '' || currentCarburant.litres === '' || currentCarburant.montantAr === '') {
      alert('Veuillez remplir Date, Compteur, Litres et Montant.');
      return;
    }

    const item = { ...currentCarburant, id: currentCarburant.id || genId() };

    if (editingCarburant !== null) {
      const updated = [...carburants];
      updated[editingCarburant] = item;
      setCarburants(updated);
    } else {
      setCarburants([...carburants, item]);
    }

    resetCarburantForm();
  }

  function handleEditCarburant(index) {
    if (locked || !canEdit) return;
    setCurrentCarburant(carburants[index]);
    setEditingCarburant(index);
    setShowCarburantForm(true);
  }

  function handleDeleteCarburant(index) {
    if (locked || !canEdit) return;
    const carburantToDelete = carburants[index];
    setCorbeille((prev) => ({ ...prev, carburants: [...prev.carburants, carburantToDelete] }));
    setCarburants(carburants.filter((_, i) => i !== index));
  }

  // ===== Corbeille =====
  function restaurerTrajet(index) {
    if (locked || !canEdit) return;
    const x = corbeille.trajets[index];
    setTrajets([...trajets, x]);
    setCorbeille((prev) => ({ ...prev, trajets: prev.trajets.filter((_, i) => i !== index) }));
  }

  function restaurerCarburant(index) {
    if (locked || !canEdit) return;
    const x = corbeille.carburants[index];
    setCarburants([...carburants, x]);
    setCorbeille((prev) => ({ ...prev, carburants: prev.carburants.filter((_, i) => i !== index) }));
  }

  function viderCorbeille() {
    if (locked || !canEdit) return;
    if (window.confirm('Êtes-vous sûr de vouloir vider la corbeille ?')) {
      setCorbeille({ trajets: [], carburants: [] });
    }
  }

  // ===== Filtrage =====
  const trajetsFiltered = useMemo(() => {
    return trajets.filter((t) => {
      if (!headerFilter.dateDebut || !headerFilter.dateFin || !t.date) return true;
      return t.date >= headerFilter.dateDebut && t.date <= headerFilter.dateFin;
    });
  }, [trajets, headerFilter]);

  // ===== Stats =====
  const distanceTotale = useMemo(() => {
    return trajetsFiltered.reduce((acc, t) => {
      if (t.isMission) return acc;
      const dep = parseInt(t.departKm || 0, 10);
      const arr = parseInt(t.arriveeKm || 0, 10);
      const d = (Number.isFinite(arr) ? arr : 0) - (Number.isFinite(dep) ? dep : 0);
      return acc + (Number.isFinite(d) ? d : 0);
    }, 0);
  }, [trajetsFiltered]);

  // ===== Save backend =====
  async function saveAll() {
    if (!canEdit || locked) return;

    try {
      // Header
      await apiFetch(`/api/logbooks/${id}`, {
        token,
        method: 'PUT',
        body: {
          objet: logbook.objet ?? '',
          chauffeur_signature: logbook.chauffeur_signature ?? '',
          service_km: Number(logbook.service_km || 0),
          mission_km: Number(logbook.mission_km || 0),
        },
      });

      // Trips
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

      // Supplies
      const suppliesPayload = carburants.map((s) => ({
        supply_date: s.date,
        compteur_km: Number(s.compteurKm),
        liters: Number(s.litres),
        montant_ar: Number(s.montantAr),
      }));

      await apiFetch(`/api/logbooks/${id}/supplies`, {
        token,
        method: 'PUT',
        body: { supplies: suppliesPayload },
      });

      // clear draft local (car synced)
      localStorage.removeItem(draftKey(id));

      alert('✅ Enregistré avec succès');
      await load();
    } catch (e) {
      alert('❌ Erreur lors de la sauvegarde : ' + (e.message || String(e)));
    }
  }

  async function submitLogbook() {
    if (!canEdit || locked) return;
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
    if (!window.confirm('Verrouiller définitivement ce journal ? (Aucune modification ensuite)')) return;
    try {
      await apiFetch(`/api/logbooks/${id}/lock`, { token, method: 'PATCH' });
      localStorage.removeItem(draftKey(id));
      await load();
      alert('🔒 Journal verrouillé.');
    } catch (e) {
      alert('❌ ' + (e.message || String(e)));
    }
  }

  function handlePrint() {
    window.open(`/print/logbook/${id}`, '_blank', 'noopener,noreferrer');
  }

  if (loading) return <div className="card">Chargement...</div>;
  if (err) return <div className="card"><div className="error">{err}</div><Link to="/app/logbooks">Retour</Link></div>;
  if (!logbook) return <div className="card">Journal de bord non trouvé.</div>;

  const corbeilleCount = (corbeille.trajets.length + corbeille.carburants.length);

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
              <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>JOURNAL DE BORD VOITURE</div>
              <div className="muted" style={{ fontSize: 13, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span><b>Immatriculation:</b> {logbook.plate}</span>
                <span><b>Période:</b> {String(logbook.period_start).slice(0,10)} → {String(logbook.period_end).slice(0,10)}</span>
                <span className={`badge ${logbook.status === 'LOCKED' ? 'badge-bad' : logbook.status === 'SUBMITTED' ? 'badge-info' : 'badge-warn'}`}>
                  {logbook.status}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setShowCorbeille((v) => !v)}>
              🗑️ Corbeille ({corbeilleCount})
            </button>
            <button className="btn btn-secondary" onClick={handlePrint}>
              🖨️ Imprimer
            </button>
            <Link className="btn btn-outline" to="/app/logbooks">
              ← Retour
            </Link>
            {canEdit && !locked && (
              <button className="btn" onClick={saveAll}>
                💾 Enregistrer
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Infos générales */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="grid2">
          <div className="field">
            <div className="label">Objet</div>
            <input
              disabled={!canEdit || locked}
              value={logbook.objet || ''}
              onChange={(e) => setLogbook({ ...logbook, objet: e.target.value })}
              placeholder="Description du véhicule/mission"
            />
          </div>

          <div className="field">
            <div className="label">Immatriculation</div>
            <input disabled value={logbook.plate || ''} />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div className="grid2">
          <div className="field">
            <div className="label">Période du (filtre)</div>
            <input
              type="date"
              value={headerFilter.dateDebut || ''}
              onChange={(e) => setHeaderFilter({ ...headerFilter, dateDebut: e.target.value })}
            />
          </div>
          <div className="field">
            <div className="label">au (filtre)</div>
            <input
              type="date"
              value={headerFilter.dateFin || ''}
              onChange={(e) => setHeaderFilter({ ...headerFilter, dateFin: e.target.value })}
            />
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline btn-sm" onClick={clearLocalDraft}>
            ♻️ Supprimer brouillon local
          </button>
        </div>
      </div>

      {/* Corbeille */}
      {showCorbeille && (
        <div className="card" style={{ marginBottom: 16, border: '2px solid rgba(15,23,42,.18)', background: 'rgba(15,23,42,.02)' }}>
          <div className="rowBetween" style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>Corbeille</div>
            <button className="btn btn-danger btn-sm" onClick={viderCorbeille} disabled={!canEdit || locked}>
              Vider la corbeille
            </button>
          </div>

          {corbeille.trajets.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Trajets supprimés</div>
              {corbeille.trajets.map((t, i) => (
                <div key={i} className="card" style={{ padding: 10, marginBottom: 8 }}>
                  <div className="rowBetween">
                    <div style={{ fontSize: 13 }}>
                      <b>{t.date}</b>
                      {' — '}
                      {t.isMission ? `MISSION: ${t.missionLabel || ''}` : `${t.debutTrajet} → ${t.finTrajet}`}
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => restaurerTrajet(i)} disabled={!canEdit || locked}>
                      ↩ Restaurer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {corbeille.carburants.length > 0 && (
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Carburants supprimés</div>
              {corbeille.carburants.map((c, i) => (
                <div key={i} className="card" style={{ padding: 10, marginBottom: 8 }}>
                  <div className="rowBetween">
                    <div style={{ fontSize: 13 }}>
                      <b>{c.date}</b> — {c.compteurKm} km — {c.litres} L — {c.montantAr} Ar
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => restaurerCarburant(i)} disabled={!canEdit || locked}>
                      ↩ Restaurer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {corbeille.trajets.length === 0 && corbeille.carburants.length === 0 && (
            <div className="muted" style={{ textAlign: 'center', padding: 10 }}>La corbeille est vide</div>
          )}
        </div>
      )}

      {/* Trajets */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="rowBetween" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Trajets</div>
          {canEdit && !locked && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setCurrentTrajet((p) => ({ ...p, isMission: false }));
                  setShowTrajetForm((v) => !v);
                }}
              >
                ➕ Ajouter un trajet
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setCurrentTrajet({
                    ...currentTrajet,
                    date: headerFilter.dateDebut || currentTrajet.date || '',
                    isMission: true,
                    missionLabel: currentTrajet.missionLabel || 'MISSION',
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
                  });
                  setEditingTrajetId(null);
                  setShowTrajetForm(true);
                }}
              >
                🎯 Ajouter mission
              </button>
            </div>
          )}
        </div>

        {/* Form trajet */}
        {showTrajetForm && (
          <div className="card" style={{ marginBottom: 12, border: '2px solid rgba(37,99,235,.18)', background: 'rgba(37,99,235,.04)' }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              {editingTrajetId !== null ? 'Modifier' : 'Nouveau'} {currentTrajet.isMission ? ' (MISSION)' : ''}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
              <div className="field">
                <div className="label">Date *</div>
                <input
                  type="date"
                  value={currentTrajet.date}
                  onChange={(e) => setCurrentTrajet({ ...currentTrajet, date: e.target.value })}
                  disabled={!canEdit || locked}
                />
              </div>

              {!currentTrajet.isMission && (
                <>
                  <div className="field">
                    <div className="label">Départ - Heure</div>
                    <input
                      type="time"
                      value={currentTrajet.departHeure}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, departHeure: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Départ - Km *</div>
                    <input
                      type="number"
                      value={currentTrajet.departKm}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, departKm: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>
                </>
              )}

              {currentTrajet.isMission && (
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <div className="label">Libellé mission *</div>
                  <input
                    value={currentTrajet.missionLabel}
                    onChange={(e) => setCurrentTrajet({ ...currentTrajet, missionLabel: e.target.value })}
                    disabled={!canEdit || locked}
                    placeholder="Détails mission..."
                  />
                </div>
              )}

              {!currentTrajet.isMission && (
                <>
                  <div className="field">
                    <div className="label">Début de trajet</div>
                    <input
                      value={currentTrajet.debutTrajet}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, debutTrajet: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Fin de trajet</div>
                    <input
                      value={currentTrajet.finTrajet}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, finTrajet: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Lieu de stationnement</div>
                    <input
                      value={currentTrajet.lieuStationnement}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, lieuStationnement: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>

                  <div className="field">
                    <div className="label">Durée stationnement (min / 2h30)</div>
                    <input
                      value={currentTrajet.dureeStationnement}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, dureeStationnement: e.target.value })}
                      disabled={!canEdit || locked}
                      placeholder="Ex: 150 ou 2h30"
                    />
                  </div>
                  <div className="field">
                    <div className="label">Arrivée - Heure</div>
                    <input
                      type="time"
                      value={currentTrajet.arriveeHeure}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, arriveeHeure: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Arrivée - Km *</div>
                    <input
                      type="number"
                      value={currentTrajet.arriveeKm}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, arriveeKm: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>

                  <div className="field">
                    <div className="label">Personnes transportées</div>
                    <input
                      value={currentTrajet.personnesTransportees}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, personnesTransportees: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>
                  <div className="field">
                    <div className="label">Émargement</div>
                    <input
                      value={currentTrajet.emargement}
                      onChange={(e) => setCurrentTrajet({ ...currentTrajet, emargement: e.target.value })}
                      disabled={!canEdit || locked}
                    />
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={handleAddTrajet} disabled={!canEdit || locked}>
                💾 {editingTrajetId !== null ? 'Mettre à jour' : 'Enregistrer'}
              </button>
              <button className="btn btn-outline" onClick={resetTrajetForm}>
                Annuler
              </button>
            </div>
          </div>
        )}

        {/* Table trajets */}
        <div className="tableWrap">
          <table className="table" style={{ minWidth: 1100, fontSize: 12 }}>
            <thead>
              <tr>
                <th>DATE</th>
                <th>DÉPART (H)</th>
                <th>DÉPART (KM)</th>
                <th>DÉBUT</th>
                <th>FIN</th>
                <th>LIEU STATION.</th>
                <th>DURÉE</th>
                <th>ARRIVÉE (H)</th>
                <th>ARRIVÉE (KM)</th>
                <th>PERSONNES</th>
                <th>ÉMARGEMENT</th>
                {canEdit && !locked && <th style={{ width: 110 }}>ACTIONS</th>}
              </tr>
            </thead>
            <tbody>
              {trajetsFiltered.length === 0 ? (
                <tr>
                  <td colSpan={canEdit && !locked ? 12 : 11} className="muted" style={{ padding: 16 }}>
                    Aucun trajet enregistré.
                  </td>
                </tr>
              ) : (
                trajetsFiltered.map((t) => (
                  t.isMission ? (
                    <tr key={t.id} style={{ background: 'rgba(16,185,129,.10)' }}>
                      <td><b>{t.date}</b></td>
                      <td colSpan={canEdit && !locked ? 10 : 9}>
                        <b>🎯 MISSION</b> — {t.missionLabel || ''}
                      </td>
                      {canEdit && !locked && (
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-outline btn-sm" onClick={() => handleEditTrajet(t.id)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTrajet(t.id)}>🗑️</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ) : (
                    <tr key={t.id}>
                      <td>{t.date}</td>
                      <td>{t.departHeure}</td>
                      <td>{t.departKm}</td>
                      <td>{t.debutTrajet}</td>
                      <td>{t.finTrajet}</td>
                      <td>{t.lieuStationnement}</td>
                      <td>{minutesToPretty(t.dureeStationnement)}</td>
                      <td>{t.arriveeHeure}</td>
                      <td>{t.arriveeKm}</td>
                      <td>{t.personnesTransportees}</td>
                      <td>{t.emargement}</td>
                      {canEdit && !locked && (
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-outline btn-sm" onClick={() => handleEditTrajet(t.id)}>✏️</button>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDeleteTrajet(t.id)}>🗑️</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Approvisionnement Carburant */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="rowBetween" style={{ marginBottom: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Approvisionnement Carburant</div>
          {canEdit && !locked && (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowCarburantForm((v) => !v)}>
              ➕ Ajouter carburant
            </button>
          )}
        </div>

        {showCarburantForm && (
          <div className="card" style={{ marginBottom: 12, border: '2px solid rgba(16,185,129,.18)', background: 'rgba(16,185,129,.04)' }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>
              {editingCarburant !== null ? 'Modifier' : 'Nouvel'} approvisionnement
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
              <div className="field">
                <div className="label">Date *</div>
                <input
                  type="date"
                  value={currentCarburant.date}
                  onChange={(e) => setCurrentCarburant({ ...currentCarburant, date: e.target.value })}
                  disabled={!canEdit || locked}
                />
              </div>
              <div className="field">
                <div className="label">Compteur Km *</div>
                <input
                  type="number"
                  value={currentCarburant.compteurKm}
                  onChange={(e) => setCurrentCarburant({ ...currentCarburant, compteurKm: e.target.value })}
                  disabled={!canEdit || locked}
                />
              </div>
              <div className="field">
                <div className="label">Litres *</div>
                <input
                  type="number"
                  step="0.01"
                  value={currentCarburant.litres}
                  onChange={(e) => setCurrentCarburant({ ...currentCarburant, litres: e.target.value })}
                  disabled={!canEdit || locked}
                />
              </div>
              <div className="field">
                <div className="label">Montant (Ar) *</div>
                <input
                  type="number"
                  value={currentCarburant.montantAr}
                  onChange={(e) => setCurrentCarburant({ ...currentCarburant, montantAr: e.target.value })}
                  disabled={!canEdit || locked}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={handleAddCarburant} disabled={!canEdit || locked}>
                💾 {editingCarburant !== null ? 'Mettre à jour' : 'Enregistrer'}
              </button>
              <button className="btn btn-outline" onClick={resetCarburantForm}>
                Annuler
              </button>
            </div>
          </div>
        )}

        <div className="tableWrap">
          <table className="table" style={{ minWidth: 820, fontSize: 12 }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Compteur Km</th>
                <th>Litres</th>
                <th>Montant (Ar)</th>
                {canEdit && !locked && <th style={{ width: 110 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {carburants.length === 0 ? (
                <tr>
                  <td colSpan={canEdit && !locked ? 5 : 4} className="muted" style={{ padding: 16 }}>
                    Aucun approvisionnement enregistré.
                  </td>
                </tr>
              ) : (
                carburants.map((c, index) => (
                  <tr key={c.id}>
                    <td>{c.date}</td>
                    <td>{c.compteurKm}</td>
                    <td>{c.litres}</td>
                    <td>{c.montantAr}</td>
                    {canEdit && !locked && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-outline btn-sm" onClick={() => handleEditCarburant(index)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteCarburant(index)}>🗑️</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer stats + résumé */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
          <div className="card" style={{ padding: 12, background: 'rgba(37,99,235,.06)' }}>
            <div className="label">Total trajets (filtrés)</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{trajetsFiltered.length}</div>
          </div>

          <div className="card" style={{ padding: 12, background: 'rgba(16,185,129,.06)' }}>
            <div className="label">Total carburants</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{carburants.length}</div>
          </div>

          <div className="card" style={{ padding: 12, background: 'rgba(245,158,11,.10)' }}>
            <div className="label">Distance totale (approx.)</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{distanceTotale} km</div>
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div className="grid2">
          <div className="field">
            <div className="label">Services (km) - manuel</div>
            <input
              type="number"
              disabled={!canEdit || locked}
              value={logbook.service_km ?? 0}
              onChange={(e) => setLogbook({ ...logbook, service_km: e.target.value })}
            />
          </div>
          <div className="field">
            <div className="label">Mission (km) - manuel</div>
            <input
              type="number"
              disabled={!canEdit || locked}
              value={logbook.mission_km ?? 0}
              onChange={(e) => setLogbook({ ...logbook, mission_km: e.target.value })}
            />
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div className="field">
          <div className="label">Signature Chauffeur</div>
          <input
            disabled={!canEdit || locked}
            value={logbook.chauffeur_signature || ''}
            onChange={(e) => setLogbook({ ...logbook, chauffeur_signature: e.target.value })}
            placeholder="Nom du chauffeur"
          />
        </div>
      </div>

      {/* Actions de flux */}
      {canEdit && !locked && (
        <div className="rowBetween" style={{ marginBottom: 18 }}>
          <div className="muted" style={{ fontSize: 13 }}>
            Astuce: tu peux travailler puis cliquer <b>Enregistrer</b>. Le brouillon local évite de perdre en cas de refresh.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {logbook.status === 'DRAFT' && (
              <button className="btn btn-secondary" onClick={submitLogbook}>
                📤 Soumettre
              </button>
            )}
            <button className="btn btn-danger" onClick={lockLogbook}>
              🔒 Verrouiller définitivement
            </button>
          </div>
        </div>
      )}

      {locked && (
        <div className="card" style={{ border: '2px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.06)' }}>
          <div style={{ fontWeight: 900, color: '#b91c1c', textAlign: 'center' }}>
            🔒 Ce journal est VERROUILLÉ — aucune modification n’est possible.
          </div>
        </div>
      )}
    </div>
  );
}
