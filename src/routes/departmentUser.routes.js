const { Router } = require('express');
const { DepartmentUserController } = require('../controllers/departmentUser.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantMiddleware, requireRole, UserRole } = require('../middleware/tenant.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const departmentUserController = new DepartmentUserController();

router.use(authMiddleware);
router.use(tenantMiddleware);

// Validation middlewares
const validateDepartmentId = validate({
  params: ['departmentId'],
});

const validateUserId = validate({
  params: ['userId'],
});

const validateAddUser = validate({
  params: ['departmentId'],
  body: ['userId', 'role'],
});

const validateUpdateRole = validate({
  params: ['departmentId', 'userId'],
  body: ['role'],
});

// Write operations: Authorization is handled in service layer
// Allowed: ACCOUNT_ADMIN, WORKSPACE_ADMIN, DEPARTMENT_MANAGER (for their own department)
router.post(
  '/:departmentId/users',
  validateAddUser,
  departmentUserController.addUserToDepartment.bind(departmentUserController)
);

// Read operations allow any workspace member (no role check)
router.get(
  '/:departmentId/users',
  validateDepartmentId,
  departmentUserController.getDepartmentUsers.bind(departmentUserController)
);

// Write operations: Authorization is handled in service layer
// Allowed: ACCOUNT_ADMIN, WORKSPACE_ADMIN, DEPARTMENT_MANAGER (for their own department)
router.patch(
  '/:departmentId/users/:userId',
  validateUpdateRole,
  departmentUserController.updateDepartmentUserRole.bind(departmentUserController)
);

// Write operations: Authorization is handled in service layer
// Allowed: ACCOUNT_ADMIN, WORKSPACE_ADMIN, DEPARTMENT_MANAGER (for their own department)
router.delete(
  '/:departmentId/users/:userId',
  validateDepartmentId,
  validateUserId,
  departmentUserController.removeUserFromDepartment.bind(departmentUserController)
);

module.exports = router;
