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
