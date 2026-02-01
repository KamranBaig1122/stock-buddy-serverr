import { GoogleAuth } from 'google-auth-library';
import axios from 'axios';
import User from '../models/User';
import { sendEmail } from './emailService';

type UserRole = 'admin' | 'staff';

interface NotificationOptions {
  title: string;
  message: string;
  data?: Record<string, unknown>;
  roles?: UserRole[];
  emailSubject?: string;
  emailHtml?: string;
  attachments?: Array<{
    filename: string;
    content: string;
    encoding: string;
    cid?: string;
  }>;
}

// Load service account credentials from environment variable only
const getServiceAccount = () => {
  if (!process.env.FCM_SERVICE_ACCOUNT) {
    throw new Error(
      'FCM_SERVICE_ACCOUNT environment variable is required. ' +
      'Please set it in your environment variables with the Firebase service account JSON as a single-line string.'
    );
  }

  try {
    const serviceAccount = JSON.parse(process.env.FCM_SERVICE_ACCOUNT);
    
    // Validate required fields
    const requiredFields = ['type', 'project_id', 'private_key', 'client_email'];
    const missingFields = requiredFields.filter(field => !serviceAccount[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`FCM_SERVICE_ACCOUNT is missing required fields: ${missingFields.join(', ')}`);
    }
    
    return serviceAccount;
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(
        'Failed to parse FCM_SERVICE_ACCOUNT. Make sure it is valid JSON: ' + error.message
      );
    }
    throw error;
  }
};

const serviceAccount = getServiceAccount();

// Get access token for Firebase Admin SDK
async function getAccessToken(): Promise<string> {
  try {
    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/firebase.database',
        'https://www.googleapis.com/auth/firebase.messaging',
      ],
    });

    const client = await auth.getClient();
    const tokenResponse = await client.getAccessToken();
    
    if (!tokenResponse.token) {
      throw new Error('Failed to get access token');
    }
    
    return tokenResponse.token;
  } catch (error) {
    console.error('Failed to get access token:', error);
    throw error;
  }
}

// Send FCM notification to a single device token
const sendFCMNotification = async (
  token: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) => {
  try {
    const accessToken = await getAccessToken();
    const url = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    // Convert data object to string format for FCM
    const fcmData: Record<string, string> = {};
    if (data) {
      Object.keys(data).forEach(key => {
        fcmData[key] = String(data[key]);
      });
    }

    const payload = {
      message: {
        token: token,
        notification: {
          body: body,
          title: title,
        },
        data: fcmData,
      },
    };

    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Failed to send FCM notification:', error.response?.data || error.message);
    throw error;
  }
};

// Send push notifications to multiple tokens
const sendPushNotifications = async (
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
) => {
  if (tokens.length === 0) {
    return;
  }

  // Send notifications to all tokens in parallel
  const promises = tokens.map(token => 
    sendFCMNotification(token, title, body, data).catch(error => {
      console.error(`Failed to send notification to token ${token.substring(0, 20)}...:`, error.message);
      return null; // Continue with other tokens even if one fails
    })
  );

  await Promise.all(promises);
};

// Send email notifications independently
const sendEmailNotifications = async (
  emails: string[],
  subject: string,
  html: string,
  attachments?: Array<{
    filename: string;
    content: string;
    encoding: string;
    cid?: string;
  }>
) => {
  if (!emails.length) {
    return;
  }

  try {
    await sendEmail({
      to: process.env.EMAIL_USER,
      bcc: emails,
      subject,
      html,
      attachments
    });
  } catch (error) {
    console.error('Failed to send email notifications:', error);
  }
};

// Main notification function - sends both push and email independently
export const notifyUsers = async ({
  title,
  message,
  data,
  roles,
  emailSubject,
  emailHtml,
  attachments
}: NotificationOptions) => {
  // Build filter for users based on roles (same as email targeting)
  const filter: Record<string, unknown> = { isActive: true };
  if (roles?.length) {
    filter.role = { $in: roles };
  }

  // Get users matching the filter
  const users = await User.find(filter).select('email noti role');

  // Extract push tokens (FCM tokens from user.noti field)
  const pushTokens = users
    .map(user => user.noti)
    .filter((token): token is string => Boolean(token));

  // Extract emails
  const emails = users
    .map(user => user.email)
    .filter((email): email is string => Boolean(email));

  // Send push notifications independently (always send if tokens exist)
  if (pushTokens.length > 0) {
    await sendPushNotifications(pushTokens, title, message, data).catch(error => {
      console.error('Failed to send push notifications:', error);
    });
  }

  // Send email notifications independently (only if emailSubject and emailHtml provided)
  if (emailSubject && emailHtml && emails.length > 0) {
    await sendEmailNotifications(emails, emailSubject, emailHtml, attachments).catch(error => {
      console.error('Failed to send email notifications:', error);
    });
  }
};

