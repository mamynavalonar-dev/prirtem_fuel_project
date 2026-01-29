const { pool } = require('../db');

/**
 * Récupère les notifications pour l'utilisateur connecté
 * Basé sur son rôle et les événements récents
 */
async function getNotifications(req, res) {
  const userId = req.user.id;
  const role = req.user.role;
  
  const notifications = [];
  const now = new Date();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);

  try {
    // ========== NOTIFICATIONS DEMANDEUR ==========
    if (role === 'DEMANDEUR') {
      // Demandes carburant rejetées/approuvées
      const fuelRes = await pool.query(
        `SELECT id, request_no, status, rejected_at, approved_at, reject_reason
         FROM fuel_requests
         WHERE requester_id=$1 
           AND status IN ('REJECTED', 'APPROVED')
           AND (rejected_at > $2 OR approved_at > $2)
         ORDER BY updated_at DESC
         LIMIT 10`,
        [userId, last24h]
      );

      for (const r of fuelRes.rows) {
        if (r.status === 'REJECTED') {
          notifications.push({
            id: `fuel-rejected-${r.id}`,
            type: 'fuel_request_rejected',
            title: `Demande carburant ${r.request_no} rejetée`,
            message: r.reject_reason || 'Aucun motif fourni',
            link: `/app/requests/fuel`,
            timestamp: r.rejected_at,
            severity: 'error'
          });
        } else if (r.status === 'APPROVED') {
          notifications.push({
            id: `fuel-approved-${r.id}`,
            type: 'fuel_request_approved',
            title: `Demande carburant ${r.request_no} approuvée ✅`,
            message: 'Votre demande a été validée par le RAF',
            link: `/app/requests/fuel`,
            timestamp: r.approved_at,
            severity: 'success'
          });
        }
      }

      // Demandes voiture rejetées/approuvées
      const carRes = await pool.query(
        `SELECT id, request_no, status, rejected_at, raf_at, reject_reason
         FROM car_requests
         WHERE requester_id=$1 
           AND status IN ('REJECTED', 'RAF_APPROVED')
           AND (rejected_at > $2 OR raf_at > $2)
         ORDER BY updated_at DESC
         LIMIT 10`,
        [userId, last24h]
      );

      for (const r of carRes.rows) {
        if (r.status === 'REJECTED') {
          notifications.push({
            id: `car-rejected-${r.id}`,
            type: 'car_request_rejected',
            title: `Demande voiture ${r.request_no} rejetée`,
            message: r.reject_reason || 'Aucun motif fourni',
            link: `/app/requests/car`,
            timestamp: r.rejected_at,
            severity: 'error'
          });
        } else if (r.status === 'RAF_APPROVED') {
          notifications.push({
            id: `car-approved-${r.id}`,
            type: 'car_request_approved',
            title: `Demande voiture ${r.request_no} approuvée ✅`,
            message: 'Votre demande a reçu le visa RAF',
            link: `/app/requests/car`,
            timestamp: r.raf_at,
            severity: 'success'
          });
        }
      }
    }

    // ========== NOTIFICATIONS LOGISTIQUE ==========
    if (['LOGISTIQUE', 'ADMIN'].includes(role)) {
      // Nouvelles demandes carburant à valider
      const newFuel = await pool.query(
        `SELECT id, request_no, submitted_at
         FROM fuel_requests
         WHERE status='SUBMITTED' AND submitted_at > $1
         ORDER BY submitted_at DESC
         LIMIT 5`,
        [last24h]
      );

      for (const r of newFuel.rows) {
        notifications.push({
          id: `fuel-new-${r.id}`,
          type: 'fuel_request_new',
          title: `Nouvelle demande carburant ${r.request_no}`,
          message: 'En attente de validation logistique',
          link: `/app/requests/fuel/manage`,
          timestamp: r.submitted_at,
          severity: 'info'
        });
      }

      // Nouvelles demandes voiture
      const newCar = await pool.query(
        `SELECT id, request_no, created_at
         FROM car_requests
         WHERE status='SUBMITTED' AND created_at > $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [last24h]
      );

      for (const r of newCar.rows) {
        notifications.push({
          id: `car-new-${r.id}`,
          type: 'car_request_new',
          title: `Nouvelle demande voiture ${r.request_no}`,
          message: 'En attente de visa logistique',
          link: `/app/requests/car/manage`,
          timestamp: r.created_at,
          severity: 'info'
        });
      }
    }

    // ========== NOTIFICATIONS RAF ==========
    if (['RAF', 'ADMIN'].includes(role)) {
      // Demandes carburant vérifiées (à approuver)
      const verifiedFuel = await pool.query(
        `SELECT id, request_no, verified_at
         FROM fuel_requests
         WHERE status='VERIFIED' AND verified_at > $1
         ORDER BY verified_at DESC
         LIMIT 5`,
        [last24h]
      );

      for (const r of verifiedFuel.rows) {
        notifications.push({
          id: `fuel-verified-${r.id}`,
          type: 'fuel_request_verified',
          title: `Demande carburant ${r.request_no} à viser`,
          message: 'Validée par logistique, en attente de visa RAF',
          link: `/app/requests/fuel/raf`,
          timestamp: r.verified_at,
          severity: 'warning'
        });
      }

      // Demandes voiture approuvées par logistique
      const logisticsCar = await pool.query(
        `SELECT id, request_no, logistics_at
         FROM car_requests
         WHERE status='LOGISTICS_APPROVED' AND logistics_at > $1
         ORDER BY logistics_at DESC
         LIMIT 5`,
        [last24h]
      );

      for (const r of logisticsCar.rows) {
        notifications.push({
          id: `car-logistics-${r.id}`,
          type: 'car_request_logistics',
          title: `Demande voiture ${r.request_no} à viser`,
          message: 'Validée par logistique, en attente de visa RAF',
          link: `/app/requests/car/raf`,
          timestamp: r.logistics_at,
          severity: 'warning'
        });
      }
    }

    // Trier par timestamp décroissant
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({ 
      notifications,
      count: notifications.length,
      unread: notifications.length // Simple: tout est "non lu" pour cette version
    });

  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
}

/**
 * Marquer une notification comme lue (stub pour future implémentation)
 */
async function markAsRead(req, res) {
  // Pour l'instant, on retourne juste OK
  // Future: table notifications avec user_id + read_at
  res.json({ ok: true });
}

module.exports = {
  getNotifications,
  markAsRead
};