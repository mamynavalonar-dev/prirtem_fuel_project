const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { authRequired } = require('../middleware/auth');
const ctrl = require('../controllers/importController');

const router = express.Router();
router.use(authRequired);

router.post('/batch', asyncHandler(ctrl.createBatch));
router.get('/batches', asyncHandler(ctrl.listBatches));
router.get('/batches/:batch_id/files', asyncHandler(ctrl.listFiles));
router.post('/upload', ctrl.upload.array('files', 10), asyncHandler(ctrl.uploadAndImport));

module.exports = router;
