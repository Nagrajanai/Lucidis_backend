const prisma = require('../config/database');
const { WorkspaceService } = require('../services/workspace.service');

const workspaceService = new WorkspaceService();

class WorkspaceController {
  async createWorkspace(req, res) {
    try {
      const accountId = req.body.accountId || req.tenant?.accountId;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: 'Account ID is required. Provide it in body or header (x-account-id)',
        });
      }

      const workspace = await workspaceService.createWorkspace(accountId, req.body);

      const response = {
        success: true,
        data: workspace,
        message: 'Workspace created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create workspace';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getWorkspaces(req, res) {
    try {
      const accountId = req.query.accountId || req.tenant?.accountId;

      // APP_OWNER still needs an accountId to know which account to list
      if (req.user?.isAppOwner && !accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required for AppOwners',
        });
        return;
      }

      const isAppOwner = req.user?.isAppOwner || false;
      const accountRole = req.tenant?.accountRole;
      const userId = req.user?.id;

      const workspaces = await workspaceService.getWorkspaces(accountId, userId, isAppOwner, accountRole);

      const response = {
        success: true,
        data: workspaces,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get workspaces';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getWorkspaceById(req, res) {
    try {
      const accountId = req.tenant?.accountId;
      const workspaceId = req.params.id;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: 'Account ID could not be resolved. Ensure you are providing correct headers or path.',
        });
      }

      const workspace = await workspaceService.getWorkspaceById(req.params.id, accountId);

      const response = {
        success: true,
        data: workspace,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Workspace not found';
      res.status(404).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async updateWorkspace(req, res) {
    try {
      const accountId = req.tenant?.accountId;
      const workspaceId = req.params.id;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: 'Account ID could not be resolved.',
        });
      }

      const workspace = await workspaceService.updateWorkspace(req.params.id, accountId, req.body);

      const response = {
        success: true,
        data: workspace,
        message: 'Workspace updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update workspace';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async deleteWorkspace(req, res) {
    try {
      const accountId = req.tenant?.accountId;

      if (!accountId) {
        return res.status(400).json({
          success: false,
          error: 'Account ID could not be resolved.',
        });
      }

      await workspaceService.deleteWorkspace(req.params.id, accountId);

      const response = {
        success: true,
        message: 'Workspace deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete workspace';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async addUserToWorkspace(req, res) {
    try {
      const workspaceId = req.params.workspaceId;
      const accountId = req.tenant?.accountId;

      if (!accountId || !workspaceId) {
        return res.status(400).json({
          success: false,
          error: 'Workspace context missing.',
        });
      }

      // Get caller's roles for role assignment validation
      const callerAccountRole = req.tenant?.accountRole;
      const callerWorkspaceRole = req.tenant?.workspaceRole;
      const isAppOwner = req.user?.isAppOwner || false;
      const invitedByUserId = req.user?.id;

      if (!invitedByUserId) {
        res.status(401).json({
          success: false,
          error: 'User ID is required',
        });
        return;
      }

      const workspaceUser = await workspaceService.addUserToWorkspace(
        workspaceId,
        accountId,
        req.body,
        callerAccountRole,
        callerWorkspaceRole,
        invitedByUserId,
        isAppOwner
      );

      const response = {
        success: true,
        data: workspaceUser,
        message: 'User added to workspace successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add user to workspace';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }
}

module.exports = { WorkspaceController };

