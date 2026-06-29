const mongoose = require('mongoose');

module.exports = async () => {
  await mongoose.connection.close();
};
