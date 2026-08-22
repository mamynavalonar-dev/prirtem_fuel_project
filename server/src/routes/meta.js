const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const { blockDemoSensitiveMutation } = require('../middleware/demo');

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

// Lecture autorisée dans la démo.
router.get('/vehicles', asyncHandler(listVehicles));
router.get('/drivers', asyncHandler(listDrivers));
router.get('/assignments', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(listAssignments));

// Les comptes de démonstration ne peuvent pas modifier le référentiel global.
router.post('/vehicles', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(createVehicle));
router.put('/vehicles/:id', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(updateVehicle));
router.delete('/vehicles/:id', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(deleteVehicle));

router.post('/drivers', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(createDriver));
router.put('/drivers/:id', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(updateDriver));
router.delete('/drivers/:id', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(deleteDriver));

router.post('/assignments', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(createAssignment));
router.patch('/vehicles/:id/unassign', requireRole('LOGISTIQUE', 'ADMIN'), blockDemoSensitiveMutation, asyncHandler(unassignVehicle));

module.exports = router;
