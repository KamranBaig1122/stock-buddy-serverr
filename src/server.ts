import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import connectDB from './config/database';

// Routes
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import itemRoutes from './routes/items';
import stockRoutes from './routes/stock';
import repairRoutes from './routes/repairs';
import disposalRoutes from './routes/disposals';
import locationRoutes from './routes/locations';
import userRoutes from './routes/users';
import transactionRoutes from './routes/transactions';

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to database
connectDB();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); // For base64 images
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/repairs', repairRoutes);
app.use('/api/disposals', disposalRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/users', userRoutes);
app.use('/api/transactions', transactionRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'StockBuddy Backend API is LIVE!',
    timestamp: new Date().toISOString(),
    status: 'Server Running',
    version: '1.0.0'
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});