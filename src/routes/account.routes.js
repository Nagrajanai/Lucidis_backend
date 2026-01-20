const { Router } = require('express');
const { AccountController } = require('../controllers/account.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { requireRole, UserRole } = require('../middleware/tenant.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const accountController = new AccountController();

// All routes require authentication and AppOwner role
router.use(authMiddleware);
router.use(requireRole(UserRole.APP_OWNER));

// Validation middlewares
const validateCreateAccount = validate({
  body: ['name', 'slug'],
});

const validateAccountId = validate({
  params: ['id'],
});

const validateAccountIdForUsers = validate({
  params: ['accountId'],
  body: ['email', 'role'],
  custom: (req) => {
    const errors = [];
    const { role } = req.body;
    
    // Validate role is ADMIN or MEMBER
    if (role && role !== 'ADMIN' && role !== 'MEMBER') {
      errors.push({
        path: 'body.role',
        message: 'Role must be ADMIN or MEMBER',
      });
    }
    
    return errors;
  },
});

router.post('/', validateCreateAccount, accountController.createAccount.bind(accountController));
router.get('/', accountController.getAccounts.bind(accountController));
router.post('/:accountId/users', validateAccountIdForUsers, accountController.inviteUserToAccount.bind(accountController));
router.get('/:id', validateAccountId, accountController.getAccountById.bind(accountController));
router.put('/:id', validateAccountId, accountController.updateAccount.bind(accountController));
router.delete('/:id', validateAccountId, accountController.deleteAccount.bind(accountController));

module.exports = router;

