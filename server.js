const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Redirect root to /flow/
app.get('/', (req, res) => {
  res.redirect('/flow/');
});

// 本地原型：禁用静态资源缓存，避免改动后浏览器仍加载旧版 JS/CSS
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, must-revalidate');
  next();
});

// Serve flow application
app.use('/flow', express.static(path.join(__dirname, 'flow'), { etag: false, lastModified: false }));

// Serve root static files (for preview.html, etc.)
app.use(express.static(__dirname, { etag: false, lastModified: false }));

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
