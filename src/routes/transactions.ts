import { Router } from 'express';
import { getTransactions, getTransactionById } from '../controllers/transactionController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, getTransactions);
router.get('/:id', authenticateToken, getTransactionById);

export default router;