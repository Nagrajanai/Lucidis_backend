const { Router } = require('express');
const { WorkspaceController } = require('../controllers/workspace.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantMiddleware, requireRole, UserRole } = require('../middleware/tenant.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const workspaceController = new WorkspaceController();

router.use(authMiddleware);
router.use(tenantMiddleware);

// Validation middlewares
const validateCreateWorkspace = validate({
  body: ['name', 'slug'],
});

const validateWorkspaceId = validate({
  params: ['id'],
});

const validateAddUserToWorkspace = validate({
  params: ['workspaceId'],
  body: ['email'],
  custom: (req) => {
    const errors = [];
    const { role } = req.body;

    // Validate role if provided
    if (role && role !== 'ADMIN' && role !== 'MEMBER') {
      errors.push({
        path: 'body.role',
        message: 'Role must be ADMIN or MEMBER',
      });
    }

    return errors;
  },
});

// Workspace CRUD operations require ACCOUNT_ADMIN role (APP_OWNER also allowed)
router.post('/', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN), validateCreateWorkspace, workspaceController.createWorkspace.bind(workspaceController));

// List workspaces: Middleware will filter results based on user relationship
router.get('/', workspaceController.getWorkspaces.bind(workspaceController));

// Workspace user assignment - must be before /:id route to avoid conflicts
// Allows ACCOUNT_ADMIN or WORKSPACE_ADMIN
router.post('/:workspaceId/users', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN, UserRole.WORKSPACE_ADMIN), validateAddUserToWorkspace, workspaceController.addUserToWorkspace.bind(workspaceController));

// Get workspace details: Allows ACCOUNT_ADMIN or WORKSPACE_MEMBER
router.get('/:id', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN, UserRole.WORKSPACE_MEMBER), validateWorkspaceId, workspaceController.getWorkspaceById.bind(workspaceController));

// Update workspace: Allows ACCOUNT_ADMIN or WORKSPACE_ADMIN
router.put('/:id', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN, UserRole.WORKSPACE_ADMIN), validateWorkspaceId, workspaceController.updateWorkspace.bind(workspaceController));

// Delete workspace: Only ACCOUNT_ADMIN or APP_OWNER
router.delete('/:id', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN), validateWorkspaceId, workspaceController.deleteWorkspace.bind(workspaceController));

module.exports = router;

