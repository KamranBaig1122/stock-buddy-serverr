import { Router } from 'express';
import { requestDisposal, approveDisposal, getPendingDisposals } from '../controllers/disposalController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.post('/request', authenticateToken, requestDisposal);
router.post('/approve', authenticateToken, requireAdmin, approveDisposal);
router.get('/pending', authenticateToken, requireAdmin, getPendingDisposals);

export default router;