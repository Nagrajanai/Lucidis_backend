const request = require('supertest');
const app = require('../app');
const prisma = require('../config/database');

describe('Auth API', () => {
  let testUser;

  beforeAll(() => {
    testUser = {
      email: 'test@example.com',
      password: 'TestPassword123!',
    };
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: { email: testUser.email },
    });
    await prisma.$disconnect();
  });

  describe('POST /api/v1/auth/register/user', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register/user')
        .send({
          email: testUser.email,
          password: testUser.password,
          firstName: 'Test',
          lastName: 'User',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toHaveProperty('id');
      expect(response.body.data.user.email).toBe(testUser.email);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should not register duplicate email', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register/user')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.tokens).toHaveProperty('accessToken');
      expect(response.body.data.tokens).toHaveProperty('refreshToken');
    });

    it('should not login with invalid credentials', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword',
        })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});

