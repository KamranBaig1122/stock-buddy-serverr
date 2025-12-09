import { Router } from 'express';
import { createLocation, getLocations, updateLocation } from '../controllers/locationController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, requireAdmin, createLocation);
router.get('/', authenticateToken, getLocations);
router.put('/:id', authenticateToken, requireAdmin, updateLocation);

export default router;