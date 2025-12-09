import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import Location from '../models/Location';

export const createLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { name, address } = req.body;
    
    const location = new Location({
      name,
      address,
      createdBy: req.user?._id
    });

    await location.save();
    res.status(201).json({ message: 'Location created successfully', location });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Location name already exists' });
    }
    res.status(500).json({ error: 'Failed to create location' });
  }
};

export const getLocations = async (req: AuthRequest, res: Response) => {
  try {
    const locations = await Location.find({ isActive: true })
      .populate('createdBy', 'name')
      .sort({ name: 1 });

    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
};

export const updateLocation = async (req: AuthRequest, res: Response) => {
  try {
    const { name, address, isActive } = req.body;
    
    const location = await Location.findByIdAndUpdate(
      req.params.id,
      { name, address, isActive },
      { new: true }
    );

    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }

    res.json({ message: 'Location updated successfully', location });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update location' });
  }
};