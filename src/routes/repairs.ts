import { Router } from 'express';
import { sendForRepair, returnFromRepair, getRepairTickets } from '../controllers/repairController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/send', authenticateToken, sendForRepair);
router.post('/return', authenticateToken, returnFromRepair);
router.get('/', authenticateToken, getRepairTickets);

export default router;