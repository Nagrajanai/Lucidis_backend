const prisma = require('../config/database');
const redis = require('../config/redis');
const { hashPassword } = require('../utils/password');
const { logger } = require('../utils/logger');
const { InvitationService } = require('./invitation.service');

class TeamService {
  async createTeam(departmentId, workspaceId, accountId, data) {
    // Verify department exists and belongs to workspace, and workspace belongs to account
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
      include: {
        workspace: true,
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    if (department.workspace.accountId !== accountId) {
      throw new Error('Department does not belong to this account');
    }

    try {
      const team = await prisma.team.create({
        data: {
          name: data.name,
          slug: data.slug,
          departmentId,
        },
      });

      // Invalidate cache
      await redis.del(`team:${team.id}`);
      await redis.del(`teams:department:${departmentId}`);

      return team;
    } catch (error) {
      // Handle Prisma unique constraint violation
      if (error.code === 'P2002') {
        if (error.meta && error.meta.target && error.meta.target.includes('slug')) {
          throw new Error(`A team with the slug "${data.slug}" already exists in this department`);
        }
        throw new Error('A team with these details already exists');
      }
      // Re-throw other errors
      throw error;
    }
  }

  async getTeams(departmentId, workspaceId) {
    // Verify department belongs to workspace
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
    });

    if (!department) {
      throw new Error('Department not found or does not belong to this workspace');
    }

    const cacheKey = `teams:department:${departmentId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const teams = await prisma.team.findMany({
      where: { departmentId },
      include: {
        teamUsers: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(teams));

    return teams;
  }

  async getTeamById(teamId, departmentId, workspaceId) {
    // Verify department belongs to workspace
    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
    });

    if (!department) {
      throw new Error('Department not found or does not belong to this workspace');
    }

    const cacheKey = `team:${teamId}`;

    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        departmentId,
      },
      include: {
        teamUsers: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(team));

    return team;
  }

  async updateTeam(teamId, departmentId, workspaceId, accountId, data) {
    // First verify team exists and belongs to department, department belongs to workspace, and workspace belongs to account
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        departmentId,
      },
      include: {
        department: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    if (team.department.workspaceId !== workspaceId) {
      throw new Error('Team does not belong to this workspace');
    }

    if (team.department.workspace.accountId !== accountId) {
      throw new Error('Team does not belong to this account');
    }

    // Now update
    const updated = await prisma.team.updateMany({
      where: {
        id: teamId,
        departmentId,
      },
      data,
    });

    if (updated.count === 0) {
      throw new Error('Team not found');
    }

    // Invalidate cache
    await redis.del(`team:${teamId}`);
    await redis.del(`teams:department:${departmentId}`);

    return this.getTeamById(teamId, departmentId, workspaceId);
  }

  async deleteTeam(teamId, departmentId, workspaceId, accountId) {
    // First verify team exists and belongs to department, department belongs to workspace, and workspace belongs to account
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
        departmentId,
      },
      include: {
        department: {
          include: {
            workspace: true,
          },
        },
      },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    if (team.department.workspaceId !== workspaceId) {
      throw new Error('Team does not belong to this workspace');
    }

    if (team.department.workspace.accountId !== accountId) {
      throw new Error('Team does not belong to this account');
    }

    // Now delete
    const deleted = await prisma.team.deleteMany({
      where: {
        id: teamId,
        departmentId,
      },
    });

    if (deleted.count === 0) {
      throw new Error('Team not found');
    }

    // Invalidate cache
    await redis.del(`team:${teamId}`);
    await redis.del(`teams:department:${departmentId}`);

    return { success: true };
  }

  async inviteUserToTeam(teamId, workspaceId, accountId, data, inviterInfo) {
    // First verify Team → Department → Workspace → Account chain
    const team = await prisma.team.findFirst({
      where: {
        id: teamId,
      },
      include: {
        department: {
          include: {
            workspace: {
              include: {
                account: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new Error('Team not found');
    }

    if (team.department.workspaceId !== workspaceId) {
      throw new Error('Team does not belong to this workspace');
    }

    if (team.department.workspace.accountId !== accountId) {
      throw new Error('Team does not belong to this account');
    }

    // Verify inviter has permission to invite
    // Allowed: TEAM_LEAD (of this team), WORKSPACE_ADMIN
    let hasPermission = false;

    // Check if inviter is WORKSPACE_ADMIN
    if (inviterInfo.workspaceRole === 'ADMIN') {
      hasPermission = true;
    }

    // Check if inviter is TEAM_LEAD of this specific team
    if (!hasPermission) {
      const inviterTeamUser = await prisma.teamUser.findUnique({
        where: {
          userId_teamId: {
            userId: inviterInfo.userId,
            teamId: teamId,
          },
        },
      });

      if (inviterTeamUser && inviterTeamUser.role === 'LEAD') {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      throw new Error('Insufficient permissions. Only TEAM_LEAD or WORKSPACE_ADMIN can invite users to teams');
    }

    // Validate role
    if (data.role !== 'LEAD' && data.role !== 'MEMBER') {
      throw new Error('Role must be LEAD or MEMBER');
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new Error('User not found. User must be added to the Department first.');
    }

    // Verify user belongs to the same department (via department_users)
    const departmentUser = await prisma.departmentUser.findUnique({
      where: {
        userId_departmentId: {
          userId: user.id,
          departmentId: team.departmentId,
        },
      },
    });

    if (!departmentUser || departmentUser.status !== 'ACTIVE') {
      throw new Error('User is not an active member of this department. Add to department first.');
    }

    // Check if user is already in this team
    const existingTeamUser = await prisma.teamUser.findUnique({
      where: {
        userId_teamId: {
          userId: user.id,
          teamId,
        },
      },
    });

    if (existingTeamUser) {
      throw new Error('User is already assigned to this team');
    }

    // Create membership with userId and status = ACTIVE
    try {
      const teamUser = await prisma.teamUser.create({
        data: {
          userId: user.id,
          teamId,
          role: data.role,
          status: 'ACTIVE',
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      // Invalidate cache
      await redis.del(`team:${teamId}`);
      await redis.del(`teams:department:${team.departmentId}`);

      // Send notification email
      try {
        const invitationService = new InvitationService();
        await invitationService.sendAllocationEmail(user.email, {
          type: 'TEAM',
          entityName: team.name,
          accountName: team.department.workspace.account.name,
          role: data.role,
        });
      } catch (emailError) {
        logger.error('Failed to send assignment email:', emailError);
      }

      return teamUser;
    } catch (error) {
      logger.error('Error adding user to team:', error);
      throw new Error('Failed to add user to team');
    }
  }
}

module.exports = { TeamService };

