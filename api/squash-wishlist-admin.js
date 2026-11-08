const { handleWishlistAdmin } = require('../lib/squash-wishlist-store');

module.exports = async function handler(req, res) {
  return handleWishlistAdmin(req, res, process.env);
};
