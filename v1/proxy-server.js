const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 8000;
const CACHE_DIR = './cache/covers';

// Ensure cache directory exists
if (!fs.existsSync('./cache')) {
    fs.mkdirSync('./cache');
}
if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Image cache management
const imageCache = {
    getFilePath(imageUrl) {
        const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
        const ext = path.extname(new URL(imageUrl).pathname) || '.jpg';
        return path.join(CACHE_DIR, `${hash}${ext}`);
    },

    exists(imageUrl) {
        return fs.existsSync(this.getFilePath(imageUrl));
    },

    async download(imageUrl) {
        return new Promise((resolve, reject) => {
            const filePath = this.getFilePath(imageUrl);
            
            if (this.exists(imageUrl)) {
                resolve(filePath);
                return;
            }

            console.log(`Downloading image: ${imageUrl}`);
            
            const file = fs.createWriteStream(filePath);
            https.get(imageUrl, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download image: ${response.statusCode}`));
                    return;
                }

                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    console.log(`Image cached: ${filePath}`);
                    resolve(filePath);
                });
            }).on('error', (err) => {
                fs.unlink(filePath, () => {}); // Delete partial file
                reject(err);
            });
        });
    },

    serve(req, res, imageUrl) {
        const filePath = this.getFilePath(imageUrl);
        
        if (!this.exists(imageUrl)) {
            res.writeHead(404);
            res.end('Image not found in cache');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }[ext] || 'image/jpeg';

        const stream = fs.createReadStream(filePath);
        res.writeHead(200, { 
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=86400' // 24 hours
        });
        stream.pipe(res);
    }
};

// Rate limiting for IGDB API (4 requests per second max)
const igdbRateLimiter = {
    queue: [],
    processing: false,
    lastRequest: 0,
    
    async throttledRequest(requestFunc) {
        return new Promise((resolve, reject) => {
            this.queue.push({ requestFunc, resolve, reject });
            this.processQueue();
        });
    },
    
    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const { requestFunc, resolve, reject } = this.queue.shift();
            
            // Ensure 300ms between requests (3.33 requests/second - safely under 4/sec limit)
            const now = Date.now();
            const timeSinceLastRequest = now - this.lastRequest;
            const minDelay = 300;
            
            if (timeSinceLastRequest < minDelay) {
                const waitTime = minDelay - timeSinceLastRequest;
                console.log(`Rate limiting: waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            
            try {
                this.lastRequest = Date.now();
                const result = await requestFunc();
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }
        
        this.processing = false;
    }
};

// Rate limiting for general requests
const rateLimiter = {
    requests: new Map(),
    isBlocked(ip) {
        const now = Date.now();
        const requests = this.requests.get(ip) || [];
        
        // Remove requests older than 1 second
        const recent = requests.filter(time => now - time < 1000);
        this.requests.set(ip, recent);
        
        // Allow max 2 requests per second per IP to be safe
        return recent.length >= 2;
    },
    addRequest(ip) {
        const requests = this.requests.get(ip) || [];
        requests.push(Date.now());
        this.requests.set(ip, requests);
    }
};

// Simple MIME type mapping
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
};

function serveStaticFile(req, res) {
    let filePath = '.' + req.url;
    if (filePath === './') {
        filePath = './index.html';
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('File not found');
            } else {
                res.writeHead(500);
                res.end('Server error');
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
}

function generateAppAccessToken(clientId, clientSecret) {
    return new Promise((resolve, reject) => {
        const postData = `client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`;
        
        const options = {
            hostname: 'id.twitch.tv',
            port: 443,
            path: '/oauth2/token',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const response = JSON.parse(data);
                    resolve(response.access_token);
                } else {
                    reject(new Error(`OAuth2 failed: ${res.statusCode} - ${data}`));
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        req.write(postData);
        req.end();
    });
}

function proxyIGDBRequest(req, res) {
    // Rate limiting
    const clientIP = req.connection.remoteAddress || req.socket.remoteAddress;
    if (rateLimiter.isBlocked(clientIP)) {
        res.writeHead(429, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Rate limit exceeded. Max 2 requests per second.' }));
        return;
    }
    rateLimiter.addRequest(clientIP);

    // Parse the request body
    let body = '';
    req.on('data', chunk => {
        body += chunk.toString();
    });

    req.on('end', async () => {
        // Load IGDB credentials from settings.json
        let settings;
        try {
            const settingsData = fs.readFileSync('./data/settings.json', 'utf8');
            settings = JSON.parse(settingsData);
        } catch (error) {
            console.error('Failed to load settings:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to load IGDB credentials' }));
            return;
        }

        if (!settings.igdb || !settings.igdb.client_id) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'IGDB Client ID not configured' }));
            return;
        }

        // Check if we need to generate a new App Access Token
        let accessToken = settings.igdb.access_token;
        
        // Force regeneration if token looks invalid (current token is known to be bad)
        const forceRegenerate = !accessToken || 
                               accessToken.length < 20 || 
                               accessToken === 'utfyxl1o8ei6y1rfldjnsoc8naiest';
        
        if (forceRegenerate) {
            console.log('Generating new App Access Token...');
            if (!settings.igdb.client_secret) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'IGDB Client Secret required to generate App Access Token',
                    help: 'Please add "client_secret" to the igdb section in settings.json'
                }));
                return;
            }

            try {
                accessToken = await generateAppAccessToken(settings.igdb.client_id, settings.igdb.client_secret);
                console.log('New App Access Token generated successfully');
                
                // Update settings file with new token
                settings.igdb.access_token = accessToken;
                fs.writeFileSync('./data/settings.json', JSON.stringify(settings, null, 4));
                console.log('Updated settings.json with new token');
            } catch (error) {
                console.error('Failed to generate App Access Token:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    error: 'Failed to generate App Access Token',
                    details: error.message 
                }));
                return;
            }
        }

        // Queue the IGDB request to respect rate limits
        await igdbRateLimiter.throttledRequest(async () => {
            // Extract the IGDB API path from the URL
            const urlParts = url.parse(req.url);
            const igdbPath = urlParts.pathname.replace('/api/igdb', '');
            
            const options = {
                hostname: 'api.igdb.com',
                port: 443,
                path: `/v4${igdbPath}`,
                method: 'POST',
                headers: {
                    'Client-ID': settings.igdb.client_id,
                    'Authorization': `Bearer ${settings.igdb.access_token}`,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            console.log(`IGDB API Request: ${options.method} ${options.path}`);
            console.log(`Headers: Client-ID=${options.headers['Client-ID']}, Auth=${options.headers['Authorization']}`);
            
            return new Promise((resolve, reject) => {
                const proxyReq = https.request(options, (proxyRes) => {
            console.log(`IGDB API Response: ${proxyRes.statusCode}`);
            
            if (proxyRes.statusCode === 401) {
                console.error('IGDB API 401 Error: Token may be expired or invalid');
                console.error('Client ID:', settings.igdb.client_id);
                console.error('Access Token:', settings.igdb.access_token ? 'Present' : 'Missing');
            }
            
            // Set CORS headers
            res.writeHead(proxyRes.statusCode, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, Client-ID'
            });

            let responseData = '';
            proxyRes.on('data', (chunk) => {
                responseData += chunk;
            });

            proxyRes.on('end', async () => {
                if (proxyRes.statusCode !== 200) {
                    console.error('IGDB API Error Response:', responseData);
                    res.write(responseData);
                    res.end();
                    return;
                }

                try {
                    // Parse response and cache images
                    const games = JSON.parse(responseData);
                    
                    if (Array.isArray(games)) {
                        for (const game of games) {
                            if (game.cover && game.cover.url) {
                                try {
                                    // Convert to full HTTPS URL
                                    const fullUrl = game.cover.url.startsWith('//') 
                                        ? `https:${game.cover.url}` 
                                        : game.cover.url;
                                    
                                    // Get high resolution version
                                    const coverUrl = fullUrl.replace('t_thumb', 't_cover_big');
                                    
                                    // Download and cache the image
                                    await imageCache.download(coverUrl);
                                    
                                    // Replace with local cache URL
                                    const hash = crypto.createHash('md5').update(coverUrl).digest('hex');
                                    game.cover.url = `/cache/covers/${hash}.jpg`;
                                    
                                } catch (error) {
                                    console.error('Failed to cache image for game:', game.name, error.message);
                                }
                            }
                        }
                    }
                    
                    res.write(JSON.stringify(games));
                } catch (error) {
                    console.error('Error processing IGDB response:', error);
                    res.write(responseData);
                }
                
                res.end();
                resolve();
            });
        });

        proxyReq.on('error', (err) => {
            console.error('IGDB proxy error:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'IGDB API request failed' }));
            reject(err);
        });

        proxyReq.write(body);
        proxyReq.end();
            });
        });
    });
}

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, Client-ID'
        });
        res.end();
        return;
    }

    // Route IGDB API requests to proxy
    if (parsedUrl.pathname.startsWith('/api/igdb/')) {
        proxyIGDBRequest(req, res);
        return;
    }

    // Serve cached images
    if (parsedUrl.pathname.startsWith('/cache/covers/')) {
        const filename = decodeURIComponent(path.basename(parsedUrl.pathname));
        const filePath = path.join(CACHE_DIR, filename);
        
        console.log(`Requesting image: ${filename}`);
        console.log(`Looking for file at: ${filePath}`);
        console.log(`File exists: ${fs.existsSync(filePath)}`);
        
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.webp': 'image/webp'
            }[ext] || 'image/jpeg';

            const stream = fs.createReadStream(filePath);
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=86400' // 24 hours
            });
            stream.pipe(res);
        } else {
            console.log(`Available files in cache:`, fs.readdirSync(CACHE_DIR).slice(0, 5));
            res.writeHead(404);
            res.end('Image not found');
        }
        return;
    }

    // Serve static files
    serveStaticFile(req, res);
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('IGDB API proxy available at http://localhost:8000/api/igdb/');
});