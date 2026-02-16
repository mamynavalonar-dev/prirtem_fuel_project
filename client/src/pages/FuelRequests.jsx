import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';
import Modal from '../components/Modal.jsx';
import './FuelRequests.css';

function ymdToday() {
  return new Date().toISOString().slice(0, 10);
}

function fmtAr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return new Intl.NumberFormat('fr-FR').format(v);
}

function fmtDateFr(d) {
  if (!d) return '';
  try {
    return new Date(d).toLocaleDateString('fr-FR');
  } catch {
    return String(d);
  }
}

function statusLabel(s) {
  switch (String(s || '').toUpperCase()) {
    case 'SUBMITTED': return 'En attente';
    case 'VERIFIED': return 'Validé (Logistique)';
    case 'APPROVED': return 'Approuvé (RAF)';
    case 'REJECTED': return 'Rejeté';
    case 'CANCELLED': return 'Annulé';
    default: return String(s || '');
  }
}

function statusClass(s) {
  return String(s || '').toLowerCase();
}

/* ---- Montant en lettres (FR) ---- */
function numberToFrWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return 'zéro';

  const units = [
    '', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
    'dix-sept', 'dix-huit', 'dix-neuf'
  ];
  const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

  function twoDigitsToFr(x) {
    if (x < 20) return units[x];
    const t = Math.floor(x / 10);
    const u = x % 10;

    if (t === 7 || t === 9) {
      const base = tens[t];
      const rest = x - t * 10; // 10..19
      return base + '-' + twoDigitsToFr(rest);
    }

    if (t === 8 && u === 0) return 'quatre-vingts';
    if (u === 0) return tens[t];

    if (u === 1 && t !== 8) return tens[t] + ' et un';
    return tens[t] + '-' + units[u];
  }

  function threeDigitsToFr(x) {
    const c = Math.floor(x / 100);
    const r = x % 100;
    let out = '';

    if (c === 1) out = 'cent';
    else if (c > 1) out = units[c] + ' cent';

    if (c > 0 && r === 0 && c > 1) out += 's';
    if (r > 0) out += (out ? ' ' : '') + twoDigitsToFr(r);

    return out;
  }

  function chunkToFr(x, labelSing, labelPlur) {
    if (x === 0) return '';
    if (x === 1 && labelSing === 'mille') return 'mille';
    const base = x === 1 ? 'un' : threeDigitsToFr(x);
    return base + ' ' + (x === 1 ? labelSing : labelPlur);
  }

  const milliards = Math.floor(n / 1_000_000_000);
  n = n % 1_000_000_000;
  const millions = Math.floor(n / 1_000_000);
  n = n % 1_000_000;
  const milliers = Math.floor(n / 1_000);
  const reste = n % 1_000;

  const parts = [];
  if (milliards) parts.push(chunkToFr(milliards, 'milliard', 'milliards'));
  if (millions) parts.push(chunkToFr(millions, 'million', 'millions'));
  if (milliers) parts.push(chunkToFr(milliers, 'mille', 'mille'));
  if (reste) parts.push(threeDigitsToFr(reste));

  return parts.filter(Boolean).join(' ');
}

/* ---- Icons (SVG inline) ---- */
function IconEye({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function IconPrinter({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 8V4h10v4" stroke="currentColor" strokeWidth="2" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 14h10v6H7z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export default function FuelRequests() {
  const { token, user } = useAuth();
  const role = user?.role || '';
  const canCreate = role === 'DEMANDEUR';

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    request_type: 'SERVICE',
    request_date: ymdToday(), // Date ticket
    objet: '',
    amount_estimated_ar: '',
    amount_estimated_words: '',
  });

  // Details modal
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsReq, setDetailsReq] = useState(null);

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch('/api/requests/fuel', { token });
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const filtered = useMemo(() => {
    const qq = String(q || '').trim().toLowerCase();
    if (!qq) return requests;

    return requests.filter((r) => {
      const hay = [
        r.request_no,
        r.request_type,
        r.objet,
        r.status,
        r.requester_username,
        r.request_date,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return hay.includes(qq);
    });
  }, [requests, q]);

  function openCreate() {
    setForm({
      request_type: 'SERVICE',
      request_date: ymdToday(),
      objet: '',
      amount_estimated_ar: '',
      amount_estimated_words: '',
    });
    setCreateOpen(true);
  }

  function onChangeAmount(v) {
    const digits = String(v || '').replace(/\D/g, '');
    const n = digits ? Number(digits) : 0;
    const words = digits ? `${numberToFrWords(n)} ariary` : '';
    setForm((f) => ({
      ...f,
      amount_estimated_ar: digits,
      amount_estimated_words: words,
    }));
  }

  async function submitCreate(e) {
    e.preventDefault();
    if (!canCreate || !token || busy) return;

    const amount = Number(form.amount_estimated_ar || 0);
    if (!form.objet.trim()) return alert('Objet requis');
    if (!form.request_date) return alert('Date ticket requise');
    if (!Number.isFinite(amount) || amount <= 0) return alert('Montant invalide');

    setBusy(true);
    try {
      // backend demande end_date >= request_date → on envoie pareil (mais on n’affiche PAS "Période")
      const payload = {
        request_type: form.request_type,
        objet: form.objet.trim(),
        amount_estimated_ar: Math.floor(amount),
        amount_estimated_words: form.amount_estimated_words || `${numberToFrWords(amount)} ariary`,
        request_date: form.request_date,
        end_date: form.request_date,
      };

      await apiFetch('/api/requests/fuel', {
        token,
        method: 'POST',
        body: payload,
      });

      setCreateOpen(false);
      await load();
    } catch (err) {
      alert(err?.message || 'Erreur création');
    } finally {
      setBusy(false);
    }
  }

  async function openDetails(id) {
    if (!token) return;
    try {
      const data = await apiFetch(`/api/requests/fuel/${id}`, { token });
      setDetailsReq(data?.request || null);
      setDetailsOpen(true);
    } catch {
      alert('Impossible de charger les détails');
    }
  }

  function openPrint(id) {
    window.open(`/print/fuel/${id}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="fuelPage">
      <div className="fuelCard">
        <div className="fuelHeaderRow">
          <div>
            <div className="fuelTitle">Demandes de carburant</div>
            <div className="fuelSubTitle">Création + suivi + impression (A5 paysage)</div>
          </div>
        </div>

        {/* ✅ Rechercher ENTRE sous-titre et tableau */}
        <div className="fuelFilters">
          <div className="fuelSearch">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher (N°, objet, type...)"
            />
          </div>

          {canCreate ? (
            <button className="fuelPrimaryBtn" onClick={openCreate} type="button">
              + Nouvelle demande
            </button>
          ) : (
            <span />
          )}
        </div>

        <div className="fuelTableWrap">
          <table className="fuelTable">
            <thead>
              <tr>
                <th>N°</th>
                <th>Date ticket</th>
                <th>Type</th>
                <th>Objet</th>
                <th style={{ textAlign: 'right' }}>Montant (Ar)</th>
                <th>Statut</th>
                <th style={{ width: 110, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="fuelEmpty">Chargement…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="fuelEmpty">Aucune demande</td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="cellStrong">{r.request_no}</td>
                    <td>{fmtDateFr(r.request_date)}</td>
                    <td>{r.request_type}</td>
                    <td className="cellObjet">{r.objet}</td>
                    <td style={{ textAlign: 'right' }} className="cellStrong">{fmtAr(r.amount_estimated_ar)}</td>
                    <td>
                      <span className={`statusPill status-${statusClass(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div className="cellActions">
                        {/* ✅ icône au lieu de "Détails" */}
                        <button
                          className="iconBtn"
                          title="Détails"
                          aria-label="Détails"
                          type="button"
                          onClick={() => openDetails(r.id)}
                        >
                          <IconEye />
                        </button>

                        {/* ✅ icône au lieu de "Imprimer" */}
                        <button
                          className="iconBtn"
                          title="Imprimer"
                          aria-label="Imprimer"
                          type="button"
                          onClick={() => openPrint(r.id)}
                        >
                          <IconPrinter />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ✅ MODAL CREATION (plus de formulaire en permanence) */}
      {createOpen && (
        <Modal title="Nouvelle demande de carburant" onClose={() => setCreateOpen(false)} width={840}>
          <form onSubmit={submitCreate}>
            <div className="fuelCreateGrid">
              <div className="field">
                <label>Date ticket</label>
                <input
                  type="date"
                  value={form.request_date}
                  onChange={(e) => setForm((f) => ({ ...f, request_date: e.target.value }))}
                  data-autofocus="true"
                />
              </div>

              <div className="field">
                <label>Type</label>
                <select
                  value={form.request_type}
                  onChange={(e) => setForm((f) => ({ ...f, request_type: e.target.value }))}
                >
                  <option value="SERVICE">SERVICE</option>
                  <option value="MISSION">MISSION</option>
                </select>
              </div>

              <div className="field">
                <label>Montant prévisionnel (Ar)</label>
                <input
                  value={form.amount_estimated_ar}
                  onChange={(e) => onChangeAmount(e.target.value)}
                  inputMode="numeric"
                  placeholder="ex: 200000"
                />
              </div>

              <div className="field fieldFull">
                <label>Objet</label>
                <input
                  value={form.objet}
                  onChange={(e) => setForm((f) => ({ ...f, objet: e.target.value }))}
                  placeholder="ex: Demande de carburant …"
                />
              </div>

              <div className="field fieldWords">
                <label>Montant (en lettre)</label>
                <input value={form.amount_estimated_words} readOnly placeholder="(auto)" />
              </div>
            </div>

            <div className="fuelActions">
              <button className="fuelPrimaryBtn" type="submit" disabled={busy}>
                {busy ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ✅ MODAL DETAILS : enlever le bouton "Fermer" du bas (il reste Fermer en haut du Modal) */}
      {detailsOpen && detailsReq && (
        <Modal
          title={`Détails — ${detailsReq.request_no}`}
          onClose={() => { setDetailsOpen(false); setDetailsReq(null); }}
          width={860}
        >
          <div className="fuelModalGrid">
            <div>
              <div className="fuelModalLabel">Type</div>
              <div className="fuelModalValue">{detailsReq.request_type}</div>
            </div>

            <div>
              <div className="fuelModalLabel">Date du ticket</div>
              <div className="fuelModalValue">{fmtDateFr(detailsReq.request_date)}</div>
            </div>

            <div className="fuelModalSpan">
              <div className="fuelModalLabel">Objet</div>
              <div className="fuelModalValue">{detailsReq.objet}</div>
            </div>

            <div>
              <div className="fuelModalLabel">Montant (Ar)</div>
              <div className="fuelModalValue">{fmtAr(detailsReq.amount_estimated_ar)}</div>
            </div>

            <div>
              <div className="fuelModalLabel">Montant (en lettre)</div>
              <div className="fuelModalValue">{detailsReq.amount_estimated_words}</div>
            </div>

            <div>
              <div className="fuelModalLabel">Statut</div>
              <div className="fuelModalValue">
                <span className={`statusPill status-${statusClass(detailsReq.status)}`}>
                  {statusLabel(detailsReq.status)}
                </span>
              </div>
            </div>
          </div>

          <div className="fuelModalActions">
            <button className="fuelPrimaryBtn" type="button" onClick={() => openPrint(detailsReq.id)}>
              Imprimer
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
