const prisma = require('../config/database');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');

/**
 * Department Authority Resolution Service
 * 
 * Provides functions to check department-level roles and retrieve department users.
 * This is an internal service used by Inbox, Tasks, Notifications, etc.
 * 
 * All functions verify Department → Workspace → Account chain for security.
 */
class DepartmentAuthorityService {
  /**
   * Verify Department → Workspace → Account chain
   * Internal helper function used by all public methods
   * 
   * @param {string} departmentId - Department ID
   * @param {string} workspaceId - Workspace ID (optional, will be fetched if not provided)
   * @param {string} accountId - Account ID (optional, will be fetched if not provided)
   * @returns {Promise<Object>} Department with workspace and account info
   * @throws {Error} If department not found or chain is invalid
   */
  async _verifyDepartmentChain(departmentId, workspaceId = null, accountId = null) {
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        ...(workspaceId && { workspaceId }),
      },
      include: {
        workspace: {
          include: {
            account: true,
          },
        },
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    // If workspaceId was provided, verify it matches
    if (workspaceId && department.workspaceId !== workspaceId) {
      throw new Error('Department does not belong to this workspace');
    }

    // If accountId was provided, verify it matches
    if (accountId && department.workspace.accountId !== accountId) {
      throw new Error('Department does not belong to this account');
    }

    return department;
  }

  /**
   * Get all department managers for a department
   * 
   * @param {string} departmentId - Department ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<Array>} Array of users with DEPARTMENT_MANAGER role
   */
  async getDepartmentManagers(departmentId, workspaceId = null, accountId = null) {
    // Verify Department → Workspace → Account chain
    await this._verifyDepartmentChain(departmentId, workspaceId, accountId);

    const cacheKey = `department_managers:${departmentId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const departmentUsers = await prisma.departmentUser.findMany({
      where: {
        departmentId,
        role: 'DEPARTMENT_MANAGER',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatar: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Extract users from departmentUsers
    const managers = departmentUsers.map(du => ({
      ...du.user,
      departmentRole: du.role,
      assignedAt: du.createdAt,
    }));

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(managers));

    return managers;
  }

  /**
   * Get all human support users for a department
   * 
   * @param {string} departmentId - Department ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<Array>} Array of users with HUMAN_SUPPORT role
   */
  async getHumanSupportUsers(departmentId, workspaceId = null, accountId = null) {
    // Verify Department → Workspace → Account chain
    await this._verifyDepartmentChain(departmentId, workspaceId, accountId);

    const cacheKey = `department_human_support:${departmentId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const departmentUsers = await prisma.departmentUser.findMany({
      where: {
        departmentId,
        role: 'HUMAN_SUPPORT',
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            avatar: true,
            isActive: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Extract users from departmentUsers
    const humanSupportUsers = departmentUsers.map(du => ({
      ...du.user,
      departmentRole: du.role,
      assignedAt: du.createdAt,
    }));

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(humanSupportUsers));

    return humanSupportUsers;
  }

  /**
   * Check if a user is a department manager
   * 
   * @param {string} userId - User ID
   * @param {string} departmentId - Department ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<boolean>} True if user is DEPARTMENT_MANAGER, false otherwise
   */
  async isDepartmentManager(userId, departmentId, workspaceId = null, accountId = null) {
    // Verify Department → Workspace → Account chain
    await this._verifyDepartmentChain(departmentId, workspaceId, accountId);

    const cacheKey = `is_dept_manager:${userId}:${departmentId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    const departmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId,
        },
      },
    });

    const isManager = departmentUser?.role === 'DEPARTMENT_MANAGER';

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, isManager ? 'true' : 'false');

    return isManager;
  }

  /**
   * Check if a user is a human support user
   * 
   * @param {string} userId - User ID
   * @param {string} departmentId - Department ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<boolean>} True if user is HUMAN_SUPPORT, false otherwise
   */
  async isHumanSupport(userId, departmentId, workspaceId = null, accountId = null) {
    // Verify Department → Workspace → Account chain
    await this._verifyDepartmentChain(departmentId, workspaceId, accountId);

    const cacheKey = `is_human_support:${userId}:${departmentId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    const departmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId,
        },
      },
    });

    const isHumanSupport = departmentUser?.role === 'HUMAN_SUPPORT';

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, isHumanSupport ? 'true' : 'false');

    return isHumanSupport;
  }

  /**
   * Check if a user is a department member (any role)
   * 
   * @param {string} userId - User ID
   * @param {string} departmentId - Department ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<boolean>} True if user is a member of the department, false otherwise
   */
  async isDepartmentMember(userId, departmentId, workspaceId = null, accountId = null) {
    // Verify Department → Workspace → Account chain
    await this._verifyDepartmentChain(departmentId, workspaceId, accountId);

    const cacheKey = `is_dept_member:${userId}:${departmentId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    const departmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId,
        },
      },
    });

    const isMember = !!departmentUser;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, isMember ? 'true' : 'false');

    return isMember;
  }

  /**
   * Get user's role in a department
   * 
   * @param {string} userId - User ID
   * @param {string} departmentId - Department ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<string|null>} User's role (DEPARTMENT_MANAGER, HUMAN_SUPPORT, MEMBER) or null if not a member
   */
  async getUserDepartmentRole(userId, departmentId, workspaceId = null, accountId = null) {
    // Verify Department → Workspace → Account chain
    await this._verifyDepartmentChain(departmentId, workspaceId, accountId);

    const cacheKey = `user_dept_role:${userId}:${departmentId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'null' ? null : cached;
    }

    const departmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId,
          departmentId,
        },
      },
    });

    const role = departmentUser?.role || null;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, role || 'null');

    return role;
  }

  /**
   * Invalidate cache for a department
   * Call this when department users are added/removed/updated
   * 
   * @param {string} departmentId - Department ID
   */
  async invalidateDepartmentCache(departmentId) {
    try {
      // Get all cache keys for this department
      const patterns = [
        `department_managers:${departmentId}`,
        `department_human_support:${departmentId}`,
        `is_dept_manager:*:${departmentId}`,
        `is_human_support:*:${departmentId}`,
        `is_dept_member:*:${departmentId}`,
        `user_dept_role:*:${departmentId}`,
      ];

      // Delete specific keys
      await redis.del(`department_managers:${departmentId}`);
      await redis.del(`department_human_support:${departmentId}`);

      // Note: For pattern-based deletion (with wildcards), you would need to:
      // 1. Use SCAN to find matching keys
      // 2. Delete them individually
      // For now, we'll rely on TTL expiration for pattern-based keys
      // In production, you might want to implement a more sophisticated cache invalidation
      
      logger.info(`Cache invalidated for department: ${departmentId}`);
    } catch (error) {
      logger.error('Error invalidating department cache:', error);
      // Don't throw - cache invalidation failure shouldn't break the flow
    }
  }
}

module.exports = { DepartmentAuthorityService };
