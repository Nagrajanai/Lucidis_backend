const { InboxService } = require('../services/inbox.service');

const inboxService = new InboxService();

class InboxController {
  async getConversations(req, res) {
    try {
      const workspaceId = req.query.workspaceId || req.tenant?.workspaceId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required',
        });
        return;
      }

      const result = await inboxService.getConversations(workspaceId, req.query);

      const response = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get conversations';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getConversationById(req, res) {
    try {
      const workspaceId = req.query.workspaceId || req.tenant?.workspaceId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required',
        });
        return;
      }

      const conversation = await inboxService.getConversationById(req.params.id, workspaceId);

      const response = {
        success: true,
        data: conversation,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Conversation not found';
      res.status(404).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getMessages(req, res) {
    try {
      const workspaceId = req.query.workspaceId || req.tenant?.workspaceId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required',
        });
        return;
      }

      const result = await inboxService.getMessages(req.params.conversationId, workspaceId, req.query);

      const response = {
        success: true,
        data: result,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get messages';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async createMockMessage(req, res) {
    try {
      const workspaceId = req.body.workspaceId || req.tenant?.workspaceId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required',
        });
        return;
      }

      const result = await inboxService.createMockMessage(workspaceId, req.body);

      const response = {
        success: true,
        data: result,
        message: 'Mock message created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create mock message';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }
}

module.exports = { InboxController };

