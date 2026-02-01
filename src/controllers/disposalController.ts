import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Item from '../models/Item';
import Transaction from '../models/Transaction';
import { notifyUsers } from '../utils/notificationService';
import { notifyLowStock } from '../utils/inventoryAlerts';

export const requestDisposal = async (req: AuthRequest, res: Response) => {
  // console.log('🗑️ [DISPOSAL] Starting disposal request...');
  // console.log('📝 [DISPOSAL] Request headers:', req.headers);
  // console.log('📝 [DISPOSAL] Content-Type:', req.headers['content-type']);
  // console.log('📝 [DISPOSAL] Request method:', req.method);
  // console.log('📝 [DISPOSAL] Request body type:', typeof req.body);
  // console.log('📝 [DISPOSAL] Request body:', JSON.stringify(req.body, null, 2));
  // console.log('📝 [DISPOSAL] Raw body length:', req.body ? Object.keys(req.body).length : 'No body');
  // console.log('👤 [DISPOSAL] User:', req.user?.name, req.user?.email);
  
  try {
    // Ensure body is parsed JSON. Some clients (Postman) may send JSON with Content-Type: text/plain
    let body: any = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
        // console.log('🔧 [DISPOSAL] Parsed string body to JSON');
      } catch (parseErr) {
        const parseMessage = parseErr instanceof Error ? parseErr.message : String(parseErr);
        // console.log('⚠️ [DISPOSAL] Failed to parse string body as JSON:', parseMessage);
        // leave body as string so validation below will catch missing fields
      }
    }

    const { itemId, locationId, quantity, reason, note, photo } = body || {};
    // console.log('🔍 [DISPOSAL] Extracted fields:', { itemId, locationId, quantity, reason, noteLength: note?.length, photoLength: photo?.length });

    // Validate required fields
    if (!itemId) {
      // console.log('❌ [DISPOSAL] Missing itemId');
      return res.status(400).json({ error: 'itemId is required' });
    }
    if (!locationId) {
      // console.log('❌ [DISPOSAL] Missing locationId');
      return res.status(400).json({ error: 'locationId is required' });
    }
    if (!quantity || quantity <= 0) {
      // console.log('❌ [DISPOSAL] Invalid quantity:', quantity);
      return res.status(400).json({ error: 'Valid quantity is required' });
    }
    if (!reason) {
      // console.log('❌ [DISPOSAL] Missing reason');
      return res.status(400).json({ error: 'reason is required' });
    }
    // console.log('✅ [DISPOSAL] Required fields validation passed');

    if (!photo || photo.trim() === '') {
      // console.log('⚠️ [DISPOSAL] Photo validation failed - no photo provided');
      // console.log('📝 [DISPOSAL] Continuing without photo for debugging...');
      // Temporarily allow requests without photos for debugging
      // return res.status(400).json({ error: 'Photo proof is required for disposal' });
    } else {
      // console.log('✅ [DISPOSAL] Photo validation passed');
    }

    // Normalize photo format - add data URL prefix if missing
    let normalizedPhoto = photo || '';
    if (photo) {
      // console.log('📸 [DISPOSAL] Original photo format check:', photo.substring(0, 50) + '...');
      if (!photo.startsWith('data:image/')) {
        // console.log('🔧 [DISPOSAL] Adding data URL prefix to photo');
        normalizedPhoto = `data:image/jpeg;base64,${photo}`;
      }
      // console.log('✅ [DISPOSAL] Photo normalized, length:', normalizedPhoto.length);
    } else {
      // console.log('⚠️ [DISPOSAL] No photo provided');
    }

    // console.log('🔍 [DISPOSAL] Looking up item with ID:', itemId);
    const item = await Item.findById(itemId);
    if (!item) {
      // console.log('❌ [DISPOSAL] Item not found with ID:', itemId);
      return res.status(404).json({ error: 'Item not found' });
    }
    // console.log('✅ [DISPOSAL] Item found:', item.name, 'SKU:', item.sku);

    // Get location name for email
    // console.log('🏢 [DISPOSAL] Looking up location with ID:', locationId);
    const Location = require('../models/Location').default;
    const location = await Location.findById(locationId);
    const locationName = location?.name || 'Unknown Location';
    // console.log('✅ [DISPOSAL] Location found:', locationName);

    // Check stock availability
    // console.log('📦 [DISPOSAL] Checking stock availability...');
    //console.log('📍 [DISPOSAL] Item locations:', item.locations.map(loc => ({ locationId: loc.locationId, quantity: loc.quantity })));
    
    const locationIndex = item.locations.findIndex(
      loc => loc.locationId.toString() === locationId
    );
    //console.log('🔍 [DISPOSAL] Location index found:', locationIndex);

    if (locationIndex < 0) {
      //console.log('❌ [DISPOSAL] Location not found in item locations');
      return res.status(400).json({ error: 'Item not available at this location' });
    }
    
    if (item.locations[locationIndex].quantity < quantity) {
      //console.log('❌ [DISPOSAL] Insufficient stock. Available:', item.locations[locationIndex].quantity, 'Requested:', quantity);
      return res.status(400).json({ error: 'Insufficient stock at location' });
    }
    //console.log('✅ [DISPOSAL] Stock check passed. Available:', item.locations[locationIndex].quantity);

    const currentStock = item.locations[locationIndex].quantity;
    const remainingStock = currentStock - quantity;
    console.log('📊 [DISPOSAL] Stock calculation - Current:', currentStock, 'Disposing:', quantity, 'Remaining:', remainingStock);

    // Create disposal transaction (pending approval)
    //console.log('💾 [DISPOSAL] Creating transaction record...');
    const transactionData = {
      type: 'DISPOSE',
      itemId,
      fromLocationId: locationId,
      quantity,
      reason,
      note,
      photo: normalizedPhoto,
      status: 'pending',
      createdBy: req.user?._id
    };
    //console.log('📝 [DISPOSAL] Transaction data:', { ...transactionData, photo: `[${normalizedPhoto.length} chars]` });
    
    const transaction = new Transaction(transactionData);
    await transaction.save();
    //console.log('✅ [DISPOSAL] Transaction saved with ID:', transaction._id);

    // Prepare email attachments for disposal photo
   //console.log('📧 [DISPOSAL] Preparing email attachments...');
    const attachments = [];
    if (normalizedPhoto && normalizedPhoto.startsWith('data:image/')) {
      const matches = normalizedPhoto.match(/^data:image\/(\w+);base64,(.+)$/);
      if (matches) {
        const [, extension, base64Data] = matches;
        //console.log('📎 [DISPOSAL] Adding photo attachment:', extension, 'size:', base64Data.length);
        attachments.push({
          filename: `disposal_proof_${Date.now()}.${extension}`,
          content: base64Data,
          encoding: 'base64',
          cid: 'disposal_photo'
        });
      } else {
        //console.log('⚠️ [DISPOSAL] Photo format not recognized for attachment');
      }
    } else {
      //console.log('⚠️ [DISPOSAL] No valid photo for attachment');
    }

    const currentDate = new Date().toLocaleString();
    const urgencyColor = reason === 'Broken' ? '#dc2626' : reason === 'Expired' ? '#ea580c' : '#7c2d12';
   // console.log('📅 [DISPOSAL] Notification details - Date:', currentDate, 'Color:', urgencyColor);

   // console.log('📢 [DISPOSAL] Sending notification to admins...');
    try {
      await notifyUsers({
      title: 'Disposal Approval Needed',
      message: `Disposal request for ${quantity} ${item.unit} of ${item.name} requires approval.`,
      roles: ['admin'],
      data: {
        itemId: item.id,
        transactionId: transaction.id
      },
      emailSubject: `🚨 StockBuddy Action Required – Disposal approval for ${item.name}`,
      emailHtml: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px;">🗑️ Disposal Approval Required</h2>
          
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 20px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #991b1b;">⚠️ Urgent Action Required</h3>
            <p>A disposal request has been submitted and requires your immediate approval.</p>
          </div>

          <div style="background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Item Details</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Item:</strong> ${item.name}</li>
              <li><strong>SKU:</strong> ${item.sku}</li>
              <li><strong>Unit:</strong> ${item.unit}</li>
              <li><strong>Current Threshold:</strong> ${item.threshold} ${item.unit}</li>
            </ul>
          </div>

          <div style="background-color: #fef3c7; border-left: 4px solid ${urgencyColor}; padding: 20px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: ${urgencyColor};">Disposal Request</h3>
            <ul style="list-style: none; padding: 0;">
              <li><strong>Quantity to Dispose:</strong> ${quantity} ${item.unit}</li>
              <li><strong>Current Stock:</strong> ${currentStock} ${item.unit}</li>
              <li><strong>Stock After Disposal:</strong> ${remainingStock} ${item.unit}</li>
              <li><strong>Location:</strong> ${locationName}</li>
              <li><strong>Reason:</strong> <span style="color: ${urgencyColor}; font-weight: bold;">${reason}</span></li>
            </ul>
          </div>

          ${note ? `
          <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <strong>Additional Notes:</strong><br/>
            <em>${note}</em>
          </div>
          ` : ''}

          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <h3 style="margin-top: 0; color: #374151;">📸 Disposal Evidence</h3>
            <img src="cid:disposal_photo" alt="Disposal Evidence" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"/>
            <p style="font-size: 12px; color: #6b7280; margin-top: 10px;">Photo evidence attached for verification</p>
          </div>

          <div style="background-color: #f1f5f9; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 14px; color: #64748b;">
            <p><strong>Requested by:</strong> ${req.user?.name || 'Staff'} (${req.user?.email || 'N/A'})</p>
            <p><strong>Request Date:</strong> ${currentDate}</p>
            <p><strong>Transaction ID:</strong> ${transaction.id}</p>
          </div>

          <div style="background-color: #dbeafe; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="margin: 0; color: #1e40af;"><strong>Please review this request promptly to maintain inventory accuracy.</strong></p>
          </div>
        </div>
      `,
      attachments
    });
   // console.log('✅ [DISPOSAL] Notification sent successfully');
    } catch (notifyError) {
     // console.error('❌ [DISPOSAL] Notification failed:', notifyError);
      // Continue anyway - don't fail the disposal request
    }

   // console.log('🎉 [DISPOSAL] Disposal request completed successfully');
    res.status(201).json({ message: 'Disposal request submitted for approval', transaction });
  } catch (error) {
    console.error('💥 [DISPOSAL] Request failed:', error);
    console.error('📍 [DISPOSAL] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: 'Failed to request disposal' });
  }
};

export const approveDisposal = async (req: AuthRequest, res: Response) => {
  //console.log('✅ [DISPOSAL-APPROVE] Starting disposal approval...');
  //console.log('📝 [DISPOSAL-APPROVE] Request body:', req.body);
  //console.log('👤 [DISPOSAL-APPROVE] Admin user:', req.user?.name);
  
  try {
    const { transactionId, approved } = req.body;
    //console.log('🔍 [DISPOSAL-APPROVE] Processing transaction:', transactionId, 'Approved:', approved);

    //console.log('🔍 [DISPOSAL-APPROVE] Looking up transaction...');
    const transaction = await Transaction.findById(transactionId);
    if (!transaction) {
      //console.log('❌ [DISPOSAL-APPROVE] Transaction not found');
      return res.status(404).json({ error: 'Disposal request not found' });
    }
    
    //console.log('📋 [DISPOSAL-APPROVE] Transaction found:', { type: transaction.type, status: transaction.status });
    if (transaction.type !== 'DISPOSE' || transaction.status !== 'pending') {
      //console.log('❌ [DISPOSAL-APPROVE] Invalid transaction type or status');
      return res.status(404).json({ error: 'Disposal request not found or already processed' });
    }

   // console.log('🔍 [DISPOSAL-APPROVE] Looking up item and location...');
    const item = await Item.findById(transaction.itemId);
    //console.log('📦 [DISPOSAL-APPROVE] Item found:', item?.name || 'Not found');

    // Get location name for email
    const Location = require('../models/Location').default;
    const location = await Location.findById(transaction.fromLocationId);
    const locationName = location?.name || 'Unknown Location';
    //console.log('🏢 [DISPOSAL-APPROVE] Location:', locationName);

    if (approved) {
      //console.log('✅ [DISPOSAL-APPROVE] Processing approval...');
      if (!item) {
        //console.log('❌ [DISPOSAL-APPROVE] Item not found for approval');
        return res.status(404).json({ error: 'Item not found' });
      }

      // Reduce stock
      //console.log('📦 [DISPOSAL-APPROVE] Reducing stock...');
      const locationIndex = item.locations.findIndex(
        loc => loc.locationId?.toString() === transaction.fromLocationId?.toString()
      );
      //console.log('📍 [DISPOSAL-APPROVE] Location index:', locationIndex);

      if (locationIndex >= 0) {
        const oldQuantity = item.locations[locationIndex].quantity;
        item.locations[locationIndex].quantity -= transaction.quantity;
        const newQuantity = item.locations[locationIndex].quantity;
        //console.log('📊 [DISPOSAL-APPROVE] Stock updated:', oldQuantity, '->', newQuantity);
        await item.save();
        //console.log('💾 [DISPOSAL-APPROVE] Item saved');
      } else {
        console.log('⚠️ [DISPOSAL-APPROVE] Location not found in item locations');
      }

      transaction.status = 'approved';
      //console.log('✅ [DISPOSAL-APPROVE] Transaction status updated to approved');

      //console.log('🔔 [DISPOSAL-APPROVE] Checking for low stock alerts...');
      try {
        await notifyLowStock(item);
        //console.log('✅ [DISPOSAL-APPROVE] Low stock check completed');
      } catch (lowStockError) {
        console.error('❌ [DISPOSAL-APPROVE] Low stock notification failed:', lowStockError);
      }

      //console.log('📢 [DISPOSAL-APPROVE] Sending approval notification...');
      try {
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
              <li>Location: ${locationName}</li>
              <li>Reason: ${transaction.reason}</li>
            </ul>
            <p>Approved by: ${req.user?.name || 'Admin'}</p>
          `
        });
        //console.log('✅ [DISPOSAL-APPROVE] Approval notification sent');
      } catch (notifyError) {
        console.error('❌ [DISPOSAL-APPROVE] Approval notification failed:', notifyError);
      }
    } else {
     // console.log('❌ [DISPOSAL-APPROVE] Processing rejection...');
      transaction.status = 'rejected';
     // console.log('✅ [DISPOSAL-APPROVE] Transaction status updated to rejected');

      const itemLabel = item?.name || String(transaction.itemId);
      const unitLabel = item?.unit || 'units';

     // console.log('📢 [DISPOSAL-APPROVE] Sending rejection notification...');
      try {
        await notifyUsers({
          title: 'Disposal Rejected',
          message: `Disposal request for ${transaction.quantity} ${unitLabel} of ${itemLabel} was rejected.`,
          data: {
            transactionId: transaction.id
          },
          emailSubject: `StockBuddy Update – Disposal request rejected`,
          emailHtml: `
            <p>The disposal request for <strong>${itemLabel}</strong> has been rejected.</p>
            <p>Rejected by: ${req.user?.name || 'Admin'}</p>
          `
        });
        //console.log('✅ [DISPOSAL-APPROVE] Rejection notification sent');
      } catch (notifyError) {
        console.error('❌ [DISPOSAL-APPROVE] Rejection notification failed:', notifyError);
      }
    }

   // console.log('💾 [DISPOSAL-APPROVE] Saving transaction...');
    transaction.approvedBy = req.user?._id as any;
    transaction.approvedAt = new Date();
    await transaction.save();
   // console.log('✅ [DISPOSAL-APPROVE] Transaction saved');

   // console.log('🎉 [DISPOSAL-APPROVE] Disposal approval completed successfully');
    res.json({ 
      message: `Disposal ${approved ? 'approved' : 'rejected'} successfully`, 
      transaction 
    });
  } catch (error) {
    console.error('💥 [DISPOSAL-APPROVE] Approval failed:', error);
    console.error('📍 [DISPOSAL-APPROVE] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    res.status(500).json({ error: 'Failed to process disposal approval' });
  }
};

export const getPendingDisposals = async (req: AuthRequest, res: Response) => {
  //console.log('📋 [DISPOSAL-PENDING] Fetching pending disposals...');
  
  try {
    const disposals = await Transaction.find({ 
      type: 'DISPOSE', 
      status: 'pending' 
    })
      .populate('itemId', 'name sku')
      .populate('fromLocationId', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 });

   // console.log('✅ [DISPOSAL-PENDING] Found', disposals.length, 'pending disposals');
    res.json(disposals);
  } catch (error) {
    console.error('💥 [DISPOSAL-PENDING] Failed to fetch pending disposals:', error);
    res.status(500).json({ error: 'Failed to fetch pending disposals' });
  }
};