const prisma = require('../config/database');
const { logger } = require('../utils/logger');
const { setRLSContext } = require('../utils/rls');

const UserRole = {
  APP_OWNER: 'APP_OWNER',
  ACCOUNT_ADMIN: 'ACCOUNT_ADMIN',
  ACCOUNT_MEMBER: 'ACCOUNT_MEMBER',
  WORKSPACE_ADMIN: 'WORKSPACE_ADMIN',
  WORKSPACE_MEMBER: 'WORKSPACE_MEMBER',
  TEAM_LEAD: 'TEAM_LEAD',
  TEAM_MEMBER: 'TEAM_MEMBER',
};

const tenantMiddleware = async (req, res, next) => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const tenant = {};

    // Extract account ID from query params or headers
    const accountId = req.query.accountId || req.headers['x-account-id'];
    const workspaceId = req.query.workspaceId || req.headers['x-workspace-id'];

    if (accountId) {
      // APP_OWNER bypasses account_users check - they own all accounts via app_owners table
      if (req.user && req.user.isAppOwner) {
        // Verify account exists and belongs to this AppOwner
        const account = await prisma.account.findFirst({
          where: {
            id: accountId,
            appOwnerId: req.user.id,
          },
        });

        if (!account) {
          res.status(403).json({
            success: false,
            error: 'Account not found or does not belong to this AppOwner',
          });
          return;
        }

        tenant.accountId = accountId;
        tenant.accountRole = null; // APP_OWNER doesn't have account role
        req.account = account;
      } else {
        // Regular users must have account_users entry
        const accountUser = await prisma.accountUser.findUnique({
          where: {
            userId_accountId: {
              userId: req.user.id,
              accountId,
            },
          },
          include: {
            account: true,
          },
        });

        if (!accountUser) {
          res.status(403).json({
            success: false,
            error: 'Access denied to this account',
          });
          return;
        }

        tenant.accountId = accountId;
        tenant.accountRole = accountUser.role;
        req.account = accountUser.account;
      }

      if (workspaceId) {
        // APP_OWNER bypasses workspace_users check - they can access any workspace in their accounts
        if (req.user && req.user.isAppOwner) {
          // Verify workspace belongs to account
          const workspace = await prisma.workspace.findFirst({
            where: {
              id: workspaceId,
              accountId: accountId,
            },
          });

          if (!workspace) {
            res.status(403).json({
              success: false,
              error: 'Workspace not found or does not belong to this account',
            });
            return;
          }

          tenant.workspaceId = workspaceId;
          tenant.workspaceRole = null; // APP_OWNER doesn't have workspace role
          req.workspace = workspace;
        } else {
          // Regular users must have workspace_users entry
          const workspaceUser = await prisma.workspaceUser.findUnique({
            where: {
              userId_workspaceId: {
                userId: req.user.id,
                workspaceId,
              },
            },
            include: {
              workspace: true,
            },
          });

          if (!workspaceUser || workspaceUser.workspace.accountId !== accountId) {
            res.status(403).json({
              success: false,
              error: 'Access denied to this workspace',
            });
            return;
          }

          tenant.workspaceId = workspaceId;
          tenant.workspaceRole = workspaceUser.role;
          req.workspace = workspaceUser.workspace;
        }
      }
    }

    req.tenant = tenant;
    
    // Set RLS context for database queries
    if (req.user) {
      // Store RLS context in request for use in services
      req.rlsContext = {
        userId: req.user.id,
        userEmail: req.user.email,
        accountId: tenant.accountId,
        workspaceId: tenant.workspaceId,
      };
      
      // Set RLS context in database session (for this request)
      // Note: This will be applied in transaction context
      req.setRLSContext = async () => {
        await setRLSContext(
          prisma,
          req.user.id,
          req.user.email,
          tenant.accountId,
          tenant.workspaceId
        );
      };
    }
    
    next();
  } catch (error) {
    logger.error('Tenant middleware error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve tenant context',
    });
  }
};

// Role-based access control decorator
const requireRole = (...roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
        });
        return;
      }

      // Check if user is AppOwner
      // APP_OWNER has full access and can bypass all role checks
      if (req.user && req.user.isAppOwner) {
        // If route explicitly requires APP_OWNER, allow it
        if (roles.includes(UserRole.APP_OWNER)) {
          return next();
        }
        // APP_OWNER can also perform ACCOUNT_ADMIN operations (they own all accounts)
        if (roles.includes(UserRole.ACCOUNT_ADMIN)) {
          return next();
        }
      }

      // Check account-level roles
      if (req.tenant?.accountId) {
        if (req.tenant.accountRole === 'ADMIN' && roles.includes(UserRole.ACCOUNT_ADMIN)) {
          return next();
        }
        if (roles.includes(UserRole.ACCOUNT_MEMBER)) {
          return next();
        }
      }

      // Check workspace-level roles
      // First check if workspaceId is in tenant (from query/headers)
      let workspaceId = req.tenant?.workspaceId;
      let workspaceRole = req.tenant?.workspaceRole;

      // If workspace roles are required but not in tenant, check params (e.g., /:workspaceId/users)
      if (!workspaceId && (roles.includes(UserRole.WORKSPACE_ADMIN) || roles.includes(UserRole.WORKSPACE_MEMBER))) {
        workspaceId = req.params.workspaceId;
        
        if (workspaceId && req.tenant?.accountId) {
          // Manually check workspace_users for this workspace
          const workspaceUser = await prisma.workspaceUser.findUnique({
            where: {
              userId_workspaceId: {
                userId: req.user.id,
                workspaceId,
              },
            },
            include: {
              workspace: true,
            },
          });

          // Verify workspace belongs to account
          if (workspaceUser && workspaceUser.workspace.accountId === req.tenant.accountId) {
            workspaceRole = workspaceUser.role;
          }
        }
      }

      if (workspaceId && workspaceRole) {
        if (workspaceRole === 'ADMIN' && roles.includes(UserRole.WORKSPACE_ADMIN)) {
          return next();
        }
        if (roles.includes(UserRole.WORKSPACE_MEMBER)) {
          return next();
        }
      }

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
      });
    } catch (error) {
      logger.error('Role check error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to verify permissions',
      });
    }
  };
};

module.exports = {
  tenantMiddleware,
  requireRole,
  UserRole,
};

