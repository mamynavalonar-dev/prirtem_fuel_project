import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

function makeTrip(row_order) {
  return {
    row_order,
    trip_date: '',
    depart_time: '',
    depart_km: '',
    route_start: '',
    route_end: '',
    parking_place: '',
    parking_duration_min: '',
    arrival_time: '',
    arrival_km: '',
    passengers: '',
    emargement: '',
    is_mission: false,
    mission_label: ''
  };
}

export default function LogbookEdit() {
  const { token, user } = useAuth();
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [logbook, setLogbook] = useState(null);
  const [trips, setTrips] = useState([]);
  const [supplies, setSupplies] = useState([]);
  const canEdit = ['LOGISTIQUE','ADMIN'].includes(user?.role);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const data = await apiFetch(`/api/logbooks/${id}`, { token }); // API call remains the same
      setLogbook(data.logbook);
      setTrips((data.trips || []).map((t) => ({
        ...t,
        trip_date: t.trip_date ? t.trip_date.substring(0,10) : '',
        is_mission: !!t.is_mission
      })));
      setSupplies((data.supplies || []).map((s) => ({
        ...s,
        supply_date: s.supply_date ? s.supply_date.substring(0,10) : ''
      })));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  const locked = logbook?.status === 'LOCKED';

  function updateTrip(i, key, val) {
    setTrips((prev) => prev.map((t, idx) => idx === i ? { ...t, [key]: val } : t));
  }

  function addTrip() {
    // Logic to determine next row_order
    const nextOrder = trips.length ? Math.max(...trips.map(t => Number(t.row_order)||0)) + 1 : 1;
    setTrips((prev) => [...prev, makeTrip(nextOrder)]);
  }

  function removeTrip(i) {
    setTrips((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addSupply() {
    setSupplies((prev) => [...prev, { supply_date: '', compteur_km: '', liters: '', montant_ar: '' }]);
  }

  function removeSupply(i) {
    setSupplies((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateSupply(i, key, val) {
    setSupplies((prev) => prev.map((s, idx) => idx === i ? { ...s, [key]: val } : s));
  }

  async function saveAll() {
    if (!canEdit) return;
    try {
      // 1. Update Header details (Objet, Signature Chauffeur)
      await apiFetch(`/api/logbooks/${id}`, {
        token, method: 'PUT',
        body: { objet: logbook.objet, chauffeur_signature: logbook.chauffeur_signature }
      });

      // 2. Update Trips
      const tripsPayload = trips.map((t, idx) => ({
        ...t, // Pass all trip data
        row_order: idx + 1, // Re-index row_order
        // Ensure numerical fields are correctly formatted or null
        depart_km: t.depart_km === '' ? null : Number(t.depart_km),
        arrival_km: t.arrival_km === '' ? null : Number(t.arrival_km),
        parking_duration_min: t.parking_duration_min === '' ? null : Number(t.parking_duration_min)
      }));
      await apiFetch(`/api/logbooks/${id}/trips`, { token, method: 'PUT', body: { trips: tripsPayload } });

      // 3. Update Supplies
      const supPayload = supplies
        .filter(s => s.supply_date || s.compteur_km || s.liters || s.montant_ar) // Filter out empty rows
        .map(s => ({
          ...s,
          compteur_km: Number(s.compteur_km),
          liters: Number(s.liters),
          montant_ar: Number(s.montant_ar)
      }));
      await apiFetch(`/api/logbooks/${id}/supplies`, { token, method: 'PUT', body: { supplies: supPayload } });
      
      alert('✅ Enregistré avec succès');
      await load(); // Reload data to reflect changes
    } catch (e) {
      alert('❌ Erreur lors de la sauvegarde : ' + e.message);
    }
  }

  if (loading) return <div className="card">Chargement...</div>;
  if (err) return <div className="card"><div className="error">{err}</div><Link to="/app/logbooks">Retour</Link></div>;
  if (!logbook) return <div className="card">Journal de bord non trouvé.</div>;

  return (
    <div style={{ padding: 20 }}>
      {/* ========== HEADER & ACTIONS ========== */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '2px solid #e5e7eb'
      }}>
        <div>
          <div style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px' }}>
            JOURNAL DE BORD VOITURE
          </div>
          {/* Info Période & Immatriculation */}
          <div style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#6b7280' }}>
            {/* Il n'y a pas d'immatriculation filtrée ici, donc on affiche le plate */}
            <span><strong>Période:</strong> Du {logbook.period_start} au {logbook.period_end}</span>
            <span><strong>Immatriculation:</strong> {logbook.plate}</span>
            <span className={`badge ${logbook.status === 'LOCKED' ? 'badge-bad' : logbook.status === 'SUBMITTED' ? 'badge-info' : 'badge-warn'}`}>
              {logbook.status}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <a className="btn btn-secondary" href={`/print/logbook/${id}`} target="_blank" rel="noreferrer">
            📄 Imprimer
          </a>
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

      {/* OBJET DU JOURNAL */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ fontWeight: '700', marginBottom: '12px' }}>Objet</div>
        <input
          disabled={!canEdit || locked}
          value={logbook.objet || ''}
          onChange={(e) => setLogbook({ ...logbook, objet: e.target.value })}
          placeholder="Description du journal..."
          style={{ width: '100%' }}
        />
      </div>

      {/* TABLEAU DES TRAJETS */}
      <div className="card" style={{ overflowX: 'auto', marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontWeight: '800', fontSize: '18px' }}>TRAJETS</div>
          {canEdit && !locked && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-sm" onClick={addTrip}>+ Trajet</button>
              {/* Option pour ajouter une ligne "MISSION" */}
              <button className="btn btn-secondary btn-sm" onClick={() => setTrips(prev => [...prev, {...makeTrip(prev.length + 1), is_mission: true, mission_label: "MISSION"}])}>+ MISSION</button>
            </div>
          )}
        </div>

        <table className="table" style={{ fontSize: '12px', width: '100%' }}>
          <thead>
            <tr>
              <th rowSpan="2" style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700' }}>DATE</th>
              <th colSpan="2" style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700', textAlign: 'center' }}>DÉPART</th>
              <th colSpan="4" style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700', textAlign: 'center' }}>ITINÉRAIRES</th>
              <th colSpan="2" style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700', textAlign: 'center' }}>ARRIVÉE</th>
              <th rowSpan="2" style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700' }}>PERSONNES TRANSPORTÉES</th>
              <th rowSpan="2" style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700' }}>ÉMARGEMENT</th>
              {canEdit && !locked && (
                <th rowSpan="2" style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700', width: '60px' }}>Actions</th>
              )}
            </tr>
            <tr>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Heures</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Km</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Début de trajet</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Fin de trajet</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Lieu stationnement</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Durée (min)</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Heures</th>
              <th style={{ border: '1px solid #e5e7eb', padding: '8px', fontWeight: '600', fontSize: '12px' }}>Km</th>
            </tr>
          </thead>
          <tbody>
            {trips.length === 0 && (
              <tr><td colSpan={canEdit && !locked ? 12 : 11} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Aucun trajet</td></tr>
            )}
            {/* Affichage des trajets */}
            {trips.map((t, i) => (
              t.is_mission ? ( // Ligne MISSION spéciale
                <tr key={i} style={{ background: '#ecfdf5' }}>
                  <td colSpan={canEdit && !locked ? 11 : 10} style={{ border: '1px solid #e5e7eb', padding: '12px' }}>
                    <strong style={{ fontSize: '14px' }}>🎯 MISSION</strong>
                    {canEdit && !locked ? (
                      <input
                        value={t.mission_label || ''}
                        onChange={(e) => updateTrip(i, 'mission_label', e.target.value)}
                        placeholder="Détails mission..."
                        style={{ marginLeft: '12px', width: 'calc(100% - 120px)', border: '1px solid #6ee7b7', borderRadius: '4px', padding: '6px' }}
                      />
                    ) : (
                      <span style={{ marginLeft: '12px', fontWeight: '600' }}>{t.mission_label || ''}</span>
                    )}
                  </td>
                  {canEdit && !locked && (
                    <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'center' }}>
                      <button className="btn btn-danger btn-sm" onClick={() => removeTrip(i)}>✕</button>
                    </td>
                  )}
                </tr>
              ) : ( // Ligne de trajet normale
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="date" value={t.trip_date} onChange={(e) => updateTrip(i, 'trip_date', e.target.value)} disabled={!canEdit || locked} style={{ width: '90px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="time" value={t.depart_time} onChange={(e) => updateTrip(i, 'depart_time', e.target.value)} disabled={!canEdit || locked} style={{ width: '80px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="number" value={t.depart_km} onChange={(e) => updateTrip(i, 'depart_km', e.target.value)} disabled={!canEdit || locked} style={{ width: '70px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input value={t.route_start} onChange={(e) => updateTrip(i, 'route_start', e.target.value)} disabled={!canEdit || locked} style={{ border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input value={t.route_end} onChange={(e) => updateTrip(i, 'route_end', e.target.value)} disabled={!canEdit || locked} style={{ border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input value={t.parking_place} onChange={(e) => updateTrip(i, 'parking_place', e.target.value)} disabled={!canEdit || locked} placeholder="Lieu..." style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px', marginBottom: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input value={t.parking_duration_min} onChange={(e) => updateTrip(i, 'parking_duration_min', e.target.value)} disabled={!canEdit || locked} placeholder="Min" style={{ width: '60px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="time" value={t.arrival_time} onChange={(e) => updateTrip(i, 'arrival_time', e.target.value)} disabled={!canEdit || locked} style={{ width: '80px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="number" value={t.arrival_km} onChange={(e) => updateTrip(i, 'arrival_km', e.target.value)} disabled={!canEdit || locked} style={{ width: '70px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input value={t.passengers} onChange={(e) => updateTrip(i, 'passengers', e.target.value)} disabled={!canEdit || locked} style={{ border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input value={t.emargement} onChange={(e) => updateTrip(i, 'emargement', e.target.value)} disabled={!canEdit || locked} style={{ border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  {canEdit && !locked && (
                    <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'center' }}>
                      <button className="btn btn-danger btn-sm" onClick={() => removeTrip(i)}>✕</button>
                    </td>
                  )}
                </tr>
              )
            ))}
          </tbody>
        </table>
        {!locked && <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={addTrip}>+ Trajet</button>}
      </div>

      {/* APPROVISIONNEMENT CARBURANT */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div style={{ fontWeight: '800', fontSize: '18px' }}>APPROVISIONNEMENT CARBURANT</div>
          {canEdit && !locked && <button className="btn btn-sm" onClick={addSupply}>+ Ligne</button>}
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead style={{ background: '#f9fafb' }}>
              <tr>
                <th style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700' }}>Date</th>
                <th style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700' }}>Compteur Km</th>
                <th style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700' }}>Litre</th>
                <th style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700' }}>Montant (Ar)</th>
                {canEdit && !locked && <th style={{ border: '1px solid #e5e7eb', padding: '10px', fontWeight: '700', width: '80px' }}>Actions</th> }
              </tr>
            </thead>
            <tbody>
              {supplies.length === 0 && <tr><td colSpan={canEdit && !locked ? 5 : 4} style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>Aucun approvisionnement</td></tr>}
              {supplies.map((s, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="date" value={s.supply_date} onChange={(e) => updateSupply(i, 'supply_date', e.target.value)} disabled={!canEdit || locked} style={{ width: '100%', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="number" value={s.compteur_km} onChange={(e) => updateSupply(i, 'compteur_km', e.target.value)} disabled={!canEdit || locked} style={{ width: '100px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="number" step="0.01" value={s.liters} onChange={(e) => updateSupply(i, 'liters', e.target.value)} disabled={!canEdit || locked} style={{ width: '100px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  <td style={{ border: '1px solid #e5e7eb', padding: '8px' }}>
                    <input type="number" value={s.montant_ar} onChange={(e) => updateSupply(i, 'montant_ar', e.target.value)} disabled={!canEdit || locked} style={{ width: '120px', border: 'none', background: 'transparent', padding: '4px' }}/>
                  </td>
                  {canEdit && !locked && (
                    <td style={{ border: '1px solid #e5e7eb', padding: '8px', textAlign: 'center' }}>
                      <button className="btn btn-danger btn-sm" onClick={() => removeSupply(i)}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* RÉSUMÉ & ACTIONS */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ fontWeight: '800', fontSize: '18px', marginBottom: '16px' }}>RÉSUMÉ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          {/* Kilométrage Services / Mission (non editable pour le moment car manuel) */}
          <div>
            <div className="label">Services (km) - manuel</div>
            <input disabled value={logbook.service_km ?? 0} style={{ width: '100%', background: '#f3f4f6' }}/>
          </div>
          <div>
            <div className="label">Mission (km) - manuel</div>
            <input disabled value={logbook.mission_km ?? 0} style={{ width: '100%', background: '#f3f4f6' }}/>
          </div>
          <div>
            <div className="label">Signature Chauffeur</div>
            <input
              disabled={!canEdit || locked}
              value={logbook.chauffeur_signature || ''}
              onChange={(e) => setLogbook({ ...logbook, chauffeur_signature: e.target.value })}
              placeholder="Nom du chauffeur"
              style={{ width: '100%' }}
            />
          </div>
        </div>
      </div>

      {/* ACTIONS DE FLUX (Soumettre, Verrouiller etc.) */}
      {canEdit && !locked && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          {logbook.status === 'DRAFT' && (
            <button className="btn btn-secondary" onClick={() => alert('Fonctionnalité à implémenter : soumettre')}>
              📤 Soumettre
            </button>
          )}
          <button className="btn btn-danger" onClick={() => alert('Fonctionnalité à implémenter : verrouiller')}>
            🔒 Verrouiller définitivement
          </button>
        </div>
      )}
      
      {/* Message si journal verrouillé */}
      {locked && (
        <div style={{ padding: '16px', background: '#fef2f2', border: '2px solid #fca5a5', borderRadius: '8px', color: '#b91c1c', fontWeight: '600', textAlign: 'center' }}>
          🔒 Ce journal est VERROUILLÉ - Aucune modification n'est possible
        </div>
      )}

      {err && <div style={{ marginTop: '16px', padding: '12px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', color: '#b91c1c' }}>❌ {err}</div>}
    </div>
  );
}