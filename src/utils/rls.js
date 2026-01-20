// RLS Helper - Sets PostgreSQL session variables for Row-Level Security

const setRLSContext = async (tx, userId, userEmail, accountId, workspaceId) => {
  try {
    // Escape values to prevent SQL injection
    const safeUserId = userId.replace(/'/g, "''");
    const safeUserEmail = userEmail.replace(/'/g, "''");
    const safeAccountId = accountId ? accountId.replace(/'/g, "''") : null;
    const safeWorkspaceId = workspaceId ? workspaceId.replace(/'/g, "''") : null;

    // Set session variables for RLS policies
    // Using SET LOCAL ensures variables are only set for this transaction
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_user_id = '${safeUserId}'`
    );
    await tx.$executeRawUnsafe(
      `SET LOCAL app.current_user_email = '${safeUserEmail}'`
    );
    
    if (safeAccountId) {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_account_id = '${safeAccountId}'`
      );
    }
    
    if (safeWorkspaceId) {
      await tx.$executeRawUnsafe(
        `SET LOCAL app.current_workspace_id = '${safeWorkspaceId}'`
      );
    }
  } catch (error) {
    // RLS context setting failed, but continue (application-level isolation still works)
    console.warn('RLS context setting failed:', error.message);
    throw error;
  }
};

// Execute a callback with RLS context in a transaction
const withRLS = async (prisma, rlsContext, callback) => {
  if (!rlsContext || !rlsContext.userId || !rlsContext.userEmail) {
    // No RLS context, execute normally (fallback to application-level isolation)
    return await callback(prisma);
  }

  return await prisma.$transaction(async (tx) => {
    // Set RLS context for this transaction
    await setRLSContext(
      tx,
      rlsContext.userId,
      rlsContext.userEmail,
      rlsContext.accountId,
      rlsContext.workspaceId
    );
    
    // Execute callback with RLS context active
    return await callback(tx);
  });
};

module.exports = { setRLSContext, withRLS };

