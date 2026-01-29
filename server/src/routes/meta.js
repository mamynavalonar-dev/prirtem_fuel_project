const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const { listVehicles, createVehicle, updateVehicle, deleteVehicle, listDrivers, createDriver, updateDriver, deleteDriver } = require('../controllers/metaController');

const router = express.Router();

router.use(authRequired);
router.get('/vehicles', asyncHandler(listVehicles));
router.post('/vehicles', requireRole('LOGISTIQUE','ADMIN'), asyncHandler(createVehicle));
router.put('/vehicles/:id', requireRole('LOGISTIQUE','ADMIN'), asyncHandler(updateVehicle));
router.delete('/vehicles/:id', requireRole('LOGISTIQUE','ADMIN'), asyncHandler(deleteVehicle));

router.get('/drivers', asyncHandler(listDrivers));
router.post('/drivers', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(createDriver));
router.put('/drivers/:id', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(updateDriver));
router.delete('/drivers/:id', requireRole('LOGISTIQUE', 'ADMIN'), asyncHandler(deleteDriver));

module.exports = router;
