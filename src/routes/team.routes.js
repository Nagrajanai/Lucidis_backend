const { Router } = require('express');
const { TeamController } = require('../controllers/team.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantMiddleware, requireRole, UserRole } = require('../middleware/tenant.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const teamController = new TeamController();

router.use(authMiddleware);
router.use(tenantMiddleware);

// Validation middlewares
const validateCreateTeam = validate({
  body: ['name', 'slug'],
});

const validateTeamId = validate({
  params: ['id'],
});

const validateInviteUser = validate({
  params: ['teamId'],
  body: ['email', 'role'],
});

// Write operations require WORKSPACE_ADMIN
router.post('/', requireRole(UserRole.WORKSPACE_ADMIN), validateCreateTeam, teamController.createTeam.bind(teamController));
// Read operations allow any workspace member
router.get('/', requireRole(UserRole.WORKSPACE_MEMBER), teamController.getTeams.bind(teamController));
router.get('/:id', requireRole(UserRole.WORKSPACE_MEMBER), validateTeamId, teamController.getTeamById.bind(teamController));
// Write operations require WORKSPACE_ADMIN
router.put('/:id', requireRole(UserRole.WORKSPACE_ADMIN), validateTeamId, teamController.updateTeam.bind(teamController));
router.delete('/:id', requireRole(UserRole.WORKSPACE_ADMIN), validateTeamId, teamController.deleteTeam.bind(teamController));
// Invite API - restricted to WORKSPACE_ADMIN
router.post('/:teamId/invite', requireRole(UserRole.WORKSPACE_ADMIN), validateInviteUser, teamController.inviteUser.bind(teamController));

module.exports = router;

