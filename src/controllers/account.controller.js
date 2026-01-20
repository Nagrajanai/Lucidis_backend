const { AccountService } = require('../services/account.service');

const accountService = new AccountService();

class AccountController {
  async createAccount(req, res) {
    try {
      // Check if user is AppOwner
      if (!req.user || !req.user.isAppOwner) {
        res.status(403).json({
          success: false,
          error: 'Only AppOwners can create accounts',
        });
        return;
      }

      const account = await accountService.createAccount(req.user.id, req.body);

      const response = {
        success: true,
        data: account,
        message: 'Account created successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create account';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getAccounts(req, res) {
    try {
      if (!req.user || !req.user.isAppOwner) {
        res.status(403).json({
          success: false,
          error: 'Only AppOwners can view accounts',
        });
        return;
      }

      const accounts = await accountService.getAccounts(req.user.id);

      const response = {
        success: true,
        data: accounts,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to get accounts';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async getAccountById(req, res) {
    try {
      if (!req.user || !req.user.isAppOwner) {
        res.status(403).json({
          success: false,
          error: 'Only AppOwners can view accounts',
        });
        return;
      }

      const account = await accountService.getAccountById(req.params.id, req.user.id);

      const response = {
        success: true,
        data: account,
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Account not found';
      res.status(404).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async updateAccount(req, res) {
    try {
      if (!req.user || !req.user.isAppOwner) {
        res.status(403).json({
          success: false,
          error: 'Only AppOwners can update accounts',
        });
        return;
      }

      const account = await accountService.updateAccount(req.params.id, req.user.id, req.body);

      const response = {
        success: true,
        data: account,
        message: 'Account updated successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update account';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async deleteAccount(req, res) {
    try {
      if (!req.user || !req.user.isAppOwner) {
        res.status(403).json({
          success: false,
          error: 'Only AppOwners can delete accounts',
        });
        return;
      }

      await accountService.deleteAccount(req.params.id, req.user.id);

      const response = {
        success: true,
        message: 'Account deleted successfully',
      };

      res.status(200).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete account';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }

  async inviteUserToAccount(req, res) {
    try {
      if (!req.user || !req.user.isAppOwner) {
        res.status(403).json({
          success: false,
          error: 'Only AppOwners can invite users to accounts',
        });
        return;
      }

      const accountUser = await accountService.inviteUserToAccount(
        req.params.accountId,
        req.user.id,
        req.body
      );

      const response = {
        success: true,
        data: accountUser,
        message: 'User invited to account successfully',
      };

      res.status(201).json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to invite user to account';
      res.status(400).json({
        success: false,
        error: errorMessage,
      });
    }
  }
}

module.exports = { AccountController };

