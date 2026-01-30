const prisma = require('../config/database');
const redis = require('../config/redis');
const { logger } = require('../utils/logger');

/**
 * Conversation State Service
 * 
 * Provides functions to manage conversation lifecycle states.
 * This is an internal service used by Assignment, Escalation, and Inbox services.
 * 
 * All functions verify Conversation → Workspace → Account chain for security.
 * This is a foundation layer - no routing or escalation logic yet.
 * 
 * State Transitions:
 * - TODO → ESCALATED (when escalated to human)
 * - TODO → ASSIGNED (when assigned to a user)
 * - ESCALATED → ASSIGNED (when assigned after escalation)
 * - ASSIGNED → CLOSED (when conversation is closed)
 * - CLOSED → TODO (when new inbound message arrives)
 * - CLOSED → ASSIGNED (when human agent replies)
 * - Invalid transitions are disallowed
 */
class ConversationStateService {
  /**
   * Valid state transitions
   * Maps from current state to allowed next states
   */
  static VALID_TRANSITIONS = {
    TODO: ['ASSIGNED', 'ESCALATED'],
    ASSIGNED: ['CLOSED'],
    ESCALATED: ['ASSIGNED'],
    CLOSED: ['TODO', 'ASSIGNED'], // CLOSED is not terminal - can be reopened
  };

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
   * Check if a state transition is valid
   * 
   * @param {string} currentState - Current conversation status
   * @param {string} newState - Desired new status
   * @returns {boolean} True if transition is valid, false otherwise
   */
  _isValidTransition(currentState, newState) {
    const allowedStates = ConversationStateService.VALID_TRANSITIONS[currentState];
    if (!allowedStates) {
      return false;
    }
    return allowedStates.includes(newState);
  }

  /**
   * Get current conversation state
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional, for verification)
   * @param {string} accountId - Account ID (optional, for verification)
   * @returns {Promise<Object>} Conversation state object with status and statusUpdatedAt
   * @throws {Error} If conversation not found or chain invalid
   */
  async getConversationState(conversationId, workspaceId = null, accountId = null) {
    // Verify Conversation → Workspace → Account chain
    await this._verifyConversationChain(conversationId, workspaceId, accountId);

    const cacheKey = `conversation_state:${conversationId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        status: true,
        statusUpdatedAt: true,
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const state = {
      status: conversation.status,
      statusUpdatedAt: conversation.statusUpdatedAt,
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(state));

    return state;
  }

  /**
   * Set conversation state (with transition validation)
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} newState - New status (TODO, ASSIGNED, ESCALATED, CLOSED)
   * @param {string} workspaceId - Workspace ID (required for verification)
   * @param {string} accountId - Account ID (required for verification)
   * @returns {Promise<Object>} Updated conversation
   * @throws {Error} If conversation not found, chain invalid, or transition invalid
   */
  async setConversationState(conversationId, newState, workspaceId, accountId) {
    // Validate newState
    const validStates = ['TODO', 'ASSIGNED', 'ESCALATED', 'CLOSED'];
    if (!validStates.includes(newState)) {
      throw new Error(`Invalid state: ${newState}. Valid states are: ${validStates.join(', ')}`);
    }

    // Verify Conversation → Workspace → Account chain
    const conversation = await this._verifyConversationChain(conversationId, workspaceId, accountId);

    // Check if transition is valid
    if (!this._isValidTransition(conversation.status, newState)) {
      throw new Error(
        `Invalid state transition: Cannot transition from ${conversation.status} to ${newState}. ` +
        `Allowed transitions from ${conversation.status}: ${ConversationStateService.VALID_TRANSITIONS[conversation.status]?.join(', ') || 'none'}`
      );
    }

    // Update conversation state
    try {
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: newState,
          statusUpdatedAt: new Date(),
        },
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          assignedUser: {
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
      await this._invalidateConversationStateCache(conversationId, workspaceId);

      logger.info(`Conversation ${conversationId} state changed from ${conversation.status} to ${newState}`);

      return updatedConversation;
    } catch (error) {
      logger.error('Error updating conversation state:', error);
      throw new Error('Failed to update conversation state');
    }
  }

  /**
   * Transition conversation to ASSIGNED state
   * Convenience method for assignment flow
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Updated conversation
   * @throws {Error} If conversation not found, chain invalid, or transition invalid
   */
  async markAsAssigned(conversationId, workspaceId, accountId) {
    return this.setConversationState(conversationId, 'ASSIGNED', workspaceId, accountId);
  }

  /**
   * Transition conversation to ESCALATED state
   * Convenience method for escalation flow
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Updated conversation
   * @throws {Error} If conversation not found, chain invalid, or transition invalid
   */
  async markAsEscalated(conversationId, workspaceId, accountId) {
    return this.setConversationState(conversationId, 'ESCALATED', workspaceId, accountId);
  }

  /**
   * Transition conversation to CLOSED state
   * Convenience method for closing conversations
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Updated conversation
   * @throws {Error} If conversation not found, chain invalid, or transition invalid
   */
  async markAsClosed(conversationId, workspaceId, accountId) {
    return this.setConversationState(conversationId, 'CLOSED', workspaceId, accountId);
  }

  /**
   * Transition conversation back to TODO state
   * Convenience method for resetting conversations or reopening closed conversations
   * Valid from CLOSED state (when new inbound message arrives)
   *
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID
   * @param {string} accountId - Account ID
   * @returns {Promise<Object>} Updated conversation
   * @throws {Error} If conversation not found, chain invalid, or transition invalid
   */
  async markAsTodo(conversationId, workspaceId, accountId) {
    return this.setConversationState(conversationId, 'TODO', workspaceId, accountId);
  }

  /**
   * Get all conversations with a specific status in a workspace
   * Useful for inbox queries
   * 
   * @param {string} workspaceId - Workspace ID
   * @param {string} status - Status to filter by
   * @param {Object} options - Query options (limit, offset)
   * @returns {Promise<Array>} Array of conversations
   */
  async getConversationsByStatus(workspaceId, status, options = {}) {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const validStates = ['TODO', 'ASSIGNED', 'ESCALATED', 'CLOSED'];
    if (!validStates.includes(status)) {
      throw new Error(`Invalid status: ${status}. Valid statuses are: ${validStates.join(', ')}`);
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        workspaceId,
        status,
      },
      include: {
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
          },
        },
      },
      orderBy: {
        statusUpdatedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return conversations;
  }

  /**
   * Invalidate cache for conversation state
   * 
   * @param {string} conversationId - Conversation ID
   * @param {string} workspaceId - Workspace ID (optional)
   */
  async _invalidateConversationStateCache(conversationId, workspaceId = null) {
    try {
      const patterns = [
        `conversation_state:${conversationId}`,
        `conversation:${conversationId}`,
      ];

      // Delete specific keys
      for (const pattern of patterns) {
        await redis.del(pattern);
      }

      if (workspaceId) {
        // Also invalidate workspace-level conversation caches
        await redis.del(`conversations:workspace:${workspaceId}`);
        // Invalidate status-specific caches
        const statuses = ['TODO', 'ASSIGNED', 'ESCALATED', 'CLOSED'];
        for (const status of statuses) {
          await redis.del(`conversations:workspace:${workspaceId}:status:${status}`);
        }
      }

      logger.debug(`Cache invalidated for conversation state: ${conversationId}`);
    } catch (error) {
      logger.error('Error invalidating conversation state cache:', error);
      // Don't throw - cache invalidation failure shouldn't break the flow
    }
  }
}

module.exports = { ConversationStateService };
