// Private-club co-branded QR requests from /squash, /tennis and /pickleball.
// Stored through the existing Friday partner intake pipe. Email alerts go
// only to randy@silverbirchgrowth.com, with reply-to set to the club email.
const { createHandler } = require('../lib/intake');

module.exports = createHandler('club-qr');
