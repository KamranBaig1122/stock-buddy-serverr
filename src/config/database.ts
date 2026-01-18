import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;
    if (!mongoURI) {
      throw new Error('MONGODB_URI environment variable is not set');
    }
    const dbName = 'stockbuddy';
    await mongoose.connect(mongoURI, {dbName});
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    // Don't exit - let the server start and show the error
    // The server can still respond to health checks
    throw error;
  }
};

export default connectDB;