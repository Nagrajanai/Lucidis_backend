const prisma = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateAccessToken, generateRefreshToken, decodeToken } = require('../utils/jwt');

class AuthService {
  async registerAppOwner(data) {
    // Check if AppOwner already exists
    const existingAppOwner = await prisma.appOwner.findUnique({
      where: { email: data.email },
    });

    if (existingAppOwner) {
      throw new Error('AppOwner with this email already exists');
    }

    const hashedPassword = await hashPassword(data.password);

    // Create AppOwner record
    const appOwner = await prisma.appOwner.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
      },
    });

    const tokens = {
      accessToken: generateAccessToken(appOwner.id, appOwner.email),
      refreshToken: generateRefreshToken(appOwner.id, appOwner.email),
    };

    // Store refresh token for AppOwner
    await prisma.appOwnerRefreshToken.create({
      data: {
        appOwnerId: appOwner.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { appOwner, tokens };
  }

  async createUser(data) {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const hashedPassword = await hashPassword(data.password);

    // Create User record
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null, // Optional phone field
      },
    });

    return user;
  }

  async registerUser(data) {
    const user = await this.createUser(data);

    const tokens = {
      accessToken: generateAccessToken(user.id, user.email),
      refreshToken: generateRefreshToken(user.id, user.email),
    };

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    return { user, tokens };
  }

  async login(data) {
    // Try AppOwner first
    const appOwner = await prisma.appOwner.findUnique({
      where: { email: data.email },
    });

    if (appOwner) {
      const isPasswordValid = await comparePassword(data.password, appOwner.password);

      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      const tokens = {
        accessToken: generateAccessToken(appOwner.id, appOwner.email),
        refreshToken: generateRefreshToken(appOwner.id, appOwner.email),
      };

      // Store refresh token for AppOwner
      await prisma.appOwnerRefreshToken.create({
        data: {
          appOwnerId: appOwner.id,
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      // Fetch accounts owned by AppOwner
      const accounts = await prisma.account.findMany({
        where: { appOwnerId: appOwner.id },
        select: { id: true },
      });

      return {
        user: {
          id: appOwner.id,
          email: appOwner.email,
          fullName: appOwner.name,
          globalRole: 'APP_OWNER',
        },
        context: {
          accounts: accounts.map((a) => ({ accountId: a.id, role: 'OWNER' })),
          workspaces: [],
          departments: [],
          teams: [],
        },
        auth: tokens,
      };
    }

    // Try User
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.isActive) {
      throw new Error('User account is inactive');
    }

    const isPasswordValid = await comparePassword(data.password, user.password);

    if (!isPasswordValid) {
      throw new Error('Invalid email or password');
    }

    const tokens = {
      accessToken: generateAccessToken(user.id, user.email),
      refreshToken: generateRefreshToken(user.id, user.email),
    };

    // Store refresh token
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      },
    });

    // Fetch active memberships
    const [accountUsers, workspaceUsers, departmentUsers, teamUsers] = await Promise.all([
      prisma.accountUser.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { accountId: true, role: true },
      }),
      prisma.workspaceUser.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { workspaceId: true, role: true },
      }),
      prisma.departmentUser.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { departmentId: true, role: true },
      }),
      prisma.teamUser.findMany({
        where: { userId: user.id, status: 'ACTIVE' },
        select: { teamId: true, role: true },
      }),
    ]);

    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: fullName || user.email, // Fallback if name is empty
        globalRole: 'USER',
      },
      context: {
        accounts: accountUsers.map((m) => ({ accountId: m.accountId, role: m.role })),
        workspaces: workspaceUsers.map((m) => ({ workspaceId: m.workspaceId, role: m.role })),
        departments: departmentUsers.map((m) => ({ departmentId: m.departmentId, role: m.role })),
        teams: teamUsers.map((m) => ({ teamId: m.teamId, role: m.role })),
      },
      auth: tokens,
    };
  }

  async refreshToken(refreshToken) {
    // Try to find token in User refresh tokens
    let tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    let isAppOwner = false;
    let userId, userEmail;

    if (tokenRecord) {
      // User token found
      if (tokenRecord.expiresAt < new Date()) {
        throw new Error('Invalid or expired refresh token');
      }
      userId = tokenRecord.user.id;
      userEmail = tokenRecord.user.email;
    } else {
      // Try AppOwner refresh tokens
      const appOwnerTokenRecord = await prisma.appOwnerRefreshToken.findUnique({
        where: { token: refreshToken },
        include: { appOwner: true },
      });

      if (!appOwnerTokenRecord || appOwnerTokenRecord.expiresAt < new Date()) {
        throw new Error('Invalid or expired refresh token');
      }

      isAppOwner = true;
      userId = appOwnerTokenRecord.appOwner.id;
      userEmail = appOwnerTokenRecord.appOwner.email;
      tokenRecord = appOwnerTokenRecord;
    }

    // Generate new tokens
    const tokens = {
      accessToken: generateAccessToken(userId, userEmail),
      refreshToken: generateRefreshToken(userId, userEmail),
    };

    // Delete old refresh token
    if (isAppOwner) {
      await prisma.appOwnerRefreshToken.delete({
        where: { id: tokenRecord.id },
      });

      // Store new refresh token for AppOwner
      await prisma.appOwnerRefreshToken.create({
        data: {
          appOwnerId: userId,
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    } else {
      await prisma.refreshToken.delete({
        where: { id: tokenRecord.id },
      });

      // Store new refresh token for User
      await prisma.refreshToken.create({
        data: {
          userId: userId,
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });
    }

    return tokens;
  }

  async logout(refreshToken) {
    // Delete from User refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });

    // Delete from AppOwner refresh tokens
    await prisma.appOwnerRefreshToken.deleteMany({
      where: { token: refreshToken },
    });
  }

  async logoutAll(userId) {
    // Delete all User refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    // Delete all AppOwner refresh tokens (if userId is AppOwner)
    await prisma.appOwnerRefreshToken.deleteMany({
      where: { appOwnerId: userId },
    });
  }
}

module.exports = { AuthService };

