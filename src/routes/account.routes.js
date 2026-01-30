const { Router } = require('express');
const { AccountController } = require('../controllers/account.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantMiddleware, requireRole, UserRole } = require('../middleware/tenant.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const accountController = new AccountController();

// Routes specific authentication/authorization
router.use(authMiddleware);
// Note: We don't apply a global requireRole(APP_OWNER) anymore because ACCOUNT_ADMIN needs access too.
router.use(tenantMiddleware);

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

// Create: Only AppOwner
router.post('/', requireRole(UserRole.APP_OWNER), validateCreateAccount, accountController.createAccount.bind(accountController));

// List: AppOwner (all) or Account Member (their own)
router.get('/', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN, UserRole.ACCOUNT_MEMBER), accountController.getAccounts.bind(accountController));

// Invitations: AppOwner or Account Admin
router.get('/invitations', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN), accountController.getInvitations.bind(accountController));

// Invite User: AppOwner or Account Admin
router.post('/:accountId/users', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN), validateAccountIdForUsers, accountController.inviteUserToAccount.bind(accountController));

// Get ID: AppOwner or Account Member
router.get('/:id', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN, UserRole.ACCOUNT_MEMBER), validateAccountId, accountController.getAccountById.bind(accountController));

// Update: AppOwner or Account Admin
router.put('/:id', requireRole(UserRole.APP_OWNER, UserRole.ACCOUNT_ADMIN), validateAccountId, accountController.updateAccount.bind(accountController));

// Delete: Only AppOwner
router.delete('/:id', requireRole(UserRole.APP_OWNER), validateAccountId, accountController.deleteAccount.bind(accountController));

module.exports = router;

