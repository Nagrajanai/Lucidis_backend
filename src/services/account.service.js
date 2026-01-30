const prisma = require('../config/database');
const { logger } = require('../utils/logger');
const redis = require('../config/redis');

class AccountService {
  async createAccount(appOwnerId, data) {
    try {
      const account = await prisma.account.create({
        data: {
          name: data.name,
          slug: data.slug,
          appOwnerId: appOwnerId,
        },
      });

      // Invalidate cache
      await redis.del(`account:${account.id}`);
      await redis.del(`accounts:appOwner:${appOwnerId}`);

      return account;
    } catch (error) {
      // Handle Prisma unique constraint violation
      if (error.code === 'P2002') {
        if (error.meta && error.meta.target && error.meta.target.includes('slug')) {
          throw new Error(`An account with the slug "${data.slug}" already exists`);
        }
        throw new Error('An account with these details already exists');
      }
      // Re-throw other errors
      throw error;
    }
  }

  async getAccounts(appOwnerId) {
    const cacheKey = `accounts:appOwner:${appOwnerId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const accounts = await prisma.account.findMany({
      where: { appOwnerId: appOwnerId },
      include: {
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        _count: {
          select: {
            workspaces: true,
            accountUsers: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Transform the response to include counts
    const accountsWithCounts = accounts.map(account => ({
      ...account,
      userCount: account._count.accountUsers,
      workspaceCount: account._count.workspaces,
      _count: undefined, // Remove the _count field from response
    }));

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(accountsWithCounts));

    return accountsWithCounts;
  }

  async getAccountById(accountId, appOwnerId) {
    const cacheKey = `account:${accountId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        appOwnerId: appOwnerId,
      },
      include: {
        workspaces: true,
        accountUsers: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        _count: {
          select: {
            workspaces: true,
            accountUsers: true,
          },
        },
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Add counts to the response
    const accountWithCounts = {
      ...account,
      userCount: account._count.accountUsers,
      workspaceCount: account._count.workspaces,
      _count: undefined, // Remove the _count field from response
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(accountWithCounts));

    return accountWithCounts;
  }

  async updateAccount(accountId, appOwnerId, data) {
    const account = await prisma.account.updateMany({
      where: {
        id: accountId,
        appOwnerId: appOwnerId,
      },
      data,
    });

    if (account.count === 0) {
      throw new Error('Account not found');
    }

    // Invalidate cache
    await redis.del(`account:${accountId}`);
    await redis.del(`accounts:appOwner:${appOwnerId}`);

    return this.getAccountById(accountId, appOwnerId);
  }

  async deleteAccount(accountId, appOwnerId) {
    const account = await prisma.account.deleteMany({
      where: {
        id: accountId,
        appOwnerId: appOwnerId,
      },
    });

    if (account.count === 0) {
      throw new Error('Account not found');
    }

    // Invalidate cache
    await redis.del(`account:${accountId}`);
    await redis.del(`accounts:appOwner:${appOwnerId}`);

    return { success: true };
  }

  async inviteUserToAccount(accountId, appOwnerId, data) {
    // Verify account exists and belongs to AppOwner
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        appOwnerId: appOwnerId,
      },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    // Find user by email (must be existing user)
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Check if user is already assigned to this account
    const existingAccountUser = await prisma.accountUser.findUnique({
      where: {
        userId_accountId: {
          userId: user.id,
          accountId: accountId,
        },
      },
    });

    if (existingAccountUser) {
      throw new Error('User is already assigned to this account');
    }

    // Validate role
    if (data.role !== 'ADMIN' && data.role !== 'MEMBER') {
      throw new Error('Role must be ADMIN or MEMBER');
    }

    // Create account user assignment
    const accountUser = await prisma.accountUser.create({
      data: {
        userId: user.id,
        accountId: accountId,
        role: data.role,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    // Invalidate cache
    await redis.del(`account:${accountId}`);
    await redis.del(`accounts:appOwner:${appOwnerId}`);

    return accountUser;
  }
}

module.exports = { AccountService };

