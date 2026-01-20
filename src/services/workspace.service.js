const prisma = require('../config/database');
const { logger } = require('../utils/logger');
const redis = require('../config/redis');

class WorkspaceService {
  async createWorkspace(accountId, data) {
    // Verify account exists and user has access
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      throw new Error('Account not found');
    }

    try {
      const workspace = await prisma.workspace.create({
        data: {
          name: data.name,
          slug: data.slug,
          accountId,
        },
      });

      // Invalidate cache
      await redis.del(`workspace:${workspace.id}`);
      await redis.del(`workspaces:account:${accountId}`);

      return workspace;
    } catch (error) {
      // Handle Prisma unique constraint violation
      if (error.code === 'P2002') {
        if (error.meta && error.meta.target && error.meta.target.includes('slug')) {
          throw new Error(`A workspace with the slug "${data.slug}" already exists in this account`);
        }
        throw new Error('A workspace with these details already exists');
      }
      // Re-throw other errors
      throw error;
    }
  }

  async getWorkspaces(accountId) {
    const cacheKey = `workspaces:account:${accountId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const workspaces = await prisma.workspace.findMany({
      where: { accountId },
      include: {
        departments: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(workspaces));

    return workspaces;
  }

  async getWorkspaceById(workspaceId, accountId) {
    const cacheKey = `workspace:${workspaceId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        accountId,
      },
      include: {
        departments: {
          include: {
            teams: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        },
        workspaceUsers: {
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
      },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(workspace));

    return workspace;
  }

  async updateWorkspace(workspaceId, accountId, data) {
    const workspace = await prisma.workspace.updateMany({
      where: {
        id: workspaceId,
        accountId,
      },
      data,
    });

    if (workspace.count === 0) {
      throw new Error('Workspace not found');
    }

    // Invalidate cache
    await redis.del(`workspace:${workspaceId}`);
    await redis.del(`workspaces:account:${accountId}`);

    return this.getWorkspaceById(workspaceId, accountId);
  }

  async deleteWorkspace(workspaceId, accountId) {
    const workspace = await prisma.workspace.deleteMany({
      where: {
        id: workspaceId,
        accountId,
      },
    });

    if (workspace.count === 0) {
      throw new Error('Workspace not found');
    }

    // Invalidate cache
    await redis.del(`workspace:${workspaceId}`);
    await redis.del(`workspaces:account:${accountId}`);

    return { success: true };
  }

  async addUserToWorkspace(workspaceId, accountId, data, callerAccountRole) {
    // Verify workspace exists and belongs to account
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        accountId,
      },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify user belongs to same account
    const accountUser = await prisma.accountUser.findUnique({
      where: {
        userId_accountId: {
          userId: user.id,
          accountId,
        },
      },
    });

    if (!accountUser) {
      throw new Error('User does not belong to this account');
    }

    // Determine role: default to MEMBER, allow explicit role only if caller is ACCOUNT_ADMIN
    let role = 'MEMBER';
    
    if (data.role) {
      // Only ACCOUNT_ADMIN can set explicit role
      if (callerAccountRole !== 'ADMIN') {
        throw new Error('Only ACCOUNT_ADMIN can assign explicit roles');
      }
      role = data.role;
    }

    // Validate role
    if (role !== 'ADMIN' && role !== 'MEMBER') {
      throw new Error('Role must be ADMIN or MEMBER');
    }

    // Insert or update workspace_users
    try {
      const workspaceUser = await prisma.workspaceUser.upsert({
        where: {
          userId_workspaceId: {
            userId: user.id,
            workspaceId,
          },
        },
        create: {
          userId: user.id,
          workspaceId,
          role,
        },
        update: {
          role,
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
      await redis.del(`workspace:${workspaceId}`);
      await redis.del(`workspaces:account:${accountId}`);

      return workspaceUser;
    } catch (error) {
      logger.error('Error adding user to workspace:', error);
      throw new Error('Failed to add user to workspace');
    }
  }
}

module.exports = { WorkspaceService };

