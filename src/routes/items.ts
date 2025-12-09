import { Router } from 'express';
import { createItem, getItems, getItemById, updateItem, searchItems, getItemByBarcode, assignBarcode } from '../controllers/itemController';
import { authenticateToken, requireAdmin } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, requireAdmin, createItem);
router.get('/', authenticateToken, getItems);
router.get('/search', authenticateToken, searchItems);
router.get('/barcode/:barcode', authenticateToken, getItemByBarcode);
router.get('/:id', authenticateToken, getItemById);
router.put('/:id', authenticateToken, requireAdmin, updateItem);
router.post('/:id/barcode', authenticateToken, requireAdmin, assignBarcode);

export default router;