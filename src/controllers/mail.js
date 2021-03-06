import { omit } from 'lodash';
import {
  MERGED_SUGGESTION_TEMPLATE,
  REJECTED_SUGGESTION_TEMPLATE,
  FROM_EMAIL,
} from '../config';

const sgMail = process.env.NODE_ENV !== 'build' ? require('@sendgrid/mail') : {};

/* Builds the message object that will help send the email */
const constructMessage = (messageFields) => ({
  from: FROM_EMAIL,
  ...messageFields,
});

/* Wrapper around SendGrid function to handle errors */
export const sendEmail = (message) => (
  process.env.NODE_ENV !== 'test' ? sgMail.send(message)
    .then(() => {
      if (process.env.NODE_ENV !== 'production') {
        console.log('Email successfully sent.');
      }
    })
    .catch((err) => {
      if (process.env.NODE_ENV !== 'production') {
        console.log(err);
        return Promise.resolve(err);
      }
      throw err;
    }) : (async () => {
    if (!message.to) {
      throw new Error('\'to\' field must be defined');
    }
    return Promise.resolve();
  })()
);

/* Email sent when an editor clicks the approve button */
export const sendApprovedEmail = (data) => {
  const message = constructMessage(data);
  return sendEmail(message);
};

/* Email sent when an editor clicks the deny button */
export const sendDeniedEmail = (data) => {
  const message = constructMessage(data);
  return sendEmail(message);
};

/* Email sent when suggestion gets merged */
export const sendMergedEmail = (data) => {
  const message = constructMessage({
    to: data.to,
    templateId: MERGED_SUGGESTION_TEMPLATE,
    dynamic_template_data: omit(data, ['to']),
  });
  return sendEmail(message);
};

/* Email sent when a suggestion has been deleted without getting merged */
export const sendRejectedEmail = (data) => {
  const message = constructMessage({
    to: data.to,
    templateId: REJECTED_SUGGESTION_TEMPLATE,
    dynamic_template_data: omit(data, ['to']),
  });
  return sendEmail(message);
};
