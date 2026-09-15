const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// Redirect root to /flow/
app.get('/', (req, res) => {
  res.redirect('/flow/');
});

// Serve flow application
app.use('/flow', express.static(path.join(__dirname, 'flow')));

// Serve root static files (for preview.html, etc.)
app.use(express.static(__dirname));

app.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}/`);
});
