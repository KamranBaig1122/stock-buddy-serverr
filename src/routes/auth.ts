import { Router } from 'express';
import { register, login, forgotPassword, resetPassword, getProfile, verifyToken } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/profile', authenticateToken, getProfile);
router.post('/verify-token', verifyToken);

export default router;