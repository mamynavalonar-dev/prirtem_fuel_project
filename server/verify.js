const jwt = require('jsonwebtoken');
const token = process.argv[2];
if (!token) {
  console.error('Usage: node verify.js <token>');
  process.exit(1);
}
const secret = process.env.JWT_SECRET;
if (!secret) {
  console.error('JWT_SECRET not set');
  process.exit(1);
}
try {
  const payload = jwt.verify(token, secret);
  console.log('Token is valid:', payload);
} catch (err) {
  console.error('Token verification failed:', err.message);
}
