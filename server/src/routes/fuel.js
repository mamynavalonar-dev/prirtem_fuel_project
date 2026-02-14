const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');
const ctrl = require('../controllers/fuelController');

const router = express.Router();
router.use(authRequired);

// Lists
router.get('/vehicle', asyncHandler(ctrl.listVehicleFuel));
router.get('/generator', asyncHandler(ctrl.listGeneratorFuel));
router.get('/other', asyncHandler(ctrl.listOtherFuel));

// Manual add (LOGISTIQUE / ADMIN)
router.post('/vehicle', asyncHandler(ctrl.manualAddVehicle));
router.post('/generator', asyncHandler(ctrl.manualAddGenerator));
router.post('/other', asyncHandler(ctrl.manualAddOther));

// ========== CRUD: UPDATE & SOFT DELETE ==========
router.put('/vehicle/:id', asyncHandler(ctrl.updateVehicleFuel));
router.delete('/vehicle/:id', asyncHandler(ctrl.softDeleteVehicleFuel));

router.put('/generator/:id', asyncHandler(ctrl.updateGeneratorFuel));
router.delete('/generator/:id', asyncHandler(ctrl.softDeleteGeneratorFuel));

router.put('/other/:id', asyncHandler(ctrl.updateOtherFuel));
router.delete('/other/:id', asyncHandler(ctrl.softDeleteOtherFuel));

// Exports (LOGISTIQUE / ADMIN)
// ✅ Route actuelle (OK)
router.get('/export/:type', asyncHandler(ctrl.exportCsv));

// ✅ COMPAT: accepte aussi /export?type=vehicle (ton Fuel.jsx actuel)
router.get('/export', asyncHandler((req, res, next) => {
  // ctrl.exportCsv lit normalement req.params.type, donc on le “mappe”
  req.params.type = req.query.type;
  return ctrl.exportCsv(req, res, next);
}));

// Reports & KPIs
router.get('/report/summary', asyncHandler(ctrl.reportSummary));
router.get('/kpi/daily/bulk', asyncHandler(ctrl.kpiDailyBulk));
router.get('/kpi/daily', asyncHandler(ctrl.kpiDaily));
router.get('/kpi/by-vehicle', asyncHandler(ctrl.kpiByVehicle));

module.exports = router;
