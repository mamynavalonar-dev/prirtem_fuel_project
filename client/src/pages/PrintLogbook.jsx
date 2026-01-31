import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

function fmtDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

export default function PrintLogbook() {
  const { id } = useParams();
  const { token } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch(`/api/logbooks/${id}`, { token }).then(setData);
  }, [id, token]);

  if (!data) return <div>Chargement...</div>;
  const { logbook, trips, supplies } = data;

  return (
    <div style={{ background: '#eee', minHeight: '100vh', padding: 20 }}>
      <div className="noPrint" style={{ marginBottom: 20, textAlign: 'center' }}>
        <Link className="btn btn-outline" to="/app/logbooks">← Retour</Link>
        <button className="btn" onClick={() => window.print()} style={{ marginLeft: 10 }}>Imprimer</button>
      </div>

      <div style={{
        background: 'white',
        width: '297mm', // A4 Paysage
        height: '210mm',
        padding: '10mm',
        margin: '0 auto',
        fontFamily: 'Arial, sans-serif',
        fontSize: '11px',
        color: 'black',
        boxShadow: '0 4px 10px rgba(0,0,0,0.1)'
      }} className="paper">
        
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ fontSize: '24px', fontWeight: '900', border: '3px solid black', padding: '0 8px', letterSpacing: '-1px' }}>
              Z
            </div>
            <div style={{ fontWeight: 'bold', fontSize: '10px', marginTop: 2 }}>CEP</div>
            <div style={{ fontWeight: 'bold', fontSize: '10px' }}>PRIRTEM</div>
          </div>
          
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h1 style={{ fontSize: '18px', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>Journal de bord voiture</h1>
            <div style={{ fontSize: '12px', marginTop: 5 }}>
              Du {new Date(logbook.period_start).toLocaleDateString('fr-FR')} au {new Date(logbook.period_end).toLocaleDateString('fr-FR')}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <span style={{ fontWeight: 'bold' }}>Objet :</span> {logbook.objet || '...........................................'} <br/>
          <span style={{ fontWeight: 'bold' }}>Immatriculation :</span> <span style={{ textDecoration: 'underline' }}>{logbook.plate}</span>
        </div>

        {/* MAIN TABLE */}
        <table style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid black', textAlign: 'center', fontSize: '10px' }}>
          <thead>
            <tr>
              <th rowSpan="2" style={thStyle}>DATE</th>
              <th colSpan="2" style={thStyle}>DEPART</th>
              <th colSpan="4" style={thStyle}>ITINERAIRES</th>
              <th colSpan="2" style={thStyle}>ARRIVEE</th>
              <th rowSpan="2" style={thStyle}>PERSONNES<br/>TRANSPORTEES</th>
              <th rowSpan="2" style={thStyle}>EMARGEMENT</th>
            </tr>
            <tr>
              <th style={thStyle}>Heures</th>
              <th style={thStyle}>Km</th>
              <th style={thStyle}>Début de trajet</th>
              <th style={thStyle}>Fin de trajet</th>
              <th style={thStyle}>Lieu de<br/>stationnement</th>
              <th style={thStyle}>Durée de<br/>stationnement</th>
              <th style={thStyle}>Heures</th>
              <th style={thStyle}>Km</th>
            </tr>
          </thead>
          <tbody>
            {trips.map((t, i) => (
              <tr key={i} style={{ height: '24px' }}>
                <td style={tdStyle}>{fmtDate(t.trip_date)}</td>
                <td style={tdStyle}>{t.depart_time ? t.depart_time.slice(0, 5).replace(':','H') : ''}</td>
                <td style={tdStyle}>{t.depart_km}</td>
                <td style={tdStyle}>{t.route_start}</td>
                <td style={tdStyle}>{t.route_end}</td>
                <td style={tdStyle}>{t.parking_place}</td>
                <td style={tdStyle}>{t.parking_duration_min ? t.parking_duration_min + ' min' : ''}</td>
                <td style={tdStyle}>{t.arrival_time ? t.arrival_time.slice(0, 5).replace(':','H') : ''}</td>
                <td style={tdStyle}>{t.arrival_km}</td>
                <td style={tdStyle}>{t.passengers}</td>
                <td style={tdStyle}>{t.emargement}</td>
              </tr>
            ))}
            {/* Lignes vides pour remplir la page si besoin */}
            {Array.from({ length: Math.max(0, 15 - trips.length) }).map((_, i) => (
              <tr key={`empty-${i}`} style={{ height: '24px' }}>
                <td style={tdStyle}></td><td style={tdStyle}></td><td style={tdStyle}></td>
                <td style={tdStyle}></td><td style={tdStyle}></td><td style={tdStyle}></td>
                <td style={tdStyle}></td><td style={tdStyle}></td><td style={tdStyle}></td>
                <td style={tdStyle}></td><td style={tdStyle}></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* FOOTER: APPRO & SIGNATURE */}
        <div style={{ display: 'flex', marginTop: 15, gap: 20 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 5 }}>Approvisionnement Carburant</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid black', fontSize: '10px' }}>
              <thead>
                <tr>
                  <th style={tdStyle}>Date</th>
                  <th style={tdStyle}>Compteur Km</th>
                  <th style={tdStyle}>Litre</th>
                </tr>
              </thead>
              <tbody>
                {supplies.length > 0 ? supplies.map((s, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{fmtDate(s.supply_date)}</td>
                    <td style={tdStyle}>{s.compteur_km}</td>
                    <td style={tdStyle}>{s.liters}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={3} style={{ ...tdStyle, height: '40px' }}></td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ width: '250px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted black', paddingBottom: 5 }}>
              <span>Services :</span>
              <span>{logbook.service_km || '.....'} km</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dotted black', paddingBottom: 5 }}>
              <span>Mission :</span>
              <span>{logbook.mission_km || '.....'} km</span>
            </div>
            <div style={{ marginTop: 10 }}>
              Chauffeur : <br/>
              <span style={{ fontFamily: 'monospace' }}>{logbook.chauffeur_signature}</span>
            </div>
          </div>
        </div>

      </div>
      <style>{`@media print { .noPrint { display: none; } @page { size: A4 landscape; margin: 0; } body { background: white; } .paper { box-shadow: none; } }`}</style>
    </div>
  );
}

const thStyle = { border: '1px solid black', padding: '4px', background: '#fff', fontWeight: 'bold' };
const tdStyle = { border: '1px solid black', padding: '4px' };