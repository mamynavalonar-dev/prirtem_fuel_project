import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

export default function PrintCarRequest() {
  const { id } = useParams();
  const { token } = useAuth();
  const [req, setReq] = useState(null);

  useEffect(() => {
    (async () => {
      const data = await apiFetch(`/api/requests/car/${id}`, { token });
      setReq(data.request);
    })();
  }, [id, token]);

  if (!req) return <div>Chargement...</div>;

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: 20 }}>
      <div className="noPrint" style={{ textAlign: 'center', marginBottom: 20 }}>
        <Link to="/app/requests/car" className="btn btn-secondary">← Retour</Link>
        <button className="btn" onClick={() => window.print()} style={{ marginLeft: 10 }}>Imprimer</button>
      </div>

      <div className="paper" style={{
        width: '270mm', height: '190mm',
        background: 'white', margin: '0 auto', padding: '15mm',
        display: 'flex', gap: '10mm', fontFamily: 'Arial, sans-serif'
      }}>
        
        {/* ----- PARTIE GAUCHE: DEMANDE ----- */}
        <div style={{ flex: 1, borderRight: '1px dashed black', paddingRight: '10mm', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', gap: 15, marginBottom: 20 }}>
            {/* Logo Z sim */}
            <div style={{ border: '4px solid #555', padding: '5px 10px', fontWeight: '900', fontSize: '24px', color: '#555', lineHeight: '24px' }}>Z</div>
            <div>
              <div style={{fontWeight:'bold'}}>CEP</div>
              <div style={{fontWeight:'bold'}}>PRIRTEM</div>
            </div>
          </div>

          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 30, fontSize: '16px' }}>
            Demande de voiture
          </div>

          <Field label="Date proposée" value={fmtDate(req.proposed_date)} />
          <Field label="Objet" value={req.objet} />
          <div style={{ margin: '15px 0', borderBottom: '1px dotted #999' }}></div>
          <Field label="Itinéraire" value={req.itinerary} multiline />
          <div style={{ margin: '15px 0', borderBottom: '1px dotted #999' }}></div>
          <Field label="Personnes transportées" value={req.people} />
          <div style={{ margin: '15px 0', borderBottom: '1px dotted #999' }}></div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <Field label="Heure de départ souhaitée" value={fmtTime(req.depart_time_wanted)} />
              <Field label="Heure probable de retour" value={fmtTime(req.return_time_expected)} />
              <Field label="Immatriculation" value={req.vehicle_plate || '...................'} />
              <Field label="Chauffeur" value={req.driver_name || '...................'} />
            </div>
          </div>

          <div style={{ marginTop: 'auto' }}>
            <div>Date : ___________________</div>
            <div style={{ marginTop: 10 }}>Le Demandeur,</div>
            <div style={{ height: 50 }}></div>
          </div>
        </div>

        {/* ----- PARTIE DROITE: AUTORISATION ----- */}
        <div style={{ flex: 1, paddingLeft: '5mm', display: 'flex', flexDirection: 'column' }}>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 15 }}>
              <div style={{ border: '4px solid #555', padding: '5px 10px', fontWeight: '900', fontSize: '24px', color: '#555', lineHeight: '24px' }}>Z</div>
              <div>
                <div style={{fontWeight:'bold'}}>CEP</div>
                <div style={{fontWeight:'bold'}}>PRIRTEM</div>
              </div>
            </div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
              N° <span style={{ textDecoration:'underline' }}>{req.request_no.split(' ')[1]}</span>
            </div>
          </div>

          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 30, fontSize: '16px' }}>
            Autorisation sortie de voiture
          </div>

          <Field label="Date" value={fmtDate(req.authorization_date)} />
          <Field label="Heure" value={fmtTime(req.authorization_time)} />
          <Field label="Immatriculation" value={req.vehicle_plate || '.......................'} />
          <Field label="Chauffeur" value={req.driver_name || '.......................'} />
          <Field label="Itinéraire" value={req.itinerary} />

          <div style={{ marginTop: 'auto', borderTop: '2px solid black', paddingTop: 10 }}>
            <div style={{ display: 'flex', border: '1px solid black' }}>
              <div style={{ flex: 1, borderRight: '1px solid black', padding: 5, minHeight: 80 }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>Visa<br/>A/Logistique</div>
                {/* Espace Signature */}
              </div>
              <div style={{ flex: 1, padding: 5, minHeight: 80 }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px' }}>Approuvée<br/>par Le RAF</div>
                {/* Espace Signature */}
              </div>
            </div>
          </div>

        </div>

      </div>
      <style>{`@media print { .noPrint { display: none; } @page { size: A4 landscape; margin: 5mm; } body { margin: 0; background: white; } .paper { margin: 0; box-shadow: none; width: 100%; height: 100%; } }`}</style>
    </div>
  );
}

function Field({ label, value, multiline }) {
  return (
    <div style={{ display: 'flex', alignItems: multiline ? 'flex-start' : 'baseline', marginBottom: 8, fontSize: '13px' }}>
      <span style={{ fontWeight: 'bold', marginRight: 10, minWidth: 60 }}>{label} :</span>
      <div style={{ flex: 1, borderBottom: '1px dotted #333', paddingLeft: 5, minHeight: 18 }}>
        {value}
      </div>
    </div>
  );
}

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : ''; }
function fmtTime(t) { return t ? t.slice(0, 5) : ''; }