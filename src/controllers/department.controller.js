const { DepartmentService } = require('../services/department.service');

const departmentService = new DepartmentService();

class DepartmentController {
  async createDepartment(req, res) {
    try {
      // Prioritize tenant context (verified) over body (untrusted)
      const workspaceId = req.tenant?.workspaceId || req.query.workspaceId || req.body.workspaceId;

      if (!workspaceId) {
        res.status(400).json({
          success: false,
          error: 'Workspace ID is required. Provide it in query parameter or header (x-workspace-id)',
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

      const department = await departmentService.createDepartment(workspaceId, req.tenant.accountId, req.body);

      const response = {
        success: true,
        data: department,
        message: 'Department created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create department';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getDepartments(req, res) {
    try {
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

      const departments = await departmentService.getDepartments(workspaceId);

      const response = {
        success: true,
        data: departments,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get departments';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getDepartmentById(req, res) {
    try {
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

      const department = await departmentService.getDepartmentById(req.params.id, workspaceId);

      const response = {
        success: true,
        data: department,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Department not found';
      res.status(404).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async updateDepartment(req, res) {
    try {
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

      // Verify account context exists for workspace verification
      if (!req.tenant?.accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required. Provide it in query parameter or header (x-account-id)',
        });
        return;
      }

      const department = await departmentService.updateDepartment(req.params.id, workspaceId, req.tenant.accountId, req.body);

      const response = {
        success: true,
        data: department,
        message: 'Department updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update department';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async deleteDepartment(req, res) {
    try {
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

      // Verify account context exists for workspace verification
      if (!req.tenant?.accountId) {
        res.status(400).json({
          success: false,
          error: 'Account ID is required. Provide it in query parameter or header (x-account-id)',
        });
        return;
      }

      await departmentService.deleteDepartment(req.params.id, workspaceId, req.tenant.accountId);

      const response = {
        success: true,
        message: 'Department deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete department';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }
}

module.exports = { DepartmentController };

