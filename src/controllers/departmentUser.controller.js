const { DepartmentUserService } = require('../services/departmentUser.service');

const departmentUserService = new DepartmentUserService();

class DepartmentUserController {
  /**
   * Add user to department
   * POST /api/v1/departments/:departmentId/users
   */
  async addUserToDepartment(req, res) {
    try {
      const departmentId = req.params.departmentId;

      if (!departmentId) {
        res.status(400).json({
          success: false,
          error: 'Department ID is required',
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

      // Pass caller info for role verification
      const callerInfo = {
        userId: req.user.id,
        isAppOwner: !!req.user.isAppOwner,
        accountRole: req.tenant?.accountRole,
        workspaceRole: req.tenant?.workspaceRole,
      };

      const departmentUser = await departmentUserService.addUserToDepartment(
        departmentId,
        workspaceId,
        req.tenant.accountId,
        req.body,
        callerInfo
      );

      const response = {
        success: true,
        data: departmentUser,
        message: 'User added to department successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add user to department';

      // Determine status code based on error type
      let statusCode = 400;
      if (errorMessage.includes('not found') || errorMessage.includes('not assigned')) {
        statusCode = 404;
      } else if (errorMessage.includes('already assigned') || errorMessage.includes('already exists')) {
        statusCode = 409;
      } else if (errorMessage.includes('Insufficient permissions') || errorMessage.includes('mismatch')) {
        statusCode = 403;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Update department user role
   * PATCH /api/v1/departments/:departmentId/users/:userId
   */
  async updateDepartmentUserRole(req, res) {
    try {
      const departmentId = req.params.departmentId;
      const userId = req.params.userId;

      if (!departmentId || !userId) {
        res.status(400).json({
          success: false,
          error: 'Department ID and User ID are required',
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

      // Pass caller info for role verification
      const callerInfo = {
        userId: req.user.id,
        accountRole: req.tenant?.accountRole,
        workspaceRole: req.tenant?.workspaceRole,
      };

      const departmentUser = await departmentUserService.updateDepartmentUserRole(
        departmentId,
        userId,
        workspaceId,
        req.tenant.accountId,
        req.body,
        callerInfo
      );

      const response = {
        success: true,
        data: departmentUser,
        message: 'Department user role updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update department user role';

      // Determine status code based on error type
      let statusCode = 400;
      if (errorMessage.includes('not found') || errorMessage.includes('not assigned')) {
        statusCode = 404;
      } else if (errorMessage.includes('Insufficient permissions') || errorMessage.includes('mismatch')) {
        statusCode = 403;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Remove user from department
   * DELETE /api/v1/departments/:departmentId/users/:userId
   */
  async removeUserFromDepartment(req, res) {
    try {
      const departmentId = req.params.departmentId;
      const userId = req.params.userId;

      if (!departmentId || !userId) {
        res.status(400).json({
          success: false,
          error: 'Department ID and User ID are required',
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

      // Pass caller info for role verification
      const callerInfo = {
        userId: req.user.id,
        accountRole: req.tenant?.accountRole,
        workspaceRole: req.tenant?.workspaceRole,
      };

      await departmentUserService.removeUserFromDepartment(
        departmentId,
        userId,
        workspaceId,
        req.tenant.accountId,
        callerInfo
      );

      const response = {
        success: true,
        message: 'User removed from department successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove user from department';

      // Determine status code based on error type
      let statusCode = 400;
      if (errorMessage.includes('not found') || errorMessage.includes('not assigned')) {
        statusCode = 404;
      } else if (errorMessage.includes('Insufficient permissions') || errorMessage.includes('mismatch')) {
        statusCode = 403;
      }

      res.status(statusCode).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * List department users
   * GET /api/v1/departments/:departmentId/users
   */
  async getDepartmentUsers(req, res) {
    try {
      const departmentId = req.params.departmentId;

      if (!departmentId) {
        res.status(400).json({
          success: false,
          error: 'Department ID is required',
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

      const departmentUsers = await departmentUserService.getDepartmentUsers(departmentId, workspaceId);

      const response = {
        success: true,
        data: departmentUsers,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get department users';
      res.status(404).json({
        success: false,
        error: errorMessage,
      });
    }
  }
}

module.exports = { DepartmentUserController };
