// server/src/routes/meta.js
const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');

const {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,

  listDrivers,
  createDriver,
  updateDriver,
  deleteDriver,

  listAssignments,
  createAssignment,
  unassignVehicle
} = require('../controllers/metaController');

const router = express.Router();

router.use(authRequired);

// Véhicules
router.get('/vehicles', asyncHandler(listVehicles));
router.post('/vehicles', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(createVehicle));
router.put('/vehicles/:id', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(updateVehicle));
router.delete('/vehicles/:id', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(deleteVehicle));

// Chauffeurs
router.get('/drivers', asyncHandler(listDrivers));
router.post('/drivers', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(createDriver));
router.put('/drivers/:id', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(updateDriver));
router.delete('/drivers/:id', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(deleteDriver));

// Affectations (historique)
router.get('/assignments', asyncHandler(listAssignments));
router.post('/assignments', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(createAssignment));
router.patch('/vehicles/:id/unassign', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(unassignVehicle));

module.exports = router;
