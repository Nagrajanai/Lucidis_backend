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
  DEPARTMENT_MANAGER: 'DEPARTMENT_MANAGER',
  HUMAN_SUPPORT: 'HUMAN_SUPPORT',
  DEPARTMENT_MEMBER: 'MEMBER', // Maps to DB role 'MEMBER'
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

    // Extract account ID and workspace ID
    let accountId = req.query.accountId || req.headers['x-account-id'] || req.body.accountId;

    // Only consider req.params.id as workspaceId if we are in the workspaces route
    const isWorkspaceRoute = req.baseUrl?.includes('/workspaces');
    const paramWorkspaceId = isWorkspaceRoute ? req.params.id : undefined;

    let workspaceId = req.query.workspaceId || req.headers['x-workspace-id'] || req.params.workspaceId || paramWorkspaceId || req.body.workspaceId;

    // REMOVED: Context Promotion (Inference) block.
    // We do NOT infer accountId from workspaceId here. Strict verification happens in requireRole.

    if (accountId) {
      tenant.accountId = accountId;

      if (req.user.isAppOwner) {
        // APP_OWNER bypasses account_users check - they own all accounts via app_owners table
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

        tenant.accountRole = 'ADMIN'; // Treat as ADMIN for role checks
        req.account = account;
      } else {
        // Regular users try account_users first
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

        if (accountUser) {
          tenant.accountRole = accountUser.role;
          req.account = accountUser.account;
        }

        // If accountUser is missing, we DON'T fail immediately here.
        // We allow the request to proceed. Downstream requireRole checks will strictly enforce permissions.
      }

      if (workspaceId) {
        tenant.workspaceId = workspaceId;

        if (req.user.isAppOwner) {
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

          tenant.workspaceRole = 'ADMIN'; // Treat as ADMIN for role checks
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

          if (workspaceUser) {
            // Check if workspace matches account context (if strict account hierarchy is enforced)
            if (accountId && workspaceUser.workspace.accountId !== accountId) {
              // Mismatch between header accountId and workspace's actual accountId
              res.status(403).json({
                success: false,
                error: 'Workspace does not belong to the specified account',
              });
              return;
            }

            tenant.workspaceRole = workspaceUser.role;
            req.workspace = workspaceUser.workspace;

            // Auto-promote accountId logic removed. It must be explicit.
          }
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
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      // AppOwners bypass role checks but still need tenant context for controllers/services
      if (req.user.isAppOwner) {
        const isWorkspaceRoute = req.baseUrl?.includes('/workspaces');
        const paramWorkspaceId = isWorkspaceRoute ? req.params.id : undefined;
        let workspaceId = req.tenant?.workspaceId || req.params.workspaceId || paramWorkspaceId || req.body.workspaceId;

        if (workspaceId && !req.tenant?.accountId) {
          const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { accountId: true }
          });
          if (workspace) {
            req.tenant = req.tenant || {};
            req.tenant.workspaceId = workspaceId;
            req.tenant.accountId = workspace.accountId;
            req.tenant.workspaceRole = 'ADMIN';
            req.tenant.accountRole = 'ADMIN';

            if (req.rlsContext) {
              req.rlsContext.workspaceId = workspaceId;
              req.rlsContext.accountId = workspace.accountId;
            }
          }
        }
        return next();
      }

      // --- STRICT HIERARCHY VERIFICATION ---
      // We explicitly resolve IDs and verify membership from Top-Down

      // 1. Resolve IDs
      const isWorkspaceRoute = req.baseUrl?.includes('/workspaces');
      let workspaceId = req.tenant?.workspaceId || req.params.workspaceId || (isWorkspaceRoute ? req.params.id : undefined) || req.body.workspaceId || req.query.workspaceId;

      const isDepartmentRoute = req.baseUrl?.includes('/departments');
      let departmentId = req.params.departmentId || req.body.departmentId || req.query.departmentId || (isDepartmentRoute ? req.params.id : undefined);

      const isTeamRoute = req.baseUrl?.includes('/teams');
      let teamId = req.params.teamId || req.body.teamId || req.query.teamId || (isTeamRoute ? req.params.id : undefined);

      // 2. Resolve Upstream IDs if missing (Strictly for verification)
      if (teamId && !departmentId) {
        const team = await prisma.team.findUnique({ where: { id: teamId }, select: { departmentId: true } });
        if (team) departmentId = team.departmentId;
      }
      if (departmentId && !workspaceId) {
        const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { workspaceId: true } });
        if (dept) workspaceId = dept.workspaceId;
      }

      // 3. Verify Account Membership (Always Required if we are in a tenant context)
      if (workspaceId) {
        // Get Account ID for this workspace
        const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { accountId: true } });
        if (!workspace) {
          return res.status(404).json({ success: false, error: 'Workspace not found' });
        }

        const realAccountId = workspace.accountId;

        // Verify AccountUser
        const activeAccountUser = await prisma.accountUser.findUnique({
          where: { userId_accountId: { userId: req.user.id, accountId: realAccountId } }
        });

        if (!activeAccountUser || activeAccountUser.status !== 'ACTIVE') {
          return res.status(403).json({ success: false, error: 'Access Denied. You must be an active member of the Account.' });
        }

        // Set Context
        req.tenant = req.tenant || {};
        req.tenant.accountId = realAccountId;
        req.tenant.accountRole = activeAccountUser.role;

        // Verify WorkspaceUser
        const workspaceUser = await prisma.workspaceUser.findUnique({
          where: { userId_workspaceId: { userId: req.user.id, workspaceId: workspaceId } }
        });

        if (!workspaceUser || workspaceUser.status !== 'ACTIVE') {
          // Allow Account Admin to bypass constraint ONLY if checking for ACCOUNT_ADMIN role
          const hasAccountAdminReq = roles.includes(UserRole.ACCOUNT_ADMIN);
          if (activeAccountUser.role === 'ADMIN' && hasAccountAdminReq) {
            req.tenant.workspaceId = workspaceId;
            req.tenant.workspaceRole = 'ADMIN'; // Virtual
          } else {
            return res.status(403).json({ success: false, error: 'Access Denied. You must be an active member of the Workspace.' });
          }
        } else {
          req.tenant.workspaceId = workspaceId;
          req.tenant.workspaceRole = workspaceUser.role;
        }
      }

      // 4. Verify Department Membership
      if (departmentId) {
        if (!req.tenant.workspaceId) {
          return res.status(403).json({ success: false, error: 'Access Denied. Workspace context required.' });
        }

        const departmentUser = await prisma.departmentUser.findUnique({
          where: { userId_departmentId: { userId: req.user.id, departmentId: departmentId } },
          include: { department: true }
        });

        // Verify Workspace Authority
        if (req.tenant.workspaceRole === 'ADMIN') {
          // Workspace Admin has full access
          if (departmentUser) {
            req.tenant.departmentId = departmentId;
            req.tenant.departmentRole = departmentUser.role;
          } else {
            req.tenant.departmentId = departmentId;
            // No specific department role, but Workspace Admin implies override
          }
        } else {
          // Regular user MUST be DepartmentUser
          if (!departmentUser || departmentUser.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, error: 'Access Denied. You must be an active member of the Department.' });
          }
          req.tenant.departmentId = departmentId;
          req.tenant.departmentRole = departmentUser.role;
        }
      }

      // --- PERMISSION CHECKS ---

      // 1. ACCOUNT_ADMIN
      if (roles.includes(UserRole.ACCOUNT_ADMIN) && req.tenant.accountRole === 'ADMIN') {
        return next();
      }

      // 2. ACCOUNT_MEMBER
      if (roles.includes(UserRole.ACCOUNT_MEMBER) && req.tenant.accountRole) {
        return next();
      }

      console.log("roles.includes(UserRole.WORKSPACE_ADMIN) && req.tenant.workspaceRole === 'ADMIN'", roles.includes(UserRole.WORKSPACE_ADMIN) && req.tenant.workspaceRole === 'ADMIN');
      console.log("roles", roles);
      console.log("UserRole.WORKSPACE_ADMIN", UserRole.WORKSPACE_ADMIN);
      console.log("req.tenant.workspaceRole", req.tenant.workspaceRole);

      // 3. WORKSPACE_ADMIN
      if (roles.includes(UserRole.WORKSPACE_ADMIN) && req.tenant.workspaceRole === 'ADMIN') {
        return next();
      }

      // 4. WORKSPACE_MEMBER
      if (roles.includes(UserRole.WORKSPACE_MEMBER) && req.tenant.workspaceRole) {
        return next();
      }

      // 5. DEPARTMENT ROLES
      if (departmentId) {
        // If Workspace Admin, they have implicit permissions unless role specifically demands a Department Role (which it shouldn't for Admins)
        // But our middleware logic is OR based. If we passed Workspace Admin check above, we returned.
        // So if we are here, we are NOT a Workspace Admin (or didn't ask for it).

        if (req.tenant.departmentRole) {
          if (roles.includes(UserRole.DEPARTMENT_MANAGER) && req.tenant.departmentRole === 'DEPARTMENT_MANAGER') return next();
          if (roles.includes(UserRole.HUMAN_SUPPORT) && (req.tenant.departmentRole === 'HUMAN_SUPPORT' || req.tenant.departmentRole === 'DEPARTMENT_MANAGER')) return next();
          if (roles.includes(UserRole.DEPARTMENT_MEMBER)) return next();
        }
      }

      // 6. Global List fallbacks (Account List)
      if (!req.tenant.accountId && !workspaceId) {
        if (roles.includes(UserRole.ACCOUNT_ADMIN) || roles.includes(UserRole.ACCOUNT_MEMBER)) return next();
      }

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
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
