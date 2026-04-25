const fs = require('fs');

const log = (msg) => {
    fs.appendFileSync('debug_stream.log', new Date().toISOString() + ': ' + msg + '\n');
    console.log(msg);
};

// we can insert a small patch into server.js to log when chunks are being sent.
