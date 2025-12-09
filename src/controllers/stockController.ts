import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import Transaction from '../models/Transaction';
import mongoose from 'mongoose';
import { notifyUsers } from '../utils/notificationService';
import { notifyLowStock } from '../utils/inventoryAlerts';

const adjustStockForTransfer = (
  item: any,
  fromLocationId: string,
  toLocationId: string,
  quantity: number
) => {
  const fromLocationIndex = item.locations.findIndex(
    (loc: any) => loc.locationId.toString() === fromLocationId
  );

  if (fromLocationIndex < 0 || item.locations[fromLocationIndex].quantity < quantity) {
    throw new Error('Insufficient stock at source location');
  }

  item.locations[fromLocationIndex].quantity -= quantity;

  const toLocationIndex = item.locations.findIndex(
    (loc: any) => loc.locationId.toString() === toLocationId
  );

  if (toLocationIndex >= 0) {
    item.locations[toLocationIndex].quantity += quantity;
  } else {
    item.locations.push({
      locationId: new mongoose.Types.ObjectId(toLocationId),
      quantity
    });
  }
};

export const addStock = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, locationId, quantity, note, photo } = req.body;

    console.log('Add stock request:', { itemId, locationId, quantity, note });

    if (!itemId || !locationId || !quantity) {
      return res.status(400).json({ error: 'itemId, locationId, and quantity are required' });
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Update item location stock
    const locationIndex = item.locations.findIndex(
      loc => loc.locationId.toString() === locationId
    );

    if (locationIndex >= 0) {
      item.locations[locationIndex].quantity += quantity;
    } else {
      item.locations.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity });
    }

    await item.save();

    // Create transaction record
    const transaction = new Transaction({
      type: 'ADD',
      itemId,
      toLocationId: locationId,
      quantity,
      note,
      photo,
      createdBy: req.user?._id
    });

    await transaction.save();

    await notifyUsers({
      title: 'Stock Added',
      message: `${item.name} stock increased by ${quantity} ${item.unit}.`,
      data: {
        itemId: item.id,
        transactionId: transaction.id,
        locationId
      },
      emailSubject: `StockBuddy Update – ${item.name} stock added`,
      emailHtml: `
        <p>Stock was added for <strong>${item.name}</strong>.</p>
        <ul>
          <li>Quantity: ${quantity} ${item.unit}</li>
          <li>Item SKU: ${item.sku}</li>
        </ul>
        <p>Transaction ID: ${transaction.id}</p>
      `
    });

    await notifyLowStock(item);

    res.status(201).json({ message: 'Stock added successfully', transaction });
  } catch (error) {
    console.error('Add stock error:', error);
    res.status(500).json({ error: 'Failed to add stock', details: error });
  }
};

export const transferStock = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, fromLocationId, toLocationId, quantity, note } = req.body;

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const fromLocationIndex = item.locations.findIndex(
      (loc: any) => loc.locationId.toString() === fromLocationId
    );

    if (fromLocationIndex < 0 || item.locations[fromLocationIndex].quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock at source location' });
    }

    const isAdmin = req.user?.role === 'admin';

    if (isAdmin) {
      try {
        adjustStockForTransfer(item, fromLocationId, toLocationId, quantity);
      } catch (error) {
        return res.status(400).json({ error: (error as Error).message });
      }

      await item.save();

      const transaction = new Transaction({
        type: 'TRANSFER',
        itemId,
        fromLocationId,
        toLocationId,
        quantity,
        note,
        status: 'approved',
        approvedBy: req.user?._id,
        approvedAt: new Date(),
        createdBy: req.user?._id
      });

      await transaction.save();

      await notifyUsers({
        title: 'Stock Transfer Completed',
        message: `${item.name} moved from location ${fromLocationId} to ${toLocationId}.`,
        data: {
          itemId: item.id,
          transactionId: transaction.id,
          fromLocationId,
          toLocationId
        },
        emailSubject: `StockBuddy Update – ${item.name} transfer completed`,
        emailHtml: `
          <p>Stock transfer completed for <strong>${item.name}</strong>.</p>
          <ul>
            <li>Quantity: ${quantity} ${item.unit}</li>
            <li>From: ${fromLocationId}</li>
            <li>To: ${toLocationId}</li>
          </ul>
          <p>Transaction ID: ${transaction.id}</p>
        `
      });

      await notifyLowStock(item);

      return res.status(201).json({ message: 'Stock transfer completed', transaction });
    }

    const transaction = new Transaction({
      type: 'TRANSFER',
      itemId,
      fromLocationId,
      toLocationId,
      quantity,
      note,
      status: 'pending',
      createdBy: req.user?._id
    });

    await transaction.save();

    await notifyUsers({
      title: 'Stock Transfer Approval Needed',
      message: `Transfer request for ${quantity} ${item.unit} of ${item.name} requires approval.`,
      data: {
        itemId: item.id,
        transactionId: transaction.id
      },
      roles: ['admin'],
      emailSubject: `StockBuddy Action Required – Transfer approval for ${item.name}`,
      emailHtml: `
        <p>A stock transfer requires your approval.</p>
        <ul>
          <li>Item: ${item.name} (${item.sku})</li>
          <li>Quantity: ${quantity} ${item.unit}</li>
        </ul>
        <p>Requested by: ${req.user?.name || 'Staff'}.</p>
      `
    });

    res.status(201).json({ message: 'Stock transfer request submitted for approval', transaction });
  } catch (error) {
    res.status(500).json({ error: 'Failed to transfer stock' });
  }
};

export const getStockByLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { locationId } = req.params;

    const items = await Item.find({ 
      status: 'active',
      'locations.locationId': locationId 
    }).populate('locations.locationId', 'name');

    const stockData = items.map(item => {
      const locationStock = item.locations.find((loc: any) => {
        const locId = loc.locationId?._id
          ? String(loc.locationId._id)
          : String(loc.locationId);
        return locId === locationId;
      });
      
      return {
        item: {
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          threshold: item.threshold
        },
        quantity: locationStock?.quantity || 0,
        status: (locationStock?.quantity || 0) <= item.threshold ? 'low' : 'sufficient'
      };
    });

    res.json(stockData);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
};

export const reviewTransfer = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId, approved, note } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.type !== 'TRANSFER' || transaction.status !== 'pending') {
      return res.status(404).json({ error: 'Transfer request not found or already processed' });
    }

    if (!transaction.fromLocationId || !transaction.toLocationId) {
      return res.status(400).json({ error: 'Transfer request is missing location details' });
    }

    const item = await Item.findById(transaction.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (approved) {
      try {
        adjustStockForTransfer(
          item,
          transaction.fromLocationId?.toString() || '',
          transaction.toLocationId?.toString() || '',
          transaction.quantity
        );
      } catch (error) {
        return res.status(400).json({ error: (error as Error).message });
      }

      await item.save();

      transaction.status = 'approved';
      transaction.note = note || transaction.note;
      transaction.approvedBy = req.user?._id as any;
      transaction.approvedAt = new Date();

      await transaction.save();

      await notifyUsers({
        title: 'Stock Transfer Approved',
        message: `${item.name} transfer request has been approved.`,
        data: {
          itemId: item.id,
          transactionId: transaction.id
        },
        emailSubject: `StockBuddy Update – Transfer approved for ${item.name}`,
        emailHtml: `
          <p>The pending stock transfer for <strong>${item.name}</strong> has been approved.</p>
          <ul>
            <li>Quantity: ${transaction.quantity} ${item.unit}</li>
            <li>From: ${transaction.fromLocationId}</li>
            <li>To: ${transaction.toLocationId}</li>
          </ul>
          <p>Approved by: ${req.user?.name || 'Admin'}</p>
        `
      });

      await notifyLowStock(item);

      return res.json({ message: 'Stock transfer approved successfully', transaction });
    }

    transaction.status = 'rejected';
    transaction.note = note || transaction.note;
    transaction.approvedBy = req.user?._id as any;
    transaction.approvedAt = new Date();
    await transaction.save();

    await notifyUsers({
      title: 'Stock Transfer Rejected',
      message: `Transfer request for ${item.name} was rejected.`,
      data: {
        itemId: item.id,
        transactionId: transaction.id
      },
      emailSubject: `StockBuddy Update – Transfer rejected for ${item.name}`,
      emailHtml: `
        <p>The pending stock transfer for <strong>${item.name}</strong> has been rejected.</p>
        <p>Reason/Note: ${transaction.note || 'Not provided'}.</p>
      `
    });

    res.json({ message: 'Stock transfer rejected', transaction });
  } catch (error) {
    res.status(500).json({ error: 'Failed to review transfer request' });
  }
};

export const getPendingTransfers = async (req: AuthRequest, res: Response) => {
  try {
    const transactions = await Transaction.find({
      type: 'TRANSFER',
      status: 'pending'
    })
      .populate('itemId', 'name sku unit threshold')
      .populate('fromLocationId', 'name')
      .populate('toLocationId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending transfers' });
  }
};