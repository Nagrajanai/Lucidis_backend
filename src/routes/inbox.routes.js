const { Router } = require('express');
const { InboxController } = require('../controllers/inbox.controller');
const { authMiddleware } = require('../middleware/auth.middleware');
const { tenantMiddleware } = require('../middleware/tenant.middleware');
const { validate } = require('../middleware/validation.middleware');

const router = Router();
const inboxController = new InboxController();

router.use(authMiddleware);
router.use(tenantMiddleware);

// Validation middlewares
const validateConversationId = validate({
  params: ['id'],
});

const validateConversationIdForMessages = validate({
  params: ['conversationId'],
});

const validateCreateMockMessage = validate({
  body: ['subject', 'body', 'fromEmail'],
});

router.get('/conversations', inboxController.getConversations.bind(inboxController));
router.get('/conversations/:id', validateConversationId, inboxController.getConversationById.bind(inboxController));
router.get('/conversations/:conversationId/messages', validateConversationIdForMessages, inboxController.getMessages.bind(inboxController));
router.post('/mock-message', validateCreateMockMessage, inboxController.createMockMessage.bind(inboxController));

module.exports = router;

