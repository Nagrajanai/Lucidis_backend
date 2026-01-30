const prisma = require('../config/database');
const crypto = require('crypto');
const { logger } = require('../utils/logger');


/**
 * Invitation Service
 * 
 * Handles invitation creation and email sending for invite-first onboarding.
 */
class InvitationService {
  /**
   * Generate a secure invitation token
   * @private
   */
  _generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Hash invitation token for storage
   * @private
   */
  _hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create an invitation record
   * 
   * @param {Object} params
   * @param {string} params.email - Invitee email
   * @param {string} params.accountId - Account ID
   * @param {string} params.invitedByUserId - User ID of inviter (optional)
   * @param {string} params.invitedByAppOwnerId - AppOwner ID of inviter (optional)
   * @param {string} params.scope - InvitationScope (ACCOUNT, WORKSPACE, DEPARTMENT, TEAM)
   * @param {string} params.targetId - Target ID (workspaceId, departmentId, teamId) - nullable for ACCOUNT
   * @param {string} params.role - Role to assign
   * @param {number} params.expiresInDays - Days until expiration (default: 7)
   * @returns {Promise<Object>} Invitation with plain token
   */
  async createInvitation({ email, accountId, invitedByUserId, invitedByAppOwnerId, scope, targetId, role, expiresInDays = 7 }) {
    const token = this._generateToken();
    // Store plain token as requested (No Hash) to allow frontend retrieval
    const tokenHash = token;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const data = {
      email,
      accountId,
      scope,
      targetId,
      role,
      tokenHash,
      expiresAt,
      status: 'INVITED',
    };

    if (invitedByUserId) {
      data.invitedByUserId = invitedByUserId;
    }
    if (invitedByAppOwnerId) {
      data.invitedByAppOwnerId = invitedByAppOwnerId;
    }

    const invitation = await prisma.invitation.create({
      data,
    });

    // Return invitation with plain token for email sending
    return {
      ...invitation,
      token, // Include plain token for email (not stored in DB)
    };
  }

  /**
   * Send invitation email via SMTP
   * 
   * @param {Object} invitation - Invitation object with token
   * @param {Object} context - Additional context for email (account name, workspace name, etc.)
   */
  async sendInvitationEmail(invitation, context = {}) {
    // TODO: Implement SMTP email sending
    // This is a placeholder - actual implementation should use nodemailer or similar

    const invitationUrl = this._buildInvitationUrl(invitation, context);

    logger.info('Invitation email would be sent:', {
      to: invitation.email,
      url: invitationUrl,
      scope: invitation.scope,
      role: invitation.role,
    });
    return invitationUrl;
    // Placeholder for actual email sending
    // await this._sendEmail({
    //   to: invitation.email,
    //   subject: `You've been invited to join ${context.accountName || 'the platform'}`,
    //   html: this._buildEmailTemplate(invitation, context, invitationUrl),
    // });
  }

  /**
   * Accept an invitation and register the user
   * 
   * @param {string} token - Invitation token
   * @param {Object} userData - Registration data (password, firstName, lastName, phone)
   */
  async acceptInvitationAndRegisterUser(token, userData) {
    // 1. Validate invitation
    // Check plain token first (New behavior)
    let invitation = await prisma.invitation.findFirst({
      where: { tokenHash: token }
    });

    // Check hashed token (Backward compatibility)
    if (!invitation) {
      const hashed = this._hashToken(token);
      invitation = await prisma.invitation.findFirst({
        where: { tokenHash: hashed }
      });
    }

    if (!invitation) {
      throw new Error('Invalid invitation token');
    }

    if (invitation.status !== 'INVITED') {
      throw new Error('Invitation is not valid');
    }

    if (new Date() > invitation.expiresAt) {
      // Mark as expired if not already
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' }
      });
      throw new Error('Invitation has expired');
    }

    // 2. Prepare user data - enforce email from invitation
    const registrationData = {
      ...userData,
      email: invitation.email
    };

    // 3. Create User using AuthService (reusing core logic)
    // We need to handle the potential "User already exists" error from createUser if needed, 
    // though createUser checks it too.
    const { AuthService } = require('./auth.service');
    const authService = new AuthService();

    const user = await authService.createUser(registrationData);

    // 4. Activate related INVITED memberships
    const membershipTables = [
      prisma.accountUser,
      prisma.workspaceUser,
      prisma.departmentUser,
      prisma.teamUser
    ];

    for (const table of membershipTables) {
      await table.updateMany({
        where: {
          email: invitation.email,
          status: 'INVITED'
        },
        data: {
          userId: user.id,
          status: 'ACTIVE'
        }
      });
    }

    // 5. Mark invitation as ACCEPTED
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED' }
    });

    return { success: true };
  }

  /**
   * Build invitation URL
   * @private
   */
  _buildInvitationUrl(invitation, context) {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    return `${baseUrl}/accept-invitation?token=${invitation.token}`;
  }

  /**
   * Build email template
   * @private
   */
  _buildEmailTemplate(invitation, context, url) {
    // Placeholder email template
    return `
      <h1>You've been invited!</h1>
      <p>You've been invited to join ${context.accountName || 'the platform'} as ${invitation.role}.</p>
      <p><a href="${url}">Accept Invitation</a></p>
      <p>This invitation expires on ${invitation.expiresAt.toLocaleDateString()}.</p>
    `;
  }
  /**
   * Send notification email for direct allocation (Workspace, Department, Team)
   * 
   * @param {string} email - User email
   * @param {Object} context - Context (type, entityName, role, accountName)
   */
  async sendAllocationEmail(email, context) {
    // TODO: Implement SMTP email sending

    const subject = `You have been added to ${context.entityName}`;
    const typeLabel = context.type.charAt(0).toUpperCase() + context.type.slice(1).toLowerCase(); // 'Workspace', 'Department'

    logger.info('Allocation email would be sent:', {
      to: email,
      subject,
      type: context.type,
      entity: context.entityName,
      role: context.role,
    });

    // return this._sendEmail({
    //   to: email,
    //   subject,
    //   html: `
    //     <h1>You have been added to a ${typeLabel}</h1>
    //     <p>You have been assigned to the <strong>${context.entityName}</strong> ${typeLabel.toLowerCase()} in ${context.accountName}.</p>
    //     <p>Role: ${context.role}</p>
    //     <p><a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}">Log in to view</a></p>
    //   `
    // });

    return true;
  }
}

module.exports = { InvitationService };