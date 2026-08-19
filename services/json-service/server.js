const express = require('express');
const { processOrder } = require('../../shared/processing.js');

const app = express();
const PORT = 4000;

app.use(express.json());

app.post('/process', (req, res) => {
  try {
    const result = processOrder(req.body);
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: 'Failed to process order',
      details: err.message
    });
  }
});

app.get('/cpu', (req, res) => {
  res.json({ pid: process.pid, cpuUsage: process.cpuUsage() });
});

app.listen(PORT, () => {
  console.log(`JSON service listening on http://localhost:${PORT}`);
});