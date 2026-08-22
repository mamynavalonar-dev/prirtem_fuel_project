const nodemailer = require('nodemailer');

function buildResetLink(tokenPlain) {
  const appUrl = process.env.APP_CLIENT_URL;
  if (!appUrl) throw new Error('APP_CLIENT_URL is required');

  const url = new URL('/reset', appUrl);
  url.searchParams.set('token', tokenPlain);
  return url.toString();
}

async function sendResetEmail(to, tokenPlain) {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASS: pass } = process.env;
  if (!host || !port || !user || !pass) {
    throw new Error('SMTP is not configured');
  }

  const resetLink = buildResetLink(tokenPlain);
  const transporter = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass }
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || 'no-reply@prirtem.local',
    to,
    subject: 'PRIRTEM - Réinitialisation du mot de passe',
    text: `Un changement de mot de passe a été demandé. Ouvrez ce lien dans les 30 minutes : ${resetLink}`,
    html: `<p>Un changement de mot de passe a été demandé.</p><p><a href="${resetLink}">Réinitialiser le mot de passe</a></p><p>Ce lien expire dans 30 minutes.</p>`
  });
}

module.exports = { buildResetLink, sendResetEmail };
