const prisma = require('../config/database');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');
const { DepartmentAuthorityService } = require('./departmentAuthority.service');
const { ConversationAssignmentService } = require('./conversationAssignment.service');

/**
 * Conversation Access Service
 * 
 * Provides functions to determine conversation visibility and access rules.
 * This is an internal service used by Inbox APIs, Socket event handlers, and Notification services.
 * 
 * All functions verify Conversation → Workspace → Account chain for security.
 * This is a foundation service only - no inbox APIs, routing, or socket emits.
 */
class ConversationAccessService {
  constructor() {
    this.departmentAuthorityService = new DepartmentAuthorityService();
    this.conversationAssignmentService = new ConversationAssignmentService();
  }

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
   * Resolve department ID for a conversation
   * Checks metadata first, then falls back to workspace-level logic
   * 
   * @param {Object} conversation - Conversation object
   * @returns {Promise<string|null>} Department ID or null if not found
   */
  async _resolveConversationDepartmentId(conversation) {
    // Check if departmentId is stored in metadata
    if (conversation.metadata && conversation.metadata.departmentId) {
      return conversation.metadata.departmentId;
    }

    // If no departmentId in metadata, return null
    // The calling function will handle this case
    return null;
  }

  /**
   * Check if a user can view a conversation
   * 
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<boolean>} True if user can view the conversation, false otherwise
   * @throws {Error} If conversation not found or chain invalid
   */
  async canUserViewConversation(userId, conversationId, workspaceId = null, accountId = null) {
    // Verify Conversation → Workspace → Account chain
    const conversation = await this._verifyConversationChain(conversationId, workspaceId, accountId);

    const cacheKey = `conversation_access:${userId}:${conversationId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached !== null) {
      return cached === 'true';
    }

    // If conversation is assigned to this user, they can view it
    if (conversation.assignedUserId === userId) {
      await redis.setex(cacheKey, 300, 'true');
      return true;
    }

    // Resolve department ID for the conversation
    const departmentId = await this._resolveConversationDepartmentId(conversation);

    if (departmentId) {
      // Check if user is a member of that department (any role)
      try {
        const isMember = await this.departmentAuthorityService.isDepartmentMember(
          userId,
          departmentId,
          conversation.workspaceId,
          conversation.workspace.accountId
        );

        await redis.setex(cacheKey, 300, isMember ? 'true' : 'false');
        return isMember;
      } catch (error) {
        // If department check fails (e.g., department not found), user cannot view
        logger.warn(`Department check failed for conversation ${conversationId}:`, error.message);
        await redis.setex(cacheKey, 300, 'false');
        return false;
      }
    }

    // If no departmentId found and not assigned, user cannot view
    await redis.setex(cacheKey, 300, 'false');
    return false;
  }

  /**
   * Get conversation visibility scope
   * Determines whether conversation is user-assigned or department-scoped
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<Object>} Visibility scope object
   * @throws {Error} If conversation not found or chain invalid
   */
  async getConversationVisibilityScope(conversationId, workspaceId = null, accountId = null) {
    // Verify Conversation → Workspace → Account chain
    const conversation = await this._verifyConversationChain(conversationId, workspaceId, accountId);

    const cacheKey = `conversation_visibility:${conversationId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const departmentId = await this._resolveConversationDepartmentId(conversation);

    let visibilityType;
    if (conversation.assignedUserId) {
      visibilityType = 'USER_ASSIGNED';
    } else {
      visibilityType = 'DEPARTMENT';
    }

    const scope = {
      departmentId,
      assignedUserId: conversation.assignedUserId,
      visibilityType,
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(scope));

    return scope;
  }

  /**
   * Get all users who can see a conversation
   * Returns assigned user if assigned, otherwise returns department managers and human support users
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<Array>} Array of user objects who can see the conversation
   * @throws {Error} If conversation not found or chain invalid
   */
  async getUsersWhoCanSeeConversation(conversationId, workspaceId = null, accountId = null) {
    // Verify Conversation → Workspace → Account chain
    const conversation = await this._verifyConversationChain(conversationId, workspaceId, accountId);

    const cacheKey = `conversation_viewers:${conversationId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let users = [];

    // If conversation is assigned to a user, return only that user
    if (conversation.assignedUserId) {
      const assignedUser = await this.conversationAssignmentService.getAssignedUser(
        conversationId,
        conversation.workspaceId,
        conversation.workspace.accountId
      );

      if (assignedUser) {
        users = [assignedUser];
      }
    } else {
      // If not assigned, get department managers and human support users
      const departmentId = await this._resolveConversationDepartmentId(conversation);

      if (departmentId) {
        try {
          // Get department managers
          const managers = await this.departmentAuthorityService.getDepartmentManagers(
            departmentId,
            conversation.workspaceId,
            conversation.workspace.accountId
          );

          // Get human support users
          const humanSupport = await this.departmentAuthorityService.getHumanSupportUsers(
            departmentId,
            conversation.workspaceId,
            conversation.workspace.accountId
          );

          // Combine and deduplicate by user ID
          const userMap = new Map();
          
          [...managers, ...humanSupport].forEach(user => {
            if (!userMap.has(user.id)) {
              userMap.set(user.id, user);
            }
          });

          users = Array.from(userMap.values());
        } catch (error) {
          logger.warn(`Failed to get department users for conversation ${conversationId}:`, error.message);
          users = [];
        }
      }
    }

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(users));

    return users;
  }

  /**
   * Invalidate cache for a conversation
   * Call this when conversation assignment changes or department membership changes
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional)
   */
  async invalidateConversationAccessCache(conversationId, workspaceId = null) {
    try {
      // Get all cache keys related to this conversation
      const patterns = [
        `conversation_access:*:${conversationId}`,
        `conversation_visibility:${conversationId}`,
        `conversation_viewers:${conversationId}`,
      ];

      // Delete specific keys
      await redis.del(`conversation_visibility:${conversationId}`);
      await redis.del(`conversation_viewers:${conversationId}`);

      // Note: For pattern-based deletion (conversation_access:*:conversationId),
      // we would need to use SCAN to find matching keys and delete them individually.
      // For now, we'll rely on TTL expiration for user-specific access keys.
      // In production, you might want to implement a more sophisticated cache invalidation.

      if (workspaceId) {
        // Also invalidate workspace-level conversation caches
        await redis.del(`conversations:workspace:${workspaceId}`);
      }

      logger.debug(`Cache invalidated for conversation access: ${conversationId}`);
    } catch (error) {
      logger.error('Error invalidating conversation access cache:', error);
      // Don't throw - cache invalidation failure shouldn't break the flow
    }
  }

  /**
   * Invalidate cache for a specific user's access to a conversation
   * 
   * @param {string} userId - User ID
   * @param {string} conversationId - Conversation ID
   */
  async invalidateUserConversationAccessCache(userId, conversationId) {
    try {
      const cacheKey = `conversation_access:${userId}:${conversationId}`;
      await redis.del(cacheKey);
      logger.debug(`Cache invalidated for user ${userId} access to conversation ${conversationId}`);
    } catch (error) {
      logger.error('Error invalidating user conversation access cache:', error);
      // Don't throw - cache invalidation failure shouldn't break the flow
    }
  }
}

module.exports = { ConversationAccessService };
