const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const zlib = require('zlib');
const { pipeline } = require('stream');
const { promisify } = require('util');
const path = require('path');

const app = express();
app.use(cors());
const pipe = promisify(pipeline);

// Configuration
const BATCH_SIZE = 200;  // Number of items per batch
const COMPRESSION_THRESHOLD = 1024 * 100;  // 100KB threshold for compression
const PORT = 3000;

// Utility to check if compression should be applied
const shouldCompress = (data) => Buffer.byteLength(JSON.stringify(data)) > COMPRESSION_THRESHOLD;

// Utility to create a Transform stream for batching JSON data
function createBatchStream(batchSize) {
    let batch = [];
    return new require('stream').Transform({
        objectMode: true,
        transform(chunk, encoding, callback) {
            batch.push(chunk);
            if (batch.length >= batchSize) {
                this.push(JSON.stringify(batch) + "\n");
                batch = [];
            }
            callback();
  tou      },
        flush(callback) {
            if (batch.length > 0) {
                this.push(JSON.stringify(batch) + "\n");
            }
            callback();
        }
    });
}

app.get('/stream-json/:filename', async (req, res) => {
    try {
        const filename = path.join(__dirname, req.params.filename);
        
        // Validate file existence
        try {
            await fs.access(filename);
        } catch (error) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Get file stats
        const stats = await fs.stat(filename);
        const fileSize = stats.size;

        // Set appropriate headers
        res.setHeader('Content-Type', 'application/json');
        if (fileSize > COMPRESSION_THRESHOLD) {
            res.setHeader('Content-Encoding', 'gzip');
        }
        res.setHeader('Transfer-Encoding', 'chunked');

        // Create read stream
        const fileStream = require('fs').createReadStream(filename, {
            highWaterMark: 64 * 1024  // 64KB chunks
        });

        // Parse JSON stream
        const jsonStream = require('JSONStream').parse('*');

        // Create pipeline based on file size
        const streams = [fileStream, jsonStream];

        // Add batching if file is large
        if (fileSize > COMPRESSION_THRESHOLD) {
            streams.push(createBatchStream(BATCH_SIZE));
        }

        // Add compression if needed
        if (fileSize > COMPRESSION_THRESHOLD) {
            streams.push(zlib.createGzip({
                level: 6,  // Balanced compression
                memLevel: 8,
                windowBits: 15
            }));
        }

        // Add response as final destination
        streams.push(res);

        // Execute pipeline
        await pipe(...streams);

    } catch (error) {
        // If headers haven't been sent, send error response
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Error processing stream',
                message: error.message
            });
        }
        // If headers have been sent, end the response
        else {
            res.end();
        }
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});