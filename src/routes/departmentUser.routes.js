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
  body: ['role'],
  custom: (req) => {
    const errors = [];
    if (!req.body.userId && !req.body.email) {
      errors.push({
        path: 'body',
        message: 'Either userId or email is required',
      });
    }
    return errors;
  },
});

const validateUpdateRole = validate({
  params: ['departmentId', 'userId'],
  body: ['role'],
});

// Write operations: Restricted to WORKSPACE_ADMIN to match department CRUD
router.post(
  '/:departmentId/users',
  requireRole(UserRole.WORKSPACE_ADMIN),
  validateAddUser,
  departmentUserController.addUserToDepartment.bind(departmentUserController)
);

// Read operations allow any workspace member
router.get(
  '/:departmentId/users',
  requireRole(UserRole.WORKSPACE_MEMBER),
  validateDepartmentId,
  departmentUserController.getDepartmentUsers.bind(departmentUserController)
);

// Write operations: Restricted to WORKSPACE_ADMIN
router.patch(
  '/:departmentId/users/:userId',
  requireRole(UserRole.WORKSPACE_ADMIN),
  validateUpdateRole,
  departmentUserController.updateDepartmentUserRole.bind(departmentUserController)
);

// Write operations: Restricted to WORKSPACE_ADMIN
router.delete(
  '/:departmentId/users/:userId',
  requireRole(UserRole.WORKSPACE_ADMIN),
  validateDepartmentId,
  validateUserId,
  departmentUserController.removeUserFromDepartment.bind(departmentUserController)
);

module.exports = router;
