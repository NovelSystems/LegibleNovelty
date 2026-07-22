import nodemailer from "nodemailer";

// Transactional email for Stage 1, sent through the same transport Stage 0
// stood up: Nodemailer → Mailpit (SMTP host `mailpit:1025`) in dev, Resend in
// production. This is the "Auth.js/Resend adapter" the brief refers to — the
// shared email-sending mechanism, NOT the separate in-app Notification
// subsystem (which stays deferred). Auth.js's own magic-link machinery only
// covers verification tokens; the seven Task 10 triggers include transactional
// mails (graduation, token received, ...) that have no Auth.js concept, so they
// route through this shared transport directly.

const SMTP_HOST = process.env.SMTP_HOST ?? "mailpit";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "1025");
const EMAIL_FROM = process.env.EMAIL_FROM ?? "no-reply@legiblenovelty.local";

let transport: nodemailer.Transporter | null = null;

function getTransport(): nodemailer.Transporter {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
    });
  }
  return transport;
}

// The seven Task 10 notification categories. Security-critical categories are
// non-optional and never consulted against Account.notification_opt_outs.
export const NotificationCategory = {
  EMAIL_VERIFICATION: "email_verification",
  PASSWORD_RESET: "password_reset",
  PARENT_DELETION_WARNING: "parent_deletion_warning",
  CHILD_GRADUATION: "child_graduation",
  VE_DECISION: "ve_decision",
  PEER_TOKEN_RECEIVED: "peer_token_received",
  PEER_TOKEN_REFRESHED: "peer_token_refreshed",
} as const;

export type NotificationCategoryValue =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

// Account/security-critical categories are always delivered regardless of a
// user's opt-out preferences.
const NON_OPTIONAL: Set<string> = new Set([
  NotificationCategory.EMAIL_VERIFICATION,
  NotificationCategory.PASSWORD_RESET,
]);

export interface SendEmailArgs {
  to: string;
  subject: string;
  text: string;
  category: NotificationCategoryValue;
  // Opt-out list from the recipient's Account (ignored for non-optional cats).
  optOuts?: string[];
}

// Returns true if the email was sent, false if it was suppressed by an opt-out.
export async function sendEmail(args: SendEmailArgs): Promise<boolean> {
  const { to, subject, text, category, optOuts = [] } = args;

  if (!NON_OPTIONAL.has(category) && optOuts.includes(category)) {
    return false;
  }

  await getTransport().sendMail({ from: EMAIL_FROM, to, subject, text });
  return true;
}

// ---------------------------------------------------------------------------
// Task 10 trigger helpers — one per notification, so callers can't accidentally
// mislabel the category (which is what governs opt-out suppression).
// ---------------------------------------------------------------------------

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

export function sendEmailVerification(to: string, token: string) {
  return sendEmail({
    to,
    subject: "Verify your Legible Novelty email",
    text: `Confirm your email to activate your account: ${APP_URL}/verify-email?token=${token}`,
    category: NotificationCategory.EMAIL_VERIFICATION,
  });
}

export function sendPasswordReset(to: string, token: string) {
  return sendEmail({
    to,
    subject: "Reset your Legible Novelty password",
    text: `Reset your password using this link: ${APP_URL}/reset-password?token=${token}`,
    category: NotificationCategory.PASSWORD_RESET,
  });
}

// Reclaim proof-of-control email (purged account). Security-critical path;
// reuses the email_verification category so it is always delivered.
export function sendReclaimVerification(to: string, token: string) {
  return sendEmail({
    to,
    subject: "Confirm control of this email to reclaim your account",
    text: `Click to prove control of this address and reclaim your account: ${APP_URL}/reclaim?token=${token}`,
    category: NotificationCategory.EMAIL_VERIFICATION,
  });
}

export function sendParentDeletionWarning(
  to: string,
  optOuts: string[],
  childCount: number,
) {
  return sendEmail({
    to,
    subject: "Your account deletion affects attached child accounts",
    text:
      `You are deleting an account with ${childCount} attached child account(s). ` +
      `Those accounts will become inaccessible for new logins until each child's ` +
      `13th birthday. During that time the child can still read all modules ` +
      `anonymously, and may choose to purge their own account immediately instead.`,
    category: NotificationCategory.PARENT_DELETION_WARNING,
    optOuts,
  });
}

export function sendGraduationNotification(to: string, optOuts: string[]) {
  return sendEmail({
    to,
    subject: "Your Legible Novelty account has graduated",
    text:
      `Your child sub-account has automatically graduated to a standard account ` +
      `on its 13th birthday. Note that 18+-gated features remain unavailable ` +
      `until adulthood.`,
    category: NotificationCategory.CHILD_GRADUATION,
    optOuts,
  });
}

export function sendVeDecision(
  to: string,
  optOuts: string[],
  approved: boolean,
) {
  return sendEmail({
    to,
    subject: approved
      ? "You are now a Verified Educator"
      : "Update on your Verified Educator application",
    text: approved
      ? `Your Verified Educator status has been granted.`
      : `Your Verified Educator application was not approved. You may re-apply ` +
        `or pursue the peer-token path.`,
    category: NotificationCategory.VE_DECISION,
    optOuts,
  });
}

export function sendPeerTokenReceived(to: string, optOuts: string[]) {
  return sendEmail({
    to,
    subject: "You have received a Verified Educator peer token",
    text:
      `A Verified Educator has granted you a peer token. You now hold Verified ` +
      `Educator status.`,
    category: NotificationCategory.PEER_TOKEN_RECEIVED,
    optOuts,
  });
}

export function sendPeerTokenRefreshed(to: string, optOuts: string[]) {
  return sendEmail({
    to,
    subject: "Your Verified Educator peer token has refreshed",
    text: `Your peer token is available again to grant to another account.`,
    category: NotificationCategory.PEER_TOKEN_REFRESHED,
    optOuts,
  });
}
