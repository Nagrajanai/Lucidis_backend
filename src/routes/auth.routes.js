const { Router } = require('express');
const { AuthController } = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const authController = new AuthController();

// Register AppOwner validation
const validateRegisterAppOwner = validate({
  body: ['email', 'password', 'name'],
});

// Register User validation
const validateRegisterUser = validate({
  body: ['email', 'password', 'firstName', 'lastName'],
});

// Login validation
const validateLogin = validate({
  body: ['email', 'password'],
});

// Refresh token validation
const validateRefreshToken = validate({
  body: ['refreshToken'],
});

router.post('/register/app-owner', validateRegisterAppOwner, authController.registerAppOwner.bind(authController));
router.post('/register/user', validateRegisterUser, authController.registerUser.bind(authController));
router.post('/login', validateLogin, authController.login.bind(authController));
router.post('/refresh-token', validateRefreshToken, authController.refreshToken.bind(authController));
router.post('/logout', authController.logout.bind(authController));
router.get('/me', authMiddleware, authController.getMe.bind(authController));

module.exports = router;

