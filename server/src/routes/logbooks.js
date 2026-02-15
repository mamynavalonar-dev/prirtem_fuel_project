const { Router } = require('express');
const { authRequired } = require('../middleware/auth');
const logbooks = require('../controllers/logbooksController');

const router = Router();

router.get('/', authRequired, logbooks.list);
router.post('/', authRequired, logbooks.create);

router.get('/:id', authRequired, logbooks.getOne);
router.put('/:id', authRequired, logbooks.update);

router.put('/:id/trips', authRequired, logbooks.replaceTrips);
router.put('/:id/supplies', authRequired, logbooks.replaceSupplies);

router.post('/:id/submit', authRequired, logbooks.submit);
router.post('/:id/lock', authRequired, logbooks.lock);

/** ✅ Soft delete -> corbeille */
router.delete('/:id', authRequired, logbooks.softDelete);

module.exports = router;
