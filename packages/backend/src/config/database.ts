import mongoose from 'mongoose'

export async function connectDatabase() {
  try {
    // Load MONGODB_URI inside the function to ensure dotenv is loaded first
    const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/slider'

    // Log masked URI for debugging
    const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@')
    console.log('Connecting to MongoDB:', maskedUri)

    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected')
})

mongoose.connection.on('error', (err) => {
  console.error('MongoDB error:', err)
})
