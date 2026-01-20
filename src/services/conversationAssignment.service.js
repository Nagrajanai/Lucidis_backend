const prisma = require('../config/database');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');

/**
 * Conversation Assignment Service
 * 
 * Provides functions to assign and manage conversation ownership.
 * This is an internal service used by Inbox, Escalation, and Message send flow.
 * 
 * All functions verify Conversation → Workspace → Account chain for security.
 * This is a foundation layer - no routing or escalation logic yet.
 */
class ConversationAssignmentService {
  /**
   * Verify Conversation → Workspace → Account chain
   * Internal helper function used by all public methods
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, will be fetched if not provided)
   * @param {string} accountId - Account ID (optional, will be fetched if not provided)
   * @returns {Promise<Object>} Conversation with workspace and account info
   * @throws {Error} If conversation not found or chain is invalid
   */
  async _verifyConversationChain(conversationId, workspaceId = null, accountId = null) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
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

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    // If workspaceId was provided, verify it matches
    if (workspaceId && conversation.workspaceId !== workspaceId) {
      throw new Error('Conversation does not belong to this workspace');
    }

    // If accountId was provided, verify it matches
    if (accountId && conversation.workspace.accountId !== accountId) {
      throw new Error('Conversation does not belong to this account');
    }

    return conversation;
  }

  /**
   * Verify user belongs to workspace
   * Internal helper function
   * 
   * @param {string} userId - User ID
   * @param {string} workspaceId - Workspace ID
   * @throws {Error} If user does not belong to workspace
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
   * Assign a conversation to a user
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} userId - User ID to assign to
   * @param {string} workspaceId - Workspace ID (for verification)
   * @param {string} accountId - Account ID (for verification)
   * @returns {Promise<Object>} Updated conversation with assigned user
   * @throws {Error} If conversation not found, user not in workspace, or chain invalid
   */
  async assignConversationToUser(conversationId, userId, workspaceId, accountId) {
    // Verify Conversation → Workspace → Account chain
    await this._verifyConversationChain(conversationId, workspaceId, accountId);

    // Verify user belongs to workspace
    await this._verifyUserInWorkspace(userId, workspaceId);

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Update conversation assignment
    try {
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          assignedUserId: userId,
          assignedAt: new Date(),
        },
        include: {
          assignedUser: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
          contact: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // Invalidate cache
      await this._invalidateConversationCache(conversationId, workspaceId);

      logger.info(`Conversation ${conversationId} assigned to user ${userId}`);

      return updatedConversation;
    } catch (error) {
      logger.error('Error assigning conversation:', error);
      throw new Error('Failed to assign conversation to user');
    }
  }

  /**
   * Unassign a conversation (remove assignment)
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (for verification)
   * @param {string} accountId - Account ID (for verification)
   * @returns {Promise<Object>} Updated conversation
   * @throws {Error} If conversation not found or chain invalid
   */
  async unassignConversation(conversationId, workspaceId, accountId) {
    // Verify Conversation → Workspace → Account chain
    await this._verifyConversationChain(conversationId, workspaceId, accountId);

    // Update conversation to remove assignment
    try {
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          assignedUserId: null,
          assignedAt: null,
        },
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      // Invalidate cache
      await this._invalidateConversationCache(conversationId, workspaceId);

      logger.info(`Conversation ${conversationId} unassigned`);

      return updatedConversation;
    } catch (error) {
      logger.error('Error unassigning conversation:', error);
      throw new Error('Failed to unassign conversation');
    }
  }

  /**
   * Check if a conversation is assigned to any user
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<boolean>} True if conversation is assigned, false otherwise
   * @throws {Error} If conversation not found or chain invalid
   */
  async isConversationAssigned(conversationId, workspaceId = null, accountId = null) {
    // Verify Conversation → Workspace → Account chain
    const conversation = await this._verifyConversationChain(conversationId, workspaceId, accountId);

    const cacheKey = `conversation_assigned:${conversationId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    const isAssigned = !!conversation.assignedUserId;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, isAssigned ? 'true' : 'false');

    return isAssigned;
  }

  /**
   * Get the user assigned to a conversation
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<Object|null>} Assigned user object or null if not assigned
   * @throws {Error} If conversation not found or chain invalid
   */
  async getAssignedUser(conversationId, workspaceId = null, accountId = null) {
    // Verify Conversation → Workspace → Account chain
    await this._verifyConversationChain(conversationId, workspaceId, accountId);

    const cacheKey = `conversation_assigned_user:${conversationId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      return parsed === null ? null : parsed;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        assignedUser: {
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
    });

    const assignedUser = conversation?.assignedUser || null;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(assignedUser));

    return assignedUser;
  }

  /**
   * Get assignment details (user and timestamp)
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<Object|null>} Assignment details { user, assignedAt } or null
   * @throws {Error} If conversation not found or chain invalid
   */
  async getAssignmentDetails(conversationId, workspaceId = null, accountId = null) {
    // Verify Conversation → Workspace → Account chain
    await this._verifyConversationChain(conversationId, workspaceId, accountId);

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        assignedUserId: true,
        assignedAt: true,
        assignedUser: {
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
    });

    if (!conversation || !conversation.assignedUserId) {
      return null;
    }

    return {
      user: conversation.assignedUser,
      assignedAt: conversation.assignedAt,
    };
  }

  /**
   * Invalidate cache for a conversation
   * Internal helper function
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID
   */
  async _invalidateConversationCache(conversationId, workspaceId) {
    try {
      const patterns = [
        `conversation:${conversationId}`,
        `conversation_assigned:${conversationId}`,
        `conversation_assigned_user:${conversationId}`,
        `conversations:workspace:${workspaceId}`,
      ];

      // Delete specific keys
      for (const pattern of patterns) {
        await redis.del(pattern);
      }

      logger.debug(`Cache invalidated for conversation: ${conversationId}`);
    } catch (error) {
      logger.error('Error invalidating conversation cache:', error);
      // Don't throw - cache invalidation failure shouldn't break the flow
    }
  }
}

module.exports = { ConversationAssignmentService };
