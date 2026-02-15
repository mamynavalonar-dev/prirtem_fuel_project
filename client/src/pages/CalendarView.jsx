import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';
import Modal from '../components/Modal.jsx';

function toYMD(v) {
  if (!v) return '';
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(v);
  if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('fr-CA');
  return s.slice(0, 10);
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function ymdToDate(ymd) {
  const [y, m, d] = String(ymd).split('-').map((x) => Number(x));
  return new Date(y, (m || 1) - 1, d || 1);
}

function clampStr(s, n) {
  const v = String(s || '').trim();
  if (v.length <= n) return v;
  return v.slice(0, n - 1) + '…';
}

function statusMeta(mode, status) {
  // NOTE: on reste volontairement sans couleurs "hardcodées" dans le thème global,
  // mais ici on a besoin d'une légende stable. Tu peux adapter à ton theme.css.
  const CAR = {
    SUBMITTED: { label: 'En attente', bg: 'rgba(255,165,0,.16)', fg: 'var(--text)' },
    LOGISTICS_APPROVED: { label: 'Validée (Log.)', bg: 'rgba(0,200,255,.14)', fg: 'var(--text)' },
    RAF_APPROVED: { label: 'Validée', bg: 'rgba(0,200,120,.16)', fg: 'var(--text)' },
    REJECTED: { label: 'Rejetée', bg: 'rgba(255,0,80,.12)', fg: 'var(--text)' },
    CANCELLED: { label: 'Annulée', bg: 'rgba(255,255,255,.06)', fg: 'var(--text)' }
  };
  const FUEL = {
    DRAFT: { label: 'Brouillon', bg: 'rgba(255,255,255,.06)', fg: 'var(--text)' },
    SUBMITTED: { label: 'En attente', bg: 'rgba(255,165,0,.16)', fg: 'var(--text)' },
    VERIFIED: { label: 'Vérifiée', bg: 'rgba(0,200,255,.14)', fg: 'var(--text)' },
    APPROVED: { label: 'Approuvée', bg: 'rgba(0,200,120,.16)', fg: 'var(--text)' },
    REJECTED: { label: 'Rejetée', bg: 'rgba(255,0,80,.12)', fg: 'var(--text)' },
    CANCELLED: { label: 'Annulée', bg: 'rgba(255,255,255,.06)', fg: 'var(--text)' }
  };

  const ref = mode === 'fuel' ? FUEL : CAR;
  return ref[status] || { label: status || '-', bg: 'rgba(255,255,255,.06)', fg: 'var(--text)' };
}

function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function sameYMD(a, b) {
  return String(a || '') === String(b || '');
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && bStart <= aEnd;
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export default function CalendarView() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const { token, user } = useAuth();

  const mode = sp.get('mode') === 'fuel' ? 'fuel' : 'car';

  const [carRequests, setCarRequests] = useState([]);
  const [fuelRequests, setFuelRequests] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const m = sp.get('m');
    if (m && /^\d{4}-\d{2}$/.test(m)) {
      const [y, mm] = m.split('-').map((x) => Number(x));
      return new Date(y, (mm || 1) - 1, 1);
    }
    return new Date();
  });

  const [selectedDate, setSelectedDate] = useState(null); // YMD
  const [dayModalOpen, setDayModalOpen] = useState(false);

  const [viewModal, setViewModal] = useState(null); // {mode, loading, data}

  // ===== Filters (persisted in URL) =====
  const status = sp.get('status') || 'ALL';
  const vehicle = sp.get('vehicle') || 'ALL';
  const driver = sp.get('driver') || 'ALL';
  const requester = sp.get('requester') || 'ALL';
  const type = sp.get('type') || 'ALL';
  const q = sp.get('q') || '';
  const hideRejected = sp.get('hideRJ') === '1';

  const setParam = useCallback(
    (k, v) => {
      const next = new URLSearchParams(sp);
      if (v === null || v === undefined || v === '' || v === 'ALL') next.delete(k);
      else next.set(k, String(v));
      setSp(next, { replace: true });
    },
    [sp, setSp]
  );

  const setMode = (m) => {
    const next = new URLSearchParams(sp);
    next.set('mode', m);
    // reset some filters that are mode-specific
    if (m === 'fuel') {
      next.delete('vehicle');
      next.delete('driver');
    } else {
      next.delete('type');
    }
    setSp(next, { replace: true });
  };

  // ===== Data loaders =====
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [car, fuel, metaVehicles, metaDrivers] = await Promise.all([
        apiFetch('/api/requests/car', { token }),
        apiFetch('/api/requests/fuel', { token }),
        apiFetch('/api/meta/vehicles', { token }),
        apiFetch('/api/meta/drivers', { token })
      ]);

      setCarRequests(car.requests || []);
      setFuelRequests(fuel.requests || []);
      setVehicles(metaVehicles.vehicles || []);
      setDrivers(metaDrivers.drivers || []);
    } catch (e) {
      console.error('Failed to load calendar data:', e);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Keep month in URL
  useEffect(() => {
    const next = new URLSearchParams(sp);
    const y = currentMonth.getFullYear();
    const m = String(currentMonth.getMonth() + 1).padStart(2, '0');
    next.set('m', `${y}-${m}`);
    setSp(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  // ===== Visible grid dates =====
  const grid = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();

    const monthStart = new Date(y, m, 1);
    const monthEnd = new Date(y, m + 1, 0);

    const gridStart = addDays(monthStart, -monthStart.getDay()); // sunday
    const gridEnd = addDays(monthEnd, 6 - monthEnd.getDay()); // saturday

    const days = [];
    for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) {
      const ymd = toYMD(d);
      days.push({
        date: new Date(d),
        ymd,
        inMonth: d.getMonth() === m,
        isToday: toYMD(new Date()) === ymd,
        isWeekend: isWeekend(d)
      });
    }

    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    return { days, weeks, monthStartYMD: toYMD(monthStart), monthEndYMD: toYMD(monthEnd) };
  }, [currentMonth]);

  // ===== Normalize events =====
  const raw = mode === 'fuel' ? fuelRequests : carRequests;

  const normalized = useMemo(() => {
    return (raw || []).map((r) => {
      const start = mode === 'fuel' ? toYMD(r.request_date) : toYMD(r.proposed_date);
      const end = toYMD(r.end_date || (mode === 'fuel' ? r.request_date : r.proposed_date) || start);
      const s = start && end && end < start ? start : start;
      const e = start && end && end < start ? start : end;

      const statusInfo = statusMeta(mode, r.status);

      const timeInfo =
        mode === 'car' && (r.depart_time_wanted || r.return_time_expected)
          ? `${String(r.depart_time_wanted || '').slice(0, 5)}–${String(r.return_time_expected || '').slice(0, 5)}`
          : '';

      const short =
        mode === 'fuel'
          ? `${r.request_type === 'MISSION' ? 'Mission' : 'Service'} – ${clampStr(r.objet, 20)}`
          : `${timeInfo ? timeInfo + ' · ' : ''}${clampStr(r.objet, 20)}${r.vehicle_plate ? ` – ${r.vehicle_plate}` : ''}`;

      return {
        id: r.id,
        mode,
        raw: r,
        start: s,
        end: e || s,
        status: r.status,
        statusLabel: statusInfo.label,
        chipText: short,
        chipTitle:
          mode === 'fuel'
            ? `${short}\n${start}${end && end !== start ? ` → ${end}` : ''}`
            : `${short}\n${start}${end && end !== start ? ` → ${end}` : ''}${timeInfo ? `\n${timeInfo}` : ''}`,
        bg: statusInfo.bg,
        fg: statusInfo.fg,
        vehicle_id: r.vehicle_id || null,
        driver_id: r.driver_id || null,
        requester: r.requester_username || ''
      };
    });
  }, [raw, mode]);

  // ===== Filtered events =====
  const filtered = useMemo(() => {
    const query = String(q || '').trim().toLowerCase();

    return normalized.filter((ev) => {
      const r = ev.raw;

      // hide rejected/cancelled
      if (hideRejected && ['REJECTED', 'CANCELLED'].includes(String(ev.status || ''))) return false;

      // status
      if (status && status !== 'ALL') {
        // group "APPROVED" for car => LOGISTICS_APPROVED + RAF_APPROVED ; fuel => VERIFIED + APPROVED
        if (status === 'APPROVED') {
          if (mode === 'car' && !['LOGISTICS_APPROVED', 'RAF_APPROVED'].includes(ev.status)) return false;
          if (mode === 'fuel' && !['VERIFIED', 'APPROVED'].includes(ev.status)) return false;
        } else if (ev.status !== status) return false;
      }

      // vehicle/driver filters (car only)
      if (mode === 'car') {
        if (vehicle !== 'ALL') {
          if (String(ev.vehicle_id || '') !== String(vehicle)) return false;
        }
        if (driver !== 'ALL') {
          if (String(ev.driver_id || '') !== String(driver)) return false;
        }
      }

      // requester
      if (requester !== 'ALL') {
        if (String(ev.requester || '') !== String(requester)) return false;
      }

      // type (fuel only)
      if (mode === 'fuel' && type !== 'ALL') {
        if (String(r.request_type || '') !== String(type)) return false;
      }

      // search
      if (query) {
        const hay = [
          r.request_no,
          r.objet,
          r.itinerary,
          r.vehicle_plate,
          r.driver_name,
          r.requester_username,
          r.amount_estimated_words,
          r.request_type
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        if (!hay.includes(query)) return false;
      }

      return true;
    });
  }, [normalized, hideRejected, status, vehicle, driver, requester, type, q, mode]);

  // ===== Events per day (for day modal + "+n") =====
  const eventsByDay = useMemo(() => {
    const map = new Map(); // ymd -> events[]
    for (const d of grid.days) map.set(d.ymd, []);
    for (const ev of filtered) {
      // only map into visible grid (for perf)
      if (!overlaps(ev.start, ev.end, grid.days[0].ymd, grid.days[grid.days.length - 1].ymd)) continue;
      for (const day of grid.days) {
        if (day.ymd >= ev.start && day.ymd <= ev.end) {
          map.get(day.ymd).push(ev);
        }
      }
    }
    // stable sort
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => {
        if (a.start !== b.start) return a.start.localeCompare(b.start);
        if (a.end !== b.end) return b.end.localeCompare(a.end);
        return String(a.raw.request_no || a.id).localeCompare(String(b.raw.request_no || b.id));
      });
      map.set(k, arr);
    }
    return map;
  }, [filtered, grid.days]);

  // ===== Conflict detection ( essentials for vehicle ) =====
  const conflictDays = useMemo(() => {
    if (mode !== 'car') return new Set();
    const set = new Set();

    const approvedStatuses = new Set(['LOGISTICS_APPROVED', 'RAF_APPROVED']);
    const approved = filtered.filter((ev) => approvedStatuses.has(ev.status) && ev.vehicle_id);

    // naive O(n^2) on limited lists - OK for <=500
    for (let i = 0; i < approved.length; i++) {
      for (let j = i + 1; j < approved.length; j++) {
        const a = approved[i];
        const b = approved[j];
        if (String(a.vehicle_id) !== String(b.vehicle_id)) continue;
        if (!overlaps(a.start, a.end, b.start, b.end)) continue;

        // mark overlap days in current visible grid
        const ovStart = a.start > b.start ? a.start : b.start;
        const ovEnd = a.end < b.end ? a.end : b.end;
        for (const day of grid.days) {
          if (day.ymd >= ovStart && day.ymd <= ovEnd) set.add(day.ymd);
        }
      }
    }
    return set;
  }, [filtered, mode, grid.days]);

  // ===== Counts (badges) =====
  const counts = useMemo(() => {
    const inMonth = filtered.filter((ev) => overlaps(ev.start, ev.end, grid.monthStartYMD, grid.monthEndYMD));
    const byStatus = {};
    for (const ev of inMonth) {
      byStatus[ev.status] = (byStatus[ev.status] || 0) + 1;
    }
    return { inMonthCount: inMonth.length, byStatus };
  }, [filtered, grid.monthStartYMD, grid.monthEndYMD]);

  // ===== Lanes per week (multi-day bars) =====
  const maxLanes = 3;

  const weekLayout = useMemo(() => {
    const layouts = []; // per week: { lanes: [ {ev, start, end}... ], laneOf: Map(id->lane) }

    for (const week of grid.weeks) {
      const wStart = week[0].ymd;
      const wEnd = week[6].ymd;

      const weekEvents = filtered
        .filter((ev) => overlaps(ev.start, ev.end, wStart, wEnd))
        .sort((a, b) => {
          if (a.start !== b.start) return a.start.localeCompare(b.start);
          // longer first (helps packing)
          if (a.end !== b.end) return b.end.localeCompare(a.end);
          return String(a.raw.request_no || a.id).localeCompare(String(b.raw.request_no || b.id));
        });

      const laneEnds = []; // per lane: last end YMD of last event in that lane (within this week ordering)
      const laneItems = []; // per lane: events

      const laneOf = new Map();

      for (const ev of weekEvents) {
        let placed = false;
        for (let li = 0; li < laneEnds.length; li++) {
          // no overlap if ev.start > laneEnd
          if (ev.start > laneEnds[li]) {
            laneEnds[li] = ev.end;
            laneItems[li].push(ev);
            laneOf.set(ev.id, li);
            placed = true;
            break;
          }
        }
        if (!placed) {
          laneEnds.push(ev.end);
          laneItems.push([ev]);
          laneOf.set(ev.id, laneItems.length - 1);
        }
      }

      layouts.push({ laneItems, laneOf, wStart, wEnd });
    }

    return layouts;
  }, [filtered, grid.weeks]);

  // ===== UI helpers =====
  const monthLabel = useMemo(() => {
    return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(currentMonth);
  }, [currentMonth]);

  const openDay = (ymd) => {
    setSelectedDate(ymd);
    setDayModalOpen(true);
  };

  const openDetails = async (ev) => {
    setViewModal({ mode: ev.mode, loading: true, data: null });
    try {
      if (ev.mode === 'fuel') {
        const data = await apiFetch(`/api/requests/fuel/${ev.id}`, { token });
        setViewModal({ mode: 'fuel', loading: false, data: data.request || null });
      } else {
        const data = await apiFetch(`/api/requests/car/${ev.id}`, { token });
        setViewModal({ mode: 'car', loading: false, data: data.request || null });
      }
    } catch (e) {
      setViewModal({ mode: ev.mode, loading: false, data: null, error: String(e.message || e) });
    }
  };

  const closeDetails = () => setViewModal(null);

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  const goToday = () => setCurrentMonth(new Date());

  const exportCsv = () => {
    // export month only, based on filters
    const inMonth = filtered.filter((ev) => overlaps(ev.start, ev.end, grid.monthStartYMD, grid.monthEndYMD));

    const header =
      mode === 'fuel'
        ? ['Type', 'N°', 'Objet', 'Période', 'Statut', 'Demandeur', 'Montant (Ar)']
        : ['N°', 'Objet', 'Itinéraire', 'Période', 'Heures', 'Véhicule', 'Chauffeur', 'Statut', 'Demandeur'];

    const lines = [header.map(csvEscape).join(',')];

    for (const ev of inMonth) {
      const r = ev.raw;

      if (mode === 'fuel') {
        lines.push(
          [
            r.request_type || '',
            r.request_no || '',
            r.objet || '',
            ev.start + (ev.end && ev.end !== ev.start ? ` → ${ev.end}` : ''),
            ev.statusLabel,
            r.requester_username || '',
            r.amount_estimated_ar ?? ''
          ]
            .map(csvEscape)
            .join(',')
        );
      } else {
        lines.push(
          [
            r.request_no || '',
            r.objet || '',
            r.itinerary || '',
            ev.start + (ev.end && ev.end !== ev.start ? ` → ${ev.end}` : ''),
            r.depart_time_wanted || r.return_time_expected ? `${String(r.depart_time_wanted || '').slice(0, 5)}–${String(r.return_time_expected || '').slice(0, 5)}` : '',
            r.vehicle_plate || '',
            r.driver_name || '',
            ev.statusLabel,
            r.requester_username || ''
          ]
            .map(csvEscape)
            .join(',')
        );
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${mode === 'fuel' ? 'carburant' : 'voiture'}_${grid.monthStartYMD.slice(0, 7)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  };

  // ===== Availability (car only) =====
  const freeVehicles = useMemo(() => {
    if (mode !== 'car' || !selectedDate) return [];

    const approvedStatuses = new Set(['LOGISTICS_APPROVED', 'RAF_APPROVED']);
    const usedVehicleIds = new Set();

    for (const ev of filtered) {
      if (!ev.vehicle_id) continue;
      if (!approvedStatuses.has(ev.status)) continue;
      if (selectedDate >= ev.start && selectedDate <= ev.end) usedVehicleIds.add(String(ev.vehicle_id));
    }

    return (vehicles || []).filter((v) => !usedVehicleIds.has(String(v.id)));
  }, [mode, selectedDate, filtered, vehicles]);

  // ===== Actions (details modal) =====
  const doCarLogisticsApprove = async (id, vehicle_id, driver_id) => {
    await apiFetch(`/api/requests/car/${id}/logistics-approve`, { method: 'POST', token, body: { vehicle_id, driver_id } });
    await loadAll();
  };
  const doCarRafApprove = async (id) => {
    await apiFetch(`/api/requests/car/${id}/raf-approve`, { method: 'POST', token });
    await loadAll();
  };
  const doCarReject = async (id) => {
    const reason = prompt('Motif de rejet (optionnel) :') || '';
    await apiFetch(`/api/requests/car/${id}/reject`, { method: 'POST', token, body: { reason } });
    await loadAll();
  };
  const doCarCancel = async (id) => {
    const reason = prompt("Motif d'annulation (optionnel) :") || '';
    await apiFetch(`/api/requests/car/${id}/cancel`, { method: 'POST', token, body: { reason } });
    await loadAll();
  };

  const doFuelSubmit = async (id) => {
    await apiFetch(`/api/requests/fuel/${id}/submit`, { method: 'PATCH', token });
    await loadAll();
  };
  const doFuelVerify = async (id) => {
    await apiFetch(`/api/requests/fuel/${id}/verify`, { method: 'PATCH', token });
    await loadAll();
  };
  const doFuelApprove = async (id) => {
    await apiFetch(`/api/requests/fuel/${id}/approve`, { method: 'PATCH', token });
    await loadAll();
  };
  const doFuelReject = async (id) => {
    const reason = prompt('Motif de rejet (optionnel) :') || '';
    await apiFetch(`/api/requests/fuel/${id}/reject`, { method: 'PATCH', token, body: { reason } });
    await loadAll();
  };
  const doFuelCancel = async (id) => {
    const reason = prompt("Motif d'annulation (optionnel) :") || '';
    await apiFetch(`/api/requests/fuel/${id}/cancel`, { method: 'POST', token, body: { reason } });
    await loadAll();
  };

  // ===== Options for filters =====
  const requesterOptions = useMemo(() => {
    const set = new Set();
    for (const ev of normalized) {
      if (ev.requester) set.add(ev.requester);
    }
    return ['ALL', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [normalized]);

  const STATUS_OPTIONS = useMemo(() => {
    if (mode === 'fuel') {
      return [
        { value: 'ALL', label: 'Tous' },
        { value: 'SUBMITTED', label: 'En attente' },
        { value: 'VERIFIED', label: 'Vérifiées' },
        { value: 'APPROVED', label: 'Approuvées' },
        { value: 'REJECTED', label: 'Rejetées' },
        { value: 'CANCELLED', label: 'Annulées' }
      ];
    }
    return [
      { value: 'ALL', label: 'Tous' },
      { value: 'SUBMITTED', label: 'En attente' },
      { value: 'LOGISTICS_APPROVED', label: 'Validées (Log.)' },
      { value: 'RAF_APPROVED', label: 'Validées (RAF)' },
      { value: 'REJECTED', label: 'Rejetées' },
      { value: 'CANCELLED', label: 'Annulées' },
      { value: 'APPROVED', label: 'Approuvées (toutes)' }
    ];
  }, [mode]);

  const typeOptions = useMemo(() => ['ALL', 'SERVICE', 'MISSION'], []);

  // ===== Day modal content =====
  const dayEvents = useMemo(() => {
    if (!selectedDate) return [];
    return eventsByDay.get(selectedDate) || [];
  }, [selectedDate, eventsByDay]);

  const emptyMonth = !loading && counts.inMonthCount === 0;

  return (
    <div>
      <div className="rowBetween" style={{ gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div className="chipGroup" style={{ display: 'flex', gap: 8 }}>
            <button
              className={`btn btn-sm ${mode === 'car' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setMode('car')}
              type="button"
            >
              Calendrier voiture
            </button>
            <button
              className={`btn btn-sm ${mode === 'fuel' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setMode('fuel')}
              type="button"
            >
              Calendrier carburant
            </button>
          </div>

          <div className="badge" style={{ padding: '6px 10px' }}>
            <b>{counts.inMonthCount}</b> demandes (mois)
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge" style={{ padding: '6px 10px' }}>
              En attente: <b>{counts.byStatus.SUBMITTED || 0}</b>
            </span>
            <span className="badge" style={{ padding: '6px 10px' }}>
              Validées: <b>{(counts.byStatus.LOGISTICS_APPROVED || 0) + (counts.byStatus.RAF_APPROVED || 0) + (counts.byStatus.VERIFIED || 0) + (counts.byStatus.APPROVED || 0)}</b>
            </span>
            <span className="badge" style={{ padding: '6px 10px' }}>
              Rejetées: <b>{counts.byStatus.REJECTED || 0}</b>
            </span>
            <span className="badge" style={{ padding: '6px 10px' }}>
              Annulées: <b>{counts.byStatus.CANCELLED || 0}</b>
            </span>
          </div>

          <button className="btn btn-sm btn-outline" onClick={exportCsv} type="button">
            Export CSV
          </button>

          <button className="btn btn-sm btn-outline" onClick={() => window.print()} type="button">
            Imprimer
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-sm btn-outline" onClick={prevMonth} type="button">
            ◀
          </button>
          <div style={{ fontWeight: 800, textTransform: 'capitalize' }}>{monthLabel}</div>
          <button className="btn btn-sm btn-outline" onClick={nextMonth} type="button">
            ▶
          </button>
          <button className="btn btn-sm btn-outline" onClick={goToday} type="button">
            Aujourd’hui
          </button>
        </div>
      </div>

      <div className="rowBetween" style={{ marginTop: 12, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ minWidth: 190 }}>
            <div className="label">Statut</div>
            <select className="input" value={status} onChange={(e) => setParam('status', e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {mode === 'car' && (
            <>
              <div className="field" style={{ minWidth: 220 }}>
                <div className="label">Véhicule</div>
                <select className="input" value={vehicle} onChange={(e) => setParam('vehicle', e.target.value)}>
                  <option value="ALL">Tous</option>
                  {(vehicles || []).map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ minWidth: 220 }}>
                <div className="label">Chauffeur</div>
                <select className="input" value={driver} onChange={(e) => setParam('driver', e.target.value)}>
                  <option value="ALL">Tous</option>
                  {(drivers || []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {mode === 'fuel' && (
            <div className="field" style={{ minWidth: 200 }}>
              <div className="label">Type</div>
              <select className="input" value={type} onChange={(e) => setParam('type', e.target.value)}>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t === 'ALL' ? 'Tous' : t}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="field" style={{ minWidth: 220 }}>
            <div className="label">Demandeur</div>
            <select className="input" value={requester} onChange={(e) => setParam('requester', e.target.value)}>
              {requesterOptions.map((u) => (
                <option key={u} value={u}>
                  {u === 'ALL' ? 'Tous' : u}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ minWidth: 240 }}>
            <div className="label">Recherche</div>
            <input className="input" value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="destination, objet, demandeur…" />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
            <input type="checkbox" checked={hideRejected} onChange={(e) => setParam('hideRJ', e.target.checked ? '1' : '')} />
            <span className="muted">Masquer rejetées/annulées</span>
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Légende */}
          {Object.entries((mode === 'fuel'
            ? { SUBMITTED: 'En attente', VERIFIED: 'Vérifiée', APPROVED: 'Approuvée', REJECTED: 'Rejetée', CANCELLED: 'Annulée' }
            : { SUBMITTED: 'En attente', LOGISTICS_APPROVED: 'Validée (Log.)', RAF_APPROVED: 'Validée', REJECTED: 'Rejetée', CANCELLED: 'Annulée' }
          )).map(([k, label]) => {
            const m = statusMeta(mode, k);
            return (
              <span key={k} className="badge" style={{ padding: '6px 10px', background: m.bg, border: '1px solid rgba(255,255,255,.08)' }}>
                {label}
              </span>
            );
          })}

          {mode === 'car' && (
            <span className="badge" style={{ padding: '6px 10px', border: '1px solid rgba(255,0,80,.25)' }}>
              ⚠ conflits: <b>{Array.from(conflictDays).filter((d) => d >= grid.monthStartYMD && d <= grid.monthEndYMD).length}</b>
            </span>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <div className="muted">Chargement…</div>
        ) : emptyMonth ? (
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Aucune demande pour ce mois</div>
            <div className="muted" style={{ marginTop: 6 }}>
              Essaie de changer les filtres ou de créer une demande.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={() => navigate(mode === 'fuel' ? '/app/requests/fuel' : '/app/requests/car')}>
                Créer une demande
              </button>
              <button
                className="btn btn-outline"
                onClick={() => {
                  setParam('status', 'ALL');
                  setParam('q', '');
                  setParam('hideRJ', '');
                  setParam('requester', 'ALL');
                  setParam('vehicle', 'ALL');
                  setParam('driver', 'ALL');
                  setParam('type', 'ALL');
                }}
              >
                Réinitialiser filtres
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ padding: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gap: 10
              }}
            >
              {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map((d) => (
                <div key={d} className="muted" style={{ fontWeight: 800, padding: '0 6px' }}>
                  {d}
                </div>
              ))}
            </div>

            <div style={{ height: 10 }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 }}>
              {grid.weeks.map((week, wi) => {
                const layout = weekLayout[wi];

                return week.map((day) => {
                  const dayEvents = eventsByDay.get(day.ymd) || [];
                  const laneCount = layout?.laneItems?.length || 0;

                  // build visible lanes
                  const lanes = [];
                  for (let li = 0; li < Math.min(maxLanes, laneCount); li++) {
                    // find event in this lane that covers this day (if any)
                    const laneEvents = layout.laneItems[li] || [];
                    const ev = laneEvents.find((x) => day.ymd >= x.start && day.ymd <= x.end);
                    lanes.push(ev || null);
                  }

                  const hiddenCount = Math.max(0, dayEvents.length - lanes.filter(Boolean).length);

                  return (
                    <div
                      key={day.ymd}
                      onClick={() => openDay(day.ymd)}
                      style={{
                        cursor: 'pointer',
                        padding: 10,
                        borderRadius: 12,
                        minHeight: 120,
                        background: day.inMonth
                          ? day.isToday
                            ? 'rgba(0,200,255,.10)'
                            : day.isWeekend
                              ? 'rgba(255,255,255,.04)'
                              : 'rgba(255,255,255,.02)'
                          : 'rgba(255,255,255,.01)',
                        border: day.isToday ? '1px solid rgba(0,200,255,.25)' : '1px solid rgba(255,255,255,.06)',
                        opacity: day.inMonth ? 1 : 0.55,
                        position: 'relative'
                      }}
                      title="Clique pour voir les détails du jour"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>{day.date.getDate()}</div>

                        {mode === 'car' && conflictDays.has(day.ymd) && (
                          <span className="badge" style={{ padding: '4px 8px', border: '1px solid rgba(255,0,80,.25)' }}>
                            Conflit
                          </span>
                        )}
                      </div>

                      <div style={{ height: 8 }} />

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {lanes.map((ev, idx) => {
                          const height = 26;

                          if (!ev) {
                            return <div key={idx} style={{ height }} />;
                          }

                          const continuesLeft = day.ymd > ev.start;
                          const continuesRight = day.ymd < ev.end;

                          return (
                            <div
                              key={ev.id + '_' + idx}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetails(ev);
                              }}
                              title={ev.chipTitle}
                              style={{
                                height,
                                display: 'flex',
                                alignItems: 'center',
                                padding: '0 10px',
                                fontSize: 12,
                                fontWeight: 800,
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                textOverflow: 'ellipsis',
                                background: ev.bg,
                                color: ev.fg,
                                border: '1px solid rgba(255,255,255,.08)',
                                borderRadius: 12,
                                borderTopLeftRadius: continuesLeft ? 6 : 12,
                                borderBottomLeftRadius: continuesLeft ? 6 : 12,
                                borderTopRightRadius: continuesRight ? 6 : 12,
                                borderBottomRightRadius: continuesRight ? 6 : 12
                              }}
                            >
                              {ev.chipText}
                            </div>
                          );
                        })}

                        {hiddenCount > 0 && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                            +{hiddenCount} autre{hiddenCount > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })}
            </div>
          </div>
        )}
      </div>

      {/* ===== Day modal (your idea) ===== */}
      {dayModalOpen && (
        <Modal title={`Détails du ${selectedDate}`} onClose={() => setDayModalOpen(false)}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 520px', minWidth: 320 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Demandes du jour</div>

              {dayEvents.length === 0 ? (
                <div className="muted">Aucune demande ce jour (avec les filtres actuels).</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dayEvents.map((ev) => {
                    const r = ev.raw;
                    return (
                      <div key={ev.id} className="card" style={{ padding: 12 }}>
                        <div className="rowBetween" style={{ gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ minWidth: 240 }}>
                            <div style={{ fontWeight: 900 }}>{r.request_no || '—'}</div>
                            <div className="muted" style={{ marginTop: 2 }}>
                              {ev.chipText}
                            </div>
                          </div>

                          <span className="badge" style={{ background: ev.bg, border: '1px solid rgba(255,255,255,.08)' }}>
                            {ev.statusLabel}
                          </span>
                        </div>

                        <div style={{ marginTop: 10 }} className="muted">
                          Période: <b>{ev.start}{ev.end && ev.end !== ev.start ? ` → ${ev.end}` : ''}</b>
                          {mode === 'car' && (r.depart_time_wanted || r.return_time_expected) ? (
                            <>
                              {' '}| Heures: <b>{String(r.depart_time_wanted || '').slice(0, 5)}–{String(r.return_time_expected || '').slice(0, 5)}</b>
                            </>
                          ) : null}
                        </div>

                        {mode === 'car' && (
                          <div className="muted" style={{ marginTop: 6 }}>
                            Véhicule: <b>{r.vehicle_plate || '—'}</b> | Chauffeur: <b>{r.driver_name || '—'}</b>
                          </div>
                        )}

                        <div className="muted" style={{ marginTop: 6 }}>
                          Demandeur: <b>{r.requester_username || '—'}</b>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => openDetails(ev)} type="button">
                            Voir détail
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => navigate(mode === 'fuel' ? '/app/requests/fuel' : '/app/requests/car')}
                            type="button"
                          >
                            Ouvrir module
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {mode === 'car' && (
              <div style={{ flex: '1 1 340px', minWidth: 280 }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Véhicules libres ce jour</div>
                {freeVehicles.length === 0 ? (
                  <div className="muted">Aucun véhicule libre (ou flotte vide).</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {freeVehicles.map((v) => (
                      <div key={v.id} className="card" style={{ padding: 10 }}>
                        <b>{v.plate}</b>
                        <div className="muted" style={{ marginTop: 2 }}>
                          {v.name || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => setDayModalOpen(false)} type="button">
              Fermer
            </button>
            <button
              className="btn btn-primary"
              onClick={() => navigate(mode === 'fuel' ? '/app/requests/fuel' : '/app/requests/car')}
              type="button"
            >
              Créer une demande
            </button>
          </div>
        </Modal>
      )}

      {/* ===== Details modal (drawer-like) ===== */}
      {viewModal && (
        <Modal title={mode === 'fuel' ? 'Détails demande carburant' : 'Détails demande voiture'} onClose={closeDetails}>
          {viewModal.loading ? (
            <div className="muted">Chargement…</div>
          ) : viewModal.error ? (
            <div className="muted">Erreur: {viewModal.error}</div>
          ) : !viewModal.data ? (
            <div className="muted">Aucune donnée.</div>
          ) : (
            <Details
              data={viewModal.data}
              mode={viewModal.mode}
              userRole={user?.role}
              vehicles={vehicles}
              drivers={drivers}
              onCarLogisticsApprove={doCarLogisticsApprove}
              onCarRafApprove={doCarRafApprove}
              onCarReject={doCarReject}
              onCarCancel={doCarCancel}
              onFuelSubmit={doFuelSubmit}
              onFuelVerify={doFuelVerify}
              onFuelApprove={doFuelApprove}
              onFuelReject={doFuelReject}
              onFuelCancel={doFuelCancel}
              onClose={closeDetails}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function Details({
  data,
  mode,
  userRole,
  vehicles,
  drivers,
  onCarLogisticsApprove,
  onCarRafApprove,
  onCarReject,
  onCarCancel,
  onFuelSubmit,
  onFuelVerify,
  onFuelApprove,
  onFuelReject,
  onFuelCancel,
  onClose
}) {
  const [vehicleId, setVehicleId] = useState(data.vehicle_id || '');
  const [driverId, setDriverId] = useState(data.driver_id || '');

  useEffect(() => {
    setVehicleId(data.vehicle_id || '');
    setDriverId(data.driver_id || '');
  }, [data.vehicle_id, data.driver_id]);

  const period =
    mode === 'fuel'
      ? `${toYMD(data.request_date)}${toYMD(data.end_date) && toYMD(data.end_date) !== toYMD(data.request_date) ? ` → ${toYMD(data.end_date)}` : ''}`
      : `${toYMD(data.proposed_date)}${toYMD(data.end_date) && toYMD(data.end_date) !== toYMD(data.proposed_date) ? ` → ${toYMD(data.end_date)}` : ''}`;

  const meta = statusMeta(mode, data.status);

  const can = {
    carLogistics: ['LOGISTIQUE', 'ADMIN'].includes(userRole) && data.status === 'SUBMITTED',
    carRaf: ['RAF', 'ADMIN'].includes(userRole) && data.status === 'LOGISTICS_APPROVED',
    carReject: ['LOGISTIQUE', 'RAF', 'ADMIN'].includes(userRole) && ['SUBMITTED', 'LOGISTICS_APPROVED'].includes(data.status),
    carCancel:
      ['DEMANDEUR'].includes(userRole) && ['SUBMITTED', 'LOGISTICS_APPROVED'].includes(data.status)
        ? true
        : ['ADMIN', 'LOGISTIQUE', 'RAF'].includes(userRole) && ['SUBMITTED', 'LOGISTICS_APPROVED'].includes(data.status),

    fuelSubmit: userRole === 'DEMANDEUR' && ['DRAFT', 'REJECTED'].includes(data.status),
    fuelVerify: ['LOGISTIQUE', 'ADMIN'].includes(userRole) && data.status === 'SUBMITTED',
    fuelApprove: ['RAF', 'ADMIN'].includes(userRole) && data.status === 'VERIFIED',
    fuelReject: ['LOGISTIQUE', 'RAF', 'ADMIN'].includes(userRole) && ['SUBMITTED', 'VERIFIED'].includes(data.status),
    fuelCancel:
      ['DEMANDEUR'].includes(userRole) && ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED'].includes(data.status)
        ? true
        : ['ADMIN', 'LOGISTIQUE', 'RAF'].includes(userRole) && ['DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED'].includes(data.status)
  };

  return (
    <div>
      <div className="rowBetween" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>{data.request_no || '—'}</div>
          <div className="muted" style={{ marginTop: 2 }}>
            {mode === 'fuel' ? data.objet : data.objet}
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Période: <b>{period}</b>
            {mode === 'car' && (data.depart_time_wanted || data.return_time_expected) ? (
              <>
                {' '}| Heures: <b>{String(data.depart_time_wanted || '').slice(0, 5)}–{String(data.return_time_expected || '').slice(0, 5)}</b>
              </>
            ) : null}
          </div>
        </div>

        <span className="badge" style={{ background: meta.bg, border: '1px solid rgba(255,255,255,.08)' }}>
          {meta.label}
        </span>
      </div>

      <div style={{ height: 12 }} />

      {mode === 'car' ? (
        <>
          <div className="grid2" style={{ gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted">Itinéraire</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{data.itinerary || '—'}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted">Personnes</div>
              <div style={{ fontWeight: 800, marginTop: 4 }}>{data.people || '—'}</div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className="grid2" style={{ gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted">Véhicule</div>
              <div style={{ fontWeight: 900, marginTop: 4 }}>{data.vehicle_plate || '—'}</div>
              {can.carLogistics && (
                <div style={{ marginTop: 10 }}>
                  <select className="input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    <option value="">(Non défini)</option>
                    {(vehicles || []).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plate}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="card" style={{ padding: 12 }}>
              <div className="muted">Chauffeur</div>
              <div style={{ fontWeight: 900, marginTop: 4 }}>{data.driver_name || '—'}</div>
              {can.carLogistics && (
                <div style={{ marginTop: 10 }}>
                  <select className="input" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                    <option value="">(Non défini)</option>
                    {(drivers || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className="card" style={{ padding: 12 }}>
            <div className="muted">Demandeur</div>
            <div style={{ fontWeight: 900, marginTop: 4 }}>{data.requester_username || '—'}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {can.carLogistics && (
              <button
                className="btn btn-primary"
                onClick={() => onCarLogisticsApprove(data.id, vehicleId || null, driverId || null)}
                type="button"
              >
                Valider (Logistique)
              </button>
            )}
            {can.carRaf && (
              <button className="btn btn-primary" onClick={() => onCarRafApprove(data.id)} type="button">
                Valider (RAF)
              </button>
            )}
            {can.carReject && (
              <button className="btn btn-danger" onClick={() => onCarReject(data.id)} type="button">
                Rejeter
              </button>
            )}
            {can.carCancel && (
              <button className="btn btn-outline" onClick={() => onCarCancel(data.id)} type="button">
                Annuler
              </button>
            )}
            <button className="btn btn-outline" onClick={onClose} type="button">
              Fermer
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="grid2" style={{ gap: 12 }}>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted">Type</div>
              <div style={{ fontWeight: 900, marginTop: 4 }}>{data.request_type || '—'}</div>
            </div>
            <div className="card" style={{ padding: 12 }}>
              <div className="muted">Montant estimé</div>
              <div style={{ fontWeight: 900, marginTop: 4 }}>{Number(data.amount_estimated_ar || 0).toLocaleString('fr-FR')} Ar</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {data.amount_estimated_words || '—'}
              </div>
            </div>
          </div>

          <div style={{ height: 12 }} />

          <div className="card" style={{ padding: 12 }}>
            <div className="muted">Demandeur</div>
            <div style={{ fontWeight: 900, marginTop: 4 }}>{data.requester_username || '—'}</div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            {can.fuelSubmit && (
              <button className="btn btn-primary" onClick={() => onFuelSubmit(data.id)} type="button">
                Soumettre
              </button>
            )}
            {can.fuelVerify && (
              <button className="btn btn-primary" onClick={() => onFuelVerify(data.id)} type="button">
                Vérifier (Logistique)
              </button>
            )}
            {can.fuelApprove && (
              <button className="btn btn-primary" onClick={() => onFuelApprove(data.id)} type="button">
                Approuver (RAF)
              </button>
            )}
            {can.fuelReject && (
              <button className="btn btn-danger" onClick={() => onFuelReject(data.id)} type="button">
                Rejeter
              </button>
            )}
            {can.fuelCancel && (
              <button className="btn btn-outline" onClick={() => onFuelCancel(data.id)} type="button">
                Annuler
              </button>
            )}
            <button className="btn btn-outline" onClick={onClose} type="button">
              Fermer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
