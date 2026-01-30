const prisma = require('../config/database');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');
const { InvitationService } = require('./invitation.service');

class DepartmentUserService {
  /**
   * Add user to department
   * Verifies: Department → Workspace → Account chain, user exists, user belongs to workspace
   */
  async addUserToDepartment(departmentId, workspaceId, accountId, data, callerInfo) {
    // Verify Department → Workspace → Account chain
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
      include: {
        workspace: {
          include: {
            account: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!department) {
      throw new Error('Department not found or does not belong to this workspace');
    }

    if (department.workspace.accountId !== accountId) {
      throw new Error('Department does not belong to this account');
    }

    // Check if caller is WORKSPACE_ADMIN or APP_OWNER
    let hasPermission = false;
    if (callerInfo.workspaceRole === 'ADMIN' || callerInfo.isAppOwner) {
      hasPermission = true;
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions. Only WORKSPACE_ADMIN can add users to departments');
    }

    // Validate role
    if (data.role !== 'DEPARTMENT_MANAGER' && data.role !== 'HUMAN_SUPPORT' && data.role !== 'MEMBER') {
      throw new Error('Role must be DEPARTMENT_MANAGER, HUMAN_SUPPORT, or MEMBER');
    }

    // Verify user exists and is active in workspace
    let user = null;

    if (data.userId) {
      user = await prisma.user.findUnique({ where: { id: data.userId } });
    } else if (data.email) {
      user = await prisma.user.findUnique({ where: { email: data.email } });
    } else {
      throw new Error('Either userId or email is required');
    }

    if (!user) {
      throw new Error('User not found. User must be added to the Workspace first.');
    }

    // Verify workspace membership
    const workspaceUser = await prisma.workspaceUser.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: workspaceId,
        },
      },
    });

    if (!workspaceUser || workspaceUser.status !== 'ACTIVE') {
      throw new Error('User is not an active member of this workspace. Add to workspace first.');
    }

    // Check if user is already in this department
    const existingDepartmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId: user.id,
          departmentId: departmentId,
        },
      },
    });

    if (existingDepartmentUser) {
      throw new Error('User is already assigned to this department');
    }

    // Direct Add (Admin Action)
    try {
      const departmentUser = await prisma.departmentUser.create({
        data: {
          userId: user.id,
          departmentId: departmentId,
          role: data.role,
          status: 'ACTIVE',
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
          department: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      // Invalidate cache
      await redis.del(`department:${departmentId}`);
      await redis.del(`department_users:department:${departmentId}`);

      // Send notification email
      try {
        const invitationService = new InvitationService();
        await invitationService.sendAllocationEmail(user.email, {
          type: 'DEPARTMENT',
          entityName: department.name,
          accountName: department.workspace.account.name,
          role: data.role,
        });
      } catch (emailError) {
        logger.error('Failed to send assignment email:', emailError);
      }

      return departmentUser;
    } catch (error) {
      logger.error('Error adding user to department:', error);
      throw new Error('Failed to add user to department');
    }
  }

  /**
   * Update department user role
   * Verifies: Department → Workspace → Account chain, user exists in department
   */
  async updateDepartmentUserRole(departmentId, userId, workspaceId, accountId, data, callerInfo) {
    // Verify Department → Workspace → Account chain
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
      include: {
        workspace: true,
      },
    });

    if (!department) {
      throw new Error('Department not found or does not belong to this workspace');
    }

    if (department.workspace.accountId !== accountId) {
      throw new Error('Department does not belong to this account');
    }

    // Check if caller is WORKSPACE_ADMIN or APP_OWNER
    let hasPermission = false;
    if (callerInfo.workspaceRole === 'ADMIN' || callerInfo.isAppOwner) {
      hasPermission = true;
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions. Only WORKSPACE_ADMIN can update department user roles');
    }

    // Verify user exists in this department
    const departmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId: userId,
          departmentId: departmentId,
        },
      },
    });

    if (!departmentUser) {
      throw new Error('User is not assigned to this department');
    }

    // Validate role
    if (data.role !== 'DEPARTMENT_MANAGER' && data.role !== 'HUMAN_SUPPORT' && data.role !== 'MEMBER') {
      throw new Error('Role must be DEPARTMENT_MANAGER, HUMAN_SUPPORT, or MEMBER');
    }

    // Update role
    try {
      const updated = await prisma.departmentUser.update({
        where: {
          userId_departmentId: {
            userId: userId,
            departmentId: departmentId,
          },
        },
        data: {
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
          department: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      // Invalidate cache
      await redis.del(`department:${departmentId}`);
      await redis.del(`department_users:department:${departmentId}`);

      return updated;
    } catch (error) {
      logger.error('Error updating department user role:', error);
      throw new Error('Failed to update department user role');
    }
  }

  /**
   * Remove user from department
   * Verifies: Department → Workspace → Account chain, user exists in department
   */
  async removeUserFromDepartment(departmentId, userId, workspaceId, accountId, callerInfo) {
    // Verify Department → Workspace → Account chain
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
      include: {
        workspace: true,
      },
    });

    if (!department) {
      throw new Error('Department not found or does not belong to this workspace');
    }

    if (department.workspace.accountId !== accountId) {
      throw new Error('Department does not belong to this account');
    }

    // Check if caller is WORKSPACE_ADMIN or APP_OWNER
    let hasPermission = false;
    if (callerInfo.workspaceRole === 'ADMIN' || callerInfo.isAppOwner) {
      hasPermission = true;
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions. Only WORKSPACE_ADMIN can remove users from departments');
    }

    // Verify user exists in this department
    const departmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId: userId,
          departmentId: departmentId,
        },
      },
    });

    if (!departmentUser) {
      throw new Error('User is not assigned to this department');
    }

    // Remove user from department
    try {
      await prisma.departmentUser.delete({
        where: {
          userId_departmentId: {
            userId: userId,
            departmentId: departmentId,
          },
        },
      });

      // Invalidate cache
      await redis.del(`department:${departmentId}`);
      await redis.del(`department_users:department:${departmentId}`);

      return { success: true };
    } catch (error) {
      logger.error('Error removing user from department:', error);
      throw new Error('Failed to remove user from department');
    }
  }

  /**
   * List department users
   * Verifies: Department → Workspace chain
   * Read access: Any workspace member
   */
  async getDepartmentUsers(departmentId, workspaceId) {
    // Verify department belongs to workspace
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
    });

    if (!department) {
      throw new Error('Department not found or does not belong to this workspace');
    }

    const cacheKey = `department_users:department:${departmentId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const departmentUsers = await prisma.departmentUser.findMany({
      where: {
        departmentId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(departmentUsers));

    return departmentUsers;
  }
}

module.exports = { DepartmentUserService };
