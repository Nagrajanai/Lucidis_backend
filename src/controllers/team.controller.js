const { TeamService } = require('../services/team.service');

const teamService = new TeamService();

class TeamController {
  async createTeam(req, res) {
    try {
      // Prioritize tenant context (verified) over body (untrusted)
      const workspaceId = req.tenant?.workspaceId || req.query.workspaceId || req.body.workspaceId;
      const departmentId = req.body.departmentId || req.tenant?.departmentId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required. Provide it in query parameter or header (x-workspace-id)',
        });
        return;
      }

      if (!departmentId) {
        res.status(400).json({
          success: false,
          error: 'Department ID is required',
        });
        return;
      }

      // If workspaceId from body/query doesn't match tenant context, reject
      if (req.tenant?.workspaceId && workspaceId !== req.tenant.workspaceId) {
        res.status(403).json({
          success: false,
          error: 'Workspace ID mismatch. Use the workspace from your tenant context',
        });
        return;
      }

      // Verify account context exists for workspace verification
      if (!req.tenant?.accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required. Provide it in query parameter or header (x-account-id)',
        });
        return;
      }

      const team = await teamService.createTeam(departmentId, workspaceId, req.tenant.accountId, req.body);

      const response = {
        success: true,
        data: team,
        message: 'Team created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create team';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getTeams(req, res) {
    try {
      // Prioritize tenant context (verified) over query (untrusted)
      const workspaceId = req.tenant?.workspaceId || req.query.workspaceId;
      const departmentId = req.query.departmentId || req.tenant?.departmentId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required. Provide it in query parameter or header (x-workspace-id)',
        });
        return;
      }

      if (!departmentId) {
        res.status(400).json({
          success: false,
          error: 'Department ID is required',
        });
        return;
      }

      // If workspaceId from query doesn't match tenant context, reject
      if (req.tenant?.workspaceId && workspaceId !== req.tenant.workspaceId) {
        res.status(403).json({
          success: false,
          error: 'Workspace ID mismatch. Use the workspace from your tenant context',
        });
        return;
      }

      const teams = await teamService.getTeams(departmentId, workspaceId);

      const response = {
        success: true,
        data: teams,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get teams';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getTeamById(req, res) {
    try {
      // Prioritize tenant context (verified) over query (untrusted)
      const workspaceId = req.tenant?.workspaceId || req.query.workspaceId;
      const departmentId = req.query.departmentId || req.tenant?.departmentId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required. Provide it in query parameter or header (x-workspace-id)',
        });
        return;
      }

      if (!departmentId) {
        res.status(400).json({
          success: false,
          error: 'Department ID is required',
        });
        return;
      }

      // If workspaceId from query doesn't match tenant context, reject
      if (req.tenant?.workspaceId && workspaceId !== req.tenant.workspaceId) {
        res.status(403).json({
          success: false,
          error: 'Workspace ID mismatch. Use the workspace from your tenant context',
        });
        return;
      }

      const team = await teamService.getTeamById(req.params.id, departmentId, workspaceId);

      const response = {
        success: true,
        data: team,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Team not found';
      res.status(404).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async updateTeam(req, res) {
    try {
      // Prioritize tenant context (verified) over query (untrusted)
      const workspaceId = req.tenant?.workspaceId || req.query.workspaceId;
      const departmentId = req.query.departmentId || req.tenant?.departmentId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required. Provide it in query parameter or header (x-workspace-id)',
        });
        return;
      }

      if (!departmentId) {
        res.status(400).json({
          success: false,
          error: 'Department ID is required',
        });
        return;
      }

      // If workspaceId from query doesn't match tenant context, reject
      if (req.tenant?.workspaceId && workspaceId !== req.tenant.workspaceId) {
        res.status(403).json({
          success: false,
          error: 'Workspace ID mismatch. Use the workspace from your tenant context',
        });
        return;
      }

      // Verify account context exists for workspace verification
      if (!req.tenant?.accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required. Provide it in query parameter or header (x-account-id)',
        });
        return;
      }

      const team = await teamService.updateTeam(req.params.id, departmentId, workspaceId, req.tenant.accountId, req.body);

      const response = {
        success: true,
        data: team,
        message: 'Team updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update team';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async deleteTeam(req, res) {
    try {
      // Prioritize tenant context (verified) over query (untrusted)
      const workspaceId = req.tenant?.workspaceId || req.query.workspaceId;
      const departmentId = req.query.departmentId || req.tenant?.departmentId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required. Provide it in query parameter or header (x-workspace-id)',
        });
        return;
      }

      if (!departmentId) {
        res.status(400).json({
          success: false,
          error: 'Department ID is required',
        });
        return;
      }

      // If workspaceId from query doesn't match tenant context, reject
      if (req.tenant?.workspaceId && workspaceId !== req.tenant.workspaceId) {
        res.status(403).json({
          success: false,
          error: 'Workspace ID mismatch. Use the workspace from your tenant context',
        });
        return;
      }

      // Verify account context exists for workspace verification
      if (!req.tenant?.accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required. Provide it in query parameter or header (x-account-id)',
        });
        return;
      }

      await teamService.deleteTeam(req.params.id, departmentId, workspaceId, req.tenant.accountId);

      const response = {
        success: true,
        message: 'Team deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete team';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async inviteUser(req, res) {
    try {
      const teamId = req.params.teamId || req.body.teamId;

      if (!teamId) {
        res.status(400).json({
          success: false,
          error: 'Team ID is required',
        });
        return;
      }

      // Prioritize tenant context (verified) over query (untrusted)
      const workspaceId = req.tenant?.workspaceId || req.query.workspaceId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required. Provide it in query parameter or header (x-workspace-id)',
        });
        return;
      }

      // If workspaceId from query doesn't match tenant context, reject
      if (req.tenant?.workspaceId && workspaceId !== req.tenant.workspaceId) {
        res.status(403).json({
          success: false,
          error: 'Workspace ID mismatch. Use the workspace from your tenant context',
        });
        return;
      }

      // Verify account context exists
      if (!req.tenant?.accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required. Provide it in query parameter or header (x-account-id)',
        });
        return;
      }

      // Pass inviter info for role verification
      const inviterInfo = {
        userId: req.user.id,
        accountRole: req.tenant?.accountRole,
        workspaceRole: req.tenant?.workspaceRole,
        isAppOwner: req.user?.isAppOwner || false,
      };

      const teamUser = await teamService.inviteUserToTeam(
        teamId,
        workspaceId,
        req.tenant.accountId,
        req.body,
        inviterInfo
      );

      const response = {
        success: true,
        data: teamUser,
        message: 'User invited to team successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to invite user';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }
}

module.exports = { TeamController };

