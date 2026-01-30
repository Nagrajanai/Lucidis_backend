const { AuthService } = require('../services/auth.service');
const { InvitationService } = require('../services/invitation.service');

const authService = new AuthService();
const invitationService = new InvitationService();

class AuthController {
  async registerAppOwner(req, res) {
    try {
      const data = req.body;
      const result = await authService.registerAppOwner(data);

      const response = {
        success: true,
        data: {
          user: {
            id: result.appOwner.id,
            email: result.appOwner.email,
            fullName: result.appOwner.name,
            globalRole: 'APP_OWNER',
          },
          context: {
            accounts: [], // New AppOwner has no accounts yet
            workspaces: [],
            departments: [],
            teams: [],
          },
          auth: result.tokens,
        },
        message: 'AppOwner registered successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async registerUser(req, res) {
    try {
      const data = req.body;
      const { token } = req.query;

      if (!token) {
        res.status(400).json({
          success: false,
          error: 'Invitation token is required',
        });
        return;
      }

      await invitationService.acceptInvitationAndRegisterUser(token, data);

      const response = {
        success: true,
        message: 'Invitation accepted and user registered successfully. Please login to continue.',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Registration failed';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async login(req, res) {
    try {
      const data = req.body;
      const result = await authService.login(data);

      const response = {
        success: true,
        data: result,
        message: 'Login successful',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Login failed';
      res.status(401).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          success: false,
          error: 'Refresh token is required',
        });
        return;
      }

      const tokens = await authService.refreshToken(refreshToken);

      const response = {
        success: true,
        data: { auth: tokens },
        message: 'Token refreshed successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Token refresh failed';
      res.status(401).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async logout(req, res) {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        await authService.logout(refreshToken);
      }

      const response = {
        success: true,
        message: 'Logout successful',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Logout failed';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getMe(req, res) {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: 'User not authenticated',
        });
        return;
      }

      const response = {
        success: true,
        data: {
          id: req.user.id,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          phone: req.user.phone,
          avatar: req.user.avatar,
        },
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get user info';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }
}

module.exports = { AuthController };

