const { WorkspaceService } = require('../services/workspace.service');

const workspaceService = new WorkspaceService();

class WorkspaceController {
  async createWorkspace(req, res) {
    try {
      const accountId = req.body.accountId || req.tenant?.accountId;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required',
        });
        return;
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

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required',
        });
        return;
      }

      const workspaces = await workspaceService.getWorkspaces(accountId);

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
      const accountId = req.query.accountId || req.tenant?.accountId;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required',
        });
        return;
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
      const accountId = req.query.accountId || req.tenant?.accountId;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required',
        });
        return;
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
      const accountId = req.query.accountId || req.tenant?.accountId;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required',
        });
        return;
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
      const accountId = req.query.accountId || req.tenant?.accountId;

      if (!accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required',
        });
        return;
      }

      // Get caller's account role for role assignment validation
      const callerAccountRole = req.tenant?.accountRole;

      const workspaceUser = await workspaceService.addUserToWorkspace(
        workspaceId,
        accountId,
        req.body,
        callerAccountRole
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

