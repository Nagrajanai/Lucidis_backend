const prisma = require('../config/database');
const { DepartmentAuthorityService } = require('./departmentAuthority.service');

/**
 * Inbox Query Service
 *
 * Provides read-only inbox views by classifying conversations according to PRD requirements.
 * This is derived data, never persisted.
 *
 * PRD References:
 * - §3 Unified Inbox & Conversation Management
 * - §18 Collaboration Features (Escalation Inbox)
 * - Phase 1 Foundation Deliverable
 *
 * Inbox types:
 * - UNASSIGNED: state != CLOSED, assignedUserId IS NULL, user has visibility
 * - ASSIGNED_TO_ME: assignedUserId === currentUser.id, state != CLOSED
 * - ESCALATED: state === ESCALATED, visible ONLY to users with HUMAN_SUPPORT role in the department
 * - CLOSED: state === CLOSED
 *
 * TODO(PRD §15): Team-based inbox will be introduced after routing & assignment schema is finalized
 */
class InboxQueryService {
  constructor() {
    this.departmentAuthorityService = new DepartmentAuthorityService();
  }

  /**
   * Get UNASSIGNED inbox conversations
   * Rules:
   * - state != CLOSED
   * - assignedUserId IS NULL
   * - user has visibility via existing authority services
   *
   * @param {string} userId - Current user ID
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array>} Array of conversations
   */
  async getUnassignedInbox(userId, workspaceId) {
    // Verify user belongs to workspace
    await this._verifyUserInWorkspace(userId, workspaceId);

    // Get user's departments for visibility checks
    const userDepartments = await this._getUserDepartments(userId, workspaceId);

    if (userDepartments.length === 0) {
      return [];
    }

    const departmentIds = userDepartments.map(d => d.id);

    // Build query for unassigned conversations
    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId,
        status: { not: 'CLOSED' },
        assignedUserId: null,
        workspace: {
          departments: {
            some: {
              id: { in: departmentIds }
            }
          }
        }
      },
      include: this._getConversationInclude(),
      orderBy: { statusUpdatedAt: 'desc' },
    });

    return conversations;
  }

  /**
   * Get ASSIGNED_TO_ME inbox conversations
   * Rules:
   * - assignedUserId === currentUser.id
   * - state != CLOSED
   *
   * @param {string} userId - Current user ID
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array>} Array of conversations
   */
  async getAssignedToMeInbox(userId, workspaceId) {
    // Verify user belongs to workspace
    await this._verifyUserInWorkspace(userId, workspaceId);

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId,
        assignedUserId: userId,
        status: { not: 'CLOSED' },
      },
      include: this._getConversationInclude(),
      orderBy: { statusUpdatedAt: 'desc' },
    });

    return conversations;
  }

  /**
   * Get ESCALATED inbox conversations
   * Rules:
   * - state === ESCALATED
   * - visible ONLY to users with HUMAN_SUPPORT role in the department
   *
   * @param {string} userId - Current user ID
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array>} Array of conversations
   */
  async getEscalatedInbox(userId, workspaceId) {
    // Verify user belongs to workspace
    await this._verifyUserInWorkspace(userId, workspaceId);

    // Get departments where user has HUMAN_SUPPORT role
    const humanSupportDepartments = await this._getHumanSupportDepartments(userId, workspaceId);

    if (humanSupportDepartments.length === 0) {
      return [];
    }

    const departmentIds = humanSupportDepartments.map(d => d.id);

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId,
        status: 'ESCALATED',
        workspace: {
          departments: {
            some: {
              id: { in: departmentIds }
            }
          }
        }
      },
      include: this._getConversationInclude(),
      orderBy: { statusUpdatedAt: 'desc' },
    });

    return conversations;
  }

  /**
   * Get CLOSED inbox conversations
   * Rules:
   * - state === CLOSED
   * - user has visibility via department membership
   *
   * @param {string} userId - Current user ID
   * @param {string} workspaceId - Workspace ID
   * @returns {Promise<Array>} Array of conversations
   */
  async getClosedInbox(userId, workspaceId) {
    // Verify user belongs to workspace
    await this._verifyUserInWorkspace(userId, workspaceId);

    // Get user's departments for visibility checks
    const userDepartments = await this._getUserDepartments(userId, workspaceId);

    if (userDepartments.length === 0) {
      return [];
    }

    const departmentIds = userDepartments.map(d => d.id);

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId,
        status: 'CLOSED',
        workspace: {
          departments: {
            some: {
              id: { in: departmentIds }
            }
          }
        }
      },
      include: this._getConversationInclude(),
      orderBy: { statusUpdatedAt: 'desc' },
    });

    return conversations;
  }

  /**
   * Get standard conversation include object for queries
   * @private
   */
  _getConversationInclude() {
    return {
      contact: {
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
        },
      },
      assignedUser: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          avatar: true,
        },
      },
      messages: {
        take: 1,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          body: true,
          fromEmail: true,
          createdAt: true,
          isRead: true,
        },
      },
    };
  }

  /**
   * Verify user belongs to workspace
   * @private
   */
  async _verifyUserInWorkspace(userId, workspaceId) {
    const workspaceUser = await prisma.workspaceUser.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!workspaceUser) {
      throw new Error('User does not belong to this workspace');
    }
  }

  /**
   * Get departments where user is a member
   * @private
   */
  async _getUserDepartments(userId, workspaceId) {
    const departmentUsers = await prisma.departmentUser.findMany({
      where: { userId },
      include: {
        department: {
          where: { workspaceId },
          select: {
            id: true,
            name: true,
            workspaceId: true,
          },
        },
      },
    });

    const departments = departmentUsers
      .map(du => du.department)
      .filter(dept => dept !== null);

    return departments;
  }

  /**
   * Get departments where user has HUMAN_SUPPORT role
   * @private
   */
  async _getHumanSupportDepartments(userId, workspaceId) {
    const departmentUsers = await prisma.departmentUser.findMany({
      where: {
        userId,
        role: 'HUMAN_SUPPORT',
      },
      include: {
        department: {
          where: { workspaceId },
          select: {
            id: true,
            name: true,
            workspaceId: true,
          },
        },
      },
    });

    const departments = departmentUsers
      .map(du => du.department)
      .filter(dept => dept !== null);

    return departments;
  }
}

module.exports = { InboxQueryService };