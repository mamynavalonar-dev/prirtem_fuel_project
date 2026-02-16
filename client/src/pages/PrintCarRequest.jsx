// client/src/pages/PrintCarRequest.jsx
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';

export default function PrintCarRequest() {
  const { id } = useParams();
  const { token } = useAuth();
  const [req, setReq] = useState(null);

  // --- Auto-fit / auto-scale (pour ne rien couper en A5) ---
  const paperRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);

  const recomputeScale = useCallback(() => {
    const paper = paperRef.current;
    const inner = innerRef.current;
    if (!paper || !inner) return;

    // Mesure en taille naturelle (sans scale)
    inner.style.transform = 'scale(1)';
    inner.style.transformOrigin = 'top left';

    // Force reflow
    void inner.offsetHeight;

    const availW = paper.clientWidth;
    const availH = paper.clientHeight;

    const needW = inner.scrollWidth;
    const needH = inner.scrollHeight;

    if (!needW || !needH) return;

    const s = Math.min(availW / needW, availH / needH, 1);
    // Autorise à réduire, mais évite de tomber trop bas
    const clamped = Math.max(0.28, s);

    setScale(clamped);
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      const data = await apiFetch(`/api/requests/car/${id}`, { token });
      setReq(data.request);
    })().catch(() => {});
  }, [id, token]);

  useLayoutEffect(() => {
    if (!req) return;
    // 2 passes pour être stable (layout + fonts)
    requestAnimationFrame(() => {
      recomputeScale();
      requestAnimationFrame(() => recomputeScale());
    });
  }, [req, recomputeScale]);

  useEffect(() => {
    const onBeforePrint = () => recomputeScale();
    window.addEventListener('beforeprint', onBeforePrint);
    window.addEventListener('resize', recomputeScale);

    const m = window.matchMedia?.('print');
    const onChange = () => recomputeScale();
    if (m?.addEventListener) m.addEventListener('change', onChange);
    else if (m?.addListener) m.addListener(onChange);

    return () => {
      window.removeEventListener('beforeprint', onBeforePrint);
      window.removeEventListener('resize', recomputeScale);
      if (m?.removeEventListener) m.removeEventListener('change', onChange);
      else if (m?.removeListener) m.removeListener(onChange);
    };
  }, [recomputeScale]);

  if (!req) return <div>Chargement...</div>;

  const noShort = toNoShort(req.request_no);

  const period =
    String(req.end_date || req.proposed_date || '') !== String(req.proposed_date || '')
      ? `${fmtDate(req.proposed_date)} → ${fmtDate(req.end_date)}`
      : fmtDate(req.proposed_date);

  return (
    <div className="printRoot">
      <div className="noPrint printToolbar">
        <Link to="/app/requests/car" className="btn btn-secondary">← Retour</Link>
        <button className="btn" onClick={() => window.print()} style={{ marginLeft: 10 }}>
          Imprimer
        </button>
      </div>

      {/* ✅ Page A5 paysage (210x148mm) */}
      <div className="paper" ref={paperRef}>
        {/* Inner scalé automatiquement (ne coupe jamais, réduit si besoin) */}
        <div
          className="paperInner"
          ref={innerRef}
          style={{ transform: `scale(${scale})` }}
        >
          {/* ====== GAUCHE : DEMANDE ====== */}
          <section className="panel panelLeft">
            <Header noShort={noShort} subtitle="DEMANDE DE VOITURE" />

            <div className="section">
              <div className="sectionTitle">IDENTIFICATION</div>
              <div className="grid2">
                <Line label="Service / Direction" value={req.requester_service} />
                <Line label="Type" value={req.trip_type} />
                <Line label="Demandeur" value={req.requester_name || req.requester_username} />
                <Line label="Contact" value={req.requester_contact} />
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">PÉRIODE & OBJET</div>
              <div className="grid2">
                <Line label="Période" value={period} />
                <Line label="Nb passagers" value={numOrBlank(req.passenger_count)} />
              </div>
              <div className="grid1" style={{ marginTop: 4 }}>
                <Line label="Objet" value={req.objet} />
              </div>
            </div>

            <div className="section">
              <div className="sectionTitle">TRAJET</div>
              <div className="grid2">
                <Line label="Départ" value={req.departure_place} />
                <Line label="Destination" value={req.destination_place} />
                <Line label="Départ souhaité" value={fmtTime(req.depart_time_wanted)} faintEmpty />
                <Line label="Retour probable" value={fmtTime(req.return_time_expected)} faintEmpty />
              </div>
              <div className="grid1" style={{ marginTop: 4 }}>
                <Box label="Itinéraire" value={req.itinerary} rows={2} />
              </div>
            </div>

            <div className="section sectionGrow">
              <div className="sectionTitle">PASSAGERS & OBSERVATIONS</div>
              <div className="grid2 grow2">
                <Box label="Personnes transportées" value={req.people} rows={6} />
                <Box label="Observations" value={req.observations || ''} rows={6} faintEmpty />
              </div>
            </div>

            <footer className="footerSign">
              <div className="signLine">
                <span className="signLabel">Date :</span>
                <span className="signDots" />
              </div>
              <div className="signBox">
                <div className="signTitle">Signature Demandeur</div>
                <div className="signSpace" />
                <div className="signLine">
                  <span className="signLabel">Nom :</span>
                  <span className="signDots" />
                </div>
              </div>
            </footer>
          </section>

          {/* ====== DROITE : AUTORISATION ====== */}
          <section className="panel panelRight">
            <Header noShort={noShort} subtitle="AUTORISATION SORTIE DE VOITURE" />

            <div className="section">
              <div className="sectionTitle">AUTORISATION</div>
              <div className="grid2">
                <Line label="Date" value={fmtDate(req.authorization_date)} faintEmpty />
                <Line label="Heure" value={fmtTime(req.authorization_time)} faintEmpty />
                <Line label="Immatriculation" value={req.vehicle_plate} faintEmpty />
                <Line label="Chauffeur" value={req.driver_name} faintEmpty />
              </div>
              <div className="grid1" style={{ marginTop: 4 }}>
                <Box label="Itinéraire" value={req.itinerary} rows={2} />
              </div>
            </div>

            <div className="section sectionGrow">
              <div className="sectionTitle">CONTRÔLE SORTIE / RETOUR</div>
              <div className="grid2">
                <Line label="Sortie réelle" value={fmtTime(req.actual_out_time)} faintEmpty />
                <Line label="Retour réel" value={fmtTime(req.actual_return_time)} faintEmpty />
                <Line label="Km départ" value={numOrBlank(req.odometer_start)} faintEmpty />
                <Line label="Km retour" value={numOrBlank(req.odometer_end)} faintEmpty />
                <Line label="Carburant départ" value={pctOrBlank(req.fuel_level_start)} faintEmpty />
                <Line label="Carburant retour" value={pctOrBlank(req.fuel_level_end)} faintEmpty />
              </div>
              <div className="hint">(À compléter par Logistique après retour véhicule)</div>
            </div>

            <footer className="footerVisa">
              <div className="visaGrid">
                <div className="visaBox">
                  <div className="visaTitle">Visa Logistique</div>
                  <div className="visaRow"><span>Nom :</span><span className="visaDots" /></div>
                  <div className="visaRow"><span>Visa :</span><span className="visaDots" /></div>
                </div>

                <div className="visaBox">
                  <div className="visaTitle">Approuvée par le RAF</div>
                  <div className="visaRow"><span>Nom :</span><span className="visaDots" /></div>
                  <div className="visaRow"><span>Visa :</span><span className="visaDots" /></div>
                </div>
              </div>
            </footer>
          </section>
        </div>
      </div>

      <style>{css}</style>
    </div>
  );
}

/* ---------------- UI components ---------------- */

function Header({ noShort, subtitle }) {
  return (
    <div className="header">
      <div className="brand">
        <div className="brandLogo">Z</div>
        <div className="brandText">
          <div>CEP</div>
          <div>PRIRTEM</div>
        </div>
      </div>

      <div className="headerRight">
        <div className="headerNo">
          N° <span className="headerNoValue">{noShort || '___'}</span>
        </div>
        <div className="headerTitle">{subtitle}</div>
      </div>
    </div>
  );
}

function Line({ label, value, faintEmpty }) {
  const v = safe(value);
  return (
    <div className="line">
      <div className="lineLabel">{label}</div>
      <div className={`lineValue ${!v && faintEmpty ? 'faint' : ''}`}>
        {v || (faintEmpty ? '' : <span className="dots" />)}
      </div>
    </div>
  );
}

function Box({ label, value, rows = 3, faintEmpty }) {
  const v = safe(value);
  return (
    <div className="box">
      <div className="boxLabel">{label}</div>
      <div className={`boxValue ${!v && faintEmpty ? 'faint' : ''}`} style={{ minHeight: `${rows * 10 + 10}px` }}>
        {v || (faintEmpty ? '' : <span className="dots" />)}
      </div>
    </div>
  );
}

/* ---------------- formatting helpers ---------------- */

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

function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return String(d);
  }
}

function fmtTime(t) {
  if (!t) return '';
  return String(t).slice(0, 5);
}

function numOrBlank(v) {
  return Number.isFinite(Number(v)) ? String(v) : '';
}

function pctOrBlank(v) {
  return Number.isFinite(Number(v)) ? `${v}%` : '';
}

/* ---------------- CSS (A5 paysage exact + auto-scale) ---------------- */

const css = `
/* ✅ A5 paysage EXACT (Chrome le lit mieux si @page est hors @media) */
@page{
  size: 210mm 148mm;
  margin: 0;
}

.printRoot{
  background:#f3f4f6;
  min-height:100vh;
  padding:16px;
}

.printToolbar{
  text-align:center;
  margin-bottom:12px;
}

/* ✅ La "feuille" A5 */
.paper{
  width:210mm;
  height:148mm;
  background:#fff;
  margin:0 auto;
  box-sizing:border-box;
  border:1px solid #111;
  position:relative;
  overflow:hidden; /* on ne coupe pas : on scale le contenu */
  font-family: Arial, sans-serif;
}

/* ✅ Contenu interne qui sera scale() */
.paperInner{
  position:absolute;
  top:0;
  left:0;
  width:210mm;
  height:auto;
  display:flex;
  transform-origin: top left;
}

/* Panels */
.panel{
  flex:1;
  box-sizing:border-box;
  padding:5mm;
  display:flex;
  flex-direction:column;
  min-height:0;
}
.panelLeft{
  border-right:1px dashed #111;
}

.header{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:10px;
  margin-bottom:6px;
}

.brand{
  display:flex;
  gap:8px;
  align-items:center;
}

.brandLogo{
  width:26px;
  height:26px;
  border:2px solid #555;
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight:900;
  color:#555;
  line-height:1;
}

.brandText{
  font-size:10px;
  font-weight:800;
  line-height:1.05;
}

.headerRight{
  text-align:right;
  display:flex;
  flex-direction:column;
  gap:3px;
}

.headerNo{
  font-size:10px;
  font-weight:900;
}

.headerNoValue{
  border-bottom:1px solid #111;
  padding:0 4px;
  display:inline-block;
  min-width:40px;
  text-align:center;
}

.headerTitle{
  font-size:11px;
  font-weight:900;
  text-transform:uppercase;
  letter-spacing:.3px;
}

.section{
  border:1px solid #111;
  padding:4px 6px;
  margin-bottom:6px;
  min-height:0;
}

.sectionGrow{
  flex:1;
  min-height:0;
}

.sectionTitle{
  font-size:9px;
  font-weight:900;
  text-transform:uppercase;
  letter-spacing:.4px;
  margin-bottom:4px;
}

.grid2{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:4px 8px;
}

.grid1{
  display:grid;
  grid-template-columns:1fr;
  gap:4px;
}

.line{
  display:grid;
  grid-template-columns:92px 1fr;
  gap:6px;
  align-items:baseline;
  font-size:10px;
  line-height:1.15;
}

.lineLabel{
  font-weight:900;
  white-space:nowrap;
}

.lineValue{
  border-bottom:1px dotted #222;
  min-height:12px;
  padding:0 2px 1px 2px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.lineValue.faint{
  opacity:.55;
}

.box{
  border:1px solid #111;
  padding:4px;
  display:flex;
  flex-direction:column;
  min-height:0;
}

.boxLabel{
  font-size:9px;
  font-weight:900;
  text-transform:uppercase;
  margin-bottom:3px;
  letter-spacing:.3px;
}

.boxValue{
  font-size:10px;
  line-height:1.2;
  white-space:pre-wrap;
  word-break:break-word;
  flex:1;
  min-height:0;
  overflow:visible; /* ✅ on ne coupe plus (scale gère) */
}

.boxValue.faint{
  opacity:.55;
}

.grow2{
  align-items:stretch;
}

.dots{
  display:inline-block;
  width:100%;
  height:10px;
  border-bottom:1px dotted #111;
  opacity:.35;
}

.hint{
  margin-top:6px;
  font-size:9px;
  opacity:.7;
  font-style:italic;
}

/* Footer */
.footerSign{
  margin-top:auto;
  display:flex;
  flex-direction:column;
  gap:6px;
}

.signLine{
  display:flex;
  align-items:center;
  gap:6px;
  font-size:10px;
}

.signLabel{
  font-weight:900;
}

.signDots{
  flex:1;
  border-bottom:1px dotted #111;
  height:10px;
}

.signBox{
  border:1px solid #111;
  padding:6px;
}

.signTitle{
  font-size:10px;
  font-weight:900;
  text-transform:uppercase;
  margin-bottom:4px;
}

.signSpace{
  height:22px;
  border-bottom:1px dotted #111;
  margin-bottom:6px;
}

.footerVisa{
  margin-top:auto;
}

.visaGrid{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:6px;
}

.visaBox{
  border:1px solid #111;
  padding:6px;
  min-height:52px;
  display:flex;
  flex-direction:column;
  gap:4px;
}

.visaTitle{
  font-size:10px;
  font-weight:900;
  text-transform:uppercase;
  text-align:center;
  margin-bottom:2px;
}

.visaRow{
  display:flex;
  gap:6px;
  font-size:10px;
  align-items:center;
}

.visaRow span:first-child{
  font-weight:900;
  width:34px;
}

.visaDots{
  flex:1;
  border-bottom:1px dotted #111;
  height:10px;
}

/* ✅ PRINT */
@media print{
  .noPrint{ display:none !important; }

  /* IMPORTANT: pour éviter les 3 pages à cause du scroll / layout */
  html, body{
    margin:0 !important;
    padding:0 !important;
    background:#fff !important;
  }

  .printRoot{
    background:#fff !important;
    padding:0 !important;
  }

  /* place la feuille exactement sur la page */
  .paper{
    position:fixed;
    left:0;
    top:0;
    width:210mm !important;
    height:148mm !important;
    margin:0 !important;
  }
}
  /* ==========================
   FIX DARK MODE (lisibilité)
   ========================== */

/* Forcer le rendu "light" sur cette page */
.printRoot{
  color: #111 !important;
  color-scheme: light;
}

.paper{
  background: #fff !important;
  color: #111 !important;
  opacity: 1 !important;
  filter: none !important;
}

/* Tout le contenu du papier en noir (évite l’héritage du thème dark) */
.paper *{
  color: #111 !important;
  opacity: 1 !important;
  filter: none !important;
}

/* Les champs "faint" : pas d’opacité (sinon illisible en dark) */
.lineValue.faint,
.boxValue.faint,
.hint{
  opacity: 1 !important;
  color: #666 !important;
}

/* Traits/bordures bien visibles */
.section,
.box{
  border-color: #111 !important;
}
.lineValue,
.headerNoValue,
.signDots,
.visaDots,
.dots{
  border-color: #111 !important;
}

/* Toolbar (boutons Retour/Imprimer) lisibles en dark */
.printToolbar .btn,
.printToolbar .btn-secondary{
  background: #fff !important;
  color: #111 !important;
  border: 1px solid #111 !important;
}

.printToolbar .btn:not(.btn-secondary){
  background: #111 !important;
  color: #fff !important;
  border: 1px solid #111 !important;
}

`;
