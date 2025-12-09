import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import Transaction from '../models/Transaction';
import { notifyUsers } from '../utils/notificationService';
import { notifyLowStock } from '../utils/inventoryAlerts';

export const requestDisposal = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, locationId, quantity, reason, note, photo } = req.body;

    if (!photo) {
      return res.status(400).json({ error: 'Photo proof is required for disposal' });
    }

    const item = await Item.findById(itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Check stock availability
    const locationIndex = item.locations.findIndex(
      loc => loc.locationId.toString() === locationId
    );

    if (locationIndex < 0 || item.locations[locationIndex].quantity < quantity) {
      return res.status(400).json({ error: 'Insufficient stock at location' });
    }

    // Create disposal transaction (pending approval)
    const transaction = new Transaction({
      type: 'DISPOSE',
      itemId,
      fromLocationId: locationId,
      quantity,
      reason,
      note,
      photo,
      status: 'pending',
      createdBy: req.user?._id
    });

    await transaction.save();

    await notifyUsers({
      title: 'Disposal Approval Needed',
      message: `Disposal request for ${quantity} ${item.unit} of ${item.name} requires approval.`,
      roles: ['admin'],
      data: {
        itemId: item.id,
        transactionId: transaction.id
      },
      emailSubject: `StockBuddy Action Required – Disposal approval for ${item.name}`,
      emailHtml: `
        <p>A disposal request needs your approval.</p>
        <ul>
          <li>Item: ${item.name} (${item.sku})</li>
          <li>Quantity: ${quantity} ${item.unit}</li>
          <li>Reason: ${reason}</li>
        </ul>
      `
    });

    res.status(201).json({ message: 'Disposal request submitted for approval', transaction });
  } catch (error) {
    res.status(500).json({ error: 'Failed to request disposal' });
  }
};

export const approveDisposal = async (req: AuthRequest, res: Response) => {
  try {
    const { transactionId, approved } = req.body;

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.type !== 'DISPOSE' || transaction.status !== 'pending') {
      return res.status(404).json({ error: 'Disposal request not found or already processed' });
    }

    const item = await Item.findById(transaction.itemId);

    if (approved) {
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Reduce stock
      const locationIndex = item.locations.findIndex(
        loc => loc.locationId?.toString() === transaction.fromLocationId?.toString()
      );

      if (locationIndex >= 0) {
        item.locations[locationIndex].quantity -= transaction.quantity;
        await item.save();
      }

      transaction.status = 'approved';

      await notifyLowStock(item);

      await notifyUsers({
        title: 'Disposal Approved',
        message: `Disposal of ${transaction.quantity} ${item.unit} for ${item.name} has been approved.`,
        data: {
          itemId: item.id,
          transactionId: transaction.id
        },
        emailSubject: `StockBuddy Update – Disposal approved for ${item.name}`,
        emailHtml: `
          <p>The disposal request for <strong>${item.name}</strong> has been approved.</p>
          <ul>
            <li>Quantity: ${transaction.quantity} ${item.unit}</li>
            <li>Reason: ${transaction.reason}</li>
          </ul>
        `
      });
    } else {
      transaction.status = 'rejected';

      const itemLabel = item?.name || String(transaction.itemId);
      const unitLabel = item?.unit || 'units';

      await notifyUsers({
        title: 'Disposal Rejected',
        message: `Disposal request for ${transaction.quantity} ${unitLabel} of ${itemLabel} was rejected.`,
        data: {
        transactionId: transaction.id
        },
        emailSubject: `StockBuddy Update – Disposal request rejected`,
        emailHtml: `
          <p>The disposal request for <strong>${itemLabel}</strong> has been rejected.</p>
          <p>Please review the request details for next steps.</p>
        `
      });
    }

    transaction.approvedBy = req.user?._id as any;
    transaction.approvedAt = new Date();
    await transaction.save();

    res.json({ 
      message: `Disposal ${approved ? 'approved' : 'rejected'} successfully`, 
      transaction 
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to process disposal approval' });
  }
};

export const getPendingDisposals = async (req: AuthRequest, res: Response) => {
  try {
    const disposals = await Transaction.find({ 
      type: 'DISPOSE', 
      status: 'pending' 
    })
      .populate('itemId', 'name sku')
      .populate('fromLocationId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json(disposals);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch pending disposals' });
  }
};