const { AuthService } = require('../services/auth.service');

const authService = new AuthService();

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
            name: result.appOwner.name,
          },
          tokens: result.tokens,
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
      const result = await authService.registerUser(data);

      const response = {
        success: true,
        data: {
          user: {
            id: result.user.id,
            email: result.user.email,
            firstName: result.user.firstName,
            lastName: result.user.lastName,
            phone: result.user.phone,
          },
          tokens: result.tokens,
        },
        message: 'User registered successfully',
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

      let response;
      if (result.userType === 'AppOwner') {
        response = {
          success: true,
          data: {
            user: {
              id: result.appOwner.id,
              email: result.appOwner.email,
              name: result.appOwner.name,
            },
            tokens: result.tokens,
          },
          message: 'Login successful',
        };
      } else {
        response = {
          success: true,
          data: {
            user: {
              id: result.user.id,
              email: result.user.email,
              firstName: result.user.firstName,
              lastName: result.user.lastName,
              phone: result.user.phone,
            },
            tokens: result.tokens,
          },
          message: 'Login successful',
        };
      }

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
        data: { tokens },
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

