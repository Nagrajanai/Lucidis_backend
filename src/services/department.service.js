const prisma = require('../config/database');
const redis = require('../config/redis');

class DepartmentService {
  async createDepartment(workspaceId, accountId, data) {
    // Verify workspace exists and belongs to account
    const workspace = await prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        accountId: accountId,
      },
    });

    if (!workspace) {
      throw new Error('Workspace not found or does not belong to this account');
    }

    try {
      const department = await prisma.department.create({
        data: {
          name: data.name,
          slug: data.slug,
          workspaceId,
        },
      });

      // Invalidate cache
      await redis.del(`department:${department.id}`);
      await redis.del(`departments:workspace:${workspaceId}`);

      return department;
    } catch (error) {
      // Handle Prisma unique constraint violation
      if (error.code === 'P2002') {
        if (error.meta && error.meta.target && error.meta.target.includes('slug')) {
          throw new Error(`A department with the slug "${data.slug}" already exists in this workspace`);
        }
        throw new Error('A department with these details already exists');
      }
      // Re-throw other errors
      throw error;
    }
  }

  async getDepartments(workspaceId) {
    const cacheKey = `departments:workspace:${workspaceId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const departments = await prisma.department.findMany({
      where: { workspaceId },
      include: {
        teams: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(departments));

    return departments;
  }

  async getDepartmentById(departmentId, workspaceId) {
    const cacheKey = `department:${departmentId}`;
    
    // Try cache first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const department = await prisma.department.findFirst({
      where: {
        id: departmentId,
        workspaceId,
      },
      include: {
        teams: true,
      },
    });

    if (!department) {
      throw new Error('Department not found');
    }

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(department));

    return department;
  }

  async updateDepartment(departmentId, workspaceId, accountId, data) {
    // First verify department exists and belongs to workspace, and workspace belongs to account
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

    // Now update
    const updated = await prisma.department.updateMany({
      where: {
        id: departmentId,
        workspaceId,
      },
      data,
    });

    if (updated.count === 0) {
      throw new Error('Department not found');
    }

    // Invalidate cache
    await redis.del(`department:${departmentId}`);
    await redis.del(`departments:workspace:${workspaceId}`);

    return this.getDepartmentById(departmentId, workspaceId);
  }

  async deleteDepartment(departmentId, workspaceId, accountId) {
    // First verify department exists and belongs to workspace, and workspace belongs to account
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

    // Now delete
    const deleted = await prisma.department.deleteMany({
      where: {
        id: departmentId,
        workspaceId,
      },
    });

    if (deleted.count === 0) {
      throw new Error('Department not found');
    }

    // Invalidate cache
    await redis.del(`department:${departmentId}`);
    await redis.del(`departments:workspace:${workspaceId}`);

    return { success: true };
  }
}

module.exports = { DepartmentService };

