import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

function fmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('fr-FR'); }
  catch { return String(d); }
}
function fmtMoney(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('fr-FR').format(n);
}
function safe(v) {
  const s = String(v ?? '').trim();
  return s ? s : '';
}
function toNoShort(requestNo) {
  const s = String(requestNo || '').trim();
  if (!s) return '';
  const parts = s.split(' ');
  return parts.length >= 2 ? parts.slice(1).join(' ') : s;
}

export default function PrintFuelRequest() {
  const { id } = useParams();
  const { token } = useAuth();
  const [req, setReq] = useState(null);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const data = await apiFetch(`/api/requests/fuel/${id}`, { token });
      setReq(data.request);
    })().catch(() => {});
  }, [id, token]);

  if (!req) return <div>Chargement...</div>;

  const noShort = toNoShort(req.request_no);
  const isService = String(req.request_type || '').toUpperCase() === 'SERVICE';
  const isMission = String(req.request_type || '').toUpperCase() === 'MISSION';

  // ✅ ici : on considère request_date = DATE DU TICKET STATION (comme tu l’as demandé)
  const ticketDate = fmtDate(req.request_date);

  return (
    <div className="printRoot">
      <div className="noPrint printToolbar">
        <Link to="/app/requests/fuel" className="btn btn-secondary">← Retour</Link>
        <button className="btn" onClick={() => window.print()} style={{ marginLeft: 10 }}>Imprimer</button>
      </div>

      <div className="paper">
        <div className="topRow">
          <div className="brand">
            <div className="brandLine">CEP</div>
            <div className="brandLine">PRIRTEM</div>
          </div>

          <div className="title">DEMANDE DE CARBURANT</div>

          <div className="noBox">
            <div className="noLabel">N°</div>
            <div className="noValue">{noShort || '____/____'}</div>
          </div>
        </div>

        <div className="typeRow">
          <div className="typeItem">
            <div className="typeText">SERVICE</div>
            <div className="check">{isService ? 'X' : ''}</div>
          </div>

          <div className="typeItem">
            <div className="typeText">MISSION</div>
            <div className="check">{isMission ? 'X' : ''}</div>
          </div>
        </div>

        <div className="lineRow">
          <div className="lineLabel">OBJET :</div>
          <div className="lineValue">{safe(req.objet) || <span className="dots" />}</div>
        </div>

        <div className="lineRow" style={{ marginTop: 10 }}>
          <div className="lineLabel">Montant prévisionnel (en chiffre) :</div>
          <div className="lineValue">{fmtMoney(req.amount_estimated_ar) || <span className="dots" />}</div>
          <div className="ar">Ar</div>
        </div>

        <div className="lineRow">
          <div className="lineLabel">(en lettre) :</div>
          <div className="lineValue">{safe(req.amount_estimated_words) || <span className="dots" />}</div>
        </div>

        {/* ✅ PÉRIODE supprimée — ✅ Date remplie par date ticket */}
        <div className="dateRow">
          <div className="dateLabel">Date</div>
          <div className="dateValue">{ticketDate || ''}</div>
          <div className="dateDots">{ticketDate ? '' : '____/____/____'}</div>
        </div>

        <div className="signTable">
          <div className="signHead">Le Demandeur</div>
          <div className="signHead">Vérifié par : A/Logistique</div>
          <div className="signHead">Visé par : Le RAF</div>

          <div className="signCell">{safe(req.requester_username) || ''}</div>
          <div className="signCell" />
          <div className="signCell" />
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

const css = `
  .printRoot{
    background:#f3f4f6;
    min-height:100vh;
    padding:16px;
  }
  .printToolbar{ text-align:center; margin-bottom:12px; }

  /* ✅ Toolbar buttons: lisibles même en dark theme */
.printToolbar .btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding:10px 14px;
  border-radius:12px;
  border:1px solid #111;
  background:#111;
  color:#fff !important;
  font-weight:800;
  text-decoration:none;
  cursor:pointer;
}
.printToolbar .btn-secondary{
  background:#fff;
  color:#111 !important;
}
.printToolbar .btn:hover{ filter:brightness(1.05); }


  .paper{
    width:210mm;
    height:148mm;
    background:#fff;
    margin:0 auto;
    box-sizing:border-box;
    border:1px solid #111;
    padding:8mm;
    color:#111;
    font-family: Arial, Helvetica, sans-serif;
  }

  .topRow{
    display:grid;
    grid-template-columns: 1fr 2fr 1fr;
    align-items:start;
    gap:10px;
  }
  .brandLine{ font-size:14px; font-weight:700; line-height:1.2; }
  .title{
    text-align:center;
    font-size:16px;
    font-weight:800;
    letter-spacing: .8px;
    margin-top:10px;
  }
  .noBox{
    text-align:right;
    font-size:14px;
    font-weight:700;
  }
  .noLabel{ display:inline-block; margin-right:6px; }
  .noValue{ display:inline-block; min-width:90px; border-bottom:1px solid #111; text-align:center; }

  .typeRow{
    display:flex;
    justify-content:center;
    gap:70px;
    margin-top:12px;
    margin-bottom:10px;
  }
  .typeItem{ display:flex; align-items:center; gap:10px; font-weight:800; }
  .check{
    width:18px; height:18px;
    border:1px solid #111;
    display:flex;
    align-items:center;
    justify-content:center;
    font-weight:900;
    font-size:13px;
  }

  .lineRow{
    display:grid;
    grid-template-columns: auto 1fr auto;
    align-items:baseline;
    gap:10px;
    margin-top:6px;
    font-size:13px;
  }
  .lineLabel{ font-weight:700; white-space:nowrap; }
  .lineValue{
    border-bottom:1px solid #111;
    min-height:16px;
    padding:0 4px 2px 4px;
  }
  .ar{ font-weight:700; }

  .dots{
    display:inline-block;
    width:100%;
    height:12px;
    border-bottom:1px solid #111;
    opacity:.4;
  }

  .dateRow{
    display:flex;
    justify-content:flex-end;
    align-items:baseline;
    gap:8px;
    margin-top:12px;
    font-size:13px;
  }
  .dateLabel{ font-weight:700; }
  .dateValue{ font-weight:700; }
  .dateDots{ min-width:110px; border-bottom:1px solid #111; text-align:center; padding-bottom:2px; }

  .signTable{
    display:grid;
    grid-template-columns:1fr 1fr 1fr;
    border:1px solid #111;
    margin-top:14px;
  }
  .signHead{
    border-right:1px solid #111;
    padding:6px 8px;
    font-weight:800;
    text-align:center;
  }
  .signHead:last-child{ border-right:none; }

  .signCell{
    border-top:1px solid #111;
    border-right:1px solid #111;
    min-height:42mm;
    padding:6px 8px;
    font-size:13px;
  }
  .signCell:last-child{ border-right:none; }

  @media print{
    .noPrint{ display:none !important; }
    @page{
      size: 210mm 148mm; /* A5 paysage */
      margin: 6mm;
    }
    html, body{
      width: 210mm !important;
      height: 148mm !important;
      margin:0 !important;
      padding:0 !important;
      background:#fff !important;
    }
    .printRoot{ background:#fff !important; padding:0 !important; }
    .paper{
      width:210mm !important;
      height:148mm !important;
      margin:0 !important;
      border:1px solid #111;
      box-shadow:none !important;
    }
  }
`;
