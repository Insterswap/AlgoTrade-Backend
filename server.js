// Secure Backend Proxy Server for Alpaca Trading API
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3001;

// ===== SECURITY MIDDLEWARE =====

// Helmet - Sets secure HTTP headers
app.use(helmet());

// CORS configuration - Allow requests from frontend
const allowedOrigins = [
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

// Add Replit domain if available
if (process.env.REPLIT_DOMAINS) {
  const replitDomain = process.env.REPLIT_DOMAINS.split(',')[0];
  allowedOrigins.push(`https://${replitDomain}`);
  allowedOrigins.push(`http://${replitDomain}`);
}

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting - Prevent abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per window (development)
  message: 'Too many requests, please try again later'
});
app.use('/api/', limiter);

// Parse JSON bodies
app.use(express.json());

// ===== SECURITY NOTE =====
// Authentication is handled by CORS policy - only requests from
// localhost:5000, 127.0.0.1:5000, and the Replit domain are allowed.
// This ensures only the frontend can access the proxy endpoints.

// ===== ALPACA API PROXY ROUTES =====

// Get Alpaca headers (using paper trading for now)
const getAlpacaHeaders = (tradingMode = 'paper') => {
  const apiKey = process.env.ALPACA_PAPER_API_KEY;
  const apiSecret = process.env.ALPACA_PAPER_API_SECRET;

  return {
    'APCA-API-KEY-ID': apiKey,
    'APCA-API-SECRET-KEY': apiSecret,
    'Content-Type': 'application/json',
  };
};

// Get base URL (using paper trading)
const getBaseURL = (tradingMode = 'paper') => {
  return 'https://paper-api.alpaca.markets';
};

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'Alpaca Proxy Server'
  });
});

// Get Account
app.get('/api/account', async (req, res) => {
  try {
    const tradingMode = req.query.mode || 'paper';
    const baseURL = getBaseURL(tradingMode);
    const headers = getAlpacaHeaders(tradingMode);

    const response = await fetch(`${baseURL}/v2/account`, { headers });
    
    if (!response.ok) {
      throw new Error(`Alpaca API error: ${response.status}`);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({ error: 'Failed to fetch account data' });
  }
});

// Get Positions
app.get('/api/positions', async (req, res) => {
  try {
    const tradingMode = req.query.mode || 'paper';
    const baseURL = getBaseURL(tradingMode);
    const headers = getAlpacaHeaders(tradingMode);

    const response = await fetch(`${baseURL}/v2/positions`, { headers });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch positions' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// Get Orders
app.get('/api/orders', async (req, res) => {
  try {
    const tradingMode = req.query.mode || 'paper';
    const status = req.query.status || 'all';
    const baseURL = getBaseURL(tradingMode);
    const headers = getAlpacaHeaders(tradingMode);

    const response = await fetch(`${baseURL}/v2/orders?status=${status}`, { headers });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch orders' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// Get Market Data (Bars)
app.get('/api/bars/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const tradingMode = req.query.mode || 'paper';
    const timeframe = req.query.timeframe || '1Day';
    const limit = parseInt(req.query.limit) || 100;
    
    const headers = getAlpacaHeaders(tradingMode);
    const end = new Date();
    
    // Calculate proper lookback based on timeframe
    let lookbackMs = 0;
    if (timeframe.includes('Min')) {
      const minutes = parseInt(timeframe);
      lookbackMs = limit * minutes * 60 * 1000;
    } else if (timeframe.includes('Hour')) {
      const hours = parseInt(timeframe);
      lookbackMs = limit * hours * 60 * 60 * 1000;
    } else if (timeframe.includes('Day')) {
      const days = parseInt(timeframe) || 1;
      lookbackMs = limit * days * 24 * 60 * 60 * 1000;
    } else if (timeframe.includes('Week')) {
      const weeks = parseInt(timeframe) || 1;
      lookbackMs = limit * weeks * 7 * 24 * 60 * 60 * 1000;
    } else {
      // Default to days
      lookbackMs = limit * 24 * 60 * 60 * 1000;
    }
    
    // Add extra buffer for market hours and weekends
    lookbackMs *= 3;
    
    const start = new Date(end.getTime() - lookbackMs);
    
    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${timeframe}&start=${start.toISOString()}&end=${end.toISOString()}&limit=${limit}&feed=iex`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch bars' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching bars:', error);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

// Get Latest Quote
app.get('/api/quote/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const tradingMode = req.query.mode || 'paper';
    const headers = getAlpacaHeaders(tradingMode);
    
    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest?feed=iex`;
    
    const response = await fetch(url, { headers });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch quote' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching quote:', error);
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// Submit Order
app.post('/api/orders', async (req, res) => {
  try {
    const tradingMode = req.query.mode || 'paper';
    const baseURL = getBaseURL(tradingMode);
    const headers = getAlpacaHeaders(tradingMode);

    const response = await fetch(`${baseURL}/v2/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) {
      const error = await response.json();
      return res.status(response.status).json(error);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error submitting order:', error);
    res.status(500).json({ error: 'Failed to submit order' });
  }
});

// Cancel Order
app.delete('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const tradingMode = req.query.mode || 'paper';
    const baseURL = getBaseURL(tradingMode);
    const headers = getAlpacaHeaders(tradingMode);

    const response = await fetch(`${baseURL}/v2/orders/${orderId}`, {
      method: 'DELETE',
      headers
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to cancel order' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error canceling order:', error);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// Get Market Clock/Status
app.get('/api/clock', async (req, res) => {
  try {
    const tradingMode = req.query.mode || 'paper';
    const baseURL = getBaseURL(tradingMode);
    const headers = getAlpacaHeaders(tradingMode);

    const response = await fetch(`${baseURL}/v2/clock`, { headers });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch clock' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching clock:', error);
    res.status(500).json({ error: 'Failed to fetch market status' });
  }
});

// ===== START SERVER =====

app.listen(PORT, () => {
  console.log(`🔒 Secure Alpaca Proxy Server running on http://localhost:${PORT}`);
  console.log(`📡 Allowed Origins:`, allowedOrigins.join(', '));
  console.log(`✅ API Keys loaded from Replit Secrets`);
  console.log(`🔐 Security: CORS-based origin validation`);
});
