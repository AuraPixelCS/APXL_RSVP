import nodemailer from "nodemailer";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  attachments?: Array<{
    filename: string;
    content: string;
    encoding: string;
    cid: string;
  }>;
}

// Nodemailer transporter uses Gmail.
// To make this work, the Google account MUST have "App Passwords" enabled.
const smtpOptions = {
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER || "", // Guest/Admin's gmail
    pass: process.env.SMTP_PASS || "", // Google App Password (not the actual password)
  },
};

export const sendEmail = async (data: EmailPayload) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.warn("Nodemailer SMTP_USER or SMTP_PASS is missing. Email will not be sent.");
    return { success: false, message: "Missing email credentials" };
  }

  const transporter = nodemailer.createTransport(smtpOptions);

  try {
    const info = await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME ?? "PEOPLElogy Anniversary RSVP"}" <${process.env.SMTP_USER}>`,
      to: data.to,
      subject: data.subject,
      html: data.html,
      attachments: data.attachments,
    });
    
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("Error sending email:", error.message);
    return { success: false, error: error.message };
  }
};

// ─── Bulk send (pooled) ──────────────────────────────────────────────────────
//
// Sends many emails over a SINGLE pooled, authenticated SMTP connection with a
// capped concurrency and send-rate. This is the correct way to do bulk over
// Gmail — opening a fresh connection/login per message (as `sendEmail` does)
// makes Gmail reject the flood with "421 too many concurrent connections" after
// only a handful succeed. Each message reuses the warm pool instead.
//
// Returns one result per input message, in order.
export const sendBulkEmails = async (
  messages: EmailPayload[]
): Promise<Array<{ success: boolean; error?: string }>> => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return messages.map(() => ({ success: false, error: "Missing email credentials" }));
  }

  const transporter = nodemailer.createTransport({
    ...smtpOptions,
    pool: true,
    maxConnections: 4,   // a few parallel connections, well under Gmail's limit
    maxMessages: 100,    // recycle a connection after 100 sends
    rateDelta: 1000,     // per 1s window…
    rateLimit: 8,        // …send at most 8 messages (≈8/sec across the pool)
  });

  const from = `"${process.env.SMTP_FROM_NAME ?? "PEOPLElogy Anniversary RSVP"}" <${process.env.SMTP_USER}>`;

  try {
    // Submit all messages; the pool queues them and respects maxConnections + rateLimit.
    const settled = await Promise.allSettled(
      messages.map((data) =>
        transporter.sendMail({
          from,
          to: data.to,
          subject: data.subject,
          html: data.html,
          attachments: data.attachments,
        })
      )
    );

    return settled.map((r) =>
      r.status === "fulfilled"
        ? { success: true }
        : { success: false, error: (r.reason as Error)?.message ?? "send failed" }
    );
  } finally {
    transporter.close();
  }
};
