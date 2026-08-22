const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/importController');

const router = express.Router();
router.use(authRequired);
router.use(requireRole('ADMIN', 'LOGISTIQUE'));

router.post('/batch', asyncHandler(ctrl.createBatch));
router.get('/batches', asyncHandler(ctrl.listBatches));
router.get('/batches/:batch_id/files', asyncHandler(ctrl.listFiles));
router.post('/upload', ctrl.uploadFiles, asyncHandler(ctrl.uploadAndImport));

module.exports = router;
