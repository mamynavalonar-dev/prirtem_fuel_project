import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';
import { apiFetch } from '../utils/api.js';
import Modal from '../components/Modal.jsx';

export default function CalendarView() {
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [viewModal, setViewModal] = useState(null);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    setLoading(true);
    try {
      const data = await apiFetch('/api/requests/car', { token });
      setRequests(data.requests || []);
    } catch (e) {
      console.error('Failed to load requests:', e);
    } finally {
      setLoading(false);
    }
  }

  // Grouper les demandes par date
  const requestsByDate = useMemo(() => {
    const map = {};
    requests.forEach(req => {
      const date = req.proposed_date;
      if (!map[date]) map[date] = [];
      map[date].push(req);
    });
    return map;
  }, [requests]);

  // Générer les jours du mois
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDay = firstDay.getDay(); // 0 = Dimanche
    const daysInMonth = lastDay.getDate();

    const days = [];
    
    // Jours du mois précédent (padding)
    for (let i = 0; i < startDay; i++) {
      days.push({ date: null, isCurrentMonth: false });
    }

    // Jours du mois actuel
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({ date: dateStr, isCurrentMonth: true });
    }

    return days;
  }, [currentMonth]);

  const changeMonth = (offset) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(newDate.getMonth() + offset);
    setCurrentMonth(newDate);
  };

  const openDayModal = (dateStr) => {
    setSelectedDate(dateStr);
  };

  const openViewModal = async (id) => {
    setViewModal({ loading: true, data: null });
    try {
      const d = await apiFetch(`/api/requests/car/${id}`, { token });
      setViewModal({ loading: false, data: d.request });
    } catch (e) {
      alert(e.message);
      setViewModal(null);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'SUBMITTED': return '#f59e0b';
      case 'LOGISTICS_APPROVED': return '#3b82f6';
      case 'RAF_APPROVED': return '#10b981';
      case 'REJECTED': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>📅 Calendrier Demandes Voiture</h1>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-outline" onClick={() => changeMonth(-1)}>← Mois précédent</button>
          <button className="btn btn-outline" onClick={() => setCurrentMonth(new Date())}>Aujourd'hui</button>
          <button className="btn btn-outline" onClick={() => changeMonth(1)}>Mois suivant →</button>
        </div>
      </div>

      {/* En-tête mois/année */}
      <div style={{ textAlign: 'center', marginBottom: 16, fontSize: '20px', fontWeight: '700' }}>
        {currentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement...</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Grille calendrier */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, background: '#e5e7eb' }}>
            {/* En-têtes jours */}
            {['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'].map(day => (
              <div key={day} style={{ background: '#f9fafb', padding: '8px', textAlign: 'center', fontWeight: '700', fontSize: '12px' }}>
                {day}
              </div>
            ))}

            {/* Jours du mois */}
            {calendarDays.map((day, idx) => {
              if (!day.isCurrentMonth) {
                return <div key={idx} style={{ background: '#fafafa', minHeight: 100 }} />;
              }

              const dayRequests = requestsByDate[day.date] || [];
              const dayNumber = parseInt(day.date.split('-')[2]);
              const isToday = day.date === new Date().toISOString().slice(0, 10);

              return (
                <div
                  key={idx}
                  style={{
                    background: 'white',
                    minHeight: 100,
                    padding: '8px',
                    cursor: dayRequests.length > 0 ? 'pointer' : 'default',
                    border: isToday ? '2px solid #3b82f6' : 'none',
                    position: 'relative'
                  }}
                  onClick={() => dayRequests.length > 0 && openDayModal(day.date)}
                >
                  {/* Numéro du jour */}
                  <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: 4, color: isToday ? '#3b82f6' : '#111827' }}>
                    {dayNumber}
                  </div>

                  {/* Demandes */}
                  {dayRequests.slice(0, 3).map(req => (
                    <div
                      key={req.id}
                      style={{
                        background: getStatusColor(req.status),
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        marginBottom: 2,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      title={req.objet}
                    >
                      {req.request_no}
                    </div>
                  ))}

                  {dayRequests.length > 3 && (
                    <div style={{ fontSize: '10px', color: '#6b7280', marginTop: 2 }}>
                      +{dayRequests.length - 3} autre(s)
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Légende */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ fontWeight: '700', marginBottom: 8 }}>Légende</div>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div className="row" style={{ gap: 6 }}>
            <div style={{ width: 16, height: 16, background: '#f59e0b', borderRadius: 4 }} />
            <span style={{ fontSize: 12 }}>Soumis</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <div style={{ width: 16, height: 16, background: '#3b82f6', borderRadius: 4 }} />
            <span style={{ fontSize: 12 }}>Visa Logistique</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <div style={{ width: 16, height: 16, background: '#10b981', borderRadius: 4 }} />
            <span style={{ fontSize: 12 }}>Visa RAF (Approuvé)</span>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <div style={{ width: 16, height: 16, background: '#ef4444', borderRadius: 4 }} />
            <span style={{ fontSize: 12 }}>Rejeté</span>
          </div>
        </div>
      </div>

      {/* Modal jour sélectionné */}
      {selectedDate && (
        <Modal 
          title={`Demandes du ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`}
          onClose={() => setSelectedDate(null)}
          width={700}
        >
          <div>
            {(requestsByDate[selectedDate] || []).map(req => (
              <div
                key={req.id}
                className="card"
                style={{ marginBottom: 12, cursor: 'pointer' }}
                onClick={() => openViewModal(req.id)}
              >
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '700' }}>{req.request_no}</div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{req.objet}</div>
                  </div>
                  <span 
                    className="badge" 
                    style={{ background: getStatusColor(req.status), color: 'white', border: 'none' }}
                  >
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Modal détails demande */}
      {viewModal && (
        <Modal 
          title={viewModal.loading ? 'Chargement...' : `Détails ${viewModal.data?.request_no || ''}`}
          onClose={() => setViewModal(null)}
          width={720}
        >
          {viewModal.loading ? (
            <div className="muted">Chargement...</div>
          ) : viewModal.data ? (
            <div>
              <div className="grid2">
                <div className="card">
                  <div className="muted">Date proposée</div>
                  <div style={{ fontWeight: 800 }}>{String(viewModal.data.proposed_date || '')}</div>
                </div>
                <div className="card">
                  <div className="muted">Statut</div>
                  <div style={{ fontWeight: 800 }}>{String(viewModal.data.status || '')}</div>
                </div>
              </div>
              <div className="card" style={{ marginTop: 10 }}>
                <div className="muted">Objet</div>
                <div style={{ fontWeight: 700 }}>{viewModal.data.objet}</div>
                <hr />
                <div className="muted">Itinéraire</div>
                <div>{viewModal.data.itinerary}</div>
                <hr />
                <div className="muted">Personnes transportées</div>
                <div>{viewModal.data.people}</div>
              </div>
            </div>
          ) : (
            <div className="muted">Impossible de charger ce détail.</div>
          )}
        </Modal>
      )}
    </div>
  );
}