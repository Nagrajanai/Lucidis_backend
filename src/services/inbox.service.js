const prisma = require('../config/database');
const redis = require('../config/redis');

class InboxService {
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
}

module.exports = { InboxService };

