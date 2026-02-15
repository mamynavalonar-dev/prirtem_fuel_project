import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

export default function PrintFuelRequest() {
  const { id } = useParams();
  const { token } = useAuth();
  const [req, setReq] = useState(null);

  useEffect(() => {
    (async () => {
      const data = await apiFetch(`/api/requests/fuel/${id}`, { token });
      setReq(data.request);
    })();
  }, [id, token]);

  if (!req) return <div>Chargement...</div>;

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', padding: 20 }}>
      <div className="noPrint" style={{ textAlign: 'center', marginBottom: 20 }}>
        <Link to="/app/requests/fuel" className="btn btn-secondary">← Retour</Link>
        <button className="btn" onClick={() => window.print()} style={{ marginLeft: 10 }}>Imprimer</button>
      </div>

      <div className="paper" style={{
        width: '210mm', minHeight: '130mm', // Demi page A4 environ ou ajusté
        background: 'white', margin: '0 auto', padding: '20mm',
        position: 'relative', fontFamily: 'Arial, sans-serif', color: '#000'
      }}>
        
        {/* Header gauche / droite */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 'normal', fontSize: '14px' }}>CEP</div>
            <div style={{ fontWeight: 'normal', fontSize: '14px' }}>PRIRTEM</div>
          </div>
          <div style={{ fontSize: '14px' }}>N° <span style={{ textDecoration: 'underline' }}>{req.request_no.split(' ')[1]}</span></div>
        </div>

        {/* Titre */}
        <div style={{ textAlign: 'center', fontSize: '18px', marginBottom: 30 }}>
          DEMANDE DE CARBURANT
        </div>

        {/* Checkbox Service / Mission */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 100, marginBottom: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>SERVICE</span>
            <div style={boxStyle}>{req.request_type === 'SERVICE' ? 'X' : ''}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>MISSION</span>
            <div style={boxStyle}>{req.request_type === 'MISSION' ? 'X' : ''}</div>
          </div>
        </div>

        {/* Champs lignes */}
        <div style={lineGroupStyle}>
          <span>OBJET : </span>
          <div style={lineStyle}>{req.objet}</div>
        </div>
        <div style={lineGroupStyle}>
          <span>PÉRIODE : </span>
          <div style={lineStyle}>
            {String(req.end_date || req.request_date || '').slice(0, 10) !== String(req.request_date || '').slice(0, 10)
              ? `${String(req.request_date || '').slice(0, 10)} → ${String(req.end_date || '').slice(0, 10)}`
              : String(req.request_date || '').slice(0, 10)}
          </div>
        </div>


        <div style={{ ...lineGroupStyle, marginTop: 25 }}>
          <span>Montant prévisionnel (en chiffre) : </span>
          <div style={{ ...lineStyle, width: '200px' }}>{Number(req.amount_estimated_ar).toLocaleString('fr-FR')}</div>
          <span>Ar</span>
        </div>

        <div style={{ ...lineGroupStyle, marginTop: 25 }}>
          <span style={{ width: '150px' }}>(en lettre) :</span>
          <div style={lineStyle}>{req.amount_estimated_words}</div>
        </div>

        <div style={{ textAlign: 'right', marginTop: 40, marginBottom: 10 }}>
          Date ____/____/________
        </div>

        {/* Tableau Signatures */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 20 }}>
          <thead>
            <tr>
              <th style={cellStyle}>Le Demandeur</th>
              <th style={cellStyle}>Vérifié par : A/Logistique</th>
              <th style={cellStyle}>Visé par : Le RAF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cellStyle, height: '100px', verticalAlign: 'bottom', textAlign:'center' }}>
                {req.requester_username || ''}
              </td>
              <td style={{ ...cellStyle, height: '100px' }}></td>
              <td style={{ ...cellStyle, height: '100px' }}></td>
            </tr>
          </tbody>
        </table>

      </div>
      <style>{`@media print { .noPrint { display: none; } body { margin: 0; } .paper { box-shadow: none; border: none; } }`}</style>
    </div>
  );
}

const boxStyle = { width: '20px', height: '20px', border: '1px solid black', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: 'bold' };
const lineGroupStyle = { display: 'flex', alignItems: 'baseline', fontSize: '14px' };
const lineStyle = { flex: 1, borderBottom: '1px solid black', paddingLeft: '10px', height: '24px' };
const cellStyle = { border: '1px solid black', padding: '5px', textAlign: 'center', width: '33%' };

