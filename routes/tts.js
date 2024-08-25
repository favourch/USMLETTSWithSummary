const express = require('express');
const { ElevenLabsClient } = require('elevenlabs');
const { createWriteStream } = require('fs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { mkdir } = require('fs/promises');
const fs = require('fs').promises;
const axios = require('axios');

const router = express.Router();

const elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY,
});

async function blackbox(message) {
    try {
        const response = await axios.post('https://www.blackbox.ai/api/chat', {
            messages: [{ id: null, content: message, role: 'user' }],
            id: null,
            previewToken: null,
            userId: null,
            codeModelMode: true,
            agentMode: {},
            trendingAgentMode: {},
            isMicMode: false,
            isChromeExt: false,
            githubToken: null
        });
        return response.data.replace(/\$@\$v=(v1\.21|undefined)-rv1\$@\$/g, '');
    } catch (error) {
        console.error(error);
        throw error;
    }
}

async function generateSummary(text) {
    try {
        const prompt = `Summarize the following text in one sentence: "${text}"`;
        const summary = await blackbox(prompt);
        return summary.trim();
    } catch (error) {
        console.error('Error generating summary:', error);
        return 'Summary unavailable';
    }
}

const createAudioFileFromText = async (text) => {
    return new Promise(async (resolve, reject) => {
        try {
            const audio = await elevenlabs.generate({
                voice: 'Rachel',
                model_id: 'eleven_turbo_v2_5',
                text,
            });

            const audioDir = path.join(process.cwd(), 'public', 'audio');
            await mkdir(audioDir, { recursive: true });

            const fileName = `${uuidv4()}`;
            const filePath = path.join(audioDir, `${fileName}.mp3`);
            const fileStream = createWriteStream(filePath);

            audio.pipe(fileStream);
            fileStream.on('finish', async () => {
                const excerpt = text.length > 50 ? text.substring(0, 50) + '...' : text;
                const summary = await generateSummary(text);
                await fs.writeFile(path.join(audioDir, `${fileName}.json`), JSON.stringify({ excerpt, summary }));
                resolve(`/audio/${fileName}.mp3`);
            });
            fileStream.on('error', reject);
        } catch (error) {
            reject(error);
        }
    });
};

router.post('/', async (req, res) => {
    try {
        const { text } = req.body;
        const audioFilePath = await createAudioFileFromText(text);
        res.json({ audioUrl: audioFilePath });
    } catch (error) {
        console.error('Error generating TTS:', error);
        res.status(500).json({ error: 'Error generating TTS' });
    }
});

router.get('/recent2', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const audioDir = path.join(process.cwd(), 'public', 'audio');
        const files = await fs.readdir(audioDir);
        const sortedFiles = files.sort((a, b) => {
            return fs.stat(path.join(audioDir, b)).mtime.getTime() -
                   fs.stat(path.join(audioDir, a)).mtime.getTime();
        });

        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const results = sortedFiles.slice(startIndex, endIndex);

        res.json({
            totalPages: Math.ceil(sortedFiles.length / limit),
            currentPage: page,
            results: results.map(file => `/audio/${file}`)
        });
    } catch (error) {
        console.error('Error fetching recent audio files:', error);
        res.status(500).json({ error: 'Error fetching recent audio files' });
    }
});

router.get('/recent', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const audioDir = path.join(process.cwd(), 'public', 'audio');
        const files = await fs.readdir(audioDir);
        const audioFiles = files.filter(file => file.endsWith('.mp3'));
        const sortedFiles = await Promise.all(audioFiles.map(async file => {
            const filePath = path.join(audioDir, file);
            const stats = await fs.stat(filePath);
            const jsonPath = path.join(audioDir, file.replace('.mp3', '.json'));
            let jsonData = { excerpt: 'No excerpt available', summary: 'No summary available' };
            try {
                jsonData = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
            } catch (err) {
                console.warn(`JSON file not found for ${file}, using default values`);
            }
            return { file, mtime: stats.mtime, ...jsonData };
        }));
        sortedFiles.sort((a, b) => b.mtime - a.mtime);

        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const results = sortedFiles.slice(startIndex, endIndex);

        res.json({
            totalPages: Math.ceil(sortedFiles.length / limit),
            currentPage: page,
            results: results.map(item => ({
                url: `/audio/${item.file}`,
                excerpt: item.excerpt,
                summary: item.summary
            }))
        });
    } catch (error) {
        console.error('Error fetching recent audio files:', error);
        res.status(500).json({ error: 'Error fetching recent audio files' });
    }
});

module.exports = router;
