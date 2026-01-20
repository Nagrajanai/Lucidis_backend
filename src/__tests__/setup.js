const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Clean up after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';

