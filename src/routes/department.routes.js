const { Router } = require('express');
const { DepartmentController } = require('../controllers/department.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantMiddleware, requireRole, UserRole } = require('../middleware/tenant.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const departmentController = new DepartmentController();

router.use(authMiddleware);
router.use(tenantMiddleware);

// Validation middlewares
const validateCreateDepartment = validate({
  body: ['name', 'slug'],
});

const validateDepartmentId = validate({
  params: ['id'],
});

// Write operations require ACCOUNT_ADMIN or WORKSPACE_ADMIN
router.post('/', requireRole(UserRole.ACCOUNT_ADMIN, UserRole.WORKSPACE_ADMIN), validateCreateDepartment, departmentController.createDepartment.bind(departmentController));
// Read operations allow any workspace member (no role check)
router.get('/', departmentController.getDepartments.bind(departmentController));
router.get('/:id', validateDepartmentId, departmentController.getDepartmentById.bind(departmentController));
// Write operations require ACCOUNT_ADMIN or WORKSPACE_ADMIN
router.put('/:id', requireRole(UserRole.ACCOUNT_ADMIN, UserRole.WORKSPACE_ADMIN), validateDepartmentId, departmentController.updateDepartment.bind(departmentController));
router.delete('/:id', requireRole(UserRole.ACCOUNT_ADMIN, UserRole.WORKSPACE_ADMIN), validateDepartmentId, departmentController.deleteDepartment.bind(departmentController));

module.exports = router;

