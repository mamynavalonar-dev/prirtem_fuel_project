const { z } = require('zod');

const passwordSchema = z.string()
  .min(12, 'Mot de passe trop court (minimum 12 caractères)')
  .regex(/[a-z]/, 'Doit contenir au moins une lettre minuscule')
  .regex(/[A-Z]/, 'Doit contenir au moins une lettre majuscule')
  .regex(/[0-9]/, 'Doit contenir au moins un chiffre')
  .regex(/[^a-zA-Z0-9]/, 'Doit contenir au moins un caractère spécial');

module.exports = { passwordSchema };
