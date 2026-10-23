const http = require('http');
const fs = require('fs');
const path = require('path');
const backendHandler = require('./api/backend');

const PORT = 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // Helper to add express/vercel style methods to res
  res.status = function(code) {
    this.statusCode = code;
    return this;
  };
  res.json = function(data) {
    this.setHeader('Content-Type', 'application/json');
    this.end(JSON.stringify(data));
    return this;
  };

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // Handle Serverless API route
  if (pathname === '/api/backend') {
    let bodyData = '';
    req.on('data', chunk => {
      bodyData += chunk;
    });
    req.on('end', async () => {
      req.body = bodyData;
      req.query = Object.fromEntries(parsedUrl.searchParams.entries());
      try {
        await backendHandler(req, res);
      } catch (err) {
        console.error("Local Server API Error:", err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, error: err.toString() });
        }
      }
    });
    return;
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Local dev server running at http://localhost:${PORT}`);
});
