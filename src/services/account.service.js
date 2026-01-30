const prisma = require('../config/database');
const { logger } = require('../utils/logger');
const redis = require('../config/redis');
const { InvitationService } = require('./invitation.service');

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
      await redis.del(`accounts:owner:${appOwnerId}`);

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

  async getAccounts(userId, isAppOwner = false) {
    const cacheKey = isAppOwner ? `accounts:owner:${userId}` : `accounts:user:${userId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let accounts;
    if (isAppOwner) {
      accounts = await prisma.account.findMany({
        where: { appOwnerId: userId },
        include: { _count: { select: { workspaces: true, accountUsers: true } } },
        orderBy: { createdAt: 'desc' },
      });
    } else {
      // Find accounts where user is a member/admin
      accounts = await prisma.account.findMany({
        where: {
          accountUsers: {
            some: {
              userId: userId,
              status: 'ACTIVE'
            }
          }
        },
        include: { _count: { select: { workspaces: true, accountUsers: true } } },
        orderBy: { createdAt: 'desc' },
      });
    }

    const result = accounts.map(account => ({
      ...account,
      userCount: account._count.accountUsers,
      workspaceCount: account._count.workspaces,
      _count: undefined,
    }));

    await redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }

  async getAccountById(accountId, userId, isAppOwner = false) {
    const cacheKey = `account:${accountId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    // Note: We might need to verify access even if cached, but for now assuming if they have ID they can try to view
    // Actually, safest is to query DB to verify ownership/membership unless we cache permissions separately.
    // Let's rely on DB query for security here.

    const whereClause = { id: accountId };
    if (isAppOwner) {
      whereClause.appOwnerId = userId;
    } else {
      whereClause.accountUsers = {
        some: {
          userId: userId,
          status: 'ACTIVE' // Or allow viewing if invited? usually active.
        }
      };
    }

    const account = await prisma.account.findFirst({
      where: whereClause,
      include: {
        workspaces: true,
        accountUsers: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
        _count: { select: { workspaces: true, accountUsers: true } },
      },
    });

    if (!account) {
      // If not found, it might exist but they don't have access. 
      // To be safe/secure, we just say not found.
      throw new Error('Account not found');
    }

    const result = {
      ...account,
      userCount: account._count.accountUsers,
      workspaceCount: account._count.workspaces,
      _count: undefined,
    };

    return result;
  }

  async updateAccount(accountId, userId, data, isAppOwner = false) {
    // Verify access
    const whereClause = { id: accountId };

    if (isAppOwner) {
      whereClause.appOwnerId = userId;
    } else {
      // Check if user is ACCOUNT_ADMIN
      whereClause.accountUsers = {
        some: {
          userId: userId,
          role: 'ADMIN',
          status: 'ACTIVE'
        }
      };
    }

    const account = await prisma.account.findFirst({ where: whereClause });

    if (!account) {
      throw new Error('Account not found or insufficient permissions');
    }

    // Validate slug uniqueness if changing
    if (data.slug && data.slug !== account.slug) {
      const existing = await prisma.account.findUnique({ where: { slug: data.slug } });
      if (existing) throw new Error('Account slug already taken');
    }

    const updated = await prisma.account.update({
      where: { id: accountId },
      data: {
        name: data.name,
        slug: data.slug,
      },
    });

    await redis.del(`account:${accountId}`);
    if (isAppOwner) await redis.del(`accounts:owner:${userId}`);
    // We would also need to invalidate cache for other users, simplified for now

    return updated;
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
    await redis.del(`accounts:owner:${appOwnerId}`); // Updated cache key

    return { success: true };
  }

  async inviteUserToAccount(accountId, inviterId, data, isAppOwner = false) {
    // Verify permissions
    const whereClause = { id: accountId };
    if (isAppOwner) {
      whereClause.appOwnerId = inviterId;
    } else {
      whereClause.accountUsers = {
        some: {
          userId: inviterId,
          role: 'ADMIN',
          status: 'ACTIVE'
        }
      };
    }

    const account = await prisma.account.findFirst({ where: whereClause });
    if (!account) throw new Error('Account not found or insufficient permissions');

    const { email, role } = data;

    // Check if user is already in account
    const existingMember = await prisma.accountUser.findFirst({
      where: {
        accountId,
        email,
      }
    });

    if (existingMember) {
      throw new Error('User is already a member or invited to this account');
    }

    const invitationService = new InvitationService();

    // Check if User exists (System-wide)
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      // --- DIRECT ADD FLOW (Existing User) ---
      // Add as ACTIVE immediately
      const accountUser = await prisma.accountUser.create({
        data: {
          userId: existingUser.id,
          email,
          accountId,
          role: role || 'MEMBER',
          status: 'ACTIVE'
        },
        include: { user: true }
      });

      // Send Allocation Email (No Token)
      try {
        await invitationService.sendAllocationEmail(email, {
          type: 'ACCOUNT',
          entityName: account.name,
          accountName: account.name,
          role: role || 'MEMBER',
        });
      } catch (e) {
        logger.error('Failed to send allocation email', e);
      }

      // Invalidate caches
      await redis.del(`account:${accountId}`);
      await redis.del(`accounts:user:${existingUser.id}`);

      return accountUser;

    } else {
      // --- INVITATION FLOW (New User) ---
      // Create Invitation (Token based)
      const invitation = await invitationService.createInvitation({
        email,
        accountId,
        invitedByUserId: isAppOwner ? null : inviterId,
        invitedByAppOwnerId: isAppOwner ? inviterId : null,
        scope: 'ACCOUNT',
        role: role || 'MEMBER',
      });

      const accountUser = await prisma.accountUser.create({
        data: {
          email,
          accountId,
          role: role || 'MEMBER',
          status: 'INVITED',
          invitationId: invitation.id
        },
        include: {
          invitation: { select: { id: true, email: true, status: true, expiresAt: true } }
        }
      });

      // Send Invitation Email (With Token)
      try {
        const invitationUrl = await invitationService.sendInvitationEmail(invitation, { accountName: account.name });
        accountUser.invitation.invitationUrl = invitationUrl;
      } catch (e) {
        logger.error('Failed to send invitation email', e);
      }

      // Invalidate caches (Account only, User doesn't exist yet)
      await redis.del(`account:${accountId}`);

      return accountUser;
    }
  }

  async getInvitations(userId, isAppOwner = false, accountId = null) {
    const where = {};

    if (accountId) {
      where.accountId = accountId;
    }

    if (isAppOwner) {
      where.invitedByAppOwnerId = userId;
    } else {
      where.invitedByUserId = userId;
    }

    where.status = 'INVITED';

    const invitations = await prisma.invitation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        account: { select: { name: true } },
      }
    });

    return invitations;
  }
}

module.exports = { AccountService };

