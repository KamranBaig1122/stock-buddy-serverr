import { Router } from 'express';
import { getUsers, createUser, updateUser, resetUserPassword } from '../controllers/userController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/', authenticateToken, requireAdmin, getUsers);
router.post('/', authenticateToken, requireAdmin, createUser);
router.put('/:id', authenticateToken, requireAdmin, updateUser);
router.post('/:id/reset-password', authenticateToken, requireAdmin, resetUserPassword);

export default router;