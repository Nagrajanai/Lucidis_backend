const prisma = require('../config/database');
const redis = require('../config/redis');
const { ConversationStateService } = require('./conversationState.service');

class InboxService {
  constructor() {
    this.conversationStateService = new ConversationStateService();
  }

  async getConversations(workspaceId, query) {
    const page = query.page || 1;
    const limit = Math.min(query.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.search) {
      where.OR = [
        { subject: { contains: query.search, mode: 'insensitive' } },
        { contact: { email: { contains: query.search, mode: 'insensitive' } } },
        { contact: { name: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [conversations, total] = await Promise.all([
      prisma.conversation.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              name: true,
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
        },
        orderBy: {
          lastMessageAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.conversation.count({ where }),
    ]);

    return {
      data: conversations,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getConversationById(conversationId, workspaceId) {
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
      },
      include: {
        contact: true,
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    return conversation;
  }

  async getMessages(conversationId, workspaceId, query) {
    // Verify conversation belongs to workspace
    const conversation = await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        workspaceId,
      },
    });

    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const page = query.page || 1;
    const limit = Math.min(query.limit || 50, 100);
    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.message.count({ where: { conversationId } }),
    ]);

    return {
      data: messages.reverse(), // Reverse to show oldest first
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async createMockMessage(workspaceId, data) {
    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Find or create contact
    let contact = await prisma.contact.findUnique({
      where: { email: data.fromEmail },
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          email: data.fromEmail,
          name: data.fromName,
        },
      });
    }

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        workspaceId,
        contactId: contact.id,
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          workspaceId,
          contactId: contact.id,
          subject: data.subject,
        },
      });
    }

    // Create message
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        toEmail: data.toEmail,
        toName: data.toName,
        subject: data.subject,
        body: data.body,
        bodyHtml: data.bodyHtml,
      },
    });

    // Update conversation last message time
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
      },
    });

    // Invalidate cache
    await redis.del(`conversations:workspace:${workspaceId}`);
    await redis.del(`conversation:${conversation.id}`);

    // Emit Socket.IO event for real-time updates
    const io = global.io;
    // console.log("Global IO Object:", io);
    if (io) {
      // console.log("Emitting socket event", {
      //   event: "new-message",
      //   workspaceId,
      //   conversationId: conversation,
      //   contact:contact
      // });
      io.to(`workspace:${workspaceId}`).emit('new-message', {
        message,
        conversation,
        contact,
      });
    }

    return {
      message,
      conversation,
      contact,
    };
  }

  /**
   * Create an inbound message (non-agent/external message) with conversation state normalization
   *
   * State normalization rules for inbound messages:
   * - CLOSED → TODO
   * - ASSIGNED → TODO
   * - ESCALATED → keep ESCALATED (no change)
   * - TODO → no change
   *
   * @param {string} workspaceId - Workspace ID
   * @param {Object} data - Message data
   * @param {string} data.fromEmail - Sender email
   * @param {string} data.fromName - Sender name (optional)
   * @param {string} data.toEmail - Recipient email
   * @param {string} data.toName - Recipient name (optional)
   * @param {string} data.subject - Message subject (optional)
   * @param {string} data.body - Message body
   * @param {string} data.bodyHtml - HTML message body (optional)
   * @param {Object} data.metadata - Additional metadata (optional)
   * @returns {Promise<Object>} Created message, conversation, and contact
   */
  async createInboundMessage(workspaceId, data) {
    // Verify workspace exists
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Find or create contact
    let contact = await prisma.contact.findUnique({
      where: { email: data.fromEmail },
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          email: data.fromEmail,
          name: data.fromName,
        },
      });
    }

    // Find or create conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        workspaceId,
        contactId: contact.id,
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          workspaceId,
          contactId: contact.id,
          subject: data.subject,
        },
      });
    }

    // Create inbound message (isInternal: false)
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        fromEmail: data.fromEmail,
        fromName: data.fromName,
        toEmail: data.toEmail,
        toName: data.toName,
        subject: data.subject,
        body: data.body,
        bodyHtml: data.bodyHtml,
        isInternal: false, // Mark as external/inbound message
        metadata: data.metadata,
      },
    });

    // Normalize conversation state for inbound messages
    await this._normalizeConversationStateForInboundMessage(conversation, workspaceId);

    // Update conversation last message time
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
      },
    });

    // Get updated conversation with latest state
    const updatedConversation = await prisma.conversation.findUnique({
      where: { id: conversation.id },
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
    await redis.del(`conversations:workspace:${workspaceId}`);
    await redis.del(`conversation:${conversation.id}`);

    // Emit Socket.IO event for real-time updates
    const io = global.io;
    if (io) {
      io.to(`workspace:${workspaceId}`).emit('new-message', {
        message,
        conversation: updatedConversation,
        contact,
      });
    }

    return {
      message,
      conversation: updatedConversation,
      contact,
    };
  }

  /**
   * Normalize conversation state for inbound messages
   * Internal method used by createInboundMessage
   *
   * Rules:
   * - CLOSED → TODO
   * - ASSIGNED → TODO
   * - ESCALATED → keep ESCALATED (no change)
   * - TODO → no change
   *
   * @param {Object} conversation - Conversation object
   * @param {string} workspaceId - Workspace ID
   * @private
   */
  async _normalizeConversationStateForInboundMessage(conversation, workspaceId) {
    let targetState = null;

    switch (conversation.status) {
      case 'CLOSED':
        targetState = 'TODO';
        break;
      case 'ASSIGNED':
        targetState = 'TODO';
        break;
      case 'ESCALATED':
        // Keep ESCALATED - no change needed
        return;
      case 'TODO':
        // No change needed
        return;
      default:
        // Unknown state - no change
        return;
    }

    if (targetState) {
      try {
        await this.conversationStateService.setConversationState(
          conversation.id,
          targetState,
          workspaceId,
          conversation.workspace.accountId
        );
      } catch (error) {
        // Log error but don't fail the message creation
        console.error('Failed to normalize conversation state:', error);
      }
    }
  }
}

module.exports = { InboxService };

