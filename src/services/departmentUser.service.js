const prisma = require('../config/database');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');

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
        workspace: true,
      },
    });

    if (!department) {
      throw new Error('Department not found or does not belong to this workspace');
    }

    if (department.workspace.accountId !== accountId) {
      throw new Error('Department does not belong to this account');
    }

    // Verify caller has permission
    // Allowed: ACCOUNT_ADMIN, WORKSPACE_ADMIN, DEPARTMENT_MANAGER (for their own department)
    let hasPermission = false;

    if (callerInfo.accountRole === 'ADMIN') {
      hasPermission = true;
    }

    if (!hasPermission && callerInfo.workspaceRole === 'ADMIN') {
      hasPermission = true;
    }

    // Check if caller is DEPARTMENT_MANAGER of this specific department
    if (!hasPermission) {
      const callerDepartmentUser = await prisma.departmentUser.findUnique({
        where: {
          userId_departmentId: {
            userId: callerInfo.userId,
            departmentId: departmentId,
          },
        },
      });

      if (callerDepartmentUser && callerDepartmentUser.role === 'DEPARTMENT_MANAGER') {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions. Only ACCOUNT_ADMIN, WORKSPACE_ADMIN, or DEPARTMENT_MANAGER can add users to departments');
    }

    // Find user by userId (must be existing user)
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify target user belongs to the same workspace (via workspace_users)
    const workspaceUser = await prisma.workspaceUser.findUnique({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: workspaceId,
        },
      },
    });

    if (!workspaceUser) {
      throw new Error('User does not belong to this workspace. User must be added to workspace first');
    }

    // Validate role
    if (data.role !== 'DEPARTMENT_MANAGER' && data.role !== 'HUMAN_SUPPORT' && data.role !== 'MEMBER') {
      throw new Error('Role must be DEPARTMENT_MANAGER, HUMAN_SUPPORT, or MEMBER');
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

    // Add user to department
    try {
      const departmentUser = await prisma.departmentUser.create({
        data: {
          userId: user.id,
          departmentId: departmentId,
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

      return departmentUser;
    } catch (error) {
      // Handle Prisma unique constraint violation
      if (error.code === 'P2002') {
        throw new Error('User is already assigned to this department');
      }
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

    // Verify caller has permission
    // Allowed: ACCOUNT_ADMIN, WORKSPACE_ADMIN, DEPARTMENT_MANAGER (for their own department)
    let hasPermission = false;

    if (callerInfo.accountRole === 'ADMIN') {
      hasPermission = true;
    }

    if (!hasPermission && callerInfo.workspaceRole === 'ADMIN') {
      hasPermission = true;
    }

    // Check if caller is DEPARTMENT_MANAGER of this specific department
    if (!hasPermission) {
      const callerDepartmentUser = await prisma.departmentUser.findUnique({
        where: {
          userId_departmentId: {
            userId: callerInfo.userId,
            departmentId: departmentId,
          },
        },
      });

      if (callerDepartmentUser && callerDepartmentUser.role === 'DEPARTMENT_MANAGER') {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions. Only ACCOUNT_ADMIN, WORKSPACE_ADMIN, or DEPARTMENT_MANAGER can update department user roles');
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

    // Verify caller has permission
    // Allowed: ACCOUNT_ADMIN, WORKSPACE_ADMIN, DEPARTMENT_MANAGER (for their own department)
    let hasPermission = false;

    if (callerInfo.accountRole === 'ADMIN') {
      hasPermission = true;
    }

    if (!hasPermission && callerInfo.workspaceRole === 'ADMIN') {
      hasPermission = true;
    }

    // Check if caller is DEPARTMENT_MANAGER of this specific department
    if (!hasPermission) {
      const callerDepartmentUser = await prisma.departmentUser.findUnique({
        where: {
          userId_departmentId: {
            userId: callerInfo.userId,
            departmentId: departmentId,
          },
        },
      });

      if (callerDepartmentUser && callerDepartmentUser.role === 'DEPARTMENT_MANAGER') {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions. Only ACCOUNT_ADMIN, WORKSPACE_ADMIN, or DEPARTMENT_MANAGER can remove users from departments');
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
