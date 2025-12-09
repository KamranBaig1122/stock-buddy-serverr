import { Router } from 'express';
import { addStock, transferStock, getStockByLocation, reviewTransfer, getPendingTransfers } from '../controllers/stockController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.post('/add', authenticateToken, addStock);
router.post('/transfer', authenticateToken, transferStock);
router.get('/location/:locationId', authenticateToken, getStockByLocation);
router.get('/transfers/pending', authenticateToken, requireAdmin, getPendingTransfers);
router.post('/transfer/review', authenticateToken, requireAdmin, reviewTransfer);

export default router;