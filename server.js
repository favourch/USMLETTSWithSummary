require('dotenv').config();
const express = require('express');
const path = require('path');
const ttsRoutes = require('./routes/tts');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.use('/api/tts', ttsRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
