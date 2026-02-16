const { pool } = require('../db');

/**
 * Helpers
 */
function clampInt(v, min, max, def) {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function asISO(d) {
  try { return new Date(d).toISOString(); } catch { return null; }
}

/**
 * Construit la liste des notifications "virtuelles" selon user/role.
 * On reste volontairement sur ce modèle (pas de table notifications),
 * et on persiste uniquement le statut lu/non-lu dans notification_reads.
 */
async function buildNotifications({ userId, role, since, fetchN }) {
  const notifications = [];

  // ========== NOTIFICATIONS DEMANDEUR ==========
  if (role === 'DEMANDEUR') {
    // Demandes carburant rejetées/approuvées
    const fuelRes = await pool.query(
      `SELECT id, request_no, status, rejected_at, approved_at, reject_reason, updated_at
       FROM fuel_requests
       WHERE requester_id=$1
         AND status IN ('REJECTED', 'APPROVED')
         AND (rejected_at > $2 OR approved_at > $2)
       ORDER BY updated_at DESC
       LIMIT $3`,
      [userId, since, fetchN]
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
          severity: 'error',
        });
      } else if (r.status === 'APPROVED') {
        notifications.push({
          id: `fuel-approved-${r.id}`,
          type: 'fuel_request_approved',
          title: `Demande carburant ${r.request_no} approuvée ✅`,
          message: 'Votre demande a été validée par le RAF',
          link: `/app/requests/fuel`,
          timestamp: r.approved_at,
          severity: 'success',
        });
      }
    }

    // Demandes voiture rejetées/approuvées
    const carRes = await pool.query(
      `SELECT id, request_no, status, rejected_at, raf_at, reject_reason, updated_at
       FROM car_requests
       WHERE requester_id=$1
         AND status IN ('REJECTED', 'RAF_APPROVED')
         AND (rejected_at > $2 OR raf_at > $2)
       ORDER BY updated_at DESC
       LIMIT $3`,
      [userId, since, fetchN]
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
          severity: 'error',
        });
      } else if (r.status === 'RAF_APPROVED') {
        notifications.push({
          id: `car-approved-${r.id}`,
          type: 'car_request_approved',
          title: `Demande voiture ${r.request_no} approuvée ✅`,
          message: 'Votre demande a reçu le visa RAF',
          link: `/app/requests/car`,
          timestamp: r.raf_at,
          severity: 'success',
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
       WHERE status='SUBMITTED'
         AND submitted_at IS NOT NULL
         AND submitted_at > $1
       ORDER BY submitted_at DESC
       LIMIT $2`,
      [since, fetchN]
    );

    for (const r of newFuel.rows) {
      notifications.push({
        id: `fuel-new-${r.id}`,
        type: 'fuel_request_new',
        title: `Nouvelle demande carburant ${r.request_no}`,
        message: 'En attente de validation logistique',
        link: `/app/requests/fuel/manage`,
        timestamp: r.submitted_at,
        severity: 'info',
      });
    }

    // Nouvelles demandes voiture
    const newCar = await pool.query(
      `SELECT id, request_no, created_at
       FROM car_requests
       WHERE status='SUBMITTED'
         AND created_at > $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [since, fetchN]
    );

    for (const r of newCar.rows) {
      notifications.push({
        id: `car-new-${r.id}`,
        type: 'car_request_new',
        title: `Nouvelle demande voiture ${r.request_no}`,
        message: 'En attente de visa logistique',
        link: `/app/requests/car/manage`,
        timestamp: r.created_at,
        severity: 'info',
      });
    }
  }

  // ========== NOTIFICATIONS RAF ==========
  if (['RAF', 'ADMIN'].includes(role)) {
    // Demandes carburant vérifiées (à approuver)
    const verifiedFuel = await pool.query(
      `SELECT id, request_no, verified_at
       FROM fuel_requests
       WHERE status='VERIFIED'
         AND verified_at IS NOT NULL
         AND verified_at > $1
       ORDER BY verified_at DESC
       LIMIT $2`,
      [since, fetchN]
    );

    for (const r of verifiedFuel.rows) {
      notifications.push({
        id: `fuel-verified-${r.id}`,
        type: 'fuel_request_verified',
        title: `Demande carburant ${r.request_no} à viser`,
        message: 'Validée par logistique, en attente de visa RAF',
        link: `/app/requests/fuel/raf`,
        timestamp: r.verified_at,
        severity: 'warning',
      });
    }

    // Demandes voiture approuvées par logistique
    const logisticsCar = await pool.query(
      `SELECT id, request_no, logistics_at
       FROM car_requests
       WHERE status='LOGISTICS_APPROVED'
         AND logistics_at IS NOT NULL
         AND logistics_at > $1
       ORDER BY logistics_at DESC
       LIMIT $2`,
      [since, fetchN]
    );

    for (const r of logisticsCar.rows) {
      notifications.push({
        id: `car-logistics-${r.id}`,
        type: 'car_request_logistics',
        title: `Demande voiture ${r.request_no} à viser`,
        message: 'Validée par logistique, en attente de visa RAF',
        link: `/app/requests/car/raf`,
        timestamp: r.logistics_at,
        severity: 'warning',
      });
    }
  }

  // Tri global
  notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return notifications;
}

/**
 * GET /api/notifications?limit=20&offset=0&days=7
 * Renvoie notifications paginées + unread réel via notification_reads.
 */
async function getNotifications(req, res) {
  const userId = req.user.id;
  const role = req.user.role;

  const limit = clampInt(req.query.limit, 1, 50, 20);
  const offset = clampInt(req.query.offset, 0, 1000, 0);
  const days = clampInt(req.query.days, 1, 90, 7);

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // On fetch un peu plus que nécessaire pour pouvoir fusionner + paginer proprement
  const fetchN = Math.min(200, limit + offset + 30);

  try {
    const all = await buildNotifications({ userId, role, since, fetchN });

    // Pagination mémoire (simple + stable)
    const page = all.slice(offset, offset + limit);

    // Read status serveur
    const ids = page.map(n => n.id);
    let readSet = new Set();

    if (ids.length) {
      const readRes = await pool.query(
        `SELECT notification_id
         FROM notification_reads
         WHERE user_id = $1
           AND notification_id = ANY($2::text[])`,
        [userId, ids]
      );
      readSet = new Set(readRes.rows.map(r => r.notification_id));
    }

    // On injecte is_read sans casser le front (champ en plus)
    const pageWithRead = page.map(n => ({
      ...n,
      is_read: readSet.has(n.id),
      timestamp_iso: asISO(n.timestamp),
    }));

    // Unread global (sur ce qu’on a construit)
    // NOTE: unread précis au niveau global nécessiterait lire sur TOUS les ids;
    // ici on calcule sur la page + on expose aussi count total.
    const unreadOnPage = pageWithRead.filter(n => !n.is_read).length;

    res.json({
      notifications: pageWithRead,
      count: all.length,
      unread: unreadOnPage,
      limit,
      offset,
      days,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
}

/**
 * POST /api/notifications/:id/read
 * Marque UNE notif comme lue côté serveur.
 */
async function markAsRead(req, res) {
  const userId = req.user.id;
  const id = String(req.params.id || '').trim();

  if (!id) {
    return res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing notification id' });
  }

  try {
    await pool.query(
      `INSERT INTO notification_reads (user_id, notification_id, read_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, notification_id) DO NOTHING`,
      [userId, id]
    );
    res.json({ ok: true });
  } catch (error) {
    console.error('Error markAsRead:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
}

/**
 * POST /api/notifications/read-all
 * - Si le front envoie { ids: [...] } => on marque ces ids.
 * - Sinon => on calcule la page par défaut (days=7, limit=50) et on marque tout.
 */
async function markAllAsRead(req, res) {
  const userId = req.user.id;
  const role = req.user.role;

  let ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
  ids = ids.map(s => s.trim()).filter(Boolean);

  try {
    // fallback sans body (pour ne pas casser ton front actuel)
    if (ids.length === 0) {
      const now = new Date();
      const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const all = await buildNotifications({ userId, role, since, fetchN: 200 });
      ids = all.map(n => n.id);
    }

    if (ids.length === 0) return res.json({ ok: true, marked: 0 });

    await pool.query(
      `INSERT INTO notification_reads (user_id, notification_id, read_at)
       SELECT $1, x, NOW()
       FROM unnest($2::text[]) AS x
       ON CONFLICT (user_id, notification_id) DO NOTHING`,
      [userId, ids]
    );

    res.json({ ok: true, marked: ids.length });
  } catch (error) {
    console.error('Error markAllAsRead:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
};
