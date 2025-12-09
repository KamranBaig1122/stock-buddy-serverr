import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';

export const createItem = async (req: AuthRequest, res: Response) => {
  try {
    const { name, sku, barcode, unit, threshold, image } = req.body;
    
    const item = new Item({
      name,
      sku,
      barcode,
      unit,
      threshold,
      image, // base64 encoded image
      locations: [],
      createdBy: req.user?._id
    });

    await item.save();
    res.status(201).json({ message: 'Item created successfully', item });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'SKU or barcode already exists' });
    }
    res.status(500).json({ error: 'Failed to create item' });
  }
};

export const getItems = async (req: AuthRequest, res: Response) => {
  try {
    const items = await Item.find({ status: 'active' })
      .populate('locations.locationId', 'name')
      .populate('createdBy', 'name');
    
    const itemsWithStock = items.map(item => ({
      ...item.toObject(),
      totalStock: item.locations.reduce((sum, loc) => sum + loc.quantity, 0),
      stockStatus: item.locations.reduce((sum, loc) => sum + loc.quantity, 0) <= item.threshold ? 'low' : 'sufficient'
    }));

    res.json(itemsWithStock);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch items' });
  }
};

export const getItemById = async (req: AuthRequest, res: Response) => {
  try {
    const item = await Item.findById(req.params.id)
      .populate('locations.locationId', 'name')
      .populate('createdBy', 'name');
    
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch item' });
  }
};

export const updateItem = async (req: AuthRequest, res: Response) => {
  try {
    const { name, unit, threshold, status } = req.body;
    
    const item = await Item.findByIdAndUpdate(
      req.params.id,
      { name, unit, threshold, status },
      { new: true }
    );

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item updated successfully', item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update item' });
  }
};

export const searchItems = async (req: AuthRequest, res: Response) => {
  try {
    const { query } = req.query;
    
    const items = await Item.find({
      status: 'active',
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { sku: { $regex: query, $options: 'i' } },
        { barcode: { $regex: query, $options: 'i' } }
      ]
    }).populate('locations.locationId', 'name');

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search items' });
  }
};

export const getItemByBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { barcode } = req.params;

    const item = await Item.findOne({ barcode })
      .populate('locations.locationId', 'name')
      .populate('createdBy', 'name');

    if (!item) {
      return res.status(404).json({ error: 'Item not found for the provided barcode' });
    }

    res.json(item);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch item by barcode' });
  }
};

const generateUniqueBarcode = async () => {
  let barcode: string;
  let exists = true;

  do {
    barcode = crypto.randomBytes(4).toString('hex').toUpperCase();
    exists = !!(await Item.exists({ barcode }));
  } while (exists);

  return barcode;
};

export const assignBarcode = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { barcode: providedBarcode, overwrite } = req.body;

    const item = await Item.findById(id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (item.barcode && !overwrite) {
      return res.status(400).json({ error: 'Item already has a barcode. Set overwrite=true to replace it.' });
    }

    const barcode = providedBarcode || await generateUniqueBarcode();

    const duplicate = await Item.findOne({ barcode, _id: { $ne: id } });
    if (duplicate) {
      return res.status(400).json({ error: 'Barcode already assigned to another item' });
    }

    item.barcode = barcode;
    await item.save();

    res.json({ message: 'Barcode assigned successfully', item });
  } catch (error) {
    res.status(500).json({ error: 'Failed to assign barcode' });
  }
};