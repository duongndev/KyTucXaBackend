import mongoose from 'mongoose';

const cleanDatabase = async () => {
    try {
        await mongoose.connect('mongodb+srv://nguyenduong18102002:2I2QrBTFjluTUZY3@database.j9o75.mongodb.net/KyTucXaDB?retryWrites=true&w=majority');
        await mongoose.connection.db.dropDatabase();
        console.log('Database dropped successfully');
    } catch (error) {
        console.error('Error dropping database:', error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
};

cleanDatabase();
