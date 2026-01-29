/**
 * ────────────────── server/src/utils/mailer.js ──────────────────
 * CORRECTIF APPLIQUÉ : URL dynamique via env et meilleure gestion des logs.
 */
const nodemailer = require('nodemailer');

async function sendResetEmail(to, tokenPlain) {
  // Utilise APP_CLIENT_URL s'il est défini, sinon fallback local
  const appUrl = process.env.APP_CLIENT_URL || 'http://localhost:5173';
  const resetLink = `${appUrl}/reset?email=${encodeURIComponent(to)}&token=${encodeURIComponent(tokenPlain)}`;

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'no-reply@prirtem.local';

  // Si SMTP non configuré, log en console (Mode DEV)
  if (!host || !port || !user || !pass) {
    console.log('⚠️ [MAIL MOCK] SMTP non configuré.');
    console.log(`📨 À: ${to}`);
    console.log(`🔗 Lien: ${resetLink}`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port),
      secure: Number(port) === 465, // true pour 465, false pour les autres
      auth: { user, pass }
    });

    await transporter.sendMail({
      from,
      to,
      subject: 'PRIRTEM - Réinitialisation mot de passe',
      text: `Bonjour,\n\nVous avez demandé la réinitialisation de votre mot de passe.\nCliquez sur ce lien pour continuer : ${resetLink}\n\nCe lien est valide 30 minutes.`,
      html: `<p>Bonjour,</p><p>Vous avez demandé la réinitialisation de votre mot de passe.</p><p><a href="${resetLink}">Cliquez ici pour réinitialiser votre mot de passe</a></p><p><i>Ce lien est valide 30 minutes.</i></p>`
    });
    console.log(`✅ Email envoyé à ${to}`);
  } catch (error) {
    console.error('❌ Erreur envoi email:', error);
    // On ne throw pas forcément l'erreur pour ne pas bloquer le front, mais on loggue
  }
}

module.exports = { sendResetEmail };