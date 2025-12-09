import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import RepairTicket from '../models/RepairTicket';
import Transaction from '../models/Transaction';
import mongoose from 'mongoose';
import { notifyUsers } from '../utils/notificationService';
import { notifyLowStock } from '../utils/inventoryAlerts';

export const sendForRepair = async (req: AuthRequest, res: Response) => {
  try {
    const { itemId, locationId, quantity, vendorName, serialNumber, note, photo } = req.body;

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

    // Reduce stock
    item.locations[locationIndex].quantity -= quantity;
    await item.save();

    // Create repair ticket
    const repairTicket = new RepairTicket({
      itemId,
      locationId,
      quantity,
      vendorName,
      serialNumber,
      note,
      photo,
      createdBy: req.user?._id
    });

    await repairTicket.save();

    // Create transaction record
    const transaction = new Transaction({
      type: 'REPAIR_OUT',
      itemId,
      fromLocationId: locationId,
      quantity,
      vendorName,
      serialNumber,
      note,
      photo,
      createdBy: req.user?._id
    });

    await transaction.save();

    await notifyUsers({
      title: 'Item Sent for Repair',
      message: `${quantity} ${item.unit} of ${item.name} were sent to ${vendorName}.`,
      data: {
        itemId: item.id,
        repairTicketId: repairTicket.id
      },
      emailSubject: `StockBuddy Update – ${item.name} sent for repair`,
      emailHtml: `
        <p>${quantity} ${item.unit} of <strong>${item.name}</strong> were sent for repair.</p>
        <ul>
          <li>Vendor: ${vendorName}</li>
          <li>Location: ${locationId}</li>
        </ul>
      `
    });

    await notifyLowStock(item);

    res.status(201).json({ message: 'Item sent for repair', repairTicket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to send item for repair' });
  }
};

export const returnFromRepair = async (req: AuthRequest, res: Response) => {
  try {
    const { repairTicketId, locationId, note } = req.body;

    const repairTicket = await RepairTicket.findById(repairTicketId);
    if (!repairTicket || repairTicket.status !== 'sent') {
      return res.status(404).json({ error: 'Repair ticket not found or already processed' });
    }

    const item = await Item.findById(repairTicket.itemId);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Add stock back
    const locationIndex = item.locations.findIndex(
      loc => loc.locationId.toString() === locationId
    );

    if (locationIndex >= 0) {
      item.locations[locationIndex].quantity += repairTicket.quantity;
    } else {
      item.locations.push({ locationId: new mongoose.Types.ObjectId(locationId), quantity: repairTicket.quantity });
    }

    await item.save();

    // Update repair ticket
    repairTicket.status = 'returned';
    repairTicket.returnedDate = new Date();
    await repairTicket.save();

    // Create transaction record
    const transaction = new Transaction({
      type: 'REPAIR_IN',
      itemId: repairTicket.itemId,
      toLocationId: locationId,
      quantity: repairTicket.quantity,
      note,
      createdBy: req.user?._id
    });

    await transaction.save();

    await notifyUsers({
      title: 'Repair Completed',
      message: `${repairTicket.quantity} ${item.unit} of ${item.name} returned from repair.`,
      data: {
        itemId: item.id,
        repairTicketId: repairTicket.id
      },
      emailSubject: `StockBuddy Update – ${item.name} returned from repair`,
      emailHtml: `
        <p>${repairTicket.quantity} ${item.unit} of <strong>${item.name}</strong> have been returned from repair.</p>
        <p>Location: ${locationId}</p>
      `
    });

    res.json({ message: 'Item returned from repair', repairTicket });
  } catch (error) {
    res.status(500).json({ error: 'Failed to return item from repair' });
  }
};

export const getRepairTickets = async (req: AuthRequest, res: Response) => {
  try {
    const tickets = await RepairTicket.find()
      .populate('itemId', 'name sku')
      .populate('locationId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

    res.json(tickets);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch repair tickets' });
  }
};