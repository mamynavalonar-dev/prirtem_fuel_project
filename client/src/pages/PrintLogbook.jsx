import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

function fmtShortDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function fmtFR(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return String(d);
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function PrintLogbook() {
  const { id } = useParams();
  const { token } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    apiFetch(`/api/logbooks/${id}`, { token }).then(setData);
  }, [id, token]);

  const pages = useMemo(() => {
    if (!data) return [];
    const ROWS_PER_PAGE = 12;     // ✅ stable (évite débordement)
    const SUPPLIES_PER_PAGE = 2;  // ✅ mini bloc papier = 2 colonnes

    const trips = data.trips || [];
    const supplies = data.supplies || [];

    const tripPages = chunk(trips, ROWS_PER_PAGE);
    const supplyPages = chunk(supplies, SUPPLIES_PER_PAGE);

    const total = Math.max(1, tripPages.length, supplyPages.length);

    const out = [];
    for (let p = 0; p < total; p++) {
      out.push({
        trips: tripPages[p] || [],
        supplies: supplyPages[p] || [],
      });
    }
    return out;
  }, [data]);

  if (!data) return <div>Chargement...</div>;
  const { logbook } = data;

  const isMissionLogbook = (logbook.logbook_type || 'SERVICE') === 'MISSION';

  const title = isMissionLogbook
    ? 'JOURNAL DE BORD VOITURE MISSION'
    : 'JOURNAL DE BORD VOITURE';

  return (
    <div style={{ background: '#eee', minHeight: '100vh', padding: 20 }}>
      <div className="noPrint" style={{ marginBottom: 20, textAlign: 'center' }}>
        <Link className="btn btn-outline" to="/app/logbooks">← Retour</Link>
        <button className="btn" onClick={() => window.print()} style={{ marginLeft: 10 }}>Imprimer</button>
      </div>

      {pages.map((pg, pageIndex) => {
        const filledTrips = [...pg.trips];
        while (filledTrips.length < 12) filledTrips.push(null);

        const s1 = pg.supplies[0] || null;
        const s2 = pg.supplies[1] || null;

        return (
          <div key={pageIndex} className="paper">
            <div className="paperInner">

              {/* HEADER */}
              <div className="hdr">
                <div className="hdrLeft">
                  <div className="logoBox">Z</div>
                  <div className="logoText">CEP</div>
                  <div className="logoText">PRIRTEM</div>
                </div>

                <div className="hdrCenter">
                  <div className="hdrTitle">{title}</div>
                  <div className="hdrDates">
                    <span>Du</span>
                    <span className="line">{fmtFR(logbook.period_start)}</span>
                    <span>au</span>
                    <span className="line">{fmtFR(logbook.period_end)}</span>
                  </div>
                </div>
              </div>

              <div className="meta">
                <div><span className="metaLabel">Objet :</span> <span className={logbook.objet ? '' : 'dots'}>{logbook.objet || ' '}</span></div>
                <div><span className="metaLabel">Immatriculation :</span> <span className="underline">{logbook.plate}</span></div>
              </div>

              {/* MAIN TABLE */}
              <table className="tbl">
                <thead>
                  <tr>
                    <th rowSpan="2" className="th wDate">DATE</th>
                    <th colSpan="2" className="th">DEPART</th>
                    <th colSpan="4" className="th">ITINERAIRES</th>
                    <th colSpan="2" className="th">ARRIVEE</th>
                    <th rowSpan="2" className="th wPers">PERSONNES<br />TRANSPORTEES</th>
                    <th rowSpan="2" className="th wEm">EMARGEMENT</th>
                  </tr>
                  <tr>
                    <th className="th wTime">Heures</th>
                    <th className="th wKm">Km</th>
                    <th className="th wRoute">Début de trajet</th>
                    <th className="th wRoute">Fin de trajet</th>
                    <th className="th wPlace">Lieu de<br />stationnement</th>
                    <th className="th wDur">Durée de<br />stationnement</th>
                    <th className="th wTime">Heures</th>
                    <th className="th wKm">Km</th>
                  </tr>
                </thead>

                <tbody>
                  {filledTrips.map((t, i) => {
                    const isMissionRow = !!t?.is_mission;
                    const depT = t?.depart_time ? String(t.depart_time).slice(0, 5).replace(':', 'H') : '';
                    const arrT = t?.arrival_time ? String(t.arrival_time).slice(0, 5).replace(':', 'H') : '';
                    const dur = t?.parking_duration_min != null ? `${t.parking_duration_min} min` : '';

                    return (
                      <tr key={i} className="tr">
                        <td className="td">{t ? fmtShortDate(t.trip_date) : ''}</td>
                        <td className="td">{isMissionRow ? '' : depT}</td>
                        <td className="td">{isMissionRow ? '' : (t?.depart_km ?? '')}</td>
                        <td className="td">
                          {isMissionRow ? `MISSION : ${t?.mission_label || ''}` : (t?.route_start ?? '')}
                        </td>
                        <td className="td">{isMissionRow ? '' : (t?.route_end ?? '')}</td>
                        <td className="td">{isMissionRow ? '' : (t?.parking_place ?? '')}</td>
                        <td className="td">{isMissionRow ? '' : dur}</td>
                        <td className="td">{isMissionRow ? '' : arrT}</td>
                        <td className="td">{isMissionRow ? '' : (t?.arrival_km ?? '')}</td>
                        <td className="td">{isMissionRow ? '' : (t?.passengers ?? '')}</td>
                        <td className="td">{isMissionRow ? '' : (t?.emargement ?? '')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* FOOTER: APPRO + SIGNATURE (comme scan) */}
              <div className="footer">
                <div className="appro">
                  <div className="approTitle">Approvisionnement Carburant</div>

                  {/* ✅ Conforme scan: 3 lignes, 2 colonnes de saisie (donc 3 colonnes au total) */}
                  <table className="approTbl">
                    <tbody>
                      <tr>
                        <td className="approLabel">Date</td>
                        <td className="approCell">{s1 ? fmtShortDate(s1.supply_date) : ''}</td>
                        <td className="approCell">{s2 ? fmtShortDate(s2.supply_date) : ''}</td>
                      </tr>
                      <tr>
                        <td className="approLabel">Compteur Km</td>
                        <td className="approCell">{s1 ? (s1.compteur_km ?? '') : ''}</td>
                        <td className="approCell">{s2 ? (s2.compteur_km ?? '') : ''}</td>
                      </tr>
                      <tr>
                        <td className="approLabel">Litre</td>
                        <td className="approCell">{s1 ? (s1.liters ?? '') : ''}</td>
                        <td className="approCell">{s2 ? (s2.liters ?? '') : ''}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="sign">
                  <div className="signLabel">chauffeur</div>
                  <div className="signLine">{logbook.chauffeur_signature || ''}</div>
                </div>
              </div>

            </div>

            {pageIndex < pages.length - 1 && <div className="pageBreak" />}
          </div>
        );
      })}

      <style>{`
        @media print {
          .noPrint { display: none; }
          @page { size: A4 landscape; margin: 0; }
          body { background: white; }
          .paper { box-shadow: none; margin: 0; }
          .pageBreak { page-break-after: always; }
        }

        .paper {
          background: white;
          width: 297mm;
          min-height: 210mm;
          margin: 0 auto 16px auto;
          box-shadow: 0 4px 10px rgba(0,0,0,0.08);
          font-family: Arial, sans-serif;
          color: #000;
        }

        .paperInner{
          padding: 10mm;
          font-size: 11px;
        }

        .hdr{
          display:flex;
          align-items:flex-start;
          gap:12mm;
          margin-bottom: 6mm;
        }
        .hdrLeft{
          width: 32mm;
          display:flex;
          flex-direction:column;
          align-items:flex-start;
          gap:1mm;
        }
        .logoBox{
          font-size: 24px;
          font-weight: 900;
          border: 2px solid #000;
          padding: 0 3mm;
          line-height: 28px;
        }
        .logoText{
          font-weight: 700;
          font-size: 10px;
          line-height: 1.1;
        }
        .hdrCenter{
          flex:1;
          text-align:center;
        }
        .hdrTitle{
          font-size: 16px;
          font-weight: 800;
          letter-spacing: .3px;
          text-transform: uppercase;
        }
        .hdrDates{
          margin-top: 2mm;
          display:flex;
          justify-content:center;
          gap:4mm;
          align-items:center;
          font-size: 12px;
        }
        .line{
          display:inline-block;
          min-width: 55mm;
          border-bottom: 1px solid #000;
          padding: 0 2mm 1px 2mm;
        }

        .meta{
          margin-bottom: 3mm;
          font-size: 11px;
        }
        .metaLabel{
          font-weight: 700;
        }
        .underline{
          text-decoration: underline;
          font-weight: 700;
        }
        .dots{
          display:inline-block;
          min-width: 120mm;
          border-bottom: 1px dotted #000;
          height: 12px;
        }

        .tbl{
          width:100%;
          border-collapse:collapse;
          border: 2px solid #000;
          text-align:center;
          font-size: 10px;
        }
        .th{
          border:1px solid #000;
          padding: 2px 3px;
          font-weight:700;
        }
        .td{
          border:1px solid #000;
          padding: 2px 3px;
          height: 7.5mm;
          vertical-align: middle;
        }

        /* widths (stable print) */
        .wDate{ width: 12mm; }
        .wTime{ width: 12mm; }
        .wKm{ width: 14mm; }
        .wRoute{ width: 32mm; }
        .wPlace{ width: 32mm; }
        .wDur{ width: 18mm; }
        .wPers{ width: 22mm; }
        .wEm{ width: 22mm; }

        .footer{
          display:flex;
          justify-content:space-between;
          align-items:flex-end;
          gap:10mm;
          margin-top: 5mm;
        }
        .appro{
          flex:1;
        }
        .approTitle{
          font-weight:700;
          margin-bottom: 2mm;
        }
        .approTbl{
          width: 120mm;
          border-collapse: collapse;
          border: 1px solid #000;
          font-size: 10px;
        }
        .approLabel{
          border: 1px solid #000;
          padding: 2px 3px;
          width: 28mm;
          text-align:left;
          font-weight:700;
        }
        .approCell{
          border: 1px solid #000;
          padding: 2px 3px;
          width: 46mm;
          height: 6.5mm;
        }

        .sign{
          width: 70mm;
          text-align:right;
        }
        .signLabel{
          font-size: 12px;
          margin-bottom: 2mm;
          text-transform: lowercase;
        }
        .signLine{
          border-top: 1px solid #000;
          min-height: 12mm;
          padding-top: 2mm;
          font-family: monospace;
          text-align:left;
        }
      `}</style>
    </div>
  );
}
